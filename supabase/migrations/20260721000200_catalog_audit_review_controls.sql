-- Catalog audit review controls: permanent approval marker, human media choices,
-- corrected storefront names, and an uncluttered active-review queue.

alter table public.products
  add column if not exists catalog_audit_applied_at timestamptz,
  add column if not exists catalog_audit_applied_item_id uuid;

alter table public.catalog_product_audit_items
  add column if not exists review_overrides jsonb not null default '{}'::jsonb,
  add column if not exists review_visible boolean not null default true;

update public.catalog_product_audit_items
set review_visible = false
where status = 'rejected'
  and review_visible = true;

with latest_applied as (
  select distinct on (item.product_id)
    item.product_id,
    item.id as audit_item_id,
    coalesce(item.reviewed_at, item.updated_at, item.created_at, now()) as applied_at
  from public.catalog_product_audit_items item
  where item.status = 'applied'
    and char_length(trim(coalesce(item.suggestion->>'name_ka', ''))) between 2 and 160
    and char_length(trim(coalesce(item.suggestion->>'name_en', ''))) between 2 and 160
  order by item.product_id, item.reviewed_at desc nulls last, item.updated_at desc, item.id desc
)
update public.products product
set catalog_audit_applied_at = approved.applied_at,
    catalog_audit_applied_item_id = approved.audit_item_id
from latest_applied approved
where product.id = approved.product_id
  and product.catalog_audit_applied_at is null;

update public.catalog_product_audit_items item
set review_visible = false
where exists (
  select 1
  from public.products product
  where product.id = item.product_id
    and product.catalog_audit_applied_at is not null
);

update public.catalog_product_audit_items item
set status = 'skipped',
    review_visible = false,
    processed_at = coalesce(item.processed_at, now()),
    error_message = 'Product was already approved by another catalog audit'
where item.status in ('processing', 'ready')
  and exists (
    select 1
    from public.products product
    where product.id = item.product_id
      and product.catalog_audit_applied_at is not null
  );

update public.catalog_product_audit_items
set status = 'failed',
    processed_at = coalesce(processed_at, now()),
    error_message = 'Audit result predates product-name correction; run the product through a new audit'
where status = 'ready'
  and (
    char_length(trim(coalesce(suggestion->>'name_ka', ''))) not between 2 and 160
    or char_length(trim(coalesce(suggestion->>'name_en', ''))) not between 2 and 160
  );

alter table public.catalog_product_audit_items
  drop constraint if exists catalog_product_audit_ready_names_check;

alter table public.catalog_product_audit_items
  add constraint catalog_product_audit_ready_names_check
  check (
    status <> 'ready'
    or (
      char_length(trim(coalesce(suggestion->>'name_ka', ''))) between 2 and 160
      and char_length(trim(coalesce(suggestion->>'name_en', ''))) between 2 and 160
    )
  );

create index if not exists idx_products_catalog_audit_pending_cursor
  on public.products(status, coalesce(created_at, '-infinity'::timestamptz), id)
  where catalog_audit_applied_at is null;

create index if not exists idx_catalog_product_audit_items_applied_product
  on public.catalog_product_audit_items(product_id, reviewed_at desc)
  where status = 'applied';

drop index if exists public.idx_catalog_product_audit_items_visible_review;
create index idx_catalog_product_audit_items_visible_review
  on public.catalog_product_audit_items(status, updated_at desc, id)
  where review_visible = true and status in ('ready', 'failed');

