-- Category-scoped catalog audits.
--
-- A job snapshots one selected category scope. Selecting a parent includes its
-- current descendants; selecting a leaf includes only that leaf. The resolved
-- UUID array is persisted so later taxonomy edits cannot silently widen a
-- running job. Legacy jobs keep category_id NULL and retain global behavior.

alter table public.catalog_product_audit_jobs
  add column if not exists category_id uuid references public.categories(id) on delete restrict,
  add column if not exists category_scope_ids uuid[] not null default '{}'::uuid[],
  add column if not exists category_label text;

alter table public.catalog_product_audit_jobs
  drop constraint if exists catalog_product_audit_jobs_category_scope_check;
alter table public.catalog_product_audit_jobs
  add constraint catalog_product_audit_jobs_category_scope_check
  check (
    category_id is null
    or (
      cardinality(category_scope_ids) between 1 and 500
      and category_id = any(category_scope_ids)
    )
  );

create index if not exists idx_catalog_product_audit_jobs_live_category
  on public.catalog_product_audit_jobs(category_id, status, created_at)
  where status in ('queued', 'running');

create index if not exists idx_products_catalog_audit_pending_category_cursor
  on public.products(category_id, (coalesce(created_at, '-infinity'::timestamptz)), id)
  include (status)
  where catalog_audit_attempted_at is null
    and catalog_audit_completed_at is null;

create or replace function public.create_catalog_product_audit_job_v3(
  actor_profile_id uuid,
  requested_agent_id uuid,
  requested_product_statuses text[],
  requested_category_id uuid,
  requested_max_products integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $catalog_audit_category$
declare
  normalized_statuses text[];
  selected_category public.categories%rowtype;
  parent_name_ka text;
  resolved_category_scope uuid[];
  category_label_ka text;
  eligible_total integer;
  product_total integer;
  job_snapshot_at timestamptz := now();
  new_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  if not exists (
    select 1
    from public.catalog_agents
    where id = requested_agent_id
      and is_active = true
      and 'audits:process' = any(scopes)
  ) then
    raise exception 'Active audit-capable catalog agent is required';
  end if;

  if requested_max_products is null
    or requested_max_products < 1
    or requested_max_products > 100000 then
    raise exception 'Requested audit product limit must be between 1 and 100000';
  end if;

  normalized_statuses := array(
    select distinct trim(status_name)
    from unnest(coalesce(requested_product_statuses, '{}'::text[])) as requested(status_name)
    where trim(status_name) in ('active', 'draft', 'archived', 'coming_soon')
    order by trim(status_name)
  );
  if cardinality(normalized_statuses) = 0 then
    raise exception 'At least one product status is required';
  end if;

  select category.*
  into selected_category
  from public.categories category
  where category.id = requested_category_id
    and category.is_active = true;
  if selected_category.id is null then
    raise exception 'An active catalog category is required';
  end if;

  with recursive category_scope as (
    select category.id
    from public.categories category
    where category.id = selected_category.id
      and category.is_active = true
    union
    select child.id
    from public.categories child
    join category_scope parent_scope on parent_scope.id = child.parent_id
    where child.is_active = true
  )
  select coalesce(array_agg(scope.id order by scope.id), '{}'::uuid[])
  into resolved_category_scope
  from category_scope scope;

  if cardinality(resolved_category_scope) = 0 then
    raise exception 'Selected catalog category has no active audit scope';
  end if;

  if selected_category.parent_id is null then
    category_label_ka := selected_category.name_ka
      || case when cardinality(resolved_category_scope) > 1 then ' — ყველა ქვეკატეგორია' else '' end;
  else
    select parent.name_ka
    into parent_name_ka
    from public.categories parent
    where parent.id = selected_category.parent_id;
    category_label_ka := concat_ws(' → ', parent_name_ka, selected_category.name_ka);
  end if;

  -- Serialize scope creation so two simultaneous submissions cannot both pass
  -- the overlap check and create separate spend budgets for the same products.
  perform pg_advisory_xact_lock(hashtext('hooma-catalog-audit-category-scope'));
  if exists (
    select 1
    from public.catalog_product_audit_jobs existing_job
    where existing_job.status in ('queued', 'running')
      and (
        existing_job.category_id is null
        or existing_job.category_scope_ids && resolved_category_scope
      )
  ) then
    raise exception 'Selected category overlaps an active catalog audit job';
  end if;

  select count(*)::integer
  into eligible_total
  from public.products product
  where product.status = any(normalized_statuses)
    and product.category_id = any(resolved_category_scope)
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
    and coalesce(product.created_at, '-infinity'::timestamptz) <= job_snapshot_at
    and exists (
      select 1
      from public.product_variants variant
      where variant.product_id = product.id
        and variant.is_active = true
    )
    and (
      product.hero_image like 'https://%'
      or exists (
        select 1
        from unnest(coalesce(product.gallery_images, '{}'::text[])) as gallery(image_url)
        where gallery.image_url like 'https://%'
      )
    );

  product_total := least(eligible_total, requested_max_products);
  if product_total = 0 then
    raise exception 'No unaudited products are available in this category scope';
  end if;

  insert into public.catalog_product_audit_jobs (
    agent_id,
    product_statuses,
    category_id,
    category_scope_ids,
    category_label,
    total_count,
    created_by,
    snapshot_at
  ) values (
    requested_agent_id,
    normalized_statuses,
    selected_category.id,
    resolved_category_scope,
    category_label_ka,
    product_total,
    actor_profile_id,
    job_snapshot_at
  )
  returning * into new_job;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_audit_job_created',
    'catalog_product_audit_job',
    new_job.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'product_statuses', to_jsonb(normalized_statuses),
      'category_id', selected_category.id,
      'category_slug', selected_category.slug,
      'category_label_ka', category_label_ka,
      'category_scope_ids', to_jsonb(resolved_category_scope),
      'requested_max_products', requested_max_products,
      'eligible_total', eligible_total,
      'total_count', product_total,
      'previously_attempted_products_excluded', true,
      'auditable_media_and_variant_required', true
    )
  );

  return jsonb_build_object(
    'id', new_job.id,
    'total_count', product_total,
    'eligible_total', eligible_total,
    'requested_max_products', requested_max_products,
    'category_id', selected_category.id,
    'category_label_ka', category_label_ka
  );
