-- Customer-initiated cancellation and exact full BOG refunds for paid catalog
-- orders before production starts.
--
-- Trust boundaries:
--   * browser roles can read only a small, non-provider-facing status surface;
--   * all mutations are service-role RPCs which re-read ownership, order state,
--     payment provenance, amount and currency from the database;
--   * cancellation takes the order lock before the payment-attempt lock, which
--     serializes it with BOG callbacks and manual production confirmation;
--   * the outbound-refund response can never mark money refunded;
--   * only an exact, signed, full-refund BOG attempt transition finalizes the
--     ledger, and unexpected refunds after production create an operations hold.

begin;

create table if not exists public.order_cancellation_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique
    references public.orders(id) on delete restrict,
  customer_id uuid not null
    references public.customers(id) on delete restrict,
  payment_attempt_id uuid not null unique
    references public.payment_attempts(id) on delete restrict,
  requested_by uuid
    references public.profiles(id) on delete restrict,
  request_operation_key uuid not null unique,
  provider text not null default 'bog'
    check (provider = 'bog'),
  provider_payment_id text not null
    check (length(provider_payment_id) between 1 and 128),
  provider_refund_idempotency_key uuid not null unique
    default gen_random_uuid(),
  refund_amount numeric(12,2) not null
    check (refund_amount > 0),
  currency text not null default 'GEL'
    check (currency = 'GEL'),
  reason_code text not null
    check (reason_code in ('customer_requested', 'provider_refund_detected')),
  reason_note text
    check (reason_note is null or char_length(reason_note) <= 500),
  status text not null default 'processing'
    check (status in (
      'processing',
      'refund_submitted',
      'submission_failed',
      'review_required',
      'refunded'
    )),
  submission_attempts integer not null default 0
    check (submission_attempts >= 0),
  provider_status text
    check (provider_status is null or length(provider_status) <= 128),
  provider_http_status integer
    check (
      provider_http_status is null
      or provider_http_status between 100 and 599
    ),
  last_error_code text
    check (last_error_code is null or length(last_error_code) <= 160),
  safe_provider_response jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(safe_provider_response) = 'object'
      and octet_length(safe_provider_response::text) <= 8192
    ),
  requested_at timestamptz not null default now(),
  last_submission_at timestamptz,
  submitted_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_cancellation_refunds_customer_created
  on public.order_cancellation_refunds(customer_id, created_at desc);
create index if not exists idx_order_cancellation_refunds_status_updated
  on public.order_cancellation_refunds(status, updated_at desc);

drop trigger if exists set_order_cancellation_refunds_updated_at
  on public.order_cancellation_refunds;
create trigger set_order_cancellation_refunds_updated_at
before update on public.order_cancellation_refunds
for each row execute function public.set_updated_at();

alter table public.order_cancellation_refunds enable row level security;

drop policy if exists "customers read own cancellation refunds"
  on public.order_cancellation_refunds;
create policy "customers read own cancellation refunds"
  on public.order_cancellation_refunds
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers customer
      where customer.id = order_cancellation_refunds.customer_id
        and customer.profile_id = auth.uid()
    )
  );

drop policy if exists "order staff read cancellation refunds"
  on public.order_cancellation_refunds;
create policy "order staff read cancellation refunds"
  on public.order_cancellation_refunds
  for select
  to authenticated
  using (
    public.has_staff_role(array[
      'owner',
      'admin',
      'production_operator',
      'support'
    ])
  );

revoke all on table public.order_cancellation_refunds
  from public, anon, authenticated;
grant select (
  id,
  order_id,
  status,
  reason_code,
  refund_amount,
  currency,
  requested_at,
  submitted_at,
  refunded_at,
  updated_at
) on table public.order_cancellation_refunds to authenticated;
grant select, insert, update on table public.order_cancellation_refunds
  to service_role;

-- `operator_refund_review` is deliberately an administrative alert. Customers
-- receive cancellation/refund progress through their order and its safe ledger.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'operator_order_paid',
    'customer_order_status',
    'operator_refund_review'
  )) not valid;
alter table public.notifications
  validate constraint notifications_notification_type_check;