create or replace function public.create_catalog_product_audit_job_v1(
  actor_profile_id uuid,
  requested_agent_id uuid,
  requested_product_statuses text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_statuses text[];
  product_total integer;
  new_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  if not exists (
    select 1 from public.catalog_agents
    where id = requested_agent_id
      and is_active = true
      and 'audits:process' = any(scopes)
  ) then raise exception 'Active audit-capable catalog agent is required'; end if;

  normalized_statuses := array(
    select distinct trim(status_name)
    from unnest(coalesce(requested_product_statuses, '{}'::text[])) as requested(status_name)
    where trim(status_name) in ('active', 'draft', 'archived', 'coming_soon')
    order by trim(status_name)
  );
  if cardinality(normalized_statuses) = 0 then
    raise exception 'At least one product status is required';
  end if;

  select count(*)::integer into product_total
  from public.products
  where status = any(normalized_statuses)
    and catalog_audit_applied_at is null;

  insert into public.catalog_product_audit_jobs (
    agent_id, product_statuses, total_count, created_by, snapshot_at
  ) values (
    requested_agent_id, normalized_statuses, product_total, actor_profile_id, now()
  ) returning * into new_job;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_audit_job_created',
    'catalog_product_audit_job',
    new_job.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'product_statuses', to_jsonb(normalized_statuses),
      'total_count', product_total,
      'previously_approved_products_excluded', true
    )
  );

  return jsonb_build_object('id', new_job.id, 'total_count', product_total);
end;
$$;

