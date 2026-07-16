-- Safe deletion for catalog drafts. Products referenced by orders or deal history stay protected.

create or replace function public.delete_catalog_draft(
  requested_product_id uuid,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role in ('owner', 'admin')
  ) then
    raise exception 'Active Owner or Admin access is required';
  end if;

  select * into product_record
  from public.products
  where id = requested_product_id
  for update;

  if product_record.id is null then raise exception 'Product was not found'; end if;
  if product_record.status <> 'draft' then raise exception 'Only Draft products can be deleted'; end if;

  if exists (
    select 1
    from public.order_items item
    left join public.product_variants variant on variant.id = item.variant_id
    where item.product_id = product_record.id or variant.product_id = product_record.id
  ) then
    raise exception 'Product is referenced by an order and cannot be deleted';
  end if;

  if exists (select 1 from public.daily_deal_items where product_id = product_record.id) then
    raise exception 'Product has deal history and cannot be deleted';
  end if;

  update public.source_imports
  set product_id = null,
      status = 'needs_review',
      reviewed_by = null,
      reviewed_at = null,
      error_message = null
  where product_id = product_record.id;

  delete from public.products where id = product_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_draft_deleted',
    'product',
    product_record.id::text,
    jsonb_build_object('slug', product_record.slug, 'name', product_record.hooma_name)
  );

  return jsonb_build_object(
    'id', product_record.id,
    'slug', product_record.slug,
    'name', product_record.hooma_name
  );
end;
$$;

revoke all on function public.delete_catalog_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_catalog_draft(uuid, uuid) to service_role;
