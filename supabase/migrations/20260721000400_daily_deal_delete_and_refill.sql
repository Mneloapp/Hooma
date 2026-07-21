-- Let catalog staff delete products that have Daily Deals history while keeping
-- order-history protections intact. Product deletion and today's refill happen
-- atomically, and a shared advisory lock serializes all Daily Deals maintenance.

create or replace function public.lock_daily_deal_items_maintenance_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A statement-level trigger acquires this before PostgreSQL locks any deal
  -- item rows. This also covers future or legacy writers that do not call the
  -- activation/deletion RPCs directly.
  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-maintenance'));
  return null;
end;
$$;

drop trigger if exists lock_daily_deal_items_maintenance on public.daily_deal_items;
create trigger lock_daily_deal_items_maintenance
before insert or update or delete or truncate on public.daily_deal_items
for each statement execute function public.lock_daily_deal_items_maintenance_v1();

-- Application writes all go through server-side RPCs. Keep customer/admin
-- reads under the existing RLS policies, but remove direct browser mutations.
drop policy if exists "admins manage daily deal items" on public.daily_deal_items;
drop policy if exists "admins manage daily deal batches" on public.daily_deal_batches;
revoke insert, update, delete, truncate, references, trigger
  on table public.daily_deal_items, public.daily_deal_batches
  from public, anon, authenticated;
grant select on table public.daily_deal_items, public.daily_deal_batches
  to anon, authenticated;
grant all on table public.daily_deal_items, public.daily_deal_batches
  to service_role;

