-- Save the daily-deal discount independently from production pricing.

create or replace function public.save_daily_deal_discount_percent(
  requested_profile_id uuid,
  requested_discount_percent numeric,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_profile public.pricing_profiles%rowtype;
  updated_deal_count integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role in ('owner', 'admin')
  ) then
    raise exception 'Active Owner or Admin access is required';
  end if;
  if requested_discount_percent is null
      or requested_discount_percent < 1
      or requested_discount_percent >= 100 then
    raise exception 'Daily deal discount is outside the allowed range';
  end if;

  update public.pricing_profiles
  set daily_deal_discount_percent = requested_discount_percent
  where id = requested_profile_id and is_default = true
  returning * into saved_profile;
  if saved_profile.id is null then raise exception 'Default pricing profile was not found'; end if;

  update public.daily_deal_items
  set discount_percent = requested_discount_percent,
      deal_price = greatest(round(original_price * (1 - requested_discount_percent / 100), 2), 0.01)
  where deal_date = (now() at time zone 'Asia/Tbilisi')::date;
  get diagnostics updated_deal_count = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'daily_deal_discount_updated',
    'pricing_profile',
    saved_profile.id::text,
    jsonb_build_object(
      'daily_deal_discount_percent', saved_profile.daily_deal_discount_percent,
      'updated_current_deal_count', updated_deal_count,
      'save_mode', 'standalone'
    )
  );

  return jsonb_build_object(
    'profile', to_jsonb(saved_profile),
    'updated_current_deal_count', updated_deal_count
  );
end;
$$;

revoke all on function public.save_daily_deal_discount_percent(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_daily_deal_discount_percent(uuid, numeric, uuid) to service_role;
