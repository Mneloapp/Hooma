-- Hooma+ prepaid memberships and authoritative catalog delivery pricing.
--
-- Commercial policy (v1):
--   * Hooma+ is prepaid for one calendar month (35 GEL) or one calendar year
--     (350 GEL), with manual renewal and no saved-card/recurring charge.
--   * active Hooma+ members receive free standard delivery on catalog orders;
--   * product subtotals strictly above 100 GEL receive free delivery;
--   * every customer receives ten product units of welcome free delivery;
--   * otherwise standard delivery is 5 GEL per catalog order.
--
-- Payment and benefit boundaries:
--   * prices and eligibility are resolved in PostgreSQL, never in the browser;
--   * welcome units are reserved atomically and consumed only after the signed
--     BOG callback marks the corresponding catalog payment paid;
--   * Hooma+ activation happens only through its own signature-verified BOG
--     callback path, not from the browser return URL;
--   * membership payments are isolated from physical orders, production, ERP,
--     and order notifications.

begin;

-- Add the order snapshot fields in a short, self-contained DDL transaction.
-- The NOT VALID constraint protects all new writes immediately without
-- scanning existing history under an ACCESS EXCLUSIVE lock. Everything below
-- is idempotent if a later statement fails and Supabase reruns the migration.
alter table public.orders
  add column if not exists delivery_benefit_code text not null default 'legacy_free',
  add column if not exists delivery_pricing_snapshot jsonb not null default '{}'::jsonb;

alter table public.orders
  drop constraint if exists orders_delivery_benefit_code_check;
alter table public.orders
  add constraint orders_delivery_benefit_code_check
  check (delivery_benefit_code in (
    'hooma_plus',
    'subtotal_threshold',
    'welcome_units',
    'standard_fee',
    'legacy_free'
  )) not valid;

commit;
begin;

create table if not exists public.commerce_delivery_settings (
  singleton boolean primary key default true check (singleton),
  policy_version text not null,
  standard_fee numeric(12,2) not null check (standard_fee >= 0),
  free_above_subtotal numeric(12,2) not null check (free_above_subtotal >= 0),
  welcome_units integer not null check (welcome_units >= 0 and welcome_units <= 100),
  payment_ttl_minutes integer not null check (payment_ttl_minutes between 2 and 1440),
  updated_at timestamptz not null default now()
);

insert into public.commerce_delivery_settings (
  singleton,
  policy_version,
  standard_fee,
  free_above_subtotal,
  welcome_units,
  payment_ttl_minutes
) values (
  true,
  '2026-07-29',
  5.00,
  100.00,
  10,
  15
)
on conflict (singleton) do nothing;

create table if not exists public.hooma_plus_plans (
  code text primary key check (code in ('monthly', 'annual')),
  label_ka text not null,
  label_en text not null,
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'GEL' check (currency = 'GEL'),
  duration_months integer not null check (duration_months in (1, 12)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hooma_plus_plans (
  code,
  label_ka,
  label_en,
  price,
  duration_months
) values
  ('monthly', 'Hooma+ თვიური', 'Hooma+ Monthly', 35.00, 1),
  ('annual', 'Hooma+ წლიური', 'Hooma+ Annual', 350.00, 12)
on conflict (code) do update
set label_ka = excluded.label_ka,
    label_en = excluded.label_en,
    price = excluded.price,
    duration_months = excluded.duration_months,
    updated_at = now();

create table if not exists public.hooma_plus_purchases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  plan_code text not null references public.hooma_plus_plans(code) on delete restrict,
  plan_label_ka text not null,
  plan_label_en text not null,
  duration_months integer not null check (duration_months in (1, 12)),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GEL' check (currency = 'GEL'),
  status text not null default 'created' check (status in (
    'created',
    'pending',
    'paid',
    'failed',
    'review_required',
    'refunded'
  )),
  idempotency_key uuid not null unique,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (activated_at is null and expires_at is null)
    or (activated_at is not null and expires_at is not null and expires_at > activated_at)
  )
);