create or replace function public.activate_daily_deals(target_date date default (now() at time zone 'Asia/Tbilisi')::date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
  configured_discount numeric(5,2);
begin
  if target_date is null then raise exception 'Target date is required'; end if;

  -- Product deletion takes this lock before locking products. Every activation
  -- must take it first as well, otherwise an FK check could race a deletion.
  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-maintenance'));

  select daily_deal_discount_percent
  into configured_discount
  from public.pricing_profiles
  where is_default = true
  limit 1;
  configured_discount := coalesce(configured_discount, 50);

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-' || target_date::text));
  insert into public.daily_deal_batches (deal_date) values (target_date) on conflict do nothing;

  delete from public.daily_deal_items
  where deal_date = target_date and position > 50;

  -- Move rows into a free temporary range, then compact them to 1..N. This
  -- avoids transient collisions with the non-deferrable unique position key.
  with displaced as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = 50 + displaced.compact_position
  from displaced
  where item.id = displaced.id;

  with compacted as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = compacted.compact_position
  from compacted
  where item.id = compacted.id;

  update public.daily_deal_items
  set discount_percent = configured_discount
  where deal_date = target_date
    and discount_percent is distinct from configured_discount;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;

  -- The normal cron/settings path usually finds an already-complete batch.
  -- Avoid ranking the full catalog when no replacement is needed.
  if existing_count >= 50 then
    update public.daily_deal_batches
    set selection_count = existing_count
    where deal_date = target_date;
    return existing_count;
  end if;

  with eligible as (
    select
      p.id as product_id,
      chosen_variant.id as variant_id,
      chosen_variant.active_price,
      exists (
        select 1
        from public.daily_deal_items previous_day
        where previous_day.product_id = p.id
          and previous_day.deal_date = target_date - 1
      ) as appeared_previous_day
    from public.products p
    cross join lateral (
      select
        v.id,
        coalesce(v.price, p.sale_price, p.base_price)::numeric(12,2) as active_price
      from public.product_variants v
      where v.product_id = p.id
        and v.is_active = true
        and coalesce(v.price, p.sale_price, p.base_price) > 0
      order by coalesce(v.price, p.sale_price, p.base_price), v.id
      limit 1
    ) chosen_variant
    where p.status = 'active'
      and p.production_status = 'approved'
      and coalesce(p.category, '') <> 'Custom Parts'
      and not exists (
        select 1 from public.categories product_category
        where product_category.id = p.category_id and product_category.slug = 'custom-parts'
      )
      and not exists (
        select 1 from public.daily_deal_items today
        where today.deal_date = target_date and today.product_id = p.id
      )
  ), ranked as (
    select *, row_number() over (
      order by appeared_previous_day asc, md5(target_date::text || ':' || product_id::text)
    ) as selection_order
    from eligible
  ), selected as (
    select * from ranked
    where selection_order <= greatest(0, 50 - existing_count)
  )
  insert into public.daily_deal_items (
    deal_date, product_id, variant_id, position, original_price, deal_price, discount_percent
  )
  select
    target_date,
    product_id,
    variant_id,
    existing_count + selection_order::integer,
    active_price,
    active_price,
    configured_discount
  from selected
  on conflict (deal_date, product_id) do nothing;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;
  update public.daily_deal_batches
  set selection_count = existing_count
  where deal_date = target_date;
  return existing_count;
end;
$$;

create or replace function public.delete_catalog_products_v2(
  requested_product_ids uuid[],
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_ids uuid[];
  locked_job_ids uuid[];
  affected_job_ids uuid[];
  affected_job_id uuid;
  matched_count integer;
  affected_deal_dates date[];
  current_deal_date date := (now() at time zone 'Asia/Tbilisi')::date;
  removed_daily_deal_count integer := 0;
  removed_current_daily_deal_count integer := 0;
  remaining_current_daily_deal_count integer := 0;
  current_daily_deal_count integer := 0;
  refilled_current_daily_deal_count integer := 0;
  deletion_result jsonb;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Owner, Admin, or Catalog Manager access is required';
  end if;

  select array_agg(unique_product.product_id order by unique_product.first_position)
  into normalized_ids
  from (
    select selected.product_id, min(selected.position) as first_position
    from unnest(requested_product_ids) with ordinality as selected(product_id, position)
    where selected.product_id is not null
    group by selected.product_id
  ) unique_product;

  if coalesce(array_length(normalized_ids, 1), 0) < 1
    or array_length(normalized_ids, 1) > 100 then
    raise exception 'Between 1 and 100 products are required';
  end if;

  -- This is intentionally before product row locks. activate_daily_deals takes
  -- the same lock before selecting candidates and checking its product FKs.
  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-maintenance'));

  -- Audit claims lock their job before their product. Use the same global
  -- Daily Deals -> audit jobs (stable UUID order) -> products order here so a
  -- normal catalog deletion cannot deadlock with claim cleanup or leave a
  -- cascaded audit item reflected in materialized job counters.
  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into locked_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = any(normalized_ids);

  perform 1
  from public.catalog_product_audit_jobs job
  where job.id = any(locked_job_ids)
  order by job.id
  for update;

  perform 1
  from public.products product
  where product.id = any(normalized_ids)
  order by product.id
  for update;

  select count(*) into matched_count
  from public.products product
  where product.id = any(normalized_ids);

  if matched_count <> array_length(normalized_ids, 1) then
    raise exception 'Some requested products were not found';
  end if;

  -- A claim belonging to a previously unrelated job may have committed while
  -- this transaction waited for a product. Do not acquire that new job lock
  -- after the product lock; abort so a retry can preserve the global order.
  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into affected_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = any(normalized_ids);
  if affected_job_ids is distinct from locked_job_ids then
    raise exception 'Concurrent audit claim changed product jobs; retry deletion';
  end if;

  select
    coalesce(array_agg(distinct deal.deal_date order by deal.deal_date), '{}'::date[]),
    count(*)::integer,
    (count(*) filter (where deal.deal_date = current_deal_date))::integer
  into affected_deal_dates, removed_daily_deal_count, removed_current_daily_deal_count
  from public.daily_deal_items deal
  where deal.product_id = any(normalized_ids);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  select
    actor_profile_id,
    'catalog_product_deal_history_removed_for_deletion',
    'product',
    product.id::text,
    jsonb_build_object(
      'slug', product.slug,
      'name', coalesce(product.name_ka, product.hooma_name),
      'product_status', product.status,
      'deal_count', (select count(*) from public.daily_deal_items deal where deal.product_id = product.id),
      'deal_dates', (select jsonb_agg(deal.deal_date order by deal.deal_date) from public.daily_deal_items deal where deal.product_id = product.id)
    )
  from public.products product
  where product.id = any(normalized_ids)
    and exists (
      select 1
      from public.daily_deal_items deal
      where deal.product_id = product.id
    );

  -- Remove every Daily Deals reference, not only references for archived
  -- products. The lower deletion function still owns all order safeguards.
  delete from public.daily_deal_items deal
  where deal.product_id = any(normalized_ids);

  update public.daily_deal_batches batch
  set selection_count = (
    select count(*)
    from public.daily_deal_items item
    where item.deal_date = batch.deal_date
  )
  where batch.deal_date = any(affected_deal_dates);

  -- Capture the item removals in total_count before the product cascade erases
  -- them. Any later deletion failure rolls this update back atomically.
  update public.catalog_product_audit_jobs job
  set total_count = greatest(
        0,
        job.total_count - (
          select count(*)::integer
          from public.catalog_product_audit_items item
          where item.job_id = job.id
            and item.product_id = any(normalized_ids)
        )
      )
  where job.id = any(affected_job_ids);

  -- Any exception from the protected lower-level deletion rolls this whole
  -- transaction back, including deal removals and audit entries.
  deletion_result := public.delete_catalog_products(normalized_ids, actor_profile_id);

  -- Product deletion cascades its audit items. Reconcile every affected job
  -- while its row lock is still held so counters cannot retain deleted items.
  foreach affected_job_id in array affected_job_ids loop
    perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
  end loop;

  select count(*)::integer
  into remaining_current_daily_deal_count
  from public.daily_deal_items
  where deal_date = current_deal_date;

  current_daily_deal_count := public.activate_daily_deals(current_deal_date);
  refilled_current_daily_deal_count := greatest(
    current_daily_deal_count - remaining_current_daily_deal_count,
    0
  );

  if removed_current_daily_deal_count > 0 or refilled_current_daily_deal_count > 0 then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_profile_id,
      'daily_deals_refilled_after_product_deletion',
      'daily_deal_batch',
      current_deal_date::text,
      jsonb_build_object(
        'deleted_product_ids', to_jsonb(normalized_ids),
        'removed_current_count', removed_current_daily_deal_count,
        'refilled_count', refilled_current_daily_deal_count,
        'selection_count', current_daily_deal_count,
        'selection_limit', 50
      )
    );
  end if;

  return deletion_result || jsonb_build_object(
    'removed_daily_deal_count', removed_daily_deal_count,
    'removed_current_daily_deal_count', removed_current_daily_deal_count,
    'refilled_current_daily_deal_count', refilled_current_daily_deal_count,
    'current_daily_deal_count', current_daily_deal_count,
    'affected_audit_job_ids', to_jsonb(affected_job_ids)
  );
end;
$$;

create or replace function public.delete_catalog_product_from_audit_v1(
  actor_profile_id uuid,
  requested_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_product_id uuid;
  eligible_item_id uuid;
  locked_job_ids uuid[];
  affected_job_ids uuid[];
  deletion_result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.review_visible = true
    and item.status in ('ready', 'failed');
  if requested_product_id is null then raise exception 'Catalog audit item is no longer available for deletion'; end if;

  -- Take Daily Deals maintenance before audit-job and product row locks. The
  -- nested v2 call reacquires this transaction-scoped lock safely.
  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-maintenance'));

  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into locked_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = requested_product_id;

  perform 1
  from public.catalog_product_audit_jobs job
  where job.id = any(locked_job_ids)
  order by job.id
  for update;

  select item.id into eligible_item_id
  from public.products product
  join public.catalog_product_audit_items item on item.product_id = product.id
  where item.id = requested_item_id
    and item.product_id = requested_product_id
    and item.review_visible = true
    and item.status in ('ready', 'failed')
  for update of product;
  if eligible_item_id is null then raise exception 'Catalog audit item is no longer available for deletion'; end if;

  perform 1
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.product_id = requested_product_id
    and item.review_visible = true
    and item.status in ('ready', 'failed')
  for update;
  if not found then raise exception 'Catalog audit item is no longer available for deletion'; end if;

  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into affected_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = requested_product_id;
  if affected_job_ids is distinct from locked_job_ids then
    raise exception 'Concurrent audit claim changed product jobs; retry deletion';
  end if;

  deletion_result := public.delete_catalog_products_v2(array[requested_product_id], actor_profile_id);

  return deletion_result || jsonb_build_object(
    'audit_item_id', requested_item_id,
    'affected_audit_job_ids', to_jsonb(affected_job_ids)
  );
end;
$$;

revoke all on function public.activate_daily_deals(date) from public, anon, authenticated;
revoke all on function public.delete_catalog_products_v2(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.delete_catalog_product_from_audit_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_daily_deal_items_maintenance_v1() from public, anon, authenticated;
grant execute on function public.activate_daily_deals(date) to service_role;
grant execute on function public.delete_catalog_products_v2(uuid[], uuid) to service_role;
grant execute on function public.delete_catalog_product_from_audit_v1(uuid, uuid) to service_role;
grant execute on function public.lock_daily_deal_items_maintenance_v1() to service_role;
