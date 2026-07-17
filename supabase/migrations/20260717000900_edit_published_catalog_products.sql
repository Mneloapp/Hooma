-- Reuse the audited Draft editor for published and archived catalog products
-- while preserving their current publication status atomically.

create or replace function public.update_catalog_product_v2(
  actor_profile_id uuid,
  requested_product_id uuid,
  product_name text,
  product_description text,
  selected_category_id uuid,
  selected_material_profile_id uuid,
  selected_pricing_profile_id uuid,
  selected_material_grams numeric,
  selected_print_minutes integer,
  selected_margin_percent numeric,
  operator_reference text,
  product_available_colors text[],
  product_color_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  select status into current_status
  from public.products
  where id = requested_product_id
  for update;
  if current_status is null then raise exception 'Product not found'; end if;
  if current_status not in ('draft', 'active', 'archived') then
    raise exception 'Product status cannot be edited';
  end if;

  if current_status <> 'draft' then
    update public.products set status = 'draft' where id = requested_product_id;
  end if;

  result := public.update_catalog_product_draft_v1(
    actor_profile_id,
    requested_product_id,
    product_name,
    product_description,
    selected_category_id,
    selected_material_profile_id,
    selected_pricing_profile_id,
    selected_material_grams,
    selected_print_minutes,
    selected_margin_percent,
    operator_reference,
    product_available_colors,
    product_color_mode
  );

  if current_status <> 'draft' then
    update public.products set status = current_status where id = requested_product_id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_updated',
    'product',
    requested_product_id::text,
    jsonb_build_object(
      'preserved_status', current_status,
      'final_sale_price', result->>'final_sale_price'
    )
  );

  return result || jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.update_catalog_product_v2(uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric, text, text[], text) from public, anon, authenticated;
grant execute on function public.update_catalog_product_v2(uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric, text, text[], text) to service_role;
