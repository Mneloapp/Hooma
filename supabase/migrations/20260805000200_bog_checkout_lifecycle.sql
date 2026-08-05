-- Keep an abandoned catalog payment intent out of the operational order
-- lifecycle and serialize each customer's unresolved BOG checkout.  The old
-- v1/v2 checkout functions remain implementation details of the service-only
-- v3 entry point so another idempotency key cannot create a second unresolved
-- live order for the same customer.

begin;

-- Preserve the deployed v2 implementation under a non-PostgREST name. v3
-- composes it below, while a new v2 compatibility wrapper keeps old Vercel
-- instances working during migration-first rollout without retaining a guard
-- bypass after this transaction commits.
alter function public.begin_bog_checkout_v2(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) rename to begin_bog_checkout_v2_internal;

alter table public.orders
  add column if not exists placed_at timestamptz;

alter table public.payment_attempts
  add column if not exists late_paid_at timestamptz;

comment on column public.orders.placed_at is
  'Trusted time when a live order entered the order lifecycle after verified payment; test orders use created_at.';

comment on column public.payment_attempts.late_paid_at is
  'First signed BOG transition from a terminal/review state to paid; used only for a bounded duplicate-charge guard.';

create index if not exists idx_orders_customer_placed_at
  on public.orders(customer_id, placed_at desc)
  where placed_at is not null;

-- Cover the customer history and the split admin operational/session queries
-- before they sort and limit. The predicates exactly match the visibility
-- boundary used by those callers, keeping abandoned checkout rows out of the
-- larger operational indexes as well as out of the UI.
create index if not exists idx_orders_customer_visible_updated
  on public.orders(customer_id, updated_at desc, id)
  where test_mode is true
     or payment_status in ('paid', 'review_required', 'refunded');

create index if not exists idx_orders_fulfillment_visible_updated
  on public.orders(fulfillment_status, updated_at desc, id)
  where test_mode is true
     or payment_status in ('paid', 'review_required', 'refunded');

create index if not exists idx_orders_payment_sessions_updated
  on public.orders(payment_status, updated_at desc, id)
  where test_mode is false
    and payment_status in ('unpaid', 'failed');

create index if not exists idx_payment_attempts_late_paid_guard
  on public.payment_attempts(late_paid_at desc, order_id)
  where provider = 'bog'
    and signature_verified is true
    and late_paid_at is not null;

-- v1 historically exposed "Order received" before the customer had paid.
-- Preserve the audit timestamp, but make the record an internal checkout
-- intent. A fresh customer-visible order_received event is emitted only after
-- a signed, paid BOG attempt is independently verified below.
update public.order_events event
set event_key = 'checkout:' || event.order_id::text || ':started',
    event_type = 'checkout_started',
    customer_label_en = 'Checkout started',
    customer_label_ka = 'გადახდის სესია დაიწყო',
    details = event.details || jsonb_build_object(
      'lifecycle', 'checkout_intent',
      'payment_status', 'unpaid'
    ),
    is_customer_visible = false
where event.event_key = 'order:' || event.order_id::text || ':received'
  and event.event_type = 'order_received'
  and event.details->>'payment_provider' = 'bog'
  and event.details->>'payment_status' = 'unpaid';

-- Existing verified live payments predate placed_at. Prefer the immutable
-- payment-confirmed event time and fall back to the verified attempt update.
-- Test orders do not require a provider callback and are placed at creation.
update public.orders customer_order
set placed_at = case
  when customer_order.test_mode is true then customer_order.created_at
  else coalesce(
    (
      select min(event.created_at)
      from public.order_events event
      where event.order_id = customer_order.id
        and event.event_type = 'payment_confirmed'
    ),
    (
      select min(attempt.updated_at)
      from public.payment_attempts attempt
      where attempt.order_id = customer_order.id
        and attempt.provider = 'bog'
        and attempt.status in ('paid', 'refunded')
        and attempt.signature_verified is true
    )
  )
