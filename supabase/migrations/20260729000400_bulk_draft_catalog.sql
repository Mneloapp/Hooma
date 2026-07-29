-- Allow an Owner/Admin to atomically reset the entire catalog to Draft while
-- preserving manager-approved audit markers for the curated catalog view.

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
  remaining_daily_deals integer;
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

  update public.products
  set status = 'draft',
      updated_at = now()
  where status is distinct from 'draft';
  get diagnostics moved_total = row_count;

  perform public.activate_daily_deals(
    (now() at time zone 'Asia/Tbilisi')::date
  );
  select count(*)::integer
  into remaining_daily_deals
  from public.daily_deal_items
  where deal_date = (now() at time zone 'Asia/Tbilisi')::date;

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
      'remaining_daily_deals', remaining_daily_deals
    )
  );

  return jsonb_build_object(
    'moved_count', moved_total,
    'previous_active_count', active_total,
    'previous_archived_count', archived_total,
    'previous_other_count', other_total,
    'audit_markers_preserved', true,
    'remaining_daily_deals', remaining_daily_deals
  );
end;
$$;

revoke all on function public.move_all_catalog_products_to_draft_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.move_all_catalog_products_to_draft_v1(uuid, text)
  to service_role;
