-- Make standard catalog delivery free from exactly GEL 100.
--
-- The original Hooma+ migration used a strict `>` comparison, which made
-- GEL 100.01 the first free-delivery subtotal. Keep the configured threshold
-- at the customer-facing GEL 100 value and replace the authoritative checkout
-- function with an inclusive comparison.

begin;

update public.commerce_delivery_settings
set policy_version = '2026-07-29-free-from-100',
    free_above_subtotal = 100.00,
    updated_at = now()
where singleton is true;

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
  elsif created_order.subtotal >= settings_record.free_above_subtotal then
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

commit;
