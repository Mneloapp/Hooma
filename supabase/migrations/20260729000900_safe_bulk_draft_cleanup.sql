-- Respect the database safe-update guard by keeping every cleanup DELETE scoped.

create or replace function public.move_catalog_products_to_draft_batch_v2(
  actor_profile_id uuid,
  confirmation_token text,
  requested_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
declare
  resolved_batch_size integer := least(greatest(coalesce(requested_batch_size, 500), 1), 2000);
  selected_product_ids uuid[];
  moved_total integer := 0;
  removed_card_total integer := 0;
  removed_daily_deal_total integer := 0;
  cleanup_total integer := 0;
  remaining_total integer := 0;
  current_deal_date date := (now() at time zone 'Asia/Tbilisi')::date;
begin
  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin')
  ) then
    raise exception 'Owner or Admin access is required';
  end if;

  if confirmation_token is distinct from 'MOVE_ALL_PRODUCTS_TO_DRAFT' then
    raise exception 'Explicit Draft reset confirmation is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('hooma-catalog-bulk-publication'));

  select coalesce(array_agg(candidate.id order by candidate.id), '{}'::uuid[])
  into selected_product_ids
  from (
    select product.id
    from public.products product
    where product.status is distinct from 'draft'
    order by product.id
    limit resolved_batch_size
    for update skip locked
  ) candidate;

  if cardinality(selected_product_ids) > 0 then
    perform set_config('hooma.bulk_catalog_draft_reset', 'on', true);

    update public.products
    set status = 'draft',
        updated_at = now()
    where id = any(selected_product_ids)
      and status is distinct from 'draft';
    get diagnostics moved_total = row_count;

    delete from public.daily_deal_items
    where deal_date = current_deal_date
      and product_id = any(selected_product_ids);
    get diagnostics removed_daily_deal_total = row_count;

    delete from public.storefront_product_cards
    where product_id = any(selected_product_ids);
    get diagnostics removed_card_total = row_count;
  end if;

  select count(*)::integer
  into remaining_total
  from public.products
  where status is distinct from 'draft';

  if remaining_total = 0 then
    delete from public.daily_deal_items
    where deal_date = current_deal_date;
    get diagnostics cleanup_total = row_count;
    removed_daily_deal_total := removed_daily_deal_total + cleanup_total;

    update public.daily_deal_batches
    set selection_count = 0
    where deal_date = current_deal_date
      and selection_count is distinct from 0;

    delete from public.storefront_product_cards card
    where exists (
      select 1
      from public.products product
      where product.id = card.product_id
        and product.status = 'draft'
    );
    get diagnostics cleanup_total = row_count;
    removed_card_total := removed_card_total + cleanup_total;
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    actor_profile_id,
    'catalog_products_moved_to_draft_batch',
    'catalog',
    'all-products',
    jsonb_build_object(
      'moved_count', moved_total,
      'remaining_count', remaining_total,
      'batch_size', resolved_batch_size,
      'audit_markers_preserved', true,
      'removed_storefront_cards', removed_card_total,
      'removed_current_daily_deals', removed_daily_deal_total
    )
  );

  return jsonb_build_object(
    'moved_count', moved_total,
    'remaining_count', remaining_total,
    'batch_size', resolved_batch_size,
    'audit_markers_preserved', true,
    'removed_storefront_cards', removed_card_total,
    'removed_current_daily_deals', removed_daily_deal_total
  );
end;
$$;

revoke all on function public.move_catalog_products_to_draft_batch_v2(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.move_catalog_products_to_draft_batch_v2(uuid, text, integer)
  to service_role;