create table if not exists public.hooma_plus_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.hooma_plus_purchases(id) on delete restrict,
  provider text not null default 'bog' check (provider = 'bog'),
  provider_payment_id text,
  idempotency_key uuid not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GEL' check (currency = 'GEL'),
  status text not null default 'created' check (status in (
    'created',
    'pending',
    'paid',
    'failed',
    'cancelled',
    'review_required',
    'refunded'
  )),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create table if not exists public.hooma_plus_periods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  purchase_id uuid not null unique references public.hooma_plus_purchases(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in (
    'active',
    'review_required',
    'refunded'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.hooma_plus_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid references public.hooma_plus_payment_attempts(id) on delete set null,
  provider_payment_id text not null,
  external_order_id text,
  provider_status text,
  payload_sha256 text not null,
  receipt_state_sha256 text not null,
  provider_event_at timestamptz,
  signature_verified boolean not null default false,
  receipt_verified boolean not null default false,
  processing_status text not null check (processing_status in (
    'applied',
    'ignored',
    'manual_review'
  )),
  failure_reason text,
  safe_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  unique(payload_sha256, receipt_state_sha256)
);

create table if not exists public.delivery_benefit_reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid not null unique,
  checkout_key uuid not null unique,
  units integer not null check (units > 0 and units <= 100),
  status text not null default 'reserved' check (status in (
    'reserved',
    'consumed',
    'released'
  )),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hooma_plus_purchases_customer
  on public.hooma_plus_purchases(customer_id, created_at desc);
create index if not exists idx_hooma_plus_purchases_status
  on public.hooma_plus_purchases(status, created_at desc);
create index if not exists idx_hooma_plus_attempts_created
  on public.hooma_plus_payment_attempts(created_at desc);
create index if not exists idx_hooma_plus_periods_customer_active
  on public.hooma_plus_periods(customer_id, ends_at desc)
  where status = 'active';
create index if not exists idx_hooma_plus_events_attempt
  on public.hooma_plus_payment_events(payment_attempt_id, received_at desc);
create index if not exists idx_delivery_reservations_customer
  on public.delivery_benefit_reservations(customer_id, status, expires_at);

drop trigger if exists set_hooma_plus_plans_updated_at
  on public.hooma_plus_plans;
create trigger set_hooma_plus_plans_updated_at
before update on public.hooma_plus_plans
for each row execute function public.set_updated_at();

drop trigger if exists set_hooma_plus_purchases_updated_at
  on public.hooma_plus_purchases;
create trigger set_hooma_plus_purchases_updated_at
before update on public.hooma_plus_purchases
for each row execute function public.set_updated_at();

drop trigger if exists set_hooma_plus_attempts_updated_at
  on public.hooma_plus_payment_attempts;
create trigger set_hooma_plus_attempts_updated_at
before update on public.hooma_plus_payment_attempts
for each row execute function public.set_updated_at();

-- Persist terminal provenance independently of whichever provider state arrives
-- next. This prevents an unsupported/manual-review callback from laundering a
-- failed/cancelled attempt into a markerless review before a later completion.
create or replace function public.mark_terminal_bog_hooma_plus_review_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('failed', 'cancelled')
    or new.status in ('failed', 'cancelled')
    or old.response_payload->>'terminal_review_reason'
      = 'LATE_COMPLETED_AFTER_TERMINAL_STATUS'
  then
    new.response_payload := new.response_payload || jsonb_build_object(
      'terminal_review_reason',
      'LATE_COMPLETED_AFTER_TERMINAL_STATUS'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.mark_terminal_bog_hooma_plus_review_v1()
  from public, anon, authenticated;

drop trigger if exists mark_terminal_bog_hooma_plus_review
  on public.hooma_plus_payment_attempts;
create trigger mark_terminal_bog_hooma_plus_review
before update of status, response_payload
  on public.hooma_plus_payment_attempts
for each row
execute function public.mark_terminal_bog_hooma_plus_review_v1();

drop trigger if exists set_hooma_plus_periods_updated_at
  on public.hooma_plus_periods;
create trigger set_hooma_plus_periods_updated_at
before update on public.hooma_plus_periods
for each row execute function public.set_updated_at();

drop trigger if exists set_delivery_reservations_updated_at
  on public.delivery_benefit_reservations;
create trigger set_delivery_reservations_updated_at
before update on public.delivery_benefit_reservations
for each row execute function public.set_updated_at();

alter table public.commerce_delivery_settings enable row level security;
alter table public.hooma_plus_plans enable row level security;
alter table public.hooma_plus_purchases enable row level security;
alter table public.hooma_plus_payment_attempts enable row level security;
alter table public.hooma_plus_periods enable row level security;
alter table public.hooma_plus_payment_events enable row level security;
alter table public.delivery_benefit_reservations enable row level security;

drop policy if exists "customers read own hooma plus purchases"
  on public.hooma_plus_purchases;
create policy "customers read own hooma plus purchases"
  on public.hooma_plus_purchases
  for select
  using (
    exists (
      select 1
      from public.customers customer
      where customer.id = hooma_plus_purchases.customer_id
        and customer.profile_id = auth.uid()
    )
  );

drop policy if exists "customers read own hooma plus periods"
  on public.hooma_plus_periods;
create policy "customers read own hooma plus periods"
  on public.hooma_plus_periods
  for select
  using (
    exists (
      select 1
      from public.customers customer
      where customer.id = hooma_plus_periods.customer_id
        and customer.profile_id = auth.uid()
    )
  );

drop policy if exists "admin staff read hooma plus purchases"
  on public.hooma_plus_purchases;
create policy "admin staff read hooma plus purchases"
  on public.hooma_plus_purchases
  for select using (public.is_admin());

drop policy if exists "admin staff read hooma plus attempts"
  on public.hooma_plus_payment_attempts;
create policy "admin staff read hooma plus attempts"
  on public.hooma_plus_payment_attempts
  for select using (public.is_admin());

drop policy if exists "admin staff read hooma plus periods"
  on public.hooma_plus_periods;
create policy "admin staff read hooma plus periods"
  on public.hooma_plus_periods
  for select using (public.is_admin());

drop policy if exists "admin staff read hooma plus events"
  on public.hooma_plus_payment_events;
create policy "admin staff read hooma plus events"
  on public.hooma_plus_payment_events
  for select using (public.is_admin());

revoke all on table public.commerce_delivery_settings from public, anon, authenticated;
revoke all on table public.hooma_plus_plans from public, anon, authenticated;
revoke all on table public.hooma_plus_purchases from public, anon, authenticated;
revoke all on table public.hooma_plus_payment_attempts from public, anon, authenticated;
revoke all on table public.hooma_plus_periods from public, anon, authenticated;
revoke all on table public.hooma_plus_payment_events from public, anon, authenticated;
revoke all on table public.delivery_benefit_reservations from public, anon, authenticated;

grant select on table public.hooma_plus_purchases to authenticated;
grant select on table public.hooma_plus_periods to authenticated;
grant select on table public.hooma_plus_payment_attempts to authenticated;
grant select on table public.hooma_plus_payment_events to authenticated;
grant select, insert, update on table public.hooma_plus_purchases to service_role;
grant select, insert, update on table public.hooma_plus_payment_attempts to service_role;
grant select, insert, update on table public.hooma_plus_periods to service_role;
grant select, insert, update on table public.hooma_plus_payment_events to service_role;
grant select, insert, update on table public.delivery_benefit_reservations to service_role;
grant select, update on table public.commerce_delivery_settings to service_role;
grant select, insert, update on table public.hooma_plus_plans to service_role;

-- Release write-conflicting FK/setup locks before compiling the function phase.
-- The new tables are already protected by RLS, policies, and explicit grants.
commit;
begin;

create or replace function public.get_hooma_plus_summary_for_customer_v1(
  requested_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_record public.commerce_delivery_settings%rowtype;
  active_until_value timestamptz;
  consumed_units integer := 0;
  reserved_units integer := 0;
begin
  if requested_customer_id is null
    or not exists (
      select 1 from public.customers where id = requested_customer_id
    )
  then
    raise exception 'HOOMA_CUSTOMER_NOT_FOUND';
  end if;

  select *
  into settings_record
  from public.commerce_delivery_settings
  where singleton is true;

  if settings_record.singleton is null then
    raise exception 'HOOMA_DELIVERY_SETTINGS_NOT_FOUND';
  end if;

  select max(period.ends_at)
  into active_until_value
  from public.hooma_plus_periods period
  where period.customer_id = requested_customer_id
    and period.status = 'active'
    and period.starts_at <= now()
    and period.ends_at > now();

  select
    coalesce(sum(reservation.units) filter (
      where reservation.status = 'consumed'
    ), 0)::integer,
    coalesce(sum(reservation.units) filter (
      where reservation.status = 'reserved'
    ), 0)::integer
  into consumed_units, reserved_units
  from public.delivery_benefit_reservations reservation
  where reservation.customer_id = requested_customer_id;

  return jsonb_build_object(
    'active', active_until_value is not null,
    'active_until', active_until_value,
    'welcome_units_total', settings_record.welcome_units,
    'welcome_units_consumed', consumed_units,
    -- An unresolved reservation stays in the balance until BOG's signed final
    -- status consumes or releases it. Ignoring a local TTL here could let a
    -- delayed paid callback exceed the ten-unit cap.
    'welcome_units_reserved', reserved_units,
    'welcome_units_remaining', greatest(
      settings_record.welcome_units - consumed_units - reserved_units,
      0
    ),
    'standard_fee', settings_record.standard_fee,
    'free_above_subtotal', settings_record.free_above_subtotal,
    'policy_version', settings_record.policy_version
  );
end;
$$;

revoke all on function public.get_hooma_plus_summary_for_customer_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_hooma_plus_summary_for_customer_v1(uuid)
  to service_role;

create or replace function public.get_my_hooma_plus_summary_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_id_value uuid;
  customer_count integer;
begin
  if auth.uid() is null then
    raise exception 'HOOMA_AUTH_REQUIRED';
  end if;

  select count(*)::integer
  into customer_count
  from public.customers customer
  where customer.profile_id = auth.uid();

  if customer_count <> 1 then
    raise exception 'HOOMA_CUSTOMER_NOT_FOUND';
  end if;

  select customer.id
  into customer_id_value
  from public.customers customer
  where customer.profile_id = auth.uid();

  return public.get_hooma_plus_summary_for_customer_v1(customer_id_value);
end;
$$;

revoke all on function public.get_my_hooma_plus_summary_v1()
  from public, anon;
grant execute on function public.get_my_hooma_plus_summary_v1()
  to authenticated;

create or replace function public.begin_bog_checkout_v2(
  requested_customer_id uuid,
  requested_guest_email text,
  requested_guest_phone text,
  requested_delivery_address jsonb,
  requested_notes text,
  requested_promised_at timestamptz,
  requested_idempotency_key uuid,
  requested_expected_total numeric,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  checkout_result jsonb;
  created_order public.orders%rowtype;
  settings_record public.commerce_delivery_settings%rowtype;
  summary_record jsonb;
  is_reused boolean;
  unit_count integer;
  welcome_remaining integer;
  delivery_fee_value numeric(12,2) := 0;
  total_value numeric(12,2);
  benefit_code_value text;
  welcome_units_reserved integer := 0;
begin
  if requested_expected_total is null
    or requested_expected_total <= 0
    or round(requested_expected_total, 2) <> requested_expected_total
  then
    raise exception 'HOOMA_INVALID_EXPECTED_TOTAL';
  end if;

  -- begin_bog_checkout_v1 owns product validation, authoritative item pricing,
  -- customer/idempotency locking and immutable order-item snapshots. Calling it
  -- from this wrapper keeps all of those writes in this transaction; an
  -- expected-total mismatch below rolls the entire checkout back.
  checkout_result := public.begin_bog_checkout_v1(
    requested_customer_id,
    requested_guest_email,
    requested_guest_phone,
    requested_delivery_address,
    requested_notes,
    requested_promised_at,
    requested_idempotency_key,
    requested_items
  );

  select *
  into created_order
  from public.orders
  where id = (checkout_result->>'order_id')::uuid
  for update;

  if created_order.id is null
    or created_order.customer_id is distinct from requested_customer_id
    or created_order.test_mode is true
  then
    raise exception 'HOOMA_LIVE_ORDER_NOT_FOUND';
  end if;

  is_reused := coalesce((checkout_result->>'reused')::boolean, false);
  if is_reused then
    select coalesce(sum(item.quantity), 0)::integer
    into unit_count
    from public.order_items item
    where item.order_id = created_order.id;

    return checkout_result || jsonb_build_object(
      'amount', created_order.total,
      'subtotal', created_order.subtotal,
      'delivery_fee', created_order.delivery_fee,
      'delivery_benefit_code', created_order.delivery_benefit_code,
      'unit_count', unit_count,
      'welcome_units_reserved', coalesce((
        select reservation.units
        from public.delivery_benefit_reservations reservation
        where reservation.order_id = created_order.id
      ), 0),
      'delivery_pricing_snapshot', created_order.delivery_pricing_snapshot
    );
  end if;

  select *
  into settings_record
  from public.commerce_delivery_settings
  where singleton is true;

  if settings_record.singleton is null then
    raise exception 'HOOMA_DELIVERY_SETTINGS_NOT_FOUND';
  end if;

  select coalesce(sum(item.quantity), 0)::integer
  into unit_count
  from public.order_items item
  where item.order_id = created_order.id;

  if unit_count < 1 or unit_count > 100 then
    raise exception 'HOOMA_INVALID_ORDER_UNIT_COUNT';
  end if;

  summary_record := public.get_hooma_plus_summary_for_customer_v1(
    requested_customer_id
  );
  welcome_remaining := coalesce(
    (summary_record->>'welcome_units_remaining')::integer,
    0
  );

  if coalesce((summary_record->>'active')::boolean, false) then
    benefit_code_value := 'hooma_plus';
  elsif created_order.subtotal > settings_record.free_above_subtotal then
    benefit_code_value := 'subtotal_threshold';
  elsif unit_count <= welcome_remaining then
    benefit_code_value := 'welcome_units';
    welcome_units_reserved := unit_count;
  else
    benefit_code_value := 'standard_fee';
    delivery_fee_value := settings_record.standard_fee;
  end if;

  total_value := round(created_order.subtotal + delivery_fee_value, 2);
  if total_value <> round(requested_expected_total, 2) then
    raise exception 'HOOMA_CHECKOUT_TOTAL_CHANGED';
  end if;

  if welcome_units_reserved > 0 then
    insert into public.delivery_benefit_reservations (
      customer_id,
      order_id,
      checkout_key,
      units,
      status,
      expires_at
    ) values (
      requested_customer_id,
      created_order.id,
      requested_idempotency_key,
      welcome_units_reserved,
      'reserved',
      now() + make_interval(mins => settings_record.payment_ttl_minutes + 15)
    );
  end if;

  update public.orders
  set delivery_fee = delivery_fee_value,
      total = total_value,
      delivery_benefit_code = benefit_code_value,
      delivery_pricing_snapshot = jsonb_build_object(
        'policy_version', settings_record.policy_version,
        'standard_fee', settings_record.standard_fee,
        'free_above_subtotal', settings_record.free_above_subtotal,
        'welcome_units_total', settings_record.welcome_units,
        'welcome_units_available_before', welcome_remaining,
        'welcome_units_reserved', welcome_units_reserved,
        'unit_count', unit_count,
        'benefit_code', benefit_code_value
      ),
      updated_at = now()
  where id = created_order.id
  returning * into created_order;

  update public.payment_attempts
  set amount = total_value,
      request_payload = request_payload || jsonb_build_object(
        'flow', 'bog_full_payment_v2',
        'subtotal', created_order.subtotal,
        'delivery_fee', delivery_fee_value,
        'total', total_value,
        'delivery_benefit_code', benefit_code_value,
        'delivery_policy_version', settings_record.policy_version,
        'payment_ttl_minutes', settings_record.payment_ttl_minutes
      ),
      updated_at = now()
  where id = (checkout_result->>'attempt_id')::uuid
    and order_id = created_order.id
    and status = 'created';

  if not found then
    raise exception 'HOOMA_PAYMENT_ATTEMPT_UPDATE_FAILED';
  end if;

  return checkout_result || jsonb_build_object(
    'amount', created_order.total,
    'subtotal', created_order.subtotal,
    'delivery_fee', created_order.delivery_fee,
    'delivery_benefit_code', created_order.delivery_benefit_code,
    'unit_count', unit_count,
    'welcome_units_reserved', welcome_units_reserved,
    'welcome_units_remaining_after_payment', greatest(
      welcome_remaining - welcome_units_reserved,
      0
    ),
    'payment_ttl_minutes', settings_record.payment_ttl_minutes,
    'delivery_pricing_snapshot', created_order.delivery_pricing_snapshot
  );
end;
$$;

revoke all on function public.begin_bog_checkout_v2(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_bog_checkout_v2(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) to service_role;

-- Recover a missed final callback only in the economically safe direction.
-- Trusted server code may fetch a fresh authenticated BOG receipt and release
-- a welcome-unit reservation when that receipt is unequivocally rejected. A
-- receipt-only recovery can never mark an order paid.
create or replace function public.release_rejected_bog_delivery_reservation_v1(
  requested_attempt_id uuid,
  requested_provider_payment_id text,
  requested_external_order_id text,
  requested_provider_status text,
  requested_capture text,
  requested_currency text,
  requested_request_amount numeric,
  requested_has_split boolean,
  requested_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  attempt_order_id uuid;
  attempt_record public.payment_attempts%rowtype;
  order_record public.orders%rowtype;
  event_payload_sha256 text;
  receipt_state_sha256 text;
begin
  if requested_attempt_id is null
    or nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or requested_external_order_id is distinct from requested_attempt_id::text
    or lower(trim(coalesce(requested_provider_status, ''))) <> 'rejected'
    or lower(trim(coalesce(requested_capture, ''))) <> 'automatic'
    or upper(trim(coalesce(requested_currency, ''))) <> 'GEL'
    or requested_request_amount is null
    or requested_has_split is distinct from false
    or requested_safe_payload is null
    or jsonb_typeof(requested_safe_payload) <> 'object'
    or requested_safe_payload->>'order_id'
      is distinct from requested_provider_payment_id
    or requested_safe_payload->>'external_order_id'
      is distinct from requested_attempt_id::text
    or requested_safe_payload->>'order_status'
      is distinct from 'rejected'
  then
    raise exception 'HOOMA_REJECTED_RECEIPT_INVALID';
  end if;

  select attempt.order_id
  into attempt_order_id
  from public.payment_attempts attempt
  where attempt.id = requested_attempt_id
    and attempt.provider = 'bog';

  if attempt_order_id is null then
    raise exception 'HOOMA_REJECTED_RECEIPT_ATTEMPT_NOT_FOUND';
  end if;

  -- Match the catalog callback's order -> attempt row-lock order.
  select *
  into order_record
  from public.orders
  where id = attempt_order_id
  for update;

  select *
  into attempt_record
  from public.payment_attempts
  where id = requested_attempt_id
    and provider = 'bog'
  for update;

  if order_record.id is null
    or order_record.test_mode is true
    or attempt_record.id is null
    or attempt_record.order_id is distinct from order_record.id
  then
    raise exception 'HOOMA_REJECTED_RECEIPT_ORDER_NOT_FOUND';
  end if;
  if attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id
      <> requested_provider_payment_id
  then
    raise exception 'HOOMA_REJECTED_RECEIPT_PROVIDER_MISMATCH';
  end if;
  if round(requested_request_amount, 2)
      <> round(attempt_record.amount, 2)
    or round(requested_request_amount, 2)
      <> round(order_record.total, 2)
  then
    raise exception 'HOOMA_REJECTED_RECEIPT_AMOUNT_MISMATCH';
  end if;
  if attempt_record.status in (
      'paid',
      'cancelled',
      'refunded',
      'review_required'
    )
    or order_record.payment_status in (
      'paid',
      'refunded',
      'review_required'
    )
  then
    raise exception 'HOOMA_REJECTED_RECEIPT_SETTLED';
  end if;

  event_payload_sha256 := encode(digest(
    (
      'receipt-recovery:'
      || requested_attempt_id::text
      || ':'
      || requested_provider_payment_id
      || ':rejected'
    )::text,
    'sha256'
  ), 'hex');
  receipt_state_sha256 := encode(
    digest(requested_safe_payload::text, 'sha256'),
    'hex'
  );

  insert into public.payment_provider_events (
    payment_attempt_id,
    provider,
    provider_payment_id,
    external_order_id,
    provider_status,
    payload_sha256,
    receipt_state_sha256,
    signature_verified,
    receipt_verified,
    processing_status,
    failure_reason,
    safe_payload,
    processed_at
  ) values (
    attempt_record.id,
    'bog',
    requested_provider_payment_id,
    requested_attempt_id::text,
    'rejected',
    event_payload_sha256,
    receipt_state_sha256,
    false,
    true,
    'applied',
    'REJECTED_RECEIPT_RECOVERY',
    requested_safe_payload,
    now()
  )
  on conflict (
    provider,
    payload_sha256,
    receipt_state_sha256
  ) do nothing;

  update public.payment_attempts
  set provider_payment_id = coalesce(
        provider_payment_id,
        requested_provider_payment_id
      ),
      status = 'failed',
      response_payload = response_payload || requested_safe_payload,
      updated_at = now()
  where id = attempt_record.id
    and status in ('created', 'pending', 'failed');

  update public.orders
  set payment_status = 'failed',
      updated_at = now()
  where id = order_record.id
    and payment_status in ('unpaid', 'failed');

  insert into public.audit_log (
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    'bog_rejected_receipt_recovered',
    'order',
    order_record.id::text,
    jsonb_build_object(
      'attempt_id', attempt_record.id,
      'provider_payment_id', requested_provider_payment_id,
      'receipt_verified', true,
      'signature_verified', false
    )
  );

  return jsonb_build_object(
    'order_id', order_record.id,
    'attempt_id', attempt_record.id,
    'attempt_status', 'failed',
    'reservation_released', true
  );
end;
$$;

revoke all on function public.release_rejected_bog_delivery_reservation_v1(
  uuid, text, text, text, text, text, numeric, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.release_rejected_bog_delivery_reservation_v1(
  uuid, text, text, text, text, text, numeric, boolean, jsonb
) to service_role;

create or replace function public.sync_delivery_benefit_from_bog_attempt_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_fulfillment_status text;
begin
  if new.provider <> 'bog' or new.order_id is null then
    return new;
  end if;

  if new.status = 'paid'
    and old.status is distinct from new.status
    and new.signature_verified is true
  then
    update public.delivery_benefit_reservations
    set status = 'consumed',
        consumed_at = coalesce(consumed_at, now()),
        released_at = null,
        updated_at = now()
    where order_id = new.order_id
      and status = 'reserved';
  elsif new.status in ('failed', 'cancelled')
    and old.status is distinct from new.status
  then
    update public.delivery_benefit_reservations
    set status = 'released',
        released_at = coalesce(released_at, now()),
        updated_at = now()
    where order_id = new.order_id
      and status = 'reserved';
  elsif new.status = 'refunded'
    and old.status is distinct from new.status
    and new.signature_verified is true
  then
    select fulfillment_status
    into order_fulfillment_status
    from public.orders
    where id = new.order_id;

    -- Restore the welcome units only while the physical benefit cannot yet
    -- have been used. Refunds after production/courier activity keep them
    -- consumed and remain visible to support in the immutable order snapshot.
    if order_fulfillment_status in (
      'order_received',
      'confirmed',
      'cancelled'
    ) then
      update public.delivery_benefit_reservations
      set status = 'released',
          released_at = coalesce(released_at, now()),
          updated_at = now()
      where order_id = new.order_id
        and status in ('reserved', 'consumed');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_delivery_benefit_from_bog_attempt_v1()
  from public, anon, authenticated;

drop trigger if exists sync_delivery_benefit_from_bog_attempt
  on public.payment_attempts;
create trigger sync_delivery_benefit_from_bog_attempt
after update of status on public.payment_attempts
for each row
execute function public.sync_delivery_benefit_from_bog_attempt_v1();

-- Preserve terminal provenance across every later provider state, including an
-- unsupported/manual-review callback that arrives before a completion.
create or replace function public.mark_terminal_bog_delivery_review_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.provider = 'bog'
    and (
      old.response_payload->>'delivery_terminal_review'
        = 'LATE_PAID_AFTER_RELEASED_BENEFIT'
      or (
        (
          old.status in ('failed', 'cancelled')
          or new.status in ('failed', 'cancelled')
        )
        and exists (
          select 1
          from public.delivery_benefit_reservations reservation
          where reservation.order_id = new.order_id
        )
      )
    )
  then
    new.response_payload := new.response_payload || jsonb_build_object(
      'delivery_terminal_review',
      'LATE_PAID_AFTER_RELEASED_BENEFIT'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.mark_terminal_bog_delivery_review_v1()
  from public, anon, authenticated;

drop trigger if exists mark_terminal_bog_delivery_review
  on public.payment_attempts;
create trigger mark_terminal_bog_delivery_review
before update of status, response_payload on public.payment_attempts
for each row
execute function public.mark_terminal_bog_delivery_review_v1();

-- A rejected/failed provider state is terminal for benefit accounting. If BOG
-- ever reports a contradictory later completion, hold both payment and the
-- original welcome balance for manual review instead of silently granting
-- more than ten units.
create or replace function public.hold_late_paid_delivery_transition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.provider <> 'bog'
    or new.status <> 'paid'
    or not (
      old.status in ('failed', 'cancelled')
      or old.response_payload->>'delivery_terminal_review'
        = 'LATE_PAID_AFTER_RELEASED_BENEFIT'
    )
    or not exists (
      select 1
      from public.delivery_benefit_reservations reservation
      where reservation.order_id = new.order_id
        and reservation.status in ('released', 'consumed')
    )
  then
    return null;
  end if;

  update public.delivery_benefit_reservations
  set status = 'reserved',
      consumed_at = null,
      released_at = null,
      updated_at = now()
  where order_id = new.order_id
    and status in ('released', 'consumed');

  update public.payment_attempts
  set status = 'review_required',
      response_payload = response_payload || jsonb_build_object(
        'delivery_terminal_review',
        'LATE_PAID_AFTER_RELEASED_BENEFIT'
      ),
      updated_at = now()
  where id = new.id
    and status = 'paid';

  update public.orders
  set payment_status = 'review_required',
      status = case when status = 'paid' then 'pending' else status end,
      updated_at = now()
  where id = new.order_id
    and payment_status <> 'refunded';

  update public.order_events
  set is_customer_visible = false,
      details = details || jsonb_build_object(
        'review_required', true,
        'review_reason', 'LATE_PAID_AFTER_RELEASED_BENEFIT'
      )
  where order_id = new.order_id
    and event_key = (
      'payment:bog:'
      || coalesce(new.provider_payment_id, '')
      || ':paid'
    );

  update public.payment_provider_events
  set processing_status = 'manual_review',
      failure_reason = 'LATE_PAID_AFTER_RELEASED_BENEFIT',
      processed_at = now()
  where payment_attempt_id = new.id
    and provider = 'bog'
    and provider_payment_id = new.provider_payment_id
    and provider_status = 'completed'
    and processing_status = 'applied';

  delete from public.notifications
  where order_id = new.order_id
    and notification_type = 'operator_order_paid';

  insert into public.audit_log (
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    'bog_late_paid_delivery_held',
    'order',
    new.order_id::text,
    jsonb_build_object(
      'attempt_id', new.id,
      'previous_status', old.status,
      'provider_payment_id', new.provider_payment_id
    )
  );

  return null;
end;
$$;

revoke all on function public.hold_late_paid_delivery_transition_v1()
  from public, anon, authenticated;

drop trigger if exists hold_late_paid_delivery_transition
  on public.payment_attempts;
create constraint trigger hold_late_paid_delivery_transition
after update on public.payment_attempts
deferrable initially deferred
for each row
when (
  new.provider = 'bog'
  and new.status = 'paid'
  and (
    old.status in ('failed', 'cancelled')
    or old.response_payload->>'delivery_terminal_review'
      = 'LATE_PAID_AFTER_RELEASED_BENEFIT'
  )
)
execute function public.hold_late_paid_delivery_transition_v1();

create or replace function public.begin_bog_hooma_plus_checkout_v1(
  requested_customer_id uuid,
  requested_plan_code text,
  requested_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_record public.hooma_plus_plans%rowtype;
  existing_purchase public.hooma_plus_purchases%rowtype;
  existing_attempt public.hooma_plus_payment_attempts%rowtype;
  created_purchase public.hooma_plus_purchases%rowtype;
  created_attempt public.hooma_plus_payment_attempts%rowtype;
begin
  if requested_customer_id is null
    or not exists (
      select 1 from public.customers where id = requested_customer_id
    )
  then
    raise exception 'HOOMA_CUSTOMER_NOT_FOUND';
  end if;
  if requested_idempotency_key is null then
    raise exception 'HOOMA_PLUS_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hooma-plus-customer:' || requested_customer_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hooma-plus-key:' || requested_idempotency_key::text, 0)
  );

  select *
  into existing_purchase
  from public.hooma_plus_purchases
  where idempotency_key = requested_idempotency_key;

  if existing_purchase.id is not null then
    select *
    into existing_attempt
    from public.hooma_plus_payment_attempts
    where purchase_id = existing_purchase.id;

    if existing_purchase.customer_id is distinct from requested_customer_id
      or existing_purchase.plan_code is distinct from requested_plan_code
      or existing_attempt.id is null
      or existing_attempt.idempotency_key is distinct from requested_idempotency_key
    then
      raise exception 'HOOMA_PLUS_IDEMPOTENCY_CONFLICT';
    end if;

    return jsonb_build_object(
      'purchase_id', existing_purchase.id,
      'attempt_id', existing_attempt.id,
      'plan_code', existing_purchase.plan_code,
      'plan_label_ka', existing_purchase.plan_label_ka,
      'plan_label_en', existing_purchase.plan_label_en,
      'amount', existing_attempt.amount,
      'currency', existing_attempt.currency,
      'purchase_status', existing_purchase.status,
      'attempt_status', existing_attempt.status,
      'attempt_created_at', existing_attempt.created_at,
      'provider_payment_id', existing_attempt.provider_payment_id,
      'response_payload', existing_attempt.response_payload,
      'activated_at', existing_purchase.activated_at,
      'expires_at', existing_purchase.expires_at,
      'reused', true
    );
  end if;

  if exists (
    select 1
    from public.hooma_plus_purchases purchase
    where purchase.customer_id = requested_customer_id
      and purchase.status = 'review_required'
  ) then
    raise exception 'HOOMA_PLUS_PAYMENT_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1
    from public.hooma_plus_payment_attempts attempt
    join public.hooma_plus_purchases purchase
      on purchase.id = attempt.purchase_id
    where purchase.customer_id = requested_customer_id
      and attempt.status in ('created', 'pending')
      and attempt.created_at >= now() - interval '20 minutes'
  ) then
    raise exception 'HOOMA_PLUS_PAYMENT_IN_PROGRESS';
  end if;

  if (
    select count(*)
    from public.hooma_plus_payment_attempts recent_attempt
    join public.hooma_plus_purchases recent_purchase
      on recent_purchase.id = recent_attempt.purchase_id
    where recent_purchase.customer_id = requested_customer_id
      and recent_attempt.created_at >= now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'HOOMA_PLUS_CHECKOUT_RATE_LIMITED';
  end if;

  select *
  into plan_record
  from public.hooma_plus_plans
  where code = requested_plan_code
    and is_active is true;

  if plan_record.code is null then
    raise exception 'HOOMA_PLUS_PLAN_NOT_FOUND';
  end if;

  insert into public.hooma_plus_purchases (
    customer_id,
    plan_code,
    plan_label_ka,
    plan_label_en,
    duration_months,
    amount,
    currency,
    status,
    idempotency_key
  ) values (
    requested_customer_id,
    plan_record.code,
    plan_record.label_ka,
    plan_record.label_en,
    plan_record.duration_months,
    plan_record.price,
    plan_record.currency,
    'created',
    requested_idempotency_key
  )
  returning * into created_purchase;

  insert into public.hooma_plus_payment_attempts (
    purchase_id,
    provider,
    idempotency_key,
    amount,
    currency,
    status,
    request_payload
  ) values (
    created_purchase.id,
    'bog',
    requested_idempotency_key,
    created_purchase.amount,
    created_purchase.currency,
    'created',
    jsonb_build_object(
      'flow', 'bog_hooma_plus_v1',
      'capture', 'automatic',
      'plan_code', created_purchase.plan_code,
      'duration_months', created_purchase.duration_months,
      'renewal', 'manual',
      'payment_ttl_minutes', 15
    )
  )
  returning * into created_attempt;

  return jsonb_build_object(
    'purchase_id', created_purchase.id,
    'attempt_id', created_attempt.id,
    'plan_code', created_purchase.plan_code,
    'plan_label_ka', created_purchase.plan_label_ka,
    'plan_label_en', created_purchase.plan_label_en,
    'amount', created_attempt.amount,
    'currency', created_attempt.currency,
    'purchase_status', created_purchase.status,
    'attempt_status', created_attempt.status,
    'attempt_created_at', created_attempt.created_at,
    'provider_payment_id', null,
    'response_payload', '{}'::jsonb,
    'activated_at', null,
    'expires_at', null,
    'reused', false
  );
end;
$$;

revoke all on function public.begin_bog_hooma_plus_checkout_v1(
  uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.begin_bog_hooma_plus_checkout_v1(
  uuid, text, uuid
) to service_role;

create or replace function public.bind_bog_hooma_plus_attempt_v1(
  requested_attempt_id uuid,
  requested_provider_payment_id text,
  requested_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_record public.hooma_plus_payment_attempts%rowtype;
  purchase_record public.hooma_plus_purchases%rowtype;
begin
  if requested_attempt_id is null
    or nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or requested_response is null
    or jsonb_typeof(requested_response) <> 'object'
  then
    raise exception 'HOOMA_PLUS_INVALID_BIND_RESULT';
  end if;

  -- Keep the purchase -> attempt row-lock order identical to the callback.
  select *
  into attempt_record
  from public.hooma_plus_payment_attempts
  where id = requested_attempt_id;

  if attempt_record.id is null then
    raise exception 'HOOMA_PLUS_ATTEMPT_NOT_FOUND';
  end if;

  select *
  into purchase_record
  from public.hooma_plus_purchases
  where id = attempt_record.purchase_id
  for update;

  if purchase_record.id is null then
    raise exception 'HOOMA_PLUS_PURCHASE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'hooma-plus-customer:' || purchase_record.customer_id::text,
      0
    )
  );

  select *
  into attempt_record
  from public.hooma_plus_payment_attempts
  where id = requested_attempt_id
  for update;

  if attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id <> requested_provider_payment_id
  then
    raise exception 'HOOMA_PLUS_PROVIDER_ID_CONFLICT';
  end if;
  if attempt_record.status in (
    'paid',
    'failed',
    'cancelled',
    'review_required',
    'refunded'
  ) then
    return jsonb_build_object(
      'attempt_id', attempt_record.id,
      'attempt_status', attempt_record.status,
      'provider_payment_id', attempt_record.provider_payment_id,
      'bound', false
    );
  end if;

  update public.hooma_plus_payment_attempts
  set provider_payment_id = requested_provider_payment_id,
      status = 'pending',
      response_payload = response_payload || requested_response,
      updated_at = now()
  where id = requested_attempt_id
  returning * into attempt_record;

  update public.hooma_plus_purchases
  set status = 'pending',
      updated_at = now()
  where id = attempt_record.purchase_id
    and status = 'created';

  return jsonb_build_object(
    'attempt_id', attempt_record.id,
    'attempt_status', attempt_record.status,
    'provider_payment_id', attempt_record.provider_payment_id,
    'bound', true
  );
end;
$$;

revoke all on function public.bind_bog_hooma_plus_attempt_v1(
  uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.bind_bog_hooma_plus_attempt_v1(
  uuid, text, jsonb
) to service_role;

-- As with catalog orders, an authenticated receipt may safely close a missed
-- rejected callback, but it can never activate Hooma+ without the signed
-- callback path.
create or replace function public.recover_rejected_bog_hooma_plus_v1(
  requested_attempt_id uuid,
  requested_provider_payment_id text,
  requested_external_order_id text,
  requested_provider_status text,
  requested_capture text,
  requested_currency text,
  requested_request_amount numeric,
  requested_has_split boolean,
  requested_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  attempt_record public.hooma_plus_payment_attempts%rowtype;
  purchase_record public.hooma_plus_purchases%rowtype;
  event_payload_sha256 text;
  receipt_state_sha256 text;
begin
  if requested_attempt_id is null
    or nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or requested_external_order_id is distinct from requested_attempt_id::text
    or lower(trim(coalesce(requested_provider_status, ''))) <> 'rejected'
    or lower(trim(coalesce(requested_capture, ''))) <> 'automatic'
    or upper(trim(coalesce(requested_currency, ''))) <> 'GEL'
    or requested_request_amount is null
    or requested_has_split is distinct from false
    or requested_safe_payload is null
    or jsonb_typeof(requested_safe_payload) <> 'object'
    or requested_safe_payload->>'order_id'
      is distinct from requested_provider_payment_id
    or requested_safe_payload->>'external_order_id'
      is distinct from requested_attempt_id::text
    or requested_safe_payload->>'order_status'
      is distinct from 'rejected'
  then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_INVALID';
  end if;

  select *
  into attempt_record
  from public.hooma_plus_payment_attempts
  where id = requested_attempt_id;

  if attempt_record.id is null then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_ATTEMPT_NOT_FOUND';
  end if;

  select *
  into purchase_record
  from public.hooma_plus_purchases
  where id = attempt_record.purchase_id
  for update;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'hooma-plus-customer:' || purchase_record.customer_id::text,
      0
    )
  );

  select *
  into attempt_record
  from public.hooma_plus_payment_attempts
  where id = requested_attempt_id
  for update;

  if purchase_record.id is null
    or attempt_record.purchase_id is distinct from purchase_record.id
  then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_PURCHASE_NOT_FOUND';
  end if;
  if attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id
      <> requested_provider_payment_id
  then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_PROVIDER_MISMATCH';
  end if;
  if round(requested_request_amount, 2)
      <> round(attempt_record.amount, 2)
    or round(requested_request_amount, 2)
      <> round(purchase_record.amount, 2)
  then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_AMOUNT_MISMATCH';
  end if;
  if attempt_record.status in (
      'paid',
      'cancelled',
      'refunded',
      'review_required'
    )
    or purchase_record.status in ('paid', 'refunded', 'review_required')
  then
    raise exception 'HOOMA_PLUS_REJECTED_RECEIPT_SETTLED';
  end if;

  event_payload_sha256 := encode(digest(
    (
      'hooma-plus-receipt-recovery:'
      || requested_attempt_id::text
      || ':'
      || requested_provider_payment_id
      || ':rejected'
    )::text,
    'sha256'
  ), 'hex');
  receipt_state_sha256 := encode(
    digest(requested_safe_payload::text, 'sha256'),
    'hex'
  );

  insert into public.hooma_plus_payment_events (
    payment_attempt_id,
    provider_payment_id,
    external_order_id,
    provider_status,
    payload_sha256,
    receipt_state_sha256,
    signature_verified,
    receipt_verified,
    processing_status,
    failure_reason,
    safe_payload,
    processed_at
  ) values (
    attempt_record.id,
    requested_provider_payment_id,
    requested_attempt_id::text,
    'rejected',
    event_payload_sha256,
    receipt_state_sha256,
    false,
    true,
    'applied',
    'REJECTED_RECEIPT_RECOVERY',
    requested_safe_payload,
    now()
  )
  on conflict (
    payload_sha256,
    receipt_state_sha256
  ) do nothing;

  update public.hooma_plus_payment_attempts
  set provider_payment_id = coalesce(
        provider_payment_id,
        requested_provider_payment_id
      ),
      status = 'failed',
      response_payload = response_payload || requested_safe_payload,
      updated_at = now()
  where id = attempt_record.id
    and status in ('created', 'pending', 'failed');

  update public.hooma_plus_purchases
  set status = 'failed',
      updated_at = now()
  where id = purchase_record.id
    and status in ('created', 'pending', 'failed');

  insert into public.audit_log (
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    'bog_hooma_plus_rejected_receipt_recovered',
    'hooma_plus_purchase',
    purchase_record.id::text,
    jsonb_build_object(
      'attempt_id', attempt_record.id,
      'provider_payment_id', requested_provider_payment_id,
      'receipt_verified', true,
      'signature_verified', false
    )
  );

  return jsonb_build_object(
    'purchase_id', purchase_record.id,
    'attempt_id', attempt_record.id,
    'attempt_status', 'failed'
  );
end;
$$;

revoke all on function public.recover_rejected_bog_hooma_plus_v1(
  uuid, text, text, text, text, text, numeric, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.recover_rejected_bog_hooma_plus_v1(
  uuid, text, text, text, text, text, numeric, boolean, jsonb
) to service_role;

create or replace function public.apply_bog_hooma_plus_result_v1(
  requested_attempt_id uuid,
  requested_provider_payment_id text,
  requested_external_order_id text,
  requested_payload_sha256 text,
  requested_event_at timestamptz,
  requested_provider_status text,
  requested_capture text,
  requested_currency text,
  requested_request_amount numeric,
  requested_transfer_amount numeric,
  requested_refund_amount numeric,
  requested_payment_method text,
  requested_payment_option text,
  requested_transaction_id text,
  requested_has_split boolean,
  requested_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  attempt_record public.hooma_plus_payment_attempts%rowtype;
  purchase_record public.hooma_plus_purchases%rowtype;
  existing_event public.hooma_plus_payment_events%rowtype;
  created_event_id uuid;
  failure_code text;
  result_state text := 'applied';
  computed_receipt_state_sha256 text;
  period_start timestamptz;
  period_end timestamptz;
begin
  if requested_attempt_id is null
    or nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or nullif(trim(requested_external_order_id), '') is null
    or nullif(trim(requested_provider_status), '') is null
    or nullif(trim(requested_capture), '') is null
    or nullif(trim(requested_currency), '') is null
    or requested_payload_sha256 is null
    or requested_payload_sha256 !~ '^[0-9a-f]{64}$'
    or requested_has_split is null
    or requested_safe_payload is null
    or jsonb_typeof(requested_safe_payload) <> 'object'
  then
    raise exception 'HOOMA_PLUS_INVALID_RESULT';
  end if;

  computed_receipt_state_sha256 := encode(digest(jsonb_build_object(
    'provider_payment_id', trim(requested_provider_payment_id),
    'external_order_id', trim(requested_external_order_id),
    'provider_status', lower(trim(requested_provider_status)),
    'capture', lower(trim(requested_capture)),
    'currency', upper(trim(requested_currency)),
    'request_amount', case
      when requested_request_amount is null then null
      else round(requested_request_amount, 2)
    end,
    'transfer_amount', case
      when requested_transfer_amount is null then null
      else round(requested_transfer_amount, 2)
    end,
    'refund_amount', case
      when requested_refund_amount is null then null
      else round(requested_refund_amount, 2)
    end,
    'payment_method', lower(trim(coalesce(requested_payment_method, ''))),
    'payment_option', lower(trim(coalesce(requested_payment_option, ''))),
    'transaction_id', trim(coalesce(requested_transaction_id, '')),
    'has_split', requested_has_split,
    'safe_payload', requested_safe_payload
  )::text, 'sha256'), 'hex');

  select *
  into existing_event
  from public.hooma_plus_payment_events
  where payload_sha256 = requested_payload_sha256
    and receipt_state_sha256 = computed_receipt_state_sha256;

  if existing_event.id is not null then
    return jsonb_build_object(
      'event_id', existing_event.id,
      'processing_status', existing_event.processing_status,
      'failure_reason', existing_event.failure_reason,
      'duplicate', true
    );
  end if;

  select *
  into attempt_record
  from public.hooma_plus_payment_attempts
  where id = requested_attempt_id;

  if attempt_record.id is not null then
    -- Serialize renewal activation and refund handling for this customer.
    select *
    into purchase_record
    from public.hooma_plus_purchases
    where id = attempt_record.purchase_id
    for update;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'hooma-plus-customer:' || purchase_record.customer_id::text,
        0
      )
    );

    select *
    into attempt_record
    from public.hooma_plus_payment_attempts
    where id = requested_attempt_id
    for update;
  end if;

  if attempt_record.id is null then
    failure_code := 'ATTEMPT_NOT_FOUND';
  elsif purchase_record.id is null
    or purchase_record.id is distinct from attempt_record.purchase_id
  then
    failure_code := 'PURCHASE_NOT_FOUND';
  elsif requested_external_order_id <> attempt_record.id::text then
    failure_code := 'EXTERNAL_ORDER_MISMATCH';
  elsif attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id <> requested_provider_payment_id
  then
    failure_code := 'PROVIDER_ORDER_MISMATCH';
  elsif lower(requested_capture) <> 'automatic' then
    failure_code := 'NON_AUTOMATIC_CAPTURE';
  elsif upper(requested_currency) <> 'GEL' then
    failure_code := 'CURRENCY_MISMATCH';
  elsif requested_request_amount is null
    or round(requested_request_amount, 2) <> round(attempt_record.amount, 2)
    or round(requested_request_amount, 2) <> round(purchase_record.amount, 2)
  then
    failure_code := 'AMOUNT_MISMATCH';
  elsif requested_has_split is true then
    failure_code := 'SPLIT_PAYMENT_NOT_ALLOWED';
  elsif requested_provider_status not in (
    'created',
    'processing',
    'completed',
    'rejected',
    'refund_requested',
    'refunded',
    'refunded_partially',
    'auth_requested',
    'blocked',
    'partial_completed'
  ) then
    failure_code := 'UNSUPPORTED_PROVIDER_STATUS';
  elsif requested_provider_status = 'completed' and (
    requested_transfer_amount is null
    or round(requested_transfer_amount, 2) <> round(attempt_record.amount, 2)
    or coalesce(round(requested_refund_amount, 2), 0) <> 0
    or requested_payment_method not in ('card', 'google_pay', 'apple_pay')
    or requested_payment_option is distinct from 'direct_debit'
    or nullif(trim(requested_transaction_id), '') is null
  ) then
    failure_code := 'INVALID_COMPLETED_PAYMENT';
  elsif requested_provider_status = 'refunded' and (
    requested_refund_amount is null
    or round(requested_refund_amount, 2) <> round(attempt_record.amount, 2)
  ) then
    failure_code := 'INVALID_FULL_REFUND';
  end if;

  if failure_code is not null then
    result_state := 'manual_review';
  elsif requested_provider_status in (
    'refund_requested',
    'refunded_partially',
    'auth_requested',
    'blocked',
    'partial_completed'
  ) then
    result_state := 'manual_review';
    failure_code := 'UNSUPPORTED_PAYMENT_TRANSITION';
  elsif requested_provider_status in ('created', 'processing')
    and attempt_record.status in (
      'failed',
      'cancelled',
      'paid',
      'review_required',
      'refunded'
    )
  then
    result_state := 'ignored';
    failure_code := 'STALE_PROVIDER_STATUS';
  elsif requested_provider_status = 'rejected'
    and attempt_record.status in ('paid', 'refunded')
  then
    result_state := 'ignored';
    failure_code := 'STALE_PROVIDER_STATUS';
  elsif requested_provider_status = 'completed'
    and attempt_record.status = 'refunded'
  then
    result_state := 'ignored';
    failure_code := 'ALREADY_REFUNDED';
  elsif requested_provider_status = 'completed'
    and attempt_record.status in ('failed', 'cancelled')
  then
    result_state := 'manual_review';
    failure_code := 'LATE_COMPLETED_AFTER_TERMINAL_STATUS';
  elsif requested_provider_status = 'completed'
    and attempt_record.response_payload->>'terminal_review_reason'
      = 'LATE_COMPLETED_AFTER_TERMINAL_STATUS'
  then
    result_state := 'manual_review';
    failure_code := 'LATE_COMPLETED_AFTER_TERMINAL_STATUS';
  end if;

  insert into public.hooma_plus_payment_events (
    payment_attempt_id,
    provider_payment_id,
    external_order_id,
    provider_status,
    payload_sha256,
    receipt_state_sha256,
    provider_event_at,
    signature_verified,
    receipt_verified,
    processing_status,
    failure_reason,
    safe_payload,
    processed_at
  ) values (
    case when attempt_record.id is null then null else attempt_record.id end,
    requested_provider_payment_id,
    requested_external_order_id,
    requested_provider_status,
    requested_payload_sha256,
    computed_receipt_state_sha256,
    requested_event_at,
    true,
    true,
    result_state,
    failure_code,
    requested_safe_payload,
    now()
  )
  on conflict (payload_sha256, receipt_state_sha256) do nothing
  returning id into created_event_id;

  if created_event_id is null then
    select *
    into existing_event
    from public.hooma_plus_payment_events
    where payload_sha256 = requested_payload_sha256
      and receipt_state_sha256 = computed_receipt_state_sha256;

    return jsonb_build_object(
      'event_id', existing_event.id,
      'processing_status', existing_event.processing_status,
      'failure_reason', existing_event.failure_reason,
      'duplicate', true
    );
  end if;

  if result_state = 'manual_review'
    and attempt_record.id is not null
    and purchase_record.id is not null
  then
    update public.hooma_plus_payment_attempts
    set provider_payment_id = coalesce(
          provider_payment_id,
          requested_provider_payment_id
        ),
        status = case
          when status = 'refunded' then status
          else 'review_required'
        end,
        response_payload = response_payload
          || requested_safe_payload
          || case
            when attempt_record.status in ('failed', 'cancelled')
              or attempt_record.response_payload->>'terminal_review_reason'
                = 'LATE_COMPLETED_AFTER_TERMINAL_STATUS'
              then jsonb_build_object(
                'terminal_review_reason',
                'LATE_COMPLETED_AFTER_TERMINAL_STATUS'
              )
            else '{}'::jsonb
          end,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.hooma_plus_purchases
    set status = case
          when status = 'refunded' then status
          else 'review_required'
        end,
        updated_at = now()
    where id = purchase_record.id;

    update public.hooma_plus_periods
    set status = 'review_required',
        updated_at = now()
    where purchase_id = purchase_record.id
      and status = 'active';
  end if;

  if result_state <> 'applied' then
    return jsonb_build_object(
      'event_id', created_event_id,
      'processing_status', result_state,
      'failure_reason', failure_code,
      'duplicate', false
    );
  end if;

  if requested_provider_status in ('created', 'processing') then
    update public.hooma_plus_payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'pending',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.hooma_plus_purchases
    set status = 'pending',
        updated_at = now()
    where id = purchase_record.id
      and status in ('created', 'pending');
  elsif requested_provider_status = 'completed' then
    update public.hooma_plus_payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'paid',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    if not exists (
      select 1
      from public.hooma_plus_periods period
      where period.purchase_id = purchase_record.id
    ) then
      select greatest(
        now(),
        coalesce(max(period.ends_at), now())
      )
      into period_start
      from public.hooma_plus_periods period
      where period.customer_id = purchase_record.customer_id
        and period.status = 'active'
        and period.ends_at > now();

      period_end := period_start
        + make_interval(months => purchase_record.duration_months);

      insert into public.hooma_plus_periods (
        customer_id,
        purchase_id,
        starts_at,
        ends_at,
        status
      ) values (
        purchase_record.customer_id,
        purchase_record.id,
        period_start,
        period_end,
        'active'
      );
    else
      select period.starts_at, period.ends_at
      into period_start, period_end
      from public.hooma_plus_periods period
      where period.purchase_id = purchase_record.id;

      update public.hooma_plus_periods
      set status = 'active',
          updated_at = now()
      where purchase_id = purchase_record.id
        and status = 'review_required';
    end if;

    update public.hooma_plus_purchases
    set status = 'paid',
        activated_at = period_start,
        expires_at = period_end,
        updated_at = now()
    where id = purchase_record.id;
  elsif requested_provider_status = 'rejected' then
    update public.hooma_plus_payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'failed',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.hooma_plus_purchases
    set status = 'failed',
        updated_at = now()
    where id = purchase_record.id
      and status in ('created', 'pending', 'failed', 'review_required');
  elsif requested_provider_status = 'refunded' then
    update public.hooma_plus_payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'refunded',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.hooma_plus_purchases
    set status = 'refunded',
        updated_at = now()
    where id = purchase_record.id;

    update public.hooma_plus_periods
    set status = 'refunded',
        updated_at = now()
    where purchase_id = purchase_record.id;
  end if;

  return jsonb_build_object(
    'event_id', created_event_id,
    'processing_status', 'applied',
    'provider_status', requested_provider_status,
    'purchase_id', purchase_record.id,
    'attempt_id', attempt_record.id,
    'active_from', period_start,
    'active_until', period_end,
    'duplicate', false
  );
end;
$$;

revoke all on function public.apply_bog_hooma_plus_result_v1(
  uuid, text, text, text, timestamptz, text, text, text, numeric, numeric,
  numeric, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_bog_hooma_plus_result_v1(
  uuid, text, text, text, timestamptz, text, text, text, numeric, numeric,
  numeric, text, text, text, boolean, jsonb
) to service_role;

alter table public.orders
  validate constraint orders_delivery_benefit_code_check;

commit;

-- Add the live orders FK in its own short lock window, then validate it under
-- a lower-impact lock after the write-blocking transaction has committed.
begin;

alter table public.delivery_benefit_reservations
  drop constraint if exists delivery_benefit_reservations_order_id_fkey;
alter table public.delivery_benefit_reservations
  add constraint delivery_benefit_reservations_order_id_fkey
  foreign key (order_id)
  references public.orders(id)
  on delete restrict
  not valid;

commit;
begin;

alter table public.delivery_benefit_reservations
  validate constraint delivery_benefit_reservations_order_id_fkey;

commit;