end;
$catalog_audit_category$;

-- Keep the legacy global creator safe during a rolling application deployment.
-- A previous server version may still call v2 briefly after this migration is
-- applied, so it participates in the same lock and cannot create a second
-- spend budget beside a scoped job.
create or replace function public.create_catalog_product_audit_job_v2(
  actor_profile_id uuid,
  requested_agent_id uuid,
  requested_product_statuses text[],
  requested_max_products integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $catalog_audit_category$
declare
  normalized_statuses text[];
  eligible_total integer;
  product_total integer;
  job_snapshot_at timestamptz := now();
  new_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  if not exists (
    select 1
    from public.catalog_agents
    where id = requested_agent_id
      and is_active = true
      and 'audits:process' = any(scopes)
  ) then
    raise exception 'Active audit-capable catalog agent is required';
  end if;

  if requested_max_products is null
    or requested_max_products < 1
    or requested_max_products > 100000 then
    raise exception 'Requested audit product limit must be between 1 and 100000';
  end if;

  normalized_statuses := array(
    select distinct trim(status_name)
    from unnest(coalesce(requested_product_statuses, '{}'::text[])) as requested(status_name)
    where trim(status_name) in ('active', 'draft', 'archived', 'coming_soon')
    order by trim(status_name)
  );
  if cardinality(normalized_statuses) = 0 then
    raise exception 'At least one product status is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('hooma-catalog-audit-category-scope'));
  if exists (
    select 1
    from public.catalog_product_audit_jobs existing_job
    where existing_job.status in ('queued', 'running')
  ) then
    raise exception 'A catalog audit job is already active';
  end if;

  select count(*)::integer
  into eligible_total
  from public.products product
  where product.status = any(normalized_statuses)
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
    and coalesce(product.created_at, '-infinity'::timestamptz) <= job_snapshot_at
    and exists (
      select 1
      from public.product_variants variant
      where variant.product_id = product.id
        and variant.is_active = true
    )
    and (
      product.hero_image like 'https://%'
      or exists (
        select 1
        from unnest(coalesce(product.gallery_images, '{}'::text[])) as gallery(image_url)
        where gallery.image_url like 'https://%'
      )
    );

  product_total := least(eligible_total, requested_max_products);
  if product_total = 0 then
    raise exception 'No unaudited products are available';
  end if;

  insert into public.catalog_product_audit_jobs (
    agent_id,
    product_statuses,
    total_count,
    created_by,
    snapshot_at
  ) values (
    requested_agent_id,
    normalized_statuses,
    product_total,
    actor_profile_id,
    job_snapshot_at
  )
  returning * into new_job;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_audit_job_created',
    'catalog_product_audit_job',
    new_job.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'product_statuses', to_jsonb(normalized_statuses),
      'requested_max_products', requested_max_products,
      'eligible_total', eligible_total,
      'total_count', product_total,
      'legacy_global_scope', true,
      'previously_attempted_products_excluded', true,
      'auditable_media_and_variant_required', true
    )
  );

  return jsonb_build_object(
    'id', new_job.id,
    'total_count', product_total,
    'eligible_total', eligible_total,
    'requested_max_products', requested_max_products
  );
