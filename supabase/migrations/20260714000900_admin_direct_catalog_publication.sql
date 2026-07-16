-- One-click catalog publication for Admin and Owner.
-- Production approval is folded into publication after server-side technical checks.

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
  actor_role text;
  next_status text;
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin');

  if actor_role is null then
    raise exception 'Only an active Admin or Owner may publish catalog products';
  end if;

  select * into product_record
  from public.products
  where id = requested_product_id
  for update;

  if product_record.id is null then raise exception 'Product was not found'; end if;

  if requested_publish then
    if not exists (
      select 1
      from public.product_sources source
      where source.product_id = product_record.id
        and source.license_status in ('verified', 'not_required')
        and source.commercial_use_allowed is true
        and source.media_use_allowed is true
    ) then
      raise exception 'Verified commercial and media rights are required';
    end if;

    if not exists (
      select 1
      from public.product_variants variant
      where variant.product_id = product_record.id
        and variant.is_active = true
        and variant.price > 0
        and variant.material_grams > 0
        and variant.estimated_print_minutes > 0
        and variant.plate_count > 0
    ) then
      raise exception 'A priced technical variant is required';
    end if;

    next_status := 'active';
    update public.products
    set status = next_status,
        production_status = 'approved'
    where id = product_record.id;
  else
    next_status := 'archived';
    update public.products
    set status = next_status
    where id = product_record.id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    case when requested_publish then 'catalog_product_published' else 'catalog_product_unpublished' end,
    'product',
    product_record.id::text,
    jsonb_build_object(
      'actor_role', actor_role,
      'previous_status', product_record.status,
      'new_status', next_status,
      'previous_production_status', product_record.production_status,
      'production_status', case when requested_publish then 'approved' else product_record.production_status end,
      'publication_mode', 'admin_direct'
    )
  );

  return jsonb_build_object(
    'status', next_status,
    'production_status', case when requested_publish then 'approved' else product_record.production_status end
  );
end;
$$;

revoke all on function public.set_catalog_publication(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_catalog_publication(uuid, boolean, uuid) to service_role;
