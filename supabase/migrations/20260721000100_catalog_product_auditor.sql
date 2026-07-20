-- Catalog Product Auditor: resumable, least-privilege AI review for existing
-- product copy, approximate dimensions, and gallery relevance.

alter table public.catalog_agents
  drop constraint if exists catalog_agents_scopes_check;

alter table public.catalog_agents
  add constraint catalog_agents_scopes_check
  check (scopes <@ array['jobs:claim', 'drafts:create', 'audits:process']::text[]);

update public.catalog_agents
set scopes = array(
  select distinct scope_name
  from unnest(scopes || array['audits:process']::text[]) as allowed(scope_name)
  order by scope_name
)
where not ('audits:process' = any(scopes));

create table if not exists public.catalog_product_audit_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.catalog_agents(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  product_statuses text[] not null default array['active', 'draft']::text[]
    check (
      cardinality(product_statuses) between 1 and 4
      and product_statuses <@ array['active', 'draft', 'archived', 'coming_soon']::text[]
    ),
  total_count integer not null default 0 check (total_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  ready_count integer not null default 0 check (ready_count >= 0),
  applied_count integer not null default 0 check (applied_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  worker_name text,
  snapshot_at timestamptz not null default now(),
  cursor_created_at timestamptz,
  cursor_product_id uuid,
  error_message text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_product_audit_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.catalog_product_audit_jobs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'applied', 'rejected', 'skipped', 'failed')),
  current_snapshot jsonb not null default '{}'::jsonb,
  suggestion jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  warnings text[] not null default '{}'::text[],
  model_name text,
  provider_response_id text,
  processing_ms integer check (processing_ms is null or processing_ms >= 0),
  error_message text,
  attempts integer not null default 1 check (attempts between 1 and 20),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, product_id)
);

create index if not exists idx_catalog_product_audit_jobs_agent_status
  on public.catalog_product_audit_jobs(agent_id, status, created_at);
create index if not exists idx_catalog_product_audit_items_job_status
  on public.catalog_product_audit_items(job_id, status, created_at);
create index if not exists idx_catalog_product_audit_items_product
  on public.catalog_product_audit_items(product_id, created_at desc);
create index if not exists idx_catalog_product_audit_items_ready_confidence
  on public.catalog_product_audit_items(job_id, confidence desc, created_at)
  where status = 'ready';
create index if not exists idx_catalog_product_audit_products_cursor
  on public.products(status, coalesce(created_at, '-infinity'::timestamptz), id);

drop trigger if exists set_catalog_product_audit_jobs_updated_at on public.catalog_product_audit_jobs;
create trigger set_catalog_product_audit_jobs_updated_at
before update on public.catalog_product_audit_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_product_audit_items_updated_at on public.catalog_product_audit_items;
create trigger set_catalog_product_audit_items_updated_at
before update on public.catalog_product_audit_items
for each row execute function public.set_updated_at();

alter table public.catalog_product_audit_jobs enable row level security;
alter table public.catalog_product_audit_items enable row level security;
revoke all on public.catalog_product_audit_jobs from public, anon, authenticated;
revoke all on public.catalog_product_audit_items from public, anon, authenticated;
grant all on public.catalog_product_audit_jobs to service_role;
grant all on public.catalog_product_audit_items to service_role;

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
  where status = any(normalized_statuses);

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
      'total_count', product_total
    )
  );

  return jsonb_build_object('id', new_job.id, 'total_count', product_total);
end;
$$;

create or replace function public.claim_catalog_product_audit_job(
  requested_agent_id uuid,
  requested_worker_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1 from public.catalog_agents
    where id = requested_agent_id
      and is_active = true
      and 'audits:process' = any(scopes)
  ) then raise exception 'Inactive or unauthorized catalog agent'; end if;

  select * into selected_job
  from public.catalog_product_audit_jobs
  where agent_id = requested_agent_id and status = 'running'
  order by claimed_at nulls last, created_at
  limit 1
  for update skip locked;

  if selected_job.id is null then
    select * into selected_job
    from public.catalog_product_audit_jobs
    where agent_id = requested_agent_id and status = 'queued'
    order by created_at
    limit 1
    for update skip locked;
  end if;

  if selected_job.id is null then return null; end if;

  update public.catalog_product_audit_jobs
  set status = 'running',
      worker_name = left(nullif(trim(requested_worker_name), ''), 120),
      claimed_at = coalesce(claimed_at, now()),
      heartbeat_at = now(),
      error_message = null
  where id = selected_job.id
  returning * into selected_job;

  update public.catalog_agents set last_seen_at = now() where id = requested_agent_id;
  return to_jsonb(selected_job);
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

  select * into selected_item
  from public.catalog_product_audit_items
  where job_id = requested_job_id
    and status = 'processing'
    and processing_started_at < now() - interval '20 minutes'
  order by processing_started_at
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
    and coalesce(product.created_at, '-infinity'::timestamptz) <= selected_job.snapshot_at
    and (
      selected_job.cursor_created_at is null
      or (coalesce(product.created_at, '-infinity'::timestamptz), product.id)
        > (selected_job.cursor_created_at, selected_job.cursor_product_id)
    )
  order by coalesce(product.created_at, '-infinity'::timestamptz), product.id
  limit 1;

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