end
where customer_order.placed_at is null
  and (
    customer_order.test_mode is true
    or (
      customer_order.payment_status in ('paid', 'refunded')
      and exists (
        select 1
        from public.payment_attempts attempt
        where attempt.order_id = customer_order.id
          and attempt.provider = 'bog'
          and attempt.status in ('paid', 'refunded')
          and attempt.signature_verified is true
      )
    )
  );

-- Recreate the customer milestone for already-paid live BOG orders after the
-- pre-payment event above has been converted into a hidden checkout intent.
insert into public.order_events (
  order_id,
  event_key,
  event_type,
  customer_label_en,
  customer_label_ka,
  details,
  is_customer_visible,
  created_at
)
select
  customer_order.id,
  'order:' || customer_order.id::text || ':received',
  'order_received',
  'Order received',
  'შეკვეთა მიღებულია',
  jsonb_build_object(
    'payment_provider', 'bog',
    'payment_mode', 'full',
    'payment_status', customer_order.payment_status,
    'lifecycle', 'placed'
  ),
  true,
  customer_order.placed_at + interval '1 microsecond'
from public.orders customer_order
where customer_order.test_mode is false
  and customer_order.placed_at is not null
  and customer_order.payment_status in ('paid', 'refunded')
  and exists (
    select 1
    from public.payment_attempts attempt
    where attempt.order_id = customer_order.id
      and attempt.provider = 'bog'
      and attempt.status in ('paid', 'refunded')
      and attempt.signature_verified is true
  )
on conflict do nothing;

