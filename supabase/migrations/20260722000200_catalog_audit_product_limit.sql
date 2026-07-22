-- Add an explicit per-job product ceiling for safe, measurable catalog-audit tests.
-- The v2 claim wrapper locks the job row before checking the ceiling, so multiple
-- workers cannot claim beyond the requested quantity.

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
as $catalog_audit_limit$
declare
  normalized_statuses text[];
  eligible_total integer;
  product_total integer;
  new_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  if not exists (
    select 1 from public.catalog_agents
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

  select count(*)::integer into eligible_total
  from public.products
  where status = any(normalized_statuses)
    and catalog_audit_attempted_at is null
    and catalog_audit_completed_at is null;

  product_total := least(eligible_total, requested_max_products);

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
    now()
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
      'previously_attempted_products_excluded', true
    )
  );

  return jsonb_build_object(
    'id', new_job.id,
    'total_count', product_total,
    'eligible_total', eligible_total,
    'requested_max_products', requested_max_products
  );
end;
$catalog_audit_limit$;

create or replace function public.claim_catalog_product_audit_item_v2(
  requested_agent_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $catalog_audit_limit$
declare
  product_ceiling integer;
  claimed_count integer;
begin
  select total_count into product_ceiling
  from public.catalog_product_audit_jobs
  where id = requested_job_id
    and agent_id = requested_agent_id
    and status = 'running'
  for update;

  if not found then
    return public.claim_catalog_product_audit_item(
      requested_agent_id,
      requested_job_id
    );
  end if;

  select count(*)::integer into claimed_count
  from public.catalog_product_audit_items
  where job_id = requested_job_id;

  if claimed_count >= product_ceiling then
    return null;
  end if;

  return public.claim_catalog_product_audit_item(
    requested_agent_id,
    requested_job_id
  );
end;
$catalog_audit_limit$;

revoke all on function public.create_catalog_product_audit_job_v2(
  uuid, uuid, text[], integer
) from public, anon, authenticated;
revoke all on function public.claim_catalog_product_audit_item_v2(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function public.create_catalog_product_audit_job_v2(
  uuid, uuid, text[], integer
) to service_role;
grant execute on function public.claim_catalog_product_audit_item_v2(
  uuid, uuid
) to service_role;
