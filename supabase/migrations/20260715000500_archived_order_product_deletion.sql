-- Allow safe deletion of archived products after detaching test or terminal order snapshots.

create or replace function public.delete_catalog_products(
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
  detached_order_item_count integer := 0;
  deleted_products jsonb;
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
      from public.order_items item
      left join public.product_variants variant on variant.id = item.variant_id
      left join public.inventory stock on stock.id = item.inventory_id
      where item.product_id = product.id or variant.product_id = product.id or stock.product_id = product.id
    )
  limit 1;

  if blocked_product_name is not null then
    raise exception 'Product is referenced by an order and must be archived before deletion: %', blocked_product_name;
  end if;

  select coalesce(product.name_ka, product.hooma_name, product.slug)
  into blocked_product_name
  from public.products product
  where product.id = any(coalesce(archived_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.order_items item
      join public.orders customer_order on customer_order.id = item.order_id
      left join public.product_variants variant on variant.id = item.variant_id
      left join public.inventory stock on stock.id = item.inventory_id
      where (item.product_id = product.id or variant.product_id = product.id or stock.product_id = product.id)
        and customer_order.test_mode is not true
        and customer_order.fulfillment_status not in ('delivered', 'cancelled')
    )
  limit 1;

  if blocked_product_name is not null then
    raise exception 'Archived product has an active live order and cannot be deleted: %', blocked_product_name;
  end if;

  select coalesce(product.name_ka, product.hooma_name, product.slug)
  into blocked_product_name
  from public.products product
  where product.id = any(coalesce(archived_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.order_items item
      left join public.product_variants variant on variant.id = item.variant_id
      left join public.inventory stock on stock.id = item.inventory_id
      where (item.product_id = product.id or variant.product_id = product.id or stock.product_id = product.id)
        and (coalesce(trim(item.product_name), '') = '' or coalesce(trim(item.sku), '') = '')
    )
  limit 1;

  if blocked_product_name is not null then
    raise exception 'Order item snapshot is incomplete for product: %', blocked_product_name;
  end if;

  select coalesce(product.name_ka, product.hooma_name, product.slug)
  into blocked_product_name
  from public.products product
  where product.id = any(normalized_ids)
    and exists (
      select 1
      from public.daily_deal_items deal
      where deal.product_id = product.id
    )
  limit 1;

  if blocked_product_name is not null then
    raise exception 'Product has deal history and cannot be deleted: %', blocked_product_name;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', product.id,
      'slug', product.slug,
      'name', coalesce(product.name_ka, product.hooma_name),
      'status', product.status
    )
    order by product.created_at
  )
  into deleted_products
  from public.products product
  where product.id = any(normalized_ids);

  update public.source_imports
  set product_id = null,
      status = 'needs_review',
      reviewed_by = null,
      reviewed_at = null,
      error_message = null
  where product_id = any(normalized_ids);

  update public.order_items order_item
  set product_id = null,
      variant_id = null,
      inventory_id = null
  where order_item.id in (
    select referenced_item.id
    from public.order_items referenced_item
    left join public.product_variants referenced_variant on referenced_variant.id = referenced_item.variant_id
    left join public.inventory referenced_inventory on referenced_inventory.id = referenced_item.inventory_id
    where referenced_item.product_id = any(coalesce(archived_ids, array[]::uuid[]))
      or referenced_variant.product_id = any(coalesce(archived_ids, array[]::uuid[]))
      or referenced_inventory.product_id = any(coalesce(archived_ids, array[]::uuid[]))
  );
  get diagnostics detached_order_item_count = row_count;

  delete from public.products
  where id = any(normalized_ids);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  select
    actor_profile_id,
    'catalog_product_deleted',
    'product',
    deleted_item->>'id',
    deleted_item || jsonb_build_object(
      'deletion_mode', 'bulk',
      'batch_size', array_length(normalized_ids, 1),
      'detached_order_item_count', detached_order_item_count
    )
  from jsonb_array_elements(deleted_products) as deleted_products_rows(deleted_item);

  return jsonb_build_object(
    'deleted_count', array_length(normalized_ids, 1),
    'detached_order_item_count', detached_order_item_count,
    'products', deleted_products
  );
end;
$$;

revoke all on function public.delete_catalog_products(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.delete_catalog_products(uuid[], uuid) to service_role;
