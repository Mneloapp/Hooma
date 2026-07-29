-- BOG hosted checkout, automatic full capture only.
--
-- Security boundaries:
--   * browser roles cannot execute payment mutation functions;
--   * the BOG callback is signature-verified and re-fetched server-to-server;
--   * only an exact GEL/full-amount/direct-debit receipt can mark an order paid;
--   * payment confirmation never creates print jobs (operator approval remains required);
--   * callback storage is sanitized and excludes buyer/card data.

alter table public.orders
  drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'failed', 'review_required', 'refunded'));

alter table public.payment_attempts
  drop constraint if exists payment_attempts_status_check;
alter table public.payment_attempts
  add constraint payment_attempts_status_check
  check (status in (
    'created',
    'pending',
    'authorized',
    'paid',
    'failed',
    'cancelled',
    'review_required',
    'refunded'
  ));

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  provider text not null check (provider in ('bog')),
  provider_payment_id text not null,
  external_order_id text,
  provider_status text,
  payload_sha256 text not null,
  receipt_state_sha256 text not null,
  provider_event_at timestamptz,
  signature_verified boolean not null default false,
  receipt_verified boolean not null default false,
  processing_status text not null
    check (processing_status in ('applied', 'ignored', 'manual_review')),
  failure_reason text,
  safe_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  unique(provider, payload_sha256, receipt_state_sha256)
);

create index if not exists idx_payment_provider_events_attempt
  on public.payment_provider_events(payment_attempt_id, received_at desc);
create index if not exists idx_payment_provider_events_provider_payment
  on public.payment_provider_events(provider, provider_payment_id, received_at desc);
create index if not exists idx_payment_attempts_bog_created
  on public.payment_attempts(created_at desc)
  where provider = 'bog';

alter table public.payment_provider_events enable row level security;

drop policy if exists "admin staff read payment provider events"
  on public.payment_provider_events;
create policy "admin staff read payment provider events"
  on public.payment_provider_events
  for select
  using (public.is_admin());

revoke all on public.payment_provider_events from public, anon, authenticated;
grant select on public.payment_provider_events to authenticated;
grant select, insert, update on public.payment_provider_events to service_role;

