-- Owner-controlled catalog release: rights review, production approval, publish and unpublish.

create or replace function public.review_catalog_source_rights(
  requested_product_id uuid,
  requested_license_name text,
  requested_license_url text,
  requested_commercial_allowed boolean,
  requested_media_allowed boolean,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_record public.product_sources%rowtype;
  resolved_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role = 'owner'
  ) then
    raise exception 'Only the active Owner may verify catalog rights';
  end if;

  select * into source_record
  from public.product_sources
  where product_id = requested_product_id
  order by created_at
  limit 1
  for update;

  if source_record.id is null then raise exception 'Product source was not found'; end if;
  if requested_commercial_allowed and requested_media_allowed then
    if nullif(trim(requested_license_name), '') is null then raise exception 'License or permission name is required'; end if;
    if requested_license_url !~* '^https://[^[:space:]]+$' then raise exception 'HTTPS license evidence URL is required'; end if;
    resolved_status := 'verified';
  else
    resolved_status := 'pending';
  end if;

  update public.product_sources
  set license_name = nullif(trim(requested_license_name), ''),
      license_url = nullif(trim(requested_license_url), ''),
      license_status = resolved_status,
      commercial_use_allowed = requested_commercial_allowed,
      media_use_allowed = requested_media_allowed,
      verified_by = case when resolved_status = 'verified' then actor_profile_id else null end,
      verified_at = case when resolved_status = 'verified' then now() else null end
  where id = source_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_source_rights_reviewed',
    'product',
    requested_product_id::text,
    jsonb_build_object(
      'source_id', source_record.id,
      'license_name', nullif(trim(requested_license_name), ''),
      'license_url', nullif(trim(requested_license_url), ''),
      'commercial_use_allowed', requested_commercial_allowed,
      'media_use_allowed', requested_media_allowed,
      'license_status', resolved_status
    )
  );

  return jsonb_build_object('license_status', resolved_status);
end;
$$;

create or replace function public.set_catalog_production_approval(
  requested_product_id uuid,
  requested_approved boolean,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
  next_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role = 'owner'
  ) then
    raise exception 'Only the active Owner may approve catalog production';
  end if;

  select * into product_record from public.products where id = requested_product_id for update;
  if product_record.id is null then raise exception 'Product was not found'; end if;

  if requested_approved and not exists (
    select 1 from public.product_variants variant
    where variant.product_id = product_record.id
      and variant.is_active = true
      and variant.price > 0
      and variant.material_grams > 0
      and variant.estimated_print_minutes > 0
      and variant.plate_count > 0
  ) then
    raise exception 'A priced technical variant is required before production approval';
  end if;

  next_status := case when requested_approved then 'approved' else 'paused' end;
  update public.products set production_status = next_status where id = product_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    case when requested_approved then 'catalog_production_approved' else 'catalog_production_paused' end,
    'product',
    product_record.id::text,
    jsonb_build_object('previous_status', product_record.production_status, 'new_status', next_status)
  );

  return jsonb_build_object('production_status', next_status);
end;
$$;

create or replace function public.set_catalog_publication(
  requested_product_id uuid,
  requested_publish boolean,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
  next_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role = 'owner'
  ) then
    raise exception 'Only the active Owner may publish catalog products';
  end if;

  select * into product_record from public.products where id = requested_product_id for update;
  if product_record.id is null then raise exception 'Product was not found'; end if;

  if requested_publish then
    if product_record.production_status <> 'approved' then raise exception 'Production approval is required'; end if;
    if not exists (
      select 1 from public.product_sources source
      where source.product_id = product_record.id
        and source.license_status in ('verified', 'not_required')
        and source.commercial_use_allowed is true
        and source.media_use_allowed is true
    ) then
      raise exception 'Verified commercial and media rights are required';
    end if;
    if not exists (
      select 1 from public.product_variants variant
      where variant.product_id = product_record.id and variant.is_active = true and variant.price > 0
    ) then
      raise exception 'An active priced variant is required';
    end if;
    next_status := 'active';
  else
    next_status := 'archived';
  end if;

  update public.products set status = next_status where id = product_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    case when requested_publish then 'catalog_product_published' else 'catalog_product_unpublished' end,
    'product',
    product_record.id::text,
    jsonb_build_object('previous_status', product_record.status, 'new_status', next_status)
  );

  return jsonb_build_object('status', next_status);
end;
$$;

revoke all on function public.review_catalog_source_rights(uuid, text, text, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.review_catalog_source_rights(uuid, text, text, boolean, boolean, uuid) to service_role;
revoke all on function public.set_catalog_production_approval(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_catalog_production_approval(uuid, boolean, uuid) to service_role;
revoke all on function public.set_catalog_publication(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_catalog_publication(uuid, boolean, uuid) to service_role;