create or replace function public.claim_customer_bog_refund_v1(
  actor_profile_id uuid,
  operation_key uuid,
  requested_order_id uuid,
  requested_reason_code text,
  requested_reason_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_record public.customers%rowtype;
  customer_count integer;
  order_record public.orders%rowtype;
  attempt_record public.payment_attempts%rowtype;
  refund_record public.order_cancellation_refunds%rowtype;
  bog_attempt_count integer;
  reason_note_value text;
begin
  if actor_profile_id is null
    or operation_key is null
    or requested_order_id is null
    or requested_reason_code is distinct from 'customer_requested'
  then
    raise exception 'REFUND_INVALID_REQUEST';
  end if;

  reason_note_value := nullif(trim(coalesce(requested_reason_note, '')), '');
  if reason_note_value is not null and char_length(reason_note_value) > 500 then
    raise exception 'REFUND_INVALID_REQUEST';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_profile_id
      and profile.role = 'customer'
      and profile.is_active is true
  ) then
    raise exception 'REFUND_FORBIDDEN';
  end if;

  select count(*)::integer
  into customer_count
  from public.customers customer
  where customer.profile_id = actor_profile_id;

  if customer_count <> 1 then
    raise exception 'REFUND_FORBIDDEN';
  end if;

  select *
  into customer_record
  from public.customers customer
  where customer.profile_id = actor_profile_id;

  -- Order first: production confirmation and BOG reconciliation use the same
  -- leading lock, so exactly one of production-start or cancellation can win.
  -- Ownership is part of the lookup to avoid exposing or locking another
  -- customer's order through this customer-facing workflow.
  select *
  into order_record
  from public.orders customer_order
  where customer_order.id = requested_order_id
    and customer_order.customer_id = customer_record.id
  for update;

  if order_record.id is null then
    raise exception 'REFUND_ORDER_NOT_FOUND';
  end if;

  if order_record.test_mode is true
    or order_record.customer_id is null
    or exists (
      select 1
      from public.custom_quote_requests quote
      where quote.order_id = order_record.id
    )
    or not exists (
      select 1
      from public.order_items item
      where item.order_id = order_record.id
    )
    or exists (
      select 1
      from public.order_items item
      where item.order_id = order_record.id
        and (item.product_id is null or item.variant_id is null)
    )
  then
    raise exception 'REFUND_ORDER_NOT_ELIGIBLE';
  end if;

  -- A repeated customer submission returns the one durable record without a
  -- second provider call. The original provider idempotency UUID is immutable.
  select *
  into refund_record
  from public.order_cancellation_refunds refund
  where refund.order_id = order_record.id;

  if refund_record.id is not null then
    if refund_record.customer_id is distinct from customer_record.id
      or refund_record.requested_by is distinct from actor_profile_id
    then
      raise exception 'REFUND_LEDGER_CONFLICT';
    end if;

    -- Preserve order -> payment-attempt lock order on repeated reads too.
    select *
    into attempt_record
    from public.payment_attempts attempt
    where attempt.id = refund_record.payment_attempt_id
      and attempt.order_id = order_record.id
      and attempt.provider = 'bog'
    for update;

    if attempt_record.id is null
      or attempt_record.provider_payment_id is distinct from refund_record.provider_payment_id
    then
      raise exception 'REFUND_LEDGER_CONFLICT';
    end if;

    return jsonb_build_object(
      'refund_request_id', refund_record.id,
      'order_id', refund_record.order_id,
      'payment_attempt_id', refund_record.payment_attempt_id,
      'provider_payment_id', refund_record.provider_payment_id,
      'provider_refund_idempotency_key', refund_record.provider_refund_idempotency_key,
      'refund_amount', refund_record.refund_amount,
      'currency', refund_record.currency,
      'status', refund_record.status,
      'created', false,
      'should_submit', false
    );
  end if;

  if exists (
    select 1
    from public.order_cancellation_refunds refund
    where refund.request_operation_key = operation_key
      and refund.order_id <> order_record.id
  ) then
    raise exception 'REFUND_OPERATION_KEY_CONFLICT';
  end if;

  if order_record.fulfillment_status not in ('order_received', 'confirmed')
    or order_record.status = 'cancelled'
  then
    raise exception 'REFUND_PRODUCTION_STARTED';
  end if;

  if exists (
    select 1
    from public.print_jobs job
    join public.order_items item on item.id = job.order_item_id
    where item.order_id = order_record.id
  ) then
    raise exception 'REFUND_PRODUCTION_STARTED';
  end if;

  if order_record.payment_status is distinct from 'paid'
    or order_record.total is null
    or round(order_record.total, 2) <= 0
  then
    raise exception 'REFUND_PAYMENT_NOT_ELIGIBLE';
  end if;

  select count(*)::integer
  into bog_attempt_count
  from public.payment_attempts attempt
  where attempt.order_id = order_record.id
    and attempt.provider = 'bog';

  if bog_attempt_count <> 1 then
    raise exception 'REFUND_PAYMENT_NOT_ELIGIBLE';
  end if;

  -- Exact paid, signed attempt second. The browser supplies none of these
  -- payment identifiers, amounts or currency values.
  select *
  into attempt_record
  from public.payment_attempts attempt
  where attempt.order_id = order_record.id
    and attempt.provider = 'bog'
  for update;

  if attempt_record.id is null
    or attempt_record.provider is distinct from 'bog'
    or attempt_record.status is distinct from 'paid'
    or attempt_record.signature_verified is distinct from true
    or upper(coalesce(attempt_record.currency, '')) <> 'GEL'
    or round(attempt_record.amount, 2) <> round(order_record.total, 2)
    or nullif(trim(attempt_record.provider_payment_id), '') is null
    or length(attempt_record.provider_payment_id) > 128
  then
    raise exception 'REFUND_PAYMENT_NOT_ELIGIBLE';
  end if;

  begin
    insert into public.order_cancellation_refunds (
      order_id,
      customer_id,
      payment_attempt_id,
      requested_by,
      request_operation_key,
      provider,
      provider_payment_id,
      refund_amount,
      currency,
      reason_code,
      reason_note,
      status
    ) values (
      order_record.id,
      customer_record.id,
      attempt_record.id,
      actor_profile_id,
      operation_key,
      'bog',
      attempt_record.provider_payment_id,
      round(attempt_record.amount, 2),
      'GEL',
      'customer_requested',
      reason_note_value,
      'processing'
    )
    returning * into refund_record;
  exception
    when unique_violation then
      -- The order lock serializes ordinary double-clicks. This handler covers
      -- a UUID reused concurrently against a different order without leaking
      -- the other order or provider identifier.
      raise exception 'REFUND_OPERATION_KEY_CONFLICT';
  end;

  -- The production hold is final from the customer's perspective even while
  -- the bank refund is asynchronous. Keep payment_status paid until the signed
  -- callback proves the exact full refund.
  update public.orders
  set status = 'cancelled',
      fulfillment_status = 'cancelled',
      updated_at = now()
  where id = order_record.id
    and payment_status = 'paid'
    and fulfillment_status in ('order_received', 'confirmed');

  if not found then
    raise exception 'REFUND_PRODUCTION_STARTED';
  end if;

  insert into public.order_events (
    order_id,
    event_key,
    event_type,
    customer_label_en,
    customer_label_ka,
    details,
    is_customer_visible,
    created_by
  ) values (
    order_record.id,
    'order:' || order_record.id::text || ':customer_cancelled',
    'cancellation_requested',
    'Order cancelled — refund requested',
    'შეკვეთა გაუქმებულია — თანხის დაბრუნება მოთხოვნილია',
    jsonb_build_object(
      'refund_request_id', refund_record.id,
      'refund_status', refund_record.status,
      'refund_amount', refund_record.refund_amount,
      'currency', refund_record.currency
    ),
    true,
    actor_profile_id
  )
  on conflict do nothing;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    actor_profile_id,
    'customer_order_cancellation_claimed',
    'order',
    order_record.id::text,
    jsonb_build_object(
      'refund_request_id', refund_record.id,
      'payment_attempt_id', attempt_record.id,
      'previous_status', order_record.status,
      'previous_fulfillment_status', order_record.fulfillment_status,
      'refund_amount', refund_record.refund_amount,
      'currency', refund_record.currency,
      'reason_code', refund_record.reason_code
    )
  );

  -- A stale "ready for production" bell item must not survive the atomic hold.
  delete from public.notifications notification
  where notification.order_id = order_record.id
    and notification.notification_type = 'operator_order_paid';

  return jsonb_build_object(
    'refund_request_id', refund_record.id,
    'order_id', refund_record.order_id,
    'payment_attempt_id', refund_record.payment_attempt_id,
    'provider_payment_id', refund_record.provider_payment_id,
    'provider_refund_idempotency_key', refund_record.provider_refund_idempotency_key,
    'refund_amount', refund_record.refund_amount,
    'currency', refund_record.currency,
    'status', refund_record.status,
    'created', true,
    'should_submit', true
  );