create or replace function public.begin_bog_checkout_v1(
  requested_customer_id uuid,
  requested_guest_email text,
  requested_guest_phone text,
  requested_delivery_address jsonb,
  requested_notes text,
  requested_promised_at timestamptz,
  requested_idempotency_key uuid,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  existing_attempt public.payment_attempts%rowtype;
  existing_order public.orders%rowtype;
  created_order public.orders%rowtype;
  created_attempt public.payment_attempts%rowtype;
  checkout_date date := (now() at time zone 'Asia/Tbilisi')::date;
  requested_item_count integer;
  requested_unit_count integer;
  resolved_item_count integer;
  inserted_item_count integer;
  subtotal_value numeric(12,2);
  resolved_items jsonb;
  checkout_fingerprint text := encode(digest(jsonb_build_object(
    'items', requested_items,
    'delivery_address', requested_delivery_address,
    'guest_email', coalesce(requested_guest_email, ''),
    'guest_phone', coalesce(requested_guest_phone, ''),
    'notes', coalesce(requested_notes, '')
  )::text, 'sha256'), 'hex');
begin
  if requested_customer_id is null
    or not exists (select 1 from public.customers where id = requested_customer_id)
  then
    raise exception 'BOG_CUSTOMER_NOT_FOUND';
  end if;
  if requested_idempotency_key is null then
    raise exception 'BOG_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if requested_promised_at is null then
    raise exception 'BOG_PROMISED_AT_REQUIRED';
  end if;

  -- Serialize one customer's checkout starts and identical submissions before
  -- checking idempotency/rate limits.
  perform pg_advisory_xact_lock(hashtextextended('bog-customer:' || requested_customer_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(requested_idempotency_key::text, 0));

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
      or existing_attempt.request_payload->>'checkout_fingerprint' is distinct from checkout_fingerprint
    then
      raise exception 'BOG_IDEMPOTENCY_CONFLICT';
    end if;

    return jsonb_build_object(
      'order_id', existing_order.id,
      'tracking_code', existing_order.tracking_code,
      'attempt_id', existing_attempt.id,
      'amount', existing_attempt.amount,
      'currency', existing_attempt.currency,
      'attempt_status', existing_attempt.status,
      'attempt_created_at', existing_attempt.created_at,
      'provider_payment_id', existing_attempt.provider_payment_id,
      'response_payload', existing_attempt.response_payload,
      'reused', true
    );
  end if;

  if (
    select count(*)
    from public.payment_attempts recent_attempt
    join public.orders recent_order on recent_order.id = recent_attempt.order_id
    where recent_attempt.provider = 'bog'
      and recent_order.customer_id = requested_customer_id
      and recent_attempt.created_at >= now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'BOG_CHECKOUT_RATE_LIMITED';
  end if;

  if jsonb_typeof(requested_items) <> 'array'
    or jsonb_array_length(requested_items) < 1
    or jsonb_array_length(requested_items) > 100
  then
    raise exception 'BOG_INVALID_ITEMS';
  end if;
  if jsonb_typeof(requested_delivery_address) <> 'object'
    or nullif(trim(requested_delivery_address->>'full_name'), '') is null
    or nullif(trim(requested_delivery_address->>'phone'), '') is null
    or nullif(trim(requested_delivery_address->>'city'), '') is null
    or nullif(trim(requested_delivery_address->>'address_line_1'), '') is null
  then
    raise exception 'BOG_INVALID_DELIVERY_ADDRESS';
  end if;
  if length(coalesce(requested_guest_email, '')) > 320
    or length(coalesce(requested_guest_phone, '')) > 64
    or length(coalesce(requested_notes, '')) > 4000
  then
    raise exception 'BOG_ORDER_FIELD_TOO_LONG';
  end if;

  with requested as (
    select *
    from jsonb_to_recordset(requested_items) as item(
      product_id uuid,
      variant_id uuid,
      material text,
      color text,
      quantity integer
    )
  )
  select count(*), coalesce(sum(quantity), 0)
  into requested_item_count, requested_unit_count
  from requested;

  if requested_item_count <> jsonb_array_length(requested_items)
    or requested_unit_count < 1
    or requested_unit_count > 100
  then
    raise exception 'BOG_INVALID_ITEM_QUANTITY';
  end if;

  if exists (
    with requested as (
      select *
      from jsonb_to_recordset(requested_items) as item(
        product_id uuid,
        variant_id uuid,
        material text,
        color text,
        quantity integer
      )
    )
    select 1
    from requested item
    left join public.product_variants variant
      on variant.id = item.variant_id
     and variant.product_id = item.product_id
     and variant.is_active is true
    left join public.products product
      on product.id = item.product_id
     and product.status = 'active'
     and product.production_status = 'approved'
     and product.catalog_audit_applied_at is not null
    where item.product_id is null
      or item.variant_id is null
      or item.quantity is null
      or item.quantity < 1
      or item.quantity > 20
      or variant.id is null
      or product.id is null
      or not public.is_storefront_product_visible_v1(item.product_id)
      or coalesce(nullif(trim(item.material), ''), 'სტანდარტული')
        <> coalesce(nullif(trim(variant.material), ''), 'სტანდარტული')
      or (
        coalesce(array_length(variant.available_colors, 1), 0) > 0
        and not (coalesce(nullif(trim(item.color), ''), 'სტანდარტული') = any(variant.available_colors))
      )
      or (
        coalesce(array_length(variant.available_colors, 1), 0) = 0
        and coalesce(nullif(trim(item.color), ''), 'სტანდარტული') <> 'სტანდარტული'
      )
  ) then
    raise exception 'BOG_PRODUCT_NOT_PURCHASABLE';
  end if;

  -- Resolve every authoritative product/variant/price snapshot once, in one
  -- statement snapshot. The order total, payment amount, and order-item prices
  -- below all consume this immutable JSON value, so a concurrent catalog/deal
  -- edit cannot split one checkout across two price snapshots.
  with requested as materialized (
    select
      item.product_id,
      item.variant_id,
      item.material,
      item.color,
      item.quantity,
      entry.item_ordinality
    from jsonb_array_elements(requested_items) with ordinality
      as entry(item_value, item_ordinality)
    cross join lateral jsonb_to_record(entry.item_value) as item(
      product_id uuid,
      variant_id uuid,
      material text,
      color text,
      quantity integer
    )
  ),
  authoritative as materialized (
    select
      item.item_ordinality,
      item.product_id,
      item.variant_id,
      product.hooma_name as product_name,
      variant.sku,
      coalesce(nullif(variant.size_label, ''), 'Standard') as size_label,
      coalesce(nullif(trim(item.material), ''), 'სტანდარტული') as material,
      coalesce(nullif(trim(item.color), ''), 'სტანდარტული') as color,
      item.quantity,
      public.resolve_catalog_price(
        item.product_id,
        item.variant_id,
        checkout_date
      )::numeric(12,2) as unit_price
    from requested item
    join public.products product
      on product.id = item.product_id
     and product.status = 'active'
     and product.production_status = 'approved'
     and product.catalog_audit_applied_at is not null
    join public.product_variants variant
      on variant.id = item.variant_id
     and variant.product_id = item.product_id
     and variant.is_active is true
    where public.is_storefront_product_visible_v1(item.product_id)
      and coalesce(nullif(trim(item.material), ''), 'სტანდარტული')
        = coalesce(nullif(trim(variant.material), ''), 'სტანდარტული')
      and (
        (
          coalesce(cardinality(variant.available_colors), 0) > 0
          and coalesce(
            coalesce(nullif(trim(item.color), ''), 'სტანდარტული')
              = any(variant.available_colors),
            false
          )
        )
        or (
          coalesce(cardinality(variant.available_colors), 0) = 0
          and coalesce(nullif(trim(item.color), ''), 'სტანდარტული') = 'სტანდარტული'
        )
      )
  )
  select
    count(*),
    round(sum(unit_price * quantity), 2),
    jsonb_agg(
      jsonb_build_object(
        'product_id', product_id,
        'variant_id', variant_id,
        'product_name', product_name,
        'sku', sku,
        'size_label', size_label,
        'material', material,
        'color', color,
        'quantity', quantity,
        'unit_price', unit_price,
        'total_price', round(unit_price * quantity, 2)
      )
      order by item_ordinality
    )
  into resolved_item_count, subtotal_value, resolved_items
  from authoritative;

  if resolved_item_count <> requested_item_count
    or resolved_items is null
  then
    raise exception 'BOG_PRODUCT_CHANGED_DURING_CHECKOUT';
  end if;
  if subtotal_value is null or subtotal_value <= 0 then
    raise exception 'BOG_INVALID_TOTAL';
  end if;

  insert into public.orders (
    customer_id,
    guest_email,
    guest_phone,
    status,
    payment_status,
    subtotal,
    delivery_fee,
    total,
    delivery_address,
    notes,
    fulfillment_status,
    promised_at,
    test_mode
  ) values (
    requested_customer_id,
    nullif(trim(requested_guest_email), ''),
    nullif(trim(requested_guest_phone), ''),
    'pending',
    'unpaid',
    subtotal_value,
    0,
    subtotal_value,
    requested_delivery_address,
    nullif(trim(requested_notes), ''),
    'order_received',
    requested_promised_at,
    false
  )
  returning * into created_order;

  insert into public.order_items (
    order_id,
    product_id,
    variant_id,
    inventory_id,
    product_name,
    sku,
    size_label,
    material,
    color,
    quantity,
    unit_price,
    total_price
  )
  select
    created_order.id,
    item.product_id,
    item.variant_id,
    null,
    item.product_name,
    item.sku,
    item.size_label,
    item.material,
    item.color,
    item.quantity,
    item.unit_price,
    item.total_price
  from jsonb_to_recordset(resolved_items) as item(
    product_id uuid,
    variant_id uuid,
    product_name text,
    sku text,
    size_label text,
    material text,
    color text,
    quantity integer,
    unit_price numeric,
    total_price numeric
  );

  get diagnostics inserted_item_count = row_count;
  if inserted_item_count <> requested_item_count then
    raise exception 'BOG_ITEM_INSERT_MISMATCH';
  end if;

  insert into public.payment_attempts (
    order_id,
    provider,
    idempotency_key,
    amount,
    currency,
    status,
    request_payload,
    response_payload,
    signature_verified
  ) values (
    created_order.id,
    'bog',
    requested_idempotency_key::text,
    subtotal_value,
    'GEL',
    'created',
    jsonb_build_object(
      'flow', 'bog_full_payment_v1',
      'capture', 'automatic',
      'checkout_fingerprint', checkout_fingerprint,
      'item_count', requested_item_count,
      'unit_count', requested_unit_count
    ),
    '{}'::jsonb,
    false
  )
  returning * into created_attempt;

  insert into public.order_events (
    order_id,
    event_key,
    event_type,
    customer_label_en,
    customer_label_ka,
    details,
    is_customer_visible
  ) values (
    created_order.id,
    'order:' || created_order.id::text || ':received',
    'order_received',
    'Order received',
    'შეკვეთა მიღებულია',
    jsonb_build_object(
      'payment_provider', 'bog',
      'payment_mode', 'full',
      'payment_status', 'unpaid'
    ),
    true
  )
  on conflict do nothing;

  return jsonb_build_object(
    'order_id', created_order.id,
    'tracking_code', created_order.tracking_code,
    'attempt_id', created_attempt.id,
    'amount', created_attempt.amount,
    'currency', created_attempt.currency,
    'attempt_status', created_attempt.status,
    'attempt_created_at', created_attempt.created_at,
    'provider_payment_id', null,
    'response_payload', '{}'::jsonb,
    'reused', false
  );
end;
$$;

revoke all on function public.begin_bog_checkout_v1(
  uuid, text, text, jsonb, text, timestamptz, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_bog_checkout_v1(
  uuid, text, text, jsonb, text, timestamptz, uuid, jsonb
) to service_role;

create or replace function public.bind_bog_payment_attempt_v1(
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
  attempt_record public.payment_attempts%rowtype;
begin
  if nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or jsonb_typeof(requested_response) <> 'object'
  then
    raise exception 'BOG_INVALID_BIND_RESULT';
  end if;

  select *
  into attempt_record
  from public.payment_attempts
  where id = requested_attempt_id
  for update;

  if attempt_record.id is null or attempt_record.provider <> 'bog' then
    raise exception 'BOG_ATTEMPT_NOT_FOUND';
  end if;
  if attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id <> requested_provider_payment_id
  then
    raise exception 'BOG_PROVIDER_ID_CONFLICT';
  end if;

  update public.payment_attempts
  set provider_payment_id = requested_provider_payment_id,
      status = case
        when status = 'created' then 'pending'
        else status
      end,
      response_payload = response_payload || requested_response,
      updated_at = now()
  where id = requested_attempt_id
  returning * into attempt_record;

  return jsonb_build_object(
    'attempt_id', attempt_record.id,
    'order_id', attempt_record.order_id,
    'provider_payment_id', attempt_record.provider_payment_id,
    'status', attempt_record.status,
    'redirect_url', attempt_record.response_payload->>'redirect_url'
  );
end;
$$;

revoke all on function public.bind_bog_payment_attempt_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bind_bog_payment_attempt_v1(uuid, text, jsonb)
  to service_role;

create or replace function public.apply_bog_payment_result_v1(
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
  attempt_order_id uuid;
  attempt_record public.payment_attempts%rowtype;
  order_record public.orders%rowtype;
  existing_event public.payment_provider_events%rowtype;
  created_event_id uuid;
  failure_code text;
  result_state text := 'applied';
  computed_receipt_state_sha256 text;
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
    raise exception 'BOG_INVALID_RESULT';
  end if;

  -- A callback body can be retried unchanged while the freshly fetched BOG
  -- receipt advances. Dedupe therefore covers both the signed raw event and
  -- the normalized authoritative receipt state.
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
  from public.payment_provider_events
    where provider = 'bog'
    and payload_sha256 = requested_payload_sha256
    and receipt_state_sha256 = computed_receipt_state_sha256;

  if existing_event.id is not null then
    return jsonb_build_object(
      'event_id', existing_event.id,
      'processing_status', existing_event.processing_status,
      'failure_reason', existing_event.failure_reason,
      'duplicate', true
    );
  end if;

  select order_id
  into attempt_order_id
  from public.payment_attempts
  where id = requested_attempt_id;

  -- Keep the same order → payment-attempt lock order as the production gate,
  -- so a refund/review callback cannot race a stale paid read into production.
  select *
  into order_record
  from public.orders
  where id = attempt_order_id
  for update;

  select *
  into attempt_record
  from public.payment_attempts
  where id = requested_attempt_id
  for update;

  if attempt_record.id is null or attempt_record.provider <> 'bog' then
    failure_code := 'ATTEMPT_NOT_FOUND';
  elsif order_record.id is null
    or order_record.id is distinct from attempt_record.order_id
    or order_record.test_mode is true
  then
    failure_code := 'LIVE_ORDER_NOT_FOUND';
  elsif requested_external_order_id <> attempt_record.id::text then
    failure_code := 'EXTERNAL_ORDER_MISMATCH';
  elsif attempt_record.provider_payment_id is not null
    and attempt_record.provider_payment_id <> requested_provider_payment_id
  then
    failure_code := 'PROVIDER_ORDER_MISMATCH';
  elsif requested_capture <> 'automatic' then
    failure_code := 'NON_AUTOMATIC_CAPTURE';
  elsif upper(coalesce(requested_currency, '')) <> 'GEL' then
    failure_code := 'CURRENCY_MISMATCH';
  elsif requested_request_amount is null
    or round(requested_request_amount, 2) <> round(attempt_record.amount, 2)
    or round(requested_request_amount, 2) <> round(order_record.total, 2)
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
    and attempt_record.status in ('failed', 'paid', 'review_required', 'refunded')
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
  end if;

  insert into public.payment_provider_events (
    payment_attempt_id,
    provider,
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
    'bog',
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
  on conflict (provider, payload_sha256, receipt_state_sha256) do nothing
  returning id into created_event_id;

  if created_event_id is null then
    select *
    into existing_event
    from public.payment_provider_events
    where provider = 'bog'
      and payload_sha256 = requested_payload_sha256
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
    and order_record.id is not null
  then
    update public.payment_attempts
    set provider_payment_id = coalesce(provider_payment_id, requested_provider_payment_id),
        status = case when status = 'refunded' then status else 'review_required' end,
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.orders
    set payment_status = case
          when payment_status = 'refunded' then payment_status
          else 'review_required'
        end,
        updated_at = now()
    where id = order_record.id;
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
    update public.payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'pending',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;
  elsif requested_provider_status = 'completed' then
    update public.payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'paid',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.orders
    set payment_status = 'paid',
        status = case when status in ('pending', 'confirmed') then 'paid' else status end,
        updated_at = now()
    where id = order_record.id
      and payment_status <> 'refunded';

    insert into public.order_events (
      order_id,
      event_key,
      event_type,
      customer_label_en,
      customer_label_ka,
      details,
      is_customer_visible
    ) values (
      order_record.id,
      'payment:bog:' || requested_provider_payment_id || ':paid',
      'payment_confirmed',
      'Payment confirmed',
      'გადახდა დადასტურებულია',
      jsonb_build_object(
        'provider', 'bog',
        'amount', attempt_record.amount,
        'currency', attempt_record.currency,
        'payment_method', requested_payment_method
      ),
      true
    )
    on conflict do nothing;
  elsif requested_provider_status = 'rejected' then
    update public.payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'failed',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.orders
    set payment_status = 'failed',
        updated_at = now()
    where id = order_record.id
      and payment_status in ('unpaid', 'failed');
  elsif requested_provider_status = 'refunded' then
    update public.payment_attempts
    set provider_payment_id = requested_provider_payment_id,
        status = 'refunded',
        response_payload = response_payload || requested_safe_payload,
        signature_verified = true,
        updated_at = now()
    where id = attempt_record.id;

    update public.orders
    set payment_status = 'refunded',
        updated_at = now()
    where id = order_record.id;

    insert into public.order_events (
      order_id,
      event_key,
      event_type,
      customer_label_en,
      customer_label_ka,
      details,
      is_customer_visible
    ) values (
      order_record.id,
      'payment:bog:' || requested_provider_payment_id || ':refunded',
      'payment_refunded',
      'Payment refunded',
      'თანხა დაბრუნებულია',
      jsonb_build_object(
        'provider', 'bog',
        'amount', attempt_record.amount,
        'currency', attempt_record.currency
      ),
      true
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'event_id', created_event_id,
    'processing_status', 'applied',
    'provider_status', requested_provider_status,
    'order_id', order_record.id,
    'attempt_id', attempt_record.id,
    'duplicate', false
  );
end;
$$;

revoke all on function public.apply_bog_payment_result_v1(
  uuid, text, text, text, timestamptz, text, text, text,
  numeric, numeric, numeric, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_bog_payment_result_v1(
  uuid, text, text, text, timestamptz, text, text, text,
  numeric, numeric, numeric, text, text, text, boolean, jsonb
) to service_role;

-- Operator recovery for the documented missed-callback case. This path may
-- fetch and record a fresh BOG receipt, but it deliberately cannot mark an
-- order paid: only the signature-verified callback function above can do so.
-- A completed/refunded/anomalous receipt is put on review hold until BOG
-- redelivers the signed callback or support resolves it with the bank.
create or replace function public.record_bog_reconciliation_review_v1(
  actor_profile_id uuid,
  operation_key uuid,
  requested_attempt_id uuid,
  requested_provider_payment_id text,
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
  actor_role text;
  attempt_order_id uuid;
  attempt_record public.payment_attempts%rowtype;
  order_record public.orders%rowtype;
  existing_event public.payment_provider_events%rowtype;
  created_event_id uuid;
  event_payload_sha256 text;
  computed_receipt_state_sha256 text;
  failure_code text;
  requires_review boolean := false;
begin
  select role
  into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active is true
    and role in ('owner', 'admin', 'production_operator', 'support');

  if actor_role is null then
    raise exception 'BOG_RECONCILIATION_FORBIDDEN';
  end if;
  if operation_key is null
    or requested_attempt_id is null
    or nullif(trim(requested_provider_payment_id), '') is null
    or length(requested_provider_payment_id) > 128
    or nullif(trim(requested_provider_status), '') is null
    or requested_safe_payload is null
    or jsonb_typeof(requested_safe_payload) <> 'object'
    or requested_has_split is null
  then
    raise exception 'BOG_INVALID_RECONCILIATION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bog-reconciliation:' || operation_key::text, 0)
  );

  select order_id
  into attempt_order_id
  from public.payment_attempts
  where id = requested_attempt_id
    and provider = 'bog';

  if attempt_order_id is null then
    raise exception 'BOG_ATTEMPT_NOT_FOUND';
  end if;

  -- Match the production workflow's order-first lock order.
  select *
  into order_record
  from public.orders
  where id = attempt_order_id
  for update;

  select *
  into attempt_record
  from public.payment_attempts
  where id = requested_attempt_id
  for update;

  if order_record.id is null or order_record.test_mode is true then
    raise exception 'BOG_LIVE_ORDER_NOT_FOUND';
  end if;
  if attempt_record.provider_payment_id is distinct from requested_provider_payment_id
    or requested_safe_payload->>'external_order_id' is distinct from attempt_record.id::text
    or requested_safe_payload->>'order_id' is distinct from requested_provider_payment_id
  then
    raise exception 'BOG_RECONCILIATION_ID_MISMATCH';
  end if;

  if attempt_record.status = 'refunded'
    or order_record.payment_status = 'refunded'
  then
    return jsonb_build_object(
      'attempt_id', attempt_record.id,
      'order_id', order_record.id,
      'provider_status', requested_provider_status,
      'already_settled', true,
      'requires_review', false
    );
  end if;

  if lower(trim(coalesce(requested_capture, ''))) <> 'automatic' then
    failure_code := 'NON_AUTOMATIC_CAPTURE';
  elsif upper(trim(coalesce(requested_currency, ''))) <> 'GEL' then
    failure_code := 'CURRENCY_MISMATCH';
  elsif requested_request_amount is null
    or round(requested_request_amount, 2) <> round(attempt_record.amount, 2)
    or round(requested_request_amount, 2) <> round(order_record.total, 2)
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

  requires_review := failure_code is not null
    or (
      requested_provider_status = 'completed'
      and not (
        attempt_record.status = 'paid'
        and order_record.payment_status = 'paid'
      )
    )
    or (
      (
        attempt_record.status = 'paid'
        or order_record.payment_status = 'paid'
      )
      and requested_provider_status <> 'completed'
    )
    or requested_provider_status in (
      'refund_requested',
      'refunded',
      'refunded_partially',
      'auth_requested',
      'blocked',
      'partial_completed'
    );
  failure_code := coalesce(
    failure_code,
    case
      when requires_review then 'SIGNED_CALLBACK_MISSING_' || upper(requested_provider_status)
      else 'ADMIN_RECEIPT_CHECK_' || upper(requested_provider_status)
    end
  );

  event_payload_sha256 := encode(
    digest(('admin-reconciliation:' || operation_key::text)::text, 'sha256'),
    'hex'
  );
  computed_receipt_state_sha256 := encode(
    digest(requested_safe_payload::text, 'sha256'),
    'hex'
  );

  -- Bind one operator idempotency key to exactly one reconciled receipt.
  select *
  into existing_event
  from public.payment_provider_events
  where provider = 'bog'
    and payload_sha256 = event_payload_sha256
  order by received_at
  limit 1;

  if existing_event.id is not null then
    if existing_event.receipt_state_sha256 <> computed_receipt_state_sha256 then
      raise exception 'BOG_RECONCILIATION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'attempt_id', attempt_record.id,
      'order_id', order_record.id,
      'provider_status', existing_event.provider_status,
      'processing_status', existing_event.processing_status,
      'failure_reason', existing_event.failure_reason,
      'duplicate', true,
      'requires_review', existing_event.processing_status = 'manual_review',
      'hold_active', (
        attempt_record.status = 'review_required'
        or order_record.payment_status = 'review_required'
      )
    );
  end if;

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
    attempt_record.id::text,
    requested_provider_status,
    event_payload_sha256,
    computed_receipt_state_sha256,
    false,
    true,
    case when requires_review then 'manual_review' else 'ignored' end,
    failure_code,
    requested_safe_payload,
    now()
  )
  on conflict (provider, payload_sha256, receipt_state_sha256) do nothing
  returning id into created_event_id;

  if created_event_id is null then
    select *
    into existing_event
    from public.payment_provider_events
    where provider = 'bog'
      and payload_sha256 = event_payload_sha256
      and receipt_state_sha256 = computed_receipt_state_sha256;
    return jsonb_build_object(
      'event_id', existing_event.id,
      'attempt_id', attempt_record.id,
      'order_id', order_record.id,
      'provider_status', existing_event.provider_status,
      'processing_status', existing_event.processing_status,
      'failure_reason', existing_event.failure_reason,
      'duplicate', true,
      'requires_review', existing_event.processing_status = 'manual_review',
      'hold_active', (
        attempt_record.status = 'review_required'
        or order_record.payment_status = 'review_required'
      )
    );
  end if;

  if requires_review then
    update public.payment_attempts
    set status = 'review_required',
        response_payload = response_payload || requested_safe_payload,
        updated_at = now()
    where id = attempt_record.id;

    update public.orders
    set payment_status = 'review_required',
        updated_at = now()
    where id = order_record.id;
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    actor_profile_id,
    'bog_payment_receipt_reconciled',
    'order',
    order_record.id::text,
    jsonb_build_object(
      'operation_key', operation_key,
      'attempt_id', attempt_record.id,
      'provider_payment_id', requested_provider_payment_id,
      'provider_status', requested_provider_status,
      'requires_review', requires_review,
      'failure_reason', failure_code
    )
  );

  return jsonb_build_object(
    'attempt_id', attempt_record.id,
    'order_id', order_record.id,
    'provider_status', requested_provider_status,
    'duplicate', false,
    'requires_review', requires_review,
    'hold_active', requires_review
  );
end;
$$;

revoke all on function public.record_bog_reconciliation_review_v1(
  uuid, uuid, uuid, text, text, text, text,
  numeric, numeric, numeric, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_bog_reconciliation_review_v1(
  uuid, uuid, uuid, text, text, text, text,
  numeric, numeric, numeric, text, text, text, boolean, jsonb
) to service_role;