end;
$catalog_audit_category$;

-- Keep the existing v2 ceiling wrapper. It locks the job before counting item
-- rows and then calls this base selector, so concurrent workers cannot exceed
-- total_count. Only the persisted category predicate is new here.
create or replace function public.claim_catalog_product_audit_item(
  requested_agent_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $catalog_audit_category$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  selected_item public.catalog_product_audit_items%rowtype;
  selected_product public.products%rowtype;
  stale_item_id uuid;
  stale_product_id uuid;
  competing_item_id uuid;
  competing_job_id uuid;
  changed_count integer := 0;
begin
  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and job.status = 'running'
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then
    raise exception 'Catalog audit job is not available';
  end if;

  update public.catalog_product_audit_items item
  set status = 'failed',
      review_visible = true,
      processed_at = now(),
      error_message = 'Sealed catalog audit attempt timed out; a late result will still be accepted'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id = product.catalog_audit_attempted_item_id
    and item.status = 'processing'
    and item.processing_started_at < now() - interval '2 hours';
  get diagnostics changed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'failed', changed_count
  );

  update public.catalog_product_audit_items item
  set status = 'skipped',
      review_visible = false,
      processed_at = coalesce(item.processed_at, now()),
      error_message = 'Product already has a different canonical catalog audit attempt'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id is distinct from product.catalog_audit_attempted_item_id
    and item.status = 'processing'
    and product.catalog_audit_attempted_at is not null;
  get diagnostics changed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'skipped', changed_count
  );

  select item.id, item.product_id
  into stale_item_id, stale_product_id
  from public.catalog_product_audit_items item
  join public.products product on product.id = item.product_id
  where item.job_id = requested_job_id
    and item.status = 'processing'
    and item.processing_started_at < now() - interval '20 minutes'
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
  order by item.processing_started_at, item.id
  limit 1;

  if stale_item_id is not null then
    select product.* into selected_product
    from public.products product
    where product.id = stale_product_id
    for update;

    if selected_product.id is not null then
      select * into selected_item
      from public.catalog_product_audit_items item
      where item.id = stale_item_id
        and item.job_id = requested_job_id
        and item.status = 'processing'
        and item.processing_started_at < now() - interval '20 minutes'
      for update;

      if selected_item.id is not null
        and selected_product.catalog_audit_attempted_at is not null then
        update public.catalog_product_audit_items
        set status = 'skipped',
            review_visible = false,
            processed_at = coalesce(processed_at, now()),
            error_message = 'Product already has a canonical catalog audit attempt'
        where id = selected_item.id;
        perform public.adjust_catalog_product_audit_job_counters_v1(
          requested_job_id, 'processing', 'skipped', 1
        );
        return to_jsonb(selected_item) || jsonb_build_object('status', 'skipped');
      end if;

      if selected_item.id is not null then
        update public.catalog_product_audit_items
        set attempts = attempts + 1,
            processing_started_at = now(),
            current_snapshot = '{}'::jsonb,
            error_message = null
        where id = selected_item.id
        returning * into selected_item;
        update public.catalog_product_audit_jobs
        set heartbeat_at = now()
        where id = requested_job_id;
        return to_jsonb(selected_item);
      end if;
    end if;
  end if;

  select product.* into selected_product
  from public.products product
  where product.status = any(selected_job.product_statuses)
    and (
      selected_job.category_id is null
      or product.category_id = any(selected_job.category_scope_ids)
    )
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
    and coalesce(product.created_at, '-infinity'::timestamptz) <= selected_job.snapshot_at
    and exists (
      select 1
      from public.product_variants variant
      where variant.product_id = product.id
        and variant.is_active = true
    )
    and (
      product.hero_image like 'https://%'
      or exists (
        select 1
        from unnest(coalesce(product.gallery_images, '{}'::text[])) as gallery(image_url)
        where gallery.image_url like 'https://%'
      )
    )
    and (
      selected_job.cursor_created_at is null
      or (coalesce(product.created_at, '-infinity'::timestamptz), product.id)
        > (selected_job.cursor_created_at, selected_job.cursor_product_id)
    )
  order by coalesce(product.created_at, '-infinity'::timestamptz), product.id
  limit 1
  for update of product;

  if selected_product.id is null then
    return null;
  end if;

  select item.id, item.job_id
  into competing_item_id, competing_job_id
  from public.catalog_product_audit_items item
  where item.product_id = selected_product.id
    and item.status in ('processing', 'ready')
  order by item.created_at, item.id
  limit 1;

  if competing_item_id is not null then
    if competing_job_id = requested_job_id then
      raise exception 'Audit cursor attempted to claim the same live product twice';
    end if;

    insert into public.catalog_product_audit_items (
      job_id,
      product_id,
      status,
      review_visible,
      processed_at,
      error_message
    ) values (
      selected_job.id,
      selected_product.id,
      'skipped',
      false,
      now(),
      'Product is already being audited by another job'
    )
    on conflict (job_id, product_id) do nothing
    returning * into selected_item;

    update public.catalog_product_audit_jobs
    set cursor_created_at = coalesce(selected_product.created_at, '-infinity'::timestamptz),
        cursor_product_id = selected_product.id,
        heartbeat_at = now()
    where id = selected_job.id;

    if selected_item.id is not null then
      perform public.adjust_catalog_product_audit_job_counters_v1(
        requested_job_id, null, 'skipped', 1
      );
      return to_jsonb(selected_item);
    end if;
    return jsonb_build_object(
      'id', competing_item_id,
      'job_id', requested_job_id,
      'product_id', selected_product.id,
      'status', 'skipped'
    );
  end if;

  insert into public.catalog_product_audit_items (job_id, product_id)
  values (selected_job.id, selected_product.id)
  on conflict do nothing
  returning * into selected_item;

  update public.catalog_product_audit_jobs
  set cursor_created_at = coalesce(selected_product.created_at, '-infinity'::timestamptz),
      cursor_product_id = selected_product.id,
      heartbeat_at = now()
  where id = selected_job.id;

  if selected_item.id is null then
    return jsonb_build_object(
      'id', gen_random_uuid(),
      'job_id', requested_job_id,
      'product_id', selected_product.id,
      'status', 'skipped'
    );
  end if;

  return to_jsonb(selected_item);
end;
$catalog_audit_category$;

revoke all on function public.create_catalog_product_audit_job_v3(
  uuid, uuid, text[], uuid, integer
) from public, anon, authenticated;
grant execute on function public.create_catalog_product_audit_job_v3(
  uuid, uuid, text[], uuid, integer
) to service_role;

revoke all on function public.create_catalog_product_audit_job_v2(
  uuid, uuid, text[], integer
) from public, anon, authenticated;
grant execute on function public.create_catalog_product_audit_job_v2(
  uuid, uuid, text[], integer
) to service_role;

-- v1 has no quantity/category budget and is no longer called by the app.
revoke execute on function public.create_catalog_product_audit_job_v1(
  uuid, uuid, text[]
) from service_role;

revoke all on function public.claim_catalog_product_audit_item(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_catalog_product_audit_item(
  uuid, uuid
) to service_role;
