-- Keep today's positions contiguous before filling vacancies.
-- Archived/deleted catalog products can leave gaps that make count-based inserts
-- collide with an existing (deal_date, position) unique key.

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

  -- Move rows into a free temporary range, then compact them to 1..N. This
  -- avoids transient collisions with the non-deferrable unique position key.
  with displaced as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = 50 + displaced.compact_position
  from displaced
  where item.id = displaced.id;

  with compacted as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = compacted.compact_position
  from compacted
  where item.id = compacted.id;

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

revoke all on function public.activate_daily_deals(date) from public, anon, authenticated;
grant execute on function public.activate_daily_deals(date) to service_role;