create or replace function public.claim_catalog_product_audit_item(
  requested_agent_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  selected_item public.catalog_product_audit_items%rowtype;
  selected_product public.products%rowtype;
  skipped_duplicates integer := 0;
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
  if selected_job.id is null then raise exception 'Catalog audit job is not available'; end if;

  update public.catalog_product_audit_items item
  set status = 'skipped',
      review_visible = false,
      processed_at = coalesce(item.processed_at, now()),
      error_message = 'Product was already approved by another catalog audit'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.status in ('processing', 'ready')
    and product.catalog_audit_applied_at is not null;
  get diagnostics skipped_duplicates = row_count;
  if skipped_duplicates > 0 then
    perform public.refresh_catalog_product_audit_job_counters(requested_job_id);
  end if;

  select * into selected_item
  from public.catalog_product_audit_items item
  where item.job_id = requested_job_id
    and item.status = 'processing'
    and item.processing_started_at < now() - interval '20 minutes'
  order by item.processing_started_at
  limit 1
  for update skip locked;

  if selected_item.id is not null then
    update public.catalog_product_audit_items
    set attempts = attempts + 1,
        processing_started_at = now(),
        error_message = null
    where id = selected_item.id
    returning * into selected_item;
    update public.catalog_product_audit_jobs set heartbeat_at = now() where id = requested_job_id;
    return to_jsonb(selected_item);
  end if;

  select product.* into selected_product
  from public.products product
  where product.status = any(selected_job.product_statuses)
    and product.catalog_audit_applied_at is null
    and coalesce(product.created_at, '-infinity'::timestamptz) <= selected_job.snapshot_at
    and (
      selected_job.cursor_created_at is null
      or (coalesce(product.created_at, '-infinity'::timestamptz), product.id)
        > (selected_job.cursor_created_at, selected_job.cursor_product_id)
    )
  order by coalesce(product.created_at, '-infinity'::timestamptz), product.id
  limit 1
  for update of product;

  if selected_product.id is null then return null; end if;

  insert into public.catalog_product_audit_items (job_id, product_id)
  values (selected_job.id, selected_product.id)
  on conflict (job_id, product_id) do update
  set processing_started_at = now(),
      attempts = public.catalog_product_audit_items.attempts + 1,
      error_message = null
  returning * into selected_item;

  update public.catalog_product_audit_jobs
  set cursor_created_at = coalesce(selected_product.created_at, '-infinity'::timestamptz),
      cursor_product_id = selected_product.id,
      heartbeat_at = now()
  where id = selected_job.id;

  return to_jsonb(selected_item);
end;
$$;

create or replace function public.apply_catalog_product_audit_item_v2(
  actor_profile_id uuid,
  requested_item_id uuid,
  requested_kept_image_urls text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_item public.catalog_product_audit_items%rowtype;
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  requested_product_id uuid;
  name_ka_value text;
  name_en_value text;
  description_ka text;
  description_en text;
  dimensions jsonb;
  dimension_x numeric;
  dimension_y numeric;
  dimension_z numeric;
  current_images text[];
  snapshot_images text[];
  submitted_images text[];
  selected_images text[];
  kept_images text[];
  removed_images text[];
  hero_image_url text;
  ordered_images text[];
  size_label_value text;
  review_override jsonb;
  locked_job_ids uuid[];
  affected_job_ids uuid[];
  affected_job_id uuid;
  manual_media_override boolean := requested_kept_image_urls is not null;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id;
  if requested_product_id is null then raise exception 'Catalog audit item not found'; end if;

  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into locked_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = requested_product_id;

  -- Claims serialize on their job before waiting for a product. Finalization
  -- takes the same locks in a stable order, then locks product before item.
  perform 1
  from public.catalog_product_audit_jobs job
  where job.id = any(locked_job_ids)
  order by job.id
  for update;

  select product.* into product_record
  from public.products product
  join public.catalog_product_audit_items item on item.product_id = product.id
  where item.id = requested_item_id
    and product.id = requested_product_id
  for update of product;
  if product_record.id is null then raise exception 'Catalog audit item or product not found'; end if;

  select * into audit_item
  from public.catalog_product_audit_items
  where id = requested_item_id
    and product_id = product_record.id
  for update;
  if audit_item.id is null then raise exception 'Catalog audit item not found'; end if;
  if audit_item.status <> 'ready' then raise exception 'Only ready audit items can be applied'; end if;

  -- A claim from a previously unrelated job may have committed while this
  -- transaction waited for the product. Re-read once the product lock makes
  -- the affected set stable for this product.
  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into affected_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = audit_item.product_id;
  if affected_job_ids is distinct from locked_job_ids then
    raise exception 'Concurrent audit claim changed product jobs; retry approval';
  end if;

  if product_record.catalog_audit_applied_at is not null then
    update public.catalog_product_audit_items
    set status = 'skipped',
        review_visible = false,
        processed_at = coalesce(processed_at, now()),
        error_message = 'Product was already approved by another catalog audit'
    where product_id = audit_item.product_id
      and status in ('processing', 'ready');
    update public.catalog_product_audit_items
    set review_visible = false
    where product_id = audit_item.product_id
      and review_visible = true;
    foreach affected_job_id in array affected_job_ids loop
      perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
    end loop;
    return jsonb_build_object(
      'product_id', product_record.id,
      'already_applied', true,
      'applied_at', product_record.catalog_audit_applied_at
    );
  end if;

  select * into variant_record
  from public.product_variants
  where id = nullif(audit_item.current_snapshot->>'variant_id', '')::uuid
    and product_id = audit_item.product_id
  for update;
  if variant_record.id is null then raise exception 'Product variant changed after audit'; end if;

  if product_record.updated_at is distinct from nullif(audit_item.current_snapshot->>'product_updated_at', '')::timestamptz
    or variant_record.updated_at is distinct from nullif(audit_item.current_snapshot->>'variant_updated_at', '')::timestamptz then
    raise exception 'Product changed after audit; run a new audit before applying';
  end if;

  name_ka_value := trim(coalesce(nullif(audit_item.suggestion->>'name_ka', ''), product_record.name_ka, product_record.hooma_name));
  name_en_value := trim(coalesce(nullif(audit_item.suggestion->>'name_en', ''), product_record.hooma_name, product_record.name_ka));
  description_ka := trim(audit_item.suggestion->>'description_ka');
  description_en := trim(audit_item.suggestion->>'description_en');
  dimensions := audit_item.suggestion->'dimensions_mm';
  dimension_x := (dimensions->>'x')::numeric;
  dimension_y := (dimensions->>'y')::numeric;
  dimension_z := (dimensions->>'z')::numeric;

  if char_length(name_ka_value) not between 2 and 160
    or char_length(name_en_value) not between 2 and 160 then
    raise exception 'Suggested product names are invalid';
  end if;
  if char_length(description_ka) not between 10 and 800
    or char_length(description_en) not between 10 and 800 then
    raise exception 'Suggested descriptions are invalid';
  end if;
  if dimension_x not between 1 and 5000
    or dimension_y not between 1 and 5000
    or dimension_z not between 1 and 5000 then
    raise exception 'Suggested dimensions are invalid';
  end if;

  select coalesce(array_agg(media_url order by first_position), '{}'::text[])
  into current_images
  from (
    select media_url, min(position) as first_position
    from unnest(
      case when product_record.hero_image is null then '{}'::text[] else array[product_record.hero_image] end
      || coalesce(product_record.gallery_images, '{}'::text[])
    ) with ordinality as media(media_url, position)
    where media_url is not null and char_length(trim(media_url)) > 0
    group by media_url
  ) current_media;

  select coalesce(array_agg(media_url order by first_position), '{}'::text[])
  into snapshot_images
  from (
    select media_url, min(position) as first_position
    from jsonb_array_elements_text(coalesce(audit_item.current_snapshot->'gallery_images', '[]'::jsonb))
      with ordinality as media(media_url, position)
    where media_url ~ '^https://'
    group by media_url
  ) snapshot_media;

  if cardinality(snapshot_images) < 1 then
    raise exception 'Audit snapshot contains no product images';
  end if;

  if manual_media_override then
    if cardinality(requested_kept_image_urls) not between 1 and 12 then
      raise exception 'Keep between 1 and 12 product images';
    end if;
    if exists (
      select 1 from unnest(requested_kept_image_urls) as requested(media_url)
      where media_url is null or trim(media_url) !~ '^https://'
    ) then raise exception 'Submitted media selection is invalid'; end if;

    select coalesce(array_agg(media_url order by first_position), '{}'::text[])
    into submitted_images
    from (
      select trim(media_url) as media_url, min(position) as first_position
      from unnest(requested_kept_image_urls) with ordinality as submitted(media_url, position)
      group by trim(media_url)
    ) normalized_submission;
  else
    select coalesce(array_agg(media_url order by first_position), '{}'::text[])
    into submitted_images
    from (
      select trim(media_url) as media_url, min(position) as first_position
      from jsonb_array_elements_text(coalesce(audit_item.suggestion->'kept_image_urls', '[]'::jsonb))
        with ordinality as submitted(media_url, position)
      group by trim(media_url)
    ) normalized_suggestion;
  end if;

  if cardinality(submitted_images) < 1
    or not (submitted_images <@ snapshot_images) then
    raise exception 'Selected media does not match the audit snapshot';
  end if;

  select coalesce(array_agg(media_url order by position), '{}'::text[])
  into selected_images
  from unnest(snapshot_images) with ordinality as snapshot(media_url, position)
  where media_url = any(submitted_images);

  if cardinality(selected_images) < 1
    or not (selected_images <@ current_images) then
    raise exception 'Selected media no longer matches the product';
  end if;

  hero_image_url := audit_item.suggestion->>'hero_image_url';
  if hero_image_url is null or not (hero_image_url = any(selected_images)) then
    hero_image_url := selected_images[1];
  end if;

  select selected_images || coalesce(array_agg(media_url order by position), '{}'::text[])
  into kept_images
  from unnest(current_images) with ordinality as current_media(media_url, position)
  where not (media_url = any(snapshot_images));

  select coalesce(array_agg(media_url order by position), '{}'::text[])
  into removed_images
  from unnest(snapshot_images) with ordinality as snapshot(media_url, position)
  where not (media_url = any(selected_images));

  select coalesce(array_agg(media_url order by position), '{}'::text[])
  into ordered_images
  from (
    select hero_image_url as media_url, 0::bigint as position
    union all
    select media_url, position
    from unnest(kept_images) with ordinality as kept(media_url, position)
    where media_url <> hero_image_url
  ) ordered;

  review_override := jsonb_build_object(
    'manual_media_override', manual_media_override,
    'kept_image_urls', to_jsonb(kept_images),
    'removed_image_urls', to_jsonb(removed_images),
    'hero_image_url', hero_image_url,
    'reviewed_by', actor_profile_id,
    'reviewed_at', now()
  );

  size_label_value := '≈ '
    || round(dimension_x, 1)::text || ' × '
    || round(dimension_y, 1)::text || ' × '
    || round(dimension_z, 1)::text || ' მმ';

  update public.products
  set hooma_name = name_en_value,
      name_ka = name_ka_value,
      short_description = description_en,
      short_description_ka = description_ka,
      long_description = description_en,
      long_description_ka = description_ka,
      hero_image = hero_image_url,
      gallery_images = ordered_images,
      catalog_audit_applied_at = now(),
      catalog_audit_applied_item_id = audit_item.id
  where id = product_record.id;

  update public.product_variants
  set product_dimensions_cm = jsonb_build_object(
        'x', round(dimension_x, 1),
        'y', round(dimension_y, 1),
        'z', round(dimension_z, 1),
        'unit', 'mm',
        'approximate', true,
        'source', 'catalog_product_auditor'
      ),
      size_label = case
        when size_label is null
          or lower(trim(size_label)) in ('standard', 'standart', 'სტანდარტი', 'სტანდარტული')
          then size_label_value
        else size_label
      end,
      image = case when image is null or not (image = any(kept_images)) then hero_image_url else image end,
      attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object(
        'dimensions_are_approximate', true,
        'dimensions_source', 'catalog_product_auditor',
        'dimensions_audited_at', now()
      )
  where id = variant_record.id;

  update public.product_variants
  set image = hero_image_url
  where product_id = product_record.id
    and id <> variant_record.id
    and (image is null or not (image = any(kept_images)));

  update public.catalog_product_audit_items
  set status = 'applied',
      review_overrides = review_override,
      review_visible = false,
      reviewed_by = actor_profile_id,
      reviewed_at = now(),
      error_message = null
  where id = audit_item.id;

  update public.catalog_product_audit_items
  set status = 'skipped',
      review_visible = false,
      processed_at = coalesce(processed_at, now()),
      error_message = 'Product was approved by another catalog audit item'
  where product_id = product_record.id
    and id <> audit_item.id
    and status in ('processing', 'ready');

  update public.catalog_product_audit_items
  set review_visible = false
  where product_id = product_record.id
    and review_visible = true;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_audit_applied',
    'product',
    product_record.id::text,
    jsonb_build_object(
      'audit_item_id', audit_item.id,
      'audit_job_id', audit_item.job_id,
      'confidence', audit_item.confidence,
      'previous', audit_item.current_snapshot,
      'agent_suggestion', audit_item.suggestion,
      'review_overrides', review_override,
      'removed_image_urls', to_jsonb(removed_images),
      'storage_objects_deleted', false
    )
  );

  foreach affected_job_id in array affected_job_ids loop
    perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
  end loop;

  return jsonb_build_object(
    'product_id', product_record.id,
    'removed_image_urls', to_jsonb(removed_images),
    'size_label', size_label_value,
    'name_ka', name_ka_value,
    'name_en', name_en_value
  );
end;
$$;

create or replace function public.apply_catalog_product_audit_item_v1(
  actor_profile_id uuid,
  requested_item_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.apply_catalog_product_audit_item_v2(actor_profile_id, requested_item_id, null::text[]);
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
  affected_job_id uuid;
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

  foreach affected_job_id in array affected_job_ids loop
    update public.catalog_product_audit_jobs
    set total_count = greatest(0, total_count - 1)
    where id = affected_job_id;
    perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
  end loop;

  return deletion_result || jsonb_build_object(
    'audit_item_id', requested_item_id,
    'affected_audit_job_ids', to_jsonb(affected_job_ids)
  );
end;
$$;

do $$
declare
  affected_job_id uuid;
begin
  for affected_job_id in
    select distinct item.job_id
    from public.catalog_product_audit_items item
    left join public.products product on product.id = item.product_id
    where product.catalog_audit_applied_at is not null
      or item.error_message = 'Audit result predates product-name correction; run the product through a new audit'
  loop
    perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
  end loop;
end;
$$;

revoke all on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.claim_catalog_product_audit_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_catalog_product_audit_item_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_catalog_product_audit_item_v2(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.delete_catalog_product_from_audit_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) to service_role;
grant execute on function public.claim_catalog_product_audit_item(uuid, uuid) to service_role;
grant execute on function public.apply_catalog_product_audit_item_v1(uuid, uuid) to service_role;
grant execute on function public.apply_catalog_product_audit_item_v2(uuid, uuid, text[]) to service_role;
grant execute on function public.delete_catalog_product_from_audit_v1(uuid, uuid) to service_role;