create or replace function public.refresh_catalog_product_audit_job_counters(requested_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counters jsonb;
begin
  select jsonb_build_object(
    'processed_count', count(*) filter (where status in ('ready', 'applied', 'rejected', 'skipped', 'failed')),
    'ready_count', count(*) filter (where status = 'ready'),
    'applied_count', count(*) filter (where status = 'applied'),
    'rejected_count', count(*) filter (where status = 'rejected'),
    'skipped_count', count(*) filter (where status = 'skipped'),
    'failed_count', count(*) filter (where status = 'failed'),
    'processing_count', count(*) filter (where status = 'processing')
  ) into counters
  from public.catalog_product_audit_items
  where job_id = requested_job_id;

  update public.catalog_product_audit_jobs
  set processed_count = (counters->>'processed_count')::integer,
      ready_count = (counters->>'ready_count')::integer,
      applied_count = (counters->>'applied_count')::integer,
      rejected_count = (counters->>'rejected_count')::integer,
      skipped_count = (counters->>'skipped_count')::integer,
      failed_count = (counters->>'failed_count')::integer,
      heartbeat_at = case when status = 'running' then now() else heartbeat_at end
  where id = requested_job_id;

  return counters;
end;
$$;

create or replace function public.apply_catalog_product_audit_item_v1(
  actor_profile_id uuid,
  requested_item_id uuid
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
  description_ka text;
  description_en text;
  dimensions jsonb;
  dimension_x numeric;
  dimension_y numeric;
  dimension_z numeric;
  current_images text[];
  kept_images text[];
  removed_images text[];
  hero_image_url text;
  ordered_images text[];
  size_label_value text;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  select * into audit_item
  from public.catalog_product_audit_items
  where id = requested_item_id
  for update;
  if audit_item.id is null then raise exception 'Catalog audit item not found'; end if;
  if audit_item.status <> 'ready' then raise exception 'Only ready audit items can be applied'; end if;

  select * into product_record
  from public.products
  where id = audit_item.product_id
  for update;
  if product_record.id is null then raise exception 'Product not found'; end if;

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

  description_ka := trim(audit_item.suggestion->>'description_ka');
  description_en := trim(audit_item.suggestion->>'description_en');
  dimensions := audit_item.suggestion->'dimensions_mm';
  dimension_x := (dimensions->>'x')::numeric;
  dimension_y := (dimensions->>'y')::numeric;
  dimension_z := (dimensions->>'z')::numeric;
  hero_image_url := audit_item.suggestion->>'hero_image_url';

  if char_length(description_ka) not between 10 and 800
    or char_length(description_en) not between 10 and 800 then
    raise exception 'Suggested descriptions are invalid';
  end if;
  if dimension_x not between 1 and 5000
    or dimension_y not between 1 and 5000
    or dimension_z not between 1 and 5000 then
    raise exception 'Suggested dimensions are invalid';
  end if;

  select coalesce(array_agg(distinct media_url order by media_url), '{}'::text[])
  into current_images
  from unnest(
    coalesce(product_record.gallery_images, '{}'::text[])
    || case when product_record.hero_image is null then '{}'::text[] else array[product_record.hero_image] end
  ) as media(media_url)
  where media_url is not null and char_length(media_url) > 0;

  select coalesce(array_agg(media_url order by position), '{}'::text[])
  into kept_images
  from jsonb_array_elements_text(coalesce(audit_item.suggestion->'kept_image_urls', '[]'::jsonb))
    with ordinality as kept(media_url, position);

  if cardinality(kept_images) < 1
    or not (kept_images <@ current_images)
    or not (hero_image_url = any(kept_images)) then
    raise exception 'Suggested media no longer matches the product';
  end if;

  select coalesce(array_agg(media_url order by position), '{}'::text[])
  into ordered_images
  from (
    select hero_image_url as media_url, 0::bigint as position
    union all
    select media_url, position
    from unnest(kept_images) with ordinality as kept(media_url, position)
    where media_url <> hero_image_url
  ) ordered;

  select coalesce(array_agg(media_url order by media_url), '{}'::text[])
  into removed_images
  from unnest(current_images) as media(media_url)
  where not (media_url = any(kept_images));

  size_label_value := '≈ '
    || round(dimension_x, 1)::text || ' × '
    || round(dimension_y, 1)::text || ' × '
    || round(dimension_z, 1)::text || ' მმ';

  update public.products
  set short_description = description_en,
      short_description_ka = description_ka,
      long_description = description_en,
      long_description_ka = description_ka,
      hero_image = hero_image_url,
      gallery_images = ordered_images
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
      reviewed_by = actor_profile_id,
      reviewed_at = now(),
      error_message = null
  where id = audit_item.id;

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
      'suggestion', audit_item.suggestion,
      'removed_image_urls', to_jsonb(removed_images),
      'storage_objects_deleted', false
    )
  );

  perform public.refresh_catalog_product_audit_job_counters(audit_item.job_id);
  return jsonb_build_object(
    'product_id', product_record.id,
    'removed_image_urls', to_jsonb(removed_images),
    'size_label', size_label_value
  );
end;
$$;

revoke all on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.claim_catalog_product_audit_job(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_catalog_product_audit_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_catalog_product_audit_job_counters(uuid) from public, anon, authenticated;
revoke all on function public.apply_catalog_product_audit_item_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) to service_role;
grant execute on function public.claim_catalog_product_audit_job(uuid, text) to service_role;
grant execute on function public.claim_catalog_product_audit_item(uuid, uuid) to service_role;
grant execute on function public.refresh_catalog_product_audit_job_counters(uuid) to service_role;
grant execute on function public.apply_catalog_product_audit_item_v1(uuid, uuid) to service_role;
