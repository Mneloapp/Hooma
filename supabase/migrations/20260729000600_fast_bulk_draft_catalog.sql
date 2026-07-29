-- Avoid one storefront refresh query per product during a whole-catalog Draft reset.

create or replace function public.sync_storefront_card_from_product_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('hooma.bulk_catalog_draft_reset', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.storefront_product_cards where product_id = old.id;
  else
    perform public.refresh_storefront_product_card_v1(new.id);
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_storefront_card_from_product_v1()
  from public, anon, authenticated;

create or replace function public.move_all_catalog_products_to_draft_v1(
  actor_profile_id uuid,
  confirmation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_total integer;
  archived_total integer;
  other_total integer;
  moved_total integer;
  removed_card_total integer;
  removed_daily_deal_total integer;
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

  select
    count(*) filter (where status = 'active')::integer,
    count(*) filter (where status = 'archived')::integer,
    count(*) filter (where status not in ('draft', 'active', 'archived'))::integer
  into active_total, archived_total, other_total
  from public.products;

  perform set_config('hooma.bulk_catalog_draft_reset', 'on', true);

  update public.products
  set status = 'draft',
      updated_at = now()
  where status is distinct from 'draft';
  get diagnostics moved_total = row_count;

  delete from public.daily_deal_items
  where deal_date = current_deal_date;
  get diagnostics removed_daily_deal_total = row_count;

  update public.daily_deal_batches
  set selection_count = 0
  where deal_date = current_deal_date
    and selection_count is distinct from 0;

  delete from public.storefront_product_cards;
  get diagnostics removed_card_total = row_count;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    actor_profile_id,
    'catalog_all_products_moved_to_draft',
    'catalog',
    'all-products',
    jsonb_build_object(
      'moved_count', moved_total,
      'previous_active_count', active_total,
      'previous_archived_count', archived_total,
      'previous_other_count', other_total,
      'audit_markers_preserved', true,
      'removed_storefront_cards', removed_card_total,
      'removed_current_daily_deals', removed_daily_deal_total
    )
  );

  return jsonb_build_object(
    'moved_count', moved_total,
    'previous_active_count', active_total,
    'previous_archived_count', archived_total,
    'previous_other_count', other_total,
    'audit_markers_preserved', true,
    'removed_storefront_cards', removed_card_total,
    'removed_current_daily_deals', removed_daily_deal_total
  );
end;
$$;

revoke all on function public.move_all_catalog_products_to_draft_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.move_all_catalog_products_to_draft_v1(uuid, text)
  to service_role;