end;
$$;

revoke all on function public.claim_customer_bog_refund_v1(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.claim_customer_bog_refund_v1(
  uuid, uuid, uuid, text, text
) to service_role;

create or replace function public.record_bog_refund_submission_v1(
  requested_refund_request_id uuid,
  requested_provider_refund_idempotency_key uuid,
  requested_outcome text,
  requested_provider_status text,
  requested_http_status integer,
  requested_error_code text,
  requested_safe_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  refund_record public.order_cancellation_refunds%rowtype;
  saved_record public.order_cancellation_refunds%rowtype;
  next_status text;
  provider_status_value text;
  error_code_value text;
  safe_response_value jsonb;
begin
  provider_status_value := nullif(trim(coalesce(requested_provider_status, '')), '');
  error_code_value := nullif(trim(coalesce(requested_error_code, '')), '');
  safe_response_value := coalesce(requested_safe_response, '{}'::jsonb);

  if requested_refund_request_id is null
    or requested_provider_refund_idempotency_key is null
    or requested_outcome is null
    or requested_outcome not in ('accepted', 'definite_failure', 'uncertain')
    or (provider_status_value is not null and length(provider_status_value) > 128)
    or (error_code_value is not null and length(error_code_value) > 160)
    or (
      requested_http_status is not null
      and (requested_http_status < 100 or requested_http_status > 599)
    )
    or jsonb_typeof(safe_response_value) <> 'object'
    or octet_length(safe_response_value::text) > 8192
  then
    raise exception 'REFUND_RESULT_INVALID';
  end if;

  select *
  into refund_record
  from public.order_cancellation_refunds refund
  where refund.id = requested_refund_request_id
  for update;

  if refund_record.id is null then
    raise exception 'REFUND_REQUEST_NOT_FOUND';
  end if;
  if refund_record.provider_refund_idempotency_key
    is distinct from requested_provider_refund_idempotency_key
  then
    raise exception 'REFUND_IDEMPOTENCY_CONFLICT';
  end if;

  -- Terminal or already-escalated states are monotonic and do not count a
  -- replayed recorder call as another provider submission.
  if refund_record.status in (
    'refund_submitted',
    'review_required',
    'refunded'
  ) then
    return jsonb_build_object(
      'refund_request_id', refund_record.id,
      'order_id', refund_record.order_id,
      'status', refund_record.status,
      'submission_attempts', refund_record.submission_attempts,
      'can_retry', refund_record.status = 'submission_failed',
      'requires_review', refund_record.status = 'review_required',
      'refunded', refund_record.status = 'refunded'
    );
  end if;

  next_status := case requested_outcome
    when 'accepted' then 'refund_submitted'
    when 'definite_failure' then 'submission_failed'
    else 'review_required'
  end;

  update public.order_cancellation_refunds
  set status = next_status,
      submission_attempts = submission_attempts + 1,
      provider_status = provider_status_value,
      provider_http_status = requested_http_status,
      last_error_code = case
        when requested_outcome = 'accepted' then null
        else coalesce(error_code_value, upper(requested_outcome))
      end,
      safe_provider_response = safe_response_value,
      last_submission_at = now(),
      submitted_at = case
        when requested_outcome = 'accepted' then coalesce(submitted_at, now())
        else submitted_at
      end,
      updated_at = now()
  where id = refund_record.id
    and status in ('processing', 'submission_failed')
  returning * into saved_record;

  if saved_record.id is null then
    select *
    into saved_record
    from public.order_cancellation_refunds refund
    where refund.id = refund_record.id;
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    refund_record.requested_by,
    'bog_refund_submission_recorded',
    'order',
    refund_record.order_id::text,
    jsonb_build_object(
      'refund_request_id', refund_record.id,
      'outcome', requested_outcome,
      'status', saved_record.status,
      'http_status', requested_http_status,
      'provider_status', provider_status_value,
      'error_code', error_code_value,
      'submission_attempts', saved_record.submission_attempts
    )
  );

  if saved_record.status in ('submission_failed', 'review_required') then
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
      saved_record.order_id,
      'operator_refund_review',
      'თანხის დაბრუნებას შემოწმება სჭირდება',
      'Refund needs review',
      'გაუქმებული შეკვეთის BOG დაბრუნება ავტომატურად ვერ დასრულდა.',
      'A cancelled order BOG refund could not complete automatically.',
      '/admin/orders',
      jsonb_build_object(
        'order_id', saved_record.order_id,
        'refund_request_id', saved_record.id,
        'refund_status', saved_record.status
      ),
      'operator:refund_review:' || saved_record.id::text || ':' || profile.id::text
    from public.profiles profile
    where profile.role in ('owner', 'admin', 'production_operator', 'support')
      and profile.is_active is true
    on conflict (dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'refund_request_id', saved_record.id,
    'order_id', saved_record.order_id,
    'status', saved_record.status,
    'submission_attempts', saved_record.submission_attempts,
    'can_retry', saved_record.status = 'submission_failed',
    'requires_review', saved_record.status = 'review_required',
    'refunded', saved_record.status = 'refunded'
  );
end;
$$;

revoke all on function public.record_bog_refund_submission_v1(
  uuid, uuid, text, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_bog_refund_submission_v1(
  uuid, uuid, text, text, integer, text, jsonb
) to service_role;

-- A refunded payment or an active cancellation ledger is a hard boundary for
-- future fulfillment transitions. This does not attempt to stop a physical
-- printer; instead it prevents Hooma from silently advancing the workflow and
-- forces an operator to resolve the review/cancellation state.
create or replace function public.guard_refunded_order_fulfillment_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.fulfillment_status is distinct from new.fulfillment_status
    and new.fulfillment_status <> 'cancelled'
    and (
      old.payment_status = 'refunded'
      or new.payment_status = 'refunded'
      or exists (
        select 1
        from public.order_cancellation_refunds refund
        where refund.order_id = new.id
      )
    )
  then
    raise exception 'ORDER_REFUND_HOLD_ACTIVE';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_refunded_order_fulfillment_v1()
  from public, anon, authenticated;

drop trigger if exists guard_refunded_order_fulfillment
  on public.orders;
create trigger guard_refunded_order_fulfillment
before update of fulfillment_status on public.orders
for each row execute function public.guard_refunded_order_fulfillment_v1();

-- Print-job RPCs do not all advance the order row: release, partial complete,
-- and failure/retry can otherwise mutate production after a refund HOLD. A
-- single database trigger protects every current and future caller. Physical
-- stop/result recording during a HOLD requires a separate audited resolution
-- workflow; normal production actions deliberately fail closed here.
create or replace function public.guard_refunded_print_job_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_order_item_id uuid;
  order_record public.orders%rowtype;
begin
  -- A print job belongs to the immutable order-item snapshot it was created
  -- for. Re-parenting would otherwise let an UPDATE move a held job onto a
  -- different order before this trigger evaluates ownership.
  if tg_op = 'UPDATE'
    and new.order_item_id is distinct from old.order_item_id
  then
    raise exception 'PRINT_JOB_ORDER_ITEM_IMMUTABLE';
  end if;

  target_order_item_id := case when tg_op = 'DELETE'
    then old.order_item_id
    else new.order_item_id
  end;

  select held_order.*
  into order_record
  from public.order_items item
  join public.orders held_order on held_order.id = item.order_id
  where item.id = target_order_item_id
  for share of held_order;

  if order_record.id is not null
    and (
      order_record.payment_status = 'refunded'
      or order_record.fulfillment_status = 'cancelled'
      or exists (
        select 1
        from public.order_cancellation_refunds refund
        where refund.order_id = order_record.id
      )
    )
  then
    raise exception 'ORDER_REFUND_HOLD_ACTIVE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_refunded_print_job_mutation_v1()
  from public, anon, authenticated;

drop trigger if exists guard_refunded_print_job_mutation
  on public.print_jobs;
create trigger guard_refunded_print_job_mutation
before insert or update or delete on public.print_jobs
for each row execute function public.guard_refunded_print_job_mutation_v1();

-- Only the callback-authoritative terminal attempt transition can finalize a
-- cancellation ledger. The callback already validates the provider receipt's
-- exact full refund amount; this trigger independently rechecks the immutable
-- local amount/currency/provider linkage before recording finality.
create or replace function public.sync_order_cancellation_refund_from_bog_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  customer_profile_id uuid;
  refund_record public.order_cancellation_refunds%rowtype;
  full_refund_verified boolean := false;
  after_production boolean := false;
  review_reason text;
begin
  if new.provider <> 'bog'
    or new.status <> 'refunded'
    or new.signature_verified is not true
    or (
      old.status is not distinct from new.status
      and old.signature_verified is not distinct from new.signature_verified
    )
  then
    return new;
  end if;

  select *
  into order_record
  from public.orders customer_order
  where customer_order.id = new.order_id;

  if order_record.id is null then
    return new;
  end if;

  select customer.profile_id
  into customer_profile_id
  from public.customers customer
  where customer.id = order_record.customer_id;

  select *
  into refund_record
  from public.order_cancellation_refunds refund
  where refund.order_id = order_record.id
     or refund.payment_attempt_id = new.id
  order by case when refund.payment_attempt_id = new.id then 0 else 1 end
  limit 1
  for update;

  after_production := order_record.fulfillment_status not in (
    'order_received',
    'confirmed',
    'cancelled'
  );

  if refund_record.id is not null then
    full_refund_verified := refund_record.payment_attempt_id = new.id
      and refund_record.provider = 'bog'
      and refund_record.provider_payment_id is not distinct from new.provider_payment_id
      and refund_record.currency = 'GEL'
      and upper(coalesce(new.currency, '')) = 'GEL'
      and round(refund_record.refund_amount, 2) = round(new.amount, 2)
      and round(refund_record.refund_amount, 2) = round(order_record.total, 2);
  else
    full_refund_verified := upper(coalesce(new.currency, '')) = 'GEL'
      and new.amount is not null
      and round(new.amount, 2) > 0
      and round(new.amount, 2) = round(order_record.total, 2)
      and nullif(trim(new.provider_payment_id), '') is not null;
  end if;

  if refund_record.id is not null
    and full_refund_verified
    and not after_production
    and order_record.fulfillment_status = 'cancelled'
  then
    update public.order_cancellation_refunds
    set status = 'refunded',
        provider_status = 'refunded',
        last_error_code = null,
        refunded_at = coalesce(refunded_at, now()),
        updated_at = now()
    where id = refund_record.id
      and status <> 'refunded';

    insert into public.audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      refund_record.requested_by,
      'customer_bog_refund_finalized',
      'order',
      order_record.id::text,
      jsonb_build_object(
        'refund_request_id', refund_record.id,
        'payment_attempt_id', new.id,
        'refund_amount', refund_record.refund_amount,
        'currency', refund_record.currency
      )
    );

    return new;
  end if;

  if refund_record.id is null
    and full_refund_verified
    and not after_production
  then
    if order_record.customer_id is null then
      return new;
    end if;

    insert into public.order_cancellation_refunds (
      order_id,
      customer_id,
      payment_attempt_id,
      requested_by,
      request_operation_key,
      provider,
      provider_payment_id,
      refund_amount,
      currency,
      reason_code,
      status,
      provider_status,
      refunded_at
    ) values (
      order_record.id,
      order_record.customer_id,
      new.id,
      customer_profile_id,
      gen_random_uuid(),
      'bog',
      new.provider_payment_id,
      round(new.amount, 2),
      'GEL',
      'provider_refund_detected',
      'refunded',
      'refunded',
      now()
    )
    returning * into refund_record;

    update public.orders
    set status = 'cancelled',
        fulfillment_status = 'cancelled',
        updated_at = now()
    where id = order_record.id
      and fulfillment_status in ('order_received', 'confirmed');

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
      'order:' || order_record.id::text || ':provider_refund_cancelled',
      'cancelled',
      'Order cancelled after payment refund',
      'თანხის დაბრუნების შემდეგ შეკვეთა გაუქმებულია',
      jsonb_build_object(
        'refund_request_id', refund_record.id,
        'refund_amount', refund_record.refund_amount,
        'currency', refund_record.currency
      ),
      true
    )
    on conflict do nothing;

    insert into public.audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      null,
      'unexpected_bog_refund_cancelled_preproduction',
      'order',
      order_record.id::text,
      jsonb_build_object(
        'refund_request_id', refund_record.id,
        'payment_attempt_id', new.id,
        'refund_amount', refund_record.refund_amount,
        'currency', refund_record.currency
      )
    );

    delete from public.notifications notification
    where notification.order_id = order_record.id
      and notification.notification_type = 'operator_order_paid';

    return new;
  end if;

  review_reason := case
    when not full_refund_verified then 'SIGNED_REFUND_LOCAL_MISMATCH'
    when after_production then 'UNEXPECTED_REFUND_AFTER_PRODUCTION'
    when order_record.fulfillment_status <> 'cancelled'
      then 'REFUND_WITHOUT_CANCELLATION_HOLD'
    else 'REFUND_REVIEW_REQUIRED'
  end;

  if refund_record.id is null and order_record.customer_id is not null then
    insert into public.order_cancellation_refunds (
      order_id,
      customer_id,
      payment_attempt_id,
      requested_by,
      request_operation_key,
      provider,
      provider_payment_id,
      refund_amount,
      currency,
      reason_code,
      status,
      provider_status,
      last_error_code
    ) values (
      order_record.id,
      order_record.customer_id,
      new.id,
      customer_profile_id,
      gen_random_uuid(),
      'bog',
      coalesce(nullif(trim(new.provider_payment_id), ''), new.id::text),
      greatest(round(coalesce(new.amount, order_record.total), 2), 0.01),
      'GEL',
      'provider_refund_detected',
      'review_required',
      'refunded',
      review_reason
    )
    returning * into refund_record;
  elsif refund_record.id is not null then
    update public.order_cancellation_refunds
    set status = case
          when status = 'refunded' then status
          else 'review_required'
        end,
        provider_status = 'refunded',
        last_error_code = review_reason,
        updated_at = now()
    where id = refund_record.id
    returning * into refund_record;
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    null,
    'unexpected_bog_refund_requires_review',
    'order',
    order_record.id::text,
    jsonb_build_object(
      'refund_request_id', refund_record.id,
      'payment_attempt_id', new.id,
      'reason', review_reason,
      'fulfillment_status', order_record.fulfillment_status,
      'attempt_amount', new.amount,
      'order_total', order_record.total,
      'currency', new.currency
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
    order_record.id,
    'operator_refund_review',
    'დაბრუნებულ შეკვეთას ოპერაციული შემოწმება სჭირდება',
    'Refunded order needs operational review',
    'BOG-ზე თანხა დაბრუნდა, მაგრამ შეკვეთა წარმოების ან სხვა შეუთავსებელ ეტაპზეა.',
    'BOG reports a refund while the order is in production or another incompatible stage.',
    '/admin/orders',
    jsonb_build_object(
      'order_id', order_record.id,
      'refund_request_id', refund_record.id,
      'review_reason', review_reason,
      'fulfillment_status', order_record.fulfillment_status
    ),
    'operator:unexpected_refund:' || order_record.id::text || ':' || profile.id::text
  from public.profiles profile
  where profile.role in ('owner', 'admin', 'production_operator', 'support')
    and profile.is_active is true
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.sync_order_cancellation_refund_from_bog_v1()
  from public, anon, authenticated;

drop trigger if exists sync_order_cancellation_refund_from_bog
  on public.payment_attempts;
create trigger sync_order_cancellation_refund_from_bog
after update of status, signature_verified on public.payment_attempts
for each row execute function public.sync_order_cancellation_refund_from_bog_v1();

comment on table public.order_cancellation_refunds is
  'One immutable-scope cancellation/refund ledger per catalog order. Provider identifiers and submission diagnostics are service-only; signed full BOG callbacks are the only final-refund authority.';

comment on function public.claim_customer_bog_refund_v1(
  uuid, uuid, uuid, text, text
) is
  'Atomically claims one customer-owned paid catalog-order cancellation before production and returns the trusted BOG full-refund target exactly once.';

comment on function public.record_bog_refund_submission_v1(
  uuid, uuid, text, text, integer, text, jsonb
) is
  'Monotonically records a sanitized outbound BOG refund result. This function cannot mark a payment or refund ledger refunded.';

commit;