create or replace function public.mark_bog_order_placed_from_payment_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  verified_attempt public.payment_attempts%rowtype;
begin
  if new.event_type <> 'payment_confirmed'
    or new.event_key is null
  then
    return new;
  end if;

  select attempt.*
  into verified_attempt
  from public.payment_attempts attempt
  join public.orders customer_order
    on customer_order.id = attempt.order_id
  where attempt.order_id = new.order_id
    and attempt.provider = 'bog'
    and attempt.status = 'paid'
    and attempt.signature_verified is true
    and nullif(trim(attempt.provider_payment_id), '') is not null
    and new.event_key = 'payment:bog:' || attempt.provider_payment_id || ':paid'
    and customer_order.test_mode is false
    and customer_order.payment_status = 'paid'
  order by attempt.updated_at desc
  limit 1;

  if verified_attempt.id is null then
    return new;
  end if;

  update public.orders
  set placed_at = coalesce(placed_at, new.created_at),
      updated_at = case when placed_at is null then now() else updated_at end
  where id = new.order_id;

  insert into public.order_events (
    order_id,
    event_key,
    event_type,
    customer_label_en,
    customer_label_ka,
    details,
    is_customer_visible,
    created_at
  ) values (
    new.order_id,
    'order:' || new.order_id::text || ':received',
    'order_received',
    'Order received',
    'შეკვეთა მიღებულია',
    jsonb_build_object(
      'payment_provider', 'bog',
      'payment_mode', 'full',
      'payment_status', 'paid',
      'lifecycle', 'placed'
    ),
    true,
    new.created_at + interval '1 microsecond'
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.mark_bog_order_placed_from_payment_event_v1()
  from public, anon, authenticated;

drop trigger if exists mark_bog_order_placed_from_payment_event
  on public.order_events;
create trigger mark_bog_order_placed_from_payment_event
after insert on public.order_events
for each row
when (new.event_type = 'payment_confirmed')
execute function public.mark_bog_order_placed_from_payment_event_v1();

-- Preserve a provider contradiction even when there is no newer checkout yet.
-- An exact-key replay can legitimately observe the last committed failed state
-- while the signed callback is still finishing. The immutable first-seen time
-- lets the subsequent new-key transaction close that mirror race without
-- blocking normal paid reorders forever.
create or replace function public.mark_bog_late_paid_transition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.provider = 'bog'
    and old.status in ('failed', 'cancelled', 'review_required')
    and new.status = 'paid'
    and new.signature_verified is true
    and new.late_paid_at is null
  then
    new.late_paid_at := now();
    new.response_payload := new.response_payload || jsonb_build_object(
      'late_paid_transition', jsonb_build_object(
        'from_status', old.status,
        'detected_at', new.late_paid_at
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.mark_bog_late_paid_transition_v1()
  from public, anon, authenticated;

drop trigger if exists mark_bog_late_paid_transition
  on public.payment_attempts;
create trigger mark_bog_late_paid_transition
before update of status, signature_verified on public.payment_attempts
for each row
execute function public.mark_bog_late_paid_transition_v1();

-- A signed completion may arrive after an older checkout was failed,
-- cancelled, pending, or already placed in review. If the customer has since
-- created any newer catalog BOG order, the older completion is financially
-- real but operationally ambiguous. Hold that old order for review at
-- transaction end, after the callback has durably stored the verified receipt,
-- instead of allowing two orders into production.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'operator_order_paid',
    'customer_order_status',
    'operator_refund_review',
    'operator_payment_review'
  )) not valid;
alter table public.notifications
  validate constraint notifications_notification_type_check;

create or replace function public.hold_late_paid_duplicate_checkout_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original_order public.orders%rowtype;
  current_attempt public.payment_attempts%rowtype;
  customer_id_value uuid;
  order_is_test boolean;
  newer_attempt_id uuid;
  newer_order_id uuid;
  newer_attempt_status text;
  newer_payment_status text;
  hold_reason constant text := 'LATE_PAID_AFTER_NEWER_BOG_CHECKOUT';
begin
  if new.provider <> 'bog'
    or new.status <> 'paid'
    or old.status is not distinct from 'paid'
    or new.signature_verified is not true
  then
    return null;
  end if;

  select customer_order.customer_id, customer_order.test_mode
  into customer_id_value, order_is_test
  from public.orders customer_order
  where customer_order.id = new.order_id;

  if customer_id_value is null or order_is_test is true then
    return null;
  end if;

  -- Serialize the final duplicate decision with checkout creation. This is the
  -- same customer lock used by begin_bog_checkout_v3.
  perform pg_advisory_xact_lock(
    hashtextextended('bog-customer:' || customer_id_value::text, 0)
  );

  select *
  into current_attempt
  from public.payment_attempts attempt
  where attempt.id = new.id
  for update;

  select *
  into original_order
  from public.orders customer_order
  where customer_order.id = new.order_id
  for update;

  if current_attempt.id is null
    or original_order.id is null
    or current_attempt.provider <> 'bog'
    or current_attempt.signature_verified is not true
    or current_attempt.status not in ('paid', 'review_required')
    or original_order.payment_status = 'refunded'
  then
    return null;
  end if;

  select
    newer_attempt.id,
    newer_order.id,
    newer_attempt.status,
    newer_order.payment_status
  into
    newer_attempt_id,
    newer_order_id,
    newer_attempt_status,
    newer_payment_status
  from public.payment_attempts newer_attempt
  join public.orders newer_order
    on newer_order.id = newer_attempt.order_id
  where newer_attempt.provider = 'bog'
    and newer_attempt.id <> new.id
    and newer_order.customer_id = customer_id_value
    and newer_order.test_mode is false
    -- Equal timestamps are treated as newer/ambiguous and fail closed. Two
    -- separate checkout transactions can share a database clock tick, while
    -- their UUID ordering does not encode creation order.
    and newer_attempt.created_at >= new.created_at
  order by newer_attempt.created_at, newer_attempt.id
  limit 1;

  if newer_attempt_id is null then
    return null;
  end if;

  update public.payment_attempts
  set status = 'review_required',
      response_payload = response_payload || jsonb_build_object(
        'duplicate_payment_hold', hold_reason,
        'newer_attempt_id', newer_attempt_id,
        'newer_order_id', newer_order_id
      ),
      updated_at = now()
  where id = new.id
    and status in ('paid', 'review_required')
    and signature_verified is true;

  update public.orders
  set payment_status = 'review_required',
      status = case when status = 'paid' then 'pending' else status end,
      placed_at = null,
      updated_at = now()
  where id = new.order_id
    and payment_status <> 'refunded';

  update public.order_events event
  set is_customer_visible = false,
      details = event.details || jsonb_build_object(
        'review_required', true,
        'review_reason', hold_reason
      )
  where event.order_id = new.order_id
    and (
      event.event_key = (
        'payment:bog:' || coalesce(new.provider_payment_id, '') || ':paid'
      )
      or event.event_key = 'order:' || new.order_id::text || ':received'
    )
    and event.event_type in ('payment_confirmed', 'order_received');

  insert into public.order_events (
    order_id,
    event_key,
    event_type,
    customer_label_en,
    customer_label_ka,
    details,
    is_customer_visible
  ) values (
    new.order_id,
    'payment:bog:' || coalesce(new.provider_payment_id, new.id::text)
      || ':duplicate_hold',
    'payment_review_required',
    'Payment is under review',
    'გადახდა მოწმებაზეა',
    jsonb_build_object(
      'provider', 'bog',
      'review_reason', hold_reason
    ),
    true
  )
  on conflict do nothing;

  update public.payment_provider_events provider_event
  set processing_status = 'manual_review',
      failure_reason = hold_reason,
      safe_payload = provider_event.safe_payload || jsonb_build_object(
        'duplicate_payment_hold', true,
        'newer_attempt_id', newer_attempt_id,
        'newer_order_id', newer_order_id
      ),
      processed_at = now()
  where provider_event.payment_attempt_id = new.id
    and provider_event.provider = 'bog'
    and provider_event.provider_payment_id = new.provider_payment_id
    and provider_event.provider_status = 'completed'
    and provider_event.processing_status in ('applied', 'manual_review');

  delete from public.notifications notification
  where notification.order_id = new.order_id
    and notification.notification_type = 'operator_order_paid';

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    null,
    'bog_late_paid_duplicate_checkout_held',
    'order',
    new.order_id::text,
    jsonb_build_object(
      'attempt_id', new.id,
      'previous_status', old.status,
      'newer_attempt_id', newer_attempt_id,
      'newer_order_id', newer_order_id,
      'newer_attempt_status', newer_attempt_status,
      'newer_payment_status', newer_payment_status,
      'review_reason', hold_reason
    )
  );

  insert into public.notifications (
    recipient_profile_id,
    order_id,
    notification_type,
    title_ka,
    title_en,
    body_ka,
    body_en,
    href,
    metadata,
    dedupe_key
  )
  select
    profile.id,
    new.order_id,
    'operator_payment_review',
    'გვიანი გადახდა შემოწმებას საჭიროებს',
    'Late payment needs review',
    'ძველ შეკვეთაზე BOG-ის გადახდა გვიან დადასტურდა, მაგრამ მომხმარებელს უკვე ახალი გადახდის სესია აქვს.',
    'BOG confirmed an older order late, but the customer already has a newer payment session.',
    '/admin/orders',
    jsonb_build_object(
      'order_id', new.order_id,
      'attempt_id', new.id,
      'newer_order_id', newer_order_id,
      'review_reason', hold_reason
    ),
    'operator:late_duplicate_payment:' || new.id::text || ':' || profile.id::text
  from public.profiles profile
  where profile.role in ('owner', 'admin', 'production_operator', 'support')
    and profile.is_active is true
  on conflict (dedupe_key) do nothing;

  return null;
