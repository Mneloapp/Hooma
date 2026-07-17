-- Remove legacy checks that hard-code a 50% discount. Some early databases
-- received an automatically named `daily_deal_items_check`, so dropping only
-- the later explicit constraint names is not sufficient.

do $$
declare
  legacy_constraint record;
begin
  for legacy_constraint in
    select constraint_definition.conname
    from pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.daily_deal_items'::regclass
      and constraint_definition.contype = 'c'
      and (
        pg_get_constraintdef(constraint_definition.oid) ilike '%deal_price%'
        or pg_get_constraintdef(constraint_definition.oid) ilike '%discount_percent%'
      )
  loop
    execute format(
      'alter table public.daily_deal_items drop constraint %I',
      legacy_constraint.conname
    );
  end loop;
end;
$$;

alter table public.daily_deal_items
  add constraint daily_deal_items_discount_percent_check
  check (discount_percent >= 1 and discount_percent < 100);

alter table public.daily_deal_items
  add constraint daily_deal_items_deal_price_check
  check (deal_price >= 0.01 and deal_price <= original_price);

-- Reinstall the authoritative calculator in case an earlier migration only
-- changed constraints and did not create the trigger successfully.
create or replace function public.set_daily_deal_price_from_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.deal_price := greatest(
    round(new.original_price * (1 - new.discount_percent / 100), 2),
    0.01
  );
  return new;
end;
$$;

drop trigger if exists calculate_daily_deal_price on public.daily_deal_items;
create trigger calculate_daily_deal_price
before insert or update of original_price, discount_percent on public.daily_deal_items
for each row execute function public.set_daily_deal_price_from_discount();

revoke all on function public.set_daily_deal_price_from_discount() from public, anon, authenticated;

-- Apply the already-saved percentage to today's catalog immediately.
do $$
begin
  perform public.activate_daily_deals((now() at time zone 'Asia/Tbilisi')::date);
end;
$$;
