-- Daily deals: up to 100 distinct products per Tbilisi calendar day at exactly 50% off.
-- Selection is server-only and least-recently-used, so the available catalog rotates before repeats.

create table if not exists public.daily_deal_batches (
  deal_date date primary key,
  selection_count integer not null default 0 check (selection_count between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_date date not null references public.daily_deal_batches(deal_date) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  position integer not null check (position between 1 and 100),
  original_price numeric(12,2) not null check (original_price > 0),
  deal_price numeric(12,2) not null check (deal_price = round(original_price * 0.50, 2)),
  discount_percent integer not null default 50 check (discount_percent = 50),
  created_at timestamptz not null default now(),
  unique (deal_date, product_id),
  unique (deal_date, position)
);

create index if not exists idx_daily_deal_items_product_date on public.daily_deal_items(product_id, deal_date desc);

drop trigger if exists set_daily_deal_batches_updated_at on public.daily_deal_batches;
create trigger set_daily_deal_batches_updated_at before update on public.daily_deal_batches
for each row execute function public.set_updated_at();

alter table public.daily_deal_batches enable row level security;
alter table public.daily_deal_items enable row level security;

drop policy if exists "public reads current daily deal batch" on public.daily_deal_batches;
create policy "public reads current daily deal batch" on public.daily_deal_batches for select using (
  deal_date = (now() at time zone 'Asia/Tbilisi')::date or public.is_admin()
);
drop policy if exists "public reads current daily deal items" on public.daily_deal_items;
create policy "public reads current daily deal items" on public.daily_deal_items for select using (
  deal_date = (now() at time zone 'Asia/Tbilisi')::date or public.is_admin()
);
drop policy if exists "admins manage daily deal batches" on public.daily_deal_batches;
create policy "admins manage daily deal batches" on public.daily_deal_batches for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage daily deal items" on public.daily_deal_items;
create policy "admins manage daily deal items" on public.daily_deal_items for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.activate_daily_deals(target_date date default (now() at time zone 'Asia/Tbilisi')::date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
begin
  if target_date is null then
    raise exception 'Target date is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-' || $1::text));
  insert into public.daily_deal_batches (deal_date) values ($1) on conflict do nothing;

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
    deal_date, product_id, variant_id, position, original_price, deal_price
  )
  select
    $1,
    product_id,
    variant_id,
    existing_count + selection_order::integer,
    active_price,
    round(active_price * 0.50, 2)
  from selected
  on conflict (deal_date, product_id) do nothing;

  select count(*) into existing_count from public.daily_deal_items where deal_date = $1;
  update public.daily_deal_batches set selection_count = existing_count where deal_date = $1;
  return existing_count;
end;
$$;

-- Checkout/payment code must call this server-only resolver instead of trusting a browser-supplied price.
create or replace function public.resolve_catalog_price(
  requested_product_id uuid,
  requested_variant_id uuid,
  price_date date default (now() at time zone 'Asia/Tbilisi')::date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_price numeric(12,2);
begin
  select deal_price into resolved_price
  from public.daily_deal_items
  where deal_date = price_date
    and product_id = requested_product_id
    and variant_id = requested_variant_id;

  if resolved_price is not null then return resolved_price; end if;

  select coalesce(v.price, p.sale_price, p.base_price)::numeric(12,2) into resolved_price
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.id = requested_product_id
    and v.id = requested_variant_id
    and p.status = 'active'
    and p.production_status = 'approved'
    and v.is_active = true;

  if resolved_price is null or resolved_price <= 0 then
    raise exception 'Product is not currently purchasable';
  end if;
  return resolved_price;
end;
$$;

revoke all on function public.activate_daily_deals(date) from public, anon, authenticated;
grant execute on function public.activate_daily_deals(date) to service_role;
revoke all on function public.resolve_catalog_price(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.resolve_catalog_price(uuid, uuid, date) to service_role;
