-- Remove Daily Deals links for archived products in the same transaction as protected deletion.

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
  archived_ids uuid[];
  matched_count integer;
  blocked_product_name text;
  removed_daily_deal_count integer := 0;
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

  select array_agg(product.id)
  into archived_ids
  from public.products product
  where product.id = any(normalized_ids)
    and product.status = 'archived';

  select coalesce(product.name_ka, product.hooma_name, product.slug)
  into blocked_product_name
  from public.products product
  where product.id = any(normalized_ids)
    and product.status <> 'archived'
    and exists (
      select 1
      from public.daily_deal_items deal
      where deal.product_id = product.id
    )
  limit 1;

  if blocked_product_name is not null then
    raise exception 'Product has deal history and must be archived before deletion: %', blocked_product_name;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  select
    actor_profile_id,
    'catalog_product_deal_history_removed_for_deletion',
    'product',
    product.id::text,
    jsonb_build_object(
      'slug', product.slug,
      'name', coalesce(product.name_ka, product.hooma_name),
      'deal_count', (select count(*) from public.daily_deal_items deal where deal.product_id = product.id),
      'deal_dates', (select jsonb_agg(deal.deal_date order by deal.deal_date) from public.daily_deal_items deal where deal.product_id = product.id)
    )
  from public.products product
  where product.id = any(coalesce(archived_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.daily_deal_items deal
      where deal.product_id = product.id
    );

  delete from public.daily_deal_items deal
  where deal.product_id = any(coalesce(archived_ids, array[]::uuid[]));
  get diagnostics removed_daily_deal_count = row_count;

  deletion_result := public.delete_catalog_products(normalized_ids, actor_profile_id);

  return deletion_result || jsonb_build_object(
    'removed_daily_deal_count', removed_daily_deal_count
  );
end;
$$;

revoke all on function public.delete_catalog_products_v2(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.delete_catalog_products_v2(uuid[], uuid) to service_role;
