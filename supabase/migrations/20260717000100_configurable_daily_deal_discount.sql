-- Make the daily-deal percentage an admin-managed pricing setting.

alter table public.pricing_profiles
  add column if not exists daily_deal_discount_percent numeric(5,2) not null default 50;

alter table public.pricing_profiles
  drop constraint if exists pricing_profiles_daily_deal_discount_percent_check;
alter table public.pricing_profiles
  add constraint pricing_profiles_daily_deal_discount_percent_check
  check (daily_deal_discount_percent >= 1 and daily_deal_discount_percent < 100);

alter table public.daily_deal_items
  drop constraint if exists daily_deal_items_deal_price_check;
alter table public.daily_deal_items
  drop constraint if exists daily_deal_items_discount_percent_check;
alter table public.daily_deal_items
  alter column discount_percent type numeric(5,2) using discount_percent::numeric,
  alter column discount_percent set default 50;
alter table public.daily_deal_items
  add constraint daily_deal_items_discount_percent_check
  check (discount_percent >= 1 and discount_percent < 100);
alter table public.daily_deal_items
  add constraint daily_deal_items_deal_price_check
  check (deal_price = greatest(round(original_price * (1 - discount_percent / 100), 2), 0.01));

create or replace function public.activate_daily_deals(target_date date default (now() at time zone 'Asia/Tbilisi')::date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
  configured_discount numeric(5,2);
begin
  if target_date is null then
    raise exception 'Target date is required';
  end if;

  select daily_deal_discount_percent
  into configured_discount
  from public.pricing_profiles
  where is_default = true
  limit 1;
  configured_discount := coalesce(configured_discount, 50);

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-' || $1::text));
  insert into public.daily_deal_batches (deal_date) values ($1) on conflict do nothing;

  update public.daily_deal_items
  set discount_percent = configured_discount,
      deal_price = greatest(round(original_price * (1 - configured_discount / 100), 2), 0.01)
  where deal_date = $1
    and discount_percent is distinct from configured_discount;

  select count(*) into existing_count from public.daily_deal_items where deal_date = $1;

  with eligible as (
    select
      p.id as product_id,
      chosen_variant.id as variant_id,
      chosen_variant.active_price,
      (
        select max(history.deal_date)
        from public.daily_deal_items history
        where history.product_id = p.id and history.deal_date < $1
      ) as last_deal_date
    from public.products p
    cross join lateral (
      select
        v.id,
        coalesce(v.price, p.sale_price, p.base_price)::numeric(12,2) as active_price
      from public.product_variants v
      where v.product_id = p.id
        and v.is_active = true
        and coalesce(v.price, p.sale_price, p.base_price) > 0
      order by coalesce(v.price, p.sale_price, p.base_price), v.id
      limit 1
    ) chosen_variant
    where p.status = 'active'
      and p.production_status = 'approved'
      and coalesce(p.category, '') <> 'Custom Parts'
      and not exists (
        select 1 from public.categories product_category
        where product_category.id = p.category_id and product_category.slug = 'custom-parts'
      )
      and not exists (
        select 1 from public.daily_deal_items today
        where today.deal_date = $1 and today.product_id = p.id
      )
  ), ranked as (
    select *, row_number() over (
      order by last_deal_date asc nulls first, md5($1::text || product_id::text)
    ) as selection_order
    from eligible
  ), selected as (
    select * from ranked
    where selection_order <= greatest(0, 100 - existing_count)
  )
  insert into public.daily_deal_items (
    deal_date, product_id, variant_id, position, original_price, deal_price, discount_percent
  )
  select
    $1,
    product_id,
    variant_id,
    existing_count + selection_order::integer,
    active_price,
    greatest(round(active_price * (1 - configured_discount / 100), 2), 0.01),
    configured_discount
  from selected
  on conflict (deal_date, product_id) do nothing;

  select count(*) into existing_count from public.daily_deal_items where deal_date = $1;
  update public.daily_deal_batches set selection_count = existing_count where deal_date = $1;
  return existing_count;
end;
$$;

create or replace function public.save_default_pricing_profile_v3(
  requested_profile_id uuid,
  requested_machine_hour_cost numeric,
  requested_labor_cost_per_order numeric,
  requested_packaging_cost numeric,
  requested_overhead_percent numeric,
  requested_failure_reserve_percent numeric,
  requested_default_margin_percent numeric,
  requested_vat_percent numeric,
  requested_rounding_step numeric,
  requested_daily_deal_discount_percent numeric,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  saved_profile public.pricing_profiles%rowtype;
  updated_deal_count integer := 0;
begin
  if requested_daily_deal_discount_percent is null
      or requested_daily_deal_discount_percent < 1
      or requested_daily_deal_discount_percent >= 100 then
    raise exception 'Daily deal discount is outside the allowed range';
  end if;

  result := public.save_default_pricing_profile_v2(
    requested_profile_id,
    requested_machine_hour_cost,
    requested_labor_cost_per_order,
    requested_packaging_cost,
    requested_overhead_percent,
    requested_failure_reserve_percent,
    requested_default_margin_percent,
    requested_vat_percent,
    requested_rounding_step,
    actor_profile_id
  );

  update public.pricing_profiles
  set daily_deal_discount_percent = requested_daily_deal_discount_percent
  where id = requested_profile_id and is_default = true
  returning * into saved_profile;
  if saved_profile.id is null then raise exception 'Default pricing profile was not found'; end if;

  update public.daily_deal_items
  set discount_percent = requested_daily_deal_discount_percent,
      deal_price = greatest(round(original_price * (1 - requested_daily_deal_discount_percent / 100), 2), 0.01)
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
      'updated_current_deal_count', updated_deal_count
    )
  );

  return result || jsonb_build_object(
    'profile', to_jsonb(saved_profile),
    'updated_current_deal_count', updated_deal_count
  );
end;
$$;

revoke all on function public.save_default_pricing_profile_v3(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_default_pricing_profile_v3(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to service_role;
