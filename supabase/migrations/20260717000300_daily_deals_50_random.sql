-- Limit daily deals to 50 and make the daily selection random-looking but stable for the date.
-- A trigger owns price calculation so percentage updates cannot violate a brittle equality constraint.

alter table public.daily_deal_items
  drop constraint if exists daily_deal_items_deal_price_check;
alter table public.daily_deal_items
  add constraint daily_deal_items_deal_price_check
  check (deal_price >= 0.01 and deal_price <= original_price);

create or replace function public.set_daily_deal_price_from_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.deal_price := greatest(round(new.original_price * (1 - new.discount_percent / 100), 2), 0.01);
  return new;
end;
$$;

drop trigger if exists calculate_daily_deal_price on public.daily_deal_items;
create trigger calculate_daily_deal_price
before insert or update of original_price, discount_percent on public.daily_deal_items
for each row execute function public.set_daily_deal_price_from_discount();

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
  if target_date is null then raise exception 'Target date is required'; end if;

  select daily_deal_discount_percent
  into configured_discount
  from public.pricing_profiles
  where is_default = true
  limit 1;
  configured_discount := coalesce(configured_discount, 50);

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-' || target_date::text));
  insert into public.daily_deal_batches (deal_date) values (target_date) on conflict do nothing;

  delete from public.daily_deal_items
  where deal_date = target_date and position > 50;

  update public.daily_deal_items
  set discount_percent = configured_discount
  where deal_date = target_date
    and discount_percent is distinct from configured_discount;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;

  with eligible as (
    select
      p.id as product_id,
      chosen_variant.id as variant_id,
      chosen_variant.active_price,
      exists (
        select 1
        from public.daily_deal_items previous_day
        where previous_day.product_id = p.id
          and previous_day.deal_date = target_date - 1
      ) as appeared_previous_day
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
        where today.deal_date = target_date and today.product_id = p.id
      )
  ), ranked as (
    select *, row_number() over (
      order by appeared_previous_day asc, md5(target_date::text || ':' || product_id::text)
    ) as selection_order
    from eligible
  ), selected as (
    select * from ranked
    where selection_order <= greatest(0, 50 - existing_count)
  )
  insert into public.daily_deal_items (
    deal_date, product_id, variant_id, position, original_price, deal_price, discount_percent
  )
  select
    target_date,
    product_id,
    variant_id,
    existing_count + selection_order::integer,
    active_price,
    active_price,
    configured_discount
  from selected
  on conflict (deal_date, product_id) do nothing;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;
  update public.daily_deal_batches
  set selection_count = existing_count
  where deal_date = target_date;
  return existing_count;
end;
$$;

revoke all on function public.set_daily_deal_price_from_discount() from public, anon, authenticated;
revoke all on function public.activate_daily_deals(date) from public, anon, authenticated;
grant execute on function public.activate_daily_deals(date) to service_role;