end;
$$;

revoke all on function public.hold_late_paid_duplicate_checkout_v1()
  from public, anon, authenticated;

drop trigger if exists hold_late_paid_duplicate_checkout
  on public.payment_attempts;
create constraint trigger hold_late_paid_duplicate_checkout
after update on public.payment_attempts
deferrable initially deferred
for each row
when (
  new.provider = 'bog'
  and old.status is distinct from 'paid'
  and new.status = 'paid'
  and new.signature_verified is true
)
execute function public.hold_late_paid_duplicate_checkout_v1();

create or replace function public.begin_bog_checkout_v3(
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
set search_path = public, extensions, pg_temp
as $$
declare
  checkout_result jsonb;
  existing_attempt public.payment_attempts%rowtype;
  existing_order public.orders%rowtype;
  authoritative_key text;
  result_order_id uuid;
  result_attempt_id uuid;
  is_reused boolean;
  exact_key_exists boolean;
  unit_count integer;
  checkout_fingerprint text := encode(digest(jsonb_build_object(
    'items', requested_items,
    'delivery_address', requested_delivery_address,
    'guest_email', coalesce(requested_guest_email, ''),
    'guest_phone', coalesce(requested_guest_phone, ''),
    'notes', coalesce(requested_notes, '')
  )::text, 'sha256'), 'hex');
begin
  if requested_customer_id is null
    or not exists (
      select 1
      from public.customers customer
      where customer.id = requested_customer_id
    )
  then
    raise exception 'BOG_CUSTOMER_NOT_FOUND';
  end if;
  if requested_idempotency_key is null then
    raise exception 'BOG_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if requested_promised_at is null then
    raise exception 'BOG_PROMISED_AT_REQUIRED';
  end if;
  if requested_expected_total is null
    or requested_expected_total <= 0
    or round(requested_expected_total, 2) <> requested_expected_total
  then
    raise exception 'HOOMA_INVALID_EXPECTED_TOTAL';
  end if;

  -- An exact-key replay must not take the customer advisory lock. A callback
  -- can already hold the original order/attempt rows and acquire that customer
  -- lock from a deferred duplicate-payment trigger; taking the locks in the
  -- opposite order here would deadlock. The key lock serializes the original
  -- creator/replay, while plain MVCC reads below never wait for row updates.
  perform pg_advisory_xact_lock(
    hashtextextended(requested_idempotency_key::text, 0)
  );

  select attempt.*
  into existing_attempt
  from public.payment_attempts attempt
  where attempt.idempotency_key = requested_idempotency_key::text;

  if existing_attempt.id is not null then
    select customer_order.*
    into existing_order
    from public.orders customer_order
    where customer_order.id = existing_attempt.order_id;

    if existing_attempt.provider <> 'bog'
      or existing_order.id is null
      or existing_order.customer_id is distinct from requested_customer_id
      or existing_order.test_mode is true
      or existing_attempt.request_payload->>'checkout_fingerprint'
        is distinct from checkout_fingerprint
    then
      raise exception 'BOG_IDEMPOTENCY_CONFLICT';
    end if;

    select coalesce(sum(item.quantity), 0)::integer
    into unit_count
    from public.order_items item
    where item.order_id = existing_order.id;

    return jsonb_build_object(
      'order_id', existing_order.id,
      'tracking_code', existing_order.tracking_code,
      'attempt_id', existing_attempt.id,
      'amount', existing_order.total,
      'subtotal', existing_order.subtotal,
      'delivery_fee', existing_order.delivery_fee,
      'delivery_benefit_code', existing_order.delivery_benefit_code,
      'unit_count', unit_count,
      'welcome_units_reserved', coalesce((
        select reservation.units
        from public.delivery_benefit_reservations reservation
        where reservation.order_id = existing_order.id
      ), 0),
      'delivery_pricing_snapshot', existing_order.delivery_pricing_snapshot,
      'currency', existing_attempt.currency,
      'attempt_status', existing_attempt.status,
      'attempt_created_at', existing_attempt.created_at,
      'provider_payment_id', existing_attempt.provider_payment_id,
      'response_payload', existing_attempt.response_payload,
      'reused', true,
      'idempotency_key', existing_attempt.idempotency_key
    );
  end if;

  -- Distinct keys serialize here. Holding the key lock first is safe because
  -- no other path can wait on this new key while holding customer/order locks.
  perform pg_advisory_xact_lock(
    hashtextextended('bog-customer:' || requested_customer_id::text, 0)
  );

  -- Recheck after acquiring the customer lock. A conforming writer cannot
  -- make this true while we hold the key lock; fail closed if legacy or manual
  -- code violated that invariant, and let a clean retry use the replay branch.
  select exists (
    select 1
    from public.payment_attempts attempt
    where attempt.idempotency_key = requested_idempotency_key::text
  ) into exact_key_exists;

  if exact_key_exists then
    raise exception 'BOG_IDEMPOTENCY_RACE_RETRY';
  end if;

  -- A signed callback may have completed after an exact replay returned its
  -- formerly terminal state but before the browser retries with a fresh key.
  -- Reject only the same checkout fingerprint for a short, bounded window;
  -- ordinary paid orders and genuinely different carts remain reorderable.
  if exists (
    select 1
    from public.payment_attempts late_attempt
    join public.orders late_order
      on late_order.id = late_attempt.order_id
    where late_attempt.provider = 'bog'
      and late_attempt.status = 'paid'
      and late_attempt.signature_verified is true
      and late_attempt.late_paid_at >= now() - interval '30 minutes'
      and late_attempt.request_payload->>'checkout_fingerprint'
        = checkout_fingerprint
      and late_attempt.idempotency_key <> requested_idempotency_key::text
      and late_order.customer_id = requested_customer_id
      and late_order.test_mode is false
  ) then
    raise exception 'BOG_RECENT_LATE_PAYMENT';
  end if;

  if exists (
    select 1
    from public.payment_attempts attempt
    join public.orders customer_order
      on customer_order.id = attempt.order_id
    where attempt.provider = 'bog'
      and attempt.status in ('created', 'pending', 'review_required')
      and attempt.idempotency_key <> requested_idempotency_key::text
      and customer_order.customer_id = requested_customer_id
      and customer_order.test_mode is false
  ) then
    raise exception 'BOG_PAYMENT_IN_PROGRESS';
  end if;

  checkout_result := public.begin_bog_checkout_v2_internal(
    requested_customer_id,
    requested_guest_email,
    requested_guest_phone,
    requested_delivery_address,
    requested_notes,
    requested_promised_at,
    requested_idempotency_key,
    requested_expected_total,
    requested_items
  );

  result_order_id := (checkout_result->>'order_id')::uuid;
  result_attempt_id := (checkout_result->>'attempt_id')::uuid;
  is_reused := coalesce((checkout_result->>'reused')::boolean, false);

  select attempt.idempotency_key
  into authoritative_key
  from public.payment_attempts attempt
  join public.orders customer_order
    on customer_order.id = attempt.order_id
  where attempt.id = result_attempt_id
    and attempt.order_id = result_order_id
    and attempt.provider = 'bog'
    and customer_order.customer_id = requested_customer_id
    and customer_order.test_mode is false;

  if authoritative_key is null
    or authoritative_key <> requested_idempotency_key::text
  then
    raise exception 'BOG_IDEMPOTENCY_CONFLICT';
  end if;

  if not is_reused then
    update public.order_events event
    set event_key = 'checkout:' || result_order_id::text || ':started',
        event_type = 'checkout_started',
        customer_label_en = 'Checkout started',
        customer_label_ka = 'გადახდის სესია დაიწყო',
        details = event.details || jsonb_build_object(
          'lifecycle', 'checkout_intent',
          'payment_status', 'unpaid'
        ),
        is_customer_visible = false
    where event.order_id = result_order_id
      and event.event_key = 'order:' || result_order_id::text || ':received'
      and event.event_type = 'order_received';

    if not found then
      raise exception 'BOG_CHECKOUT_EVENT_NOT_FOUND';
    end if;
  end if;

  return checkout_result || jsonb_build_object(
    'idempotency_key', authoritative_key
  );
end;
$$;

-- Backward-compatible RPC name for old application instances during rollout.
-- It delegates to the guarded v3 entry point and therefore cannot bypass the
-- one-unresolved-checkout invariant.
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
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.begin_bog_checkout_v3(
    requested_customer_id,
    requested_guest_email,
    requested_guest_phone,
    requested_delivery_address,
    requested_notes,
    requested_promised_at,
    requested_idempotency_key,
    requested_expected_total,
    requested_items
  );
$$;

revoke all on function public.begin_bog_checkout_v3(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_bog_checkout_v3(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) to service_role;

revoke all on function public.begin_bog_checkout_v2(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_bog_checkout_v2(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) to service_role;

-- Only the v2/v3 guarded wrappers remain callable through PostgREST. Their
-- legacy implementations are owner-only composition details.
revoke all on function public.begin_bog_checkout_v1(
  uuid, text, text, jsonb, text, timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.begin_bog_checkout_v2_internal(
  uuid, text, text, jsonb, text, timestamptz, uuid, numeric, jsonb
) from public, anon, authenticated, service_role;

commit;
