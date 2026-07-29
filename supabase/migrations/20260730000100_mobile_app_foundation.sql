begin;

create table if not exists public.mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_id text not null,
  app_version text,
  locale text not null default 'ka' check (locale in ('ka', 'en')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, device_id),
  unique(expo_push_token)
);

create index if not exists idx_mobile_push_tokens_profile_enabled
  on public.mobile_push_tokens(profile_id, enabled, last_seen_at desc);
create index if not exists idx_mobile_push_tokens_enabled
  on public.mobile_push_tokens(enabled, last_seen_at desc)
  where enabled is true;

alter table public.mobile_push_tokens enable row level security;

drop policy if exists "profiles read own mobile push tokens"
  on public.mobile_push_tokens;
create policy "profiles read own mobile push tokens"
  on public.mobile_push_tokens for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "profiles insert own mobile push tokens"
  on public.mobile_push_tokens;
create policy "profiles insert own mobile push tokens"
  on public.mobile_push_tokens for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "profiles update own mobile push tokens"
  on public.mobile_push_tokens;
create policy "profiles update own mobile push tokens"
  on public.mobile_push_tokens for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "profiles delete own mobile push tokens"
  on public.mobile_push_tokens;
create policy "profiles delete own mobile push tokens"
  on public.mobile_push_tokens for delete to authenticated
  using (profile_id = auth.uid());

revoke all on table public.mobile_push_tokens from public, anon, authenticated;
grant select, insert, delete on table public.mobile_push_tokens to authenticated;
grant update (
  expo_push_token,
  platform,
  app_version,
  locale,
  enabled,
  last_seen_at,
  updated_at
) on table public.mobile_push_tokens to authenticated;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'operator_order_paid',
    'customer_order_status',
    'customer_order_received',
    'customer_payment_confirmed',
    'customer_production_started',
    'customer_quality_check',
    'customer_ready_for_delivery',
    'customer_out_for_delivery',
    'customer_delivered',
    'customer_hooma_plus_expiring'
  )) not valid;

create table if not exists public.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_token_id uuid not null references public.mobile_push_tokens(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'retry', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 20),
  expo_ticket_id text,
  error_code text,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, push_token_id)
);

create index if not exists idx_mobile_push_deliveries_pending
  on public.mobile_push_deliveries(status, next_attempt_at)
  where status in ('pending', 'retry');

alter table public.mobile_push_deliveries enable row level security;
revoke all on table public.mobile_push_deliveries from public, anon, authenticated;

create table if not exists public.mobile_api_rate_limits (
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  route_key text not null check (route_key ~ '^[a-z0-9:_-]{1,80}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key(subject_hash, route_key, window_started_at)
);

create index if not exists idx_mobile_api_rate_limits_cleanup
  on public.mobile_api_rate_limits(window_started_at);

alter table public.mobile_api_rate_limits enable row level security;
revoke all on table public.mobile_api_rate_limits from public, anon, authenticated;

create or replace function public.consume_mobile_api_rate_limit_v1(
  requested_subject_hash text,
  requested_route_key text,
  requested_limit integer,
  requested_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bucket timestamptz;
  next_count integer;
begin
  if requested_subject_hash is null
    or requested_subject_hash !~ '^[0-9a-f]{64}$'
    or requested_route_key is null
    or requested_route_key !~ '^[a-z0-9:_-]{1,80}$'
    or requested_limit not between 1 and 1000
    or requested_window_seconds not between 10 and 86400
  then
    raise exception 'Invalid mobile API rate-limit request';
  end if;

  bucket := to_timestamp(
    floor(extract(epoch from now()) / requested_window_seconds)
      * requested_window_seconds
  );

  insert into public.mobile_api_rate_limits (
    subject_hash,
    route_key,
    window_started_at,
    request_count
  )
  values (
    requested_subject_hash,
    requested_route_key,
    bucket,
    1
  )
  on conflict (subject_hash, route_key, window_started_at)
  do update set
    request_count = public.mobile_api_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into next_count;

  return jsonb_build_object(
    'allowed', next_count <= requested_limit,
    'remaining', greatest(requested_limit - next_count, 0),
    'retry_after_seconds',
      greatest(
        requested_window_seconds
          - floor(extract(epoch from now() - bucket))::integer,
        1
      )
  );
end;
$$;

revoke all on function public.consume_mobile_api_rate_limit_v1(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_mobile_api_rate_limit_v1(text, text, integer, integer)
  to service_role;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  operator_notes text,
  unique(profile_id)
);

create index if not exists idx_account_deletion_requests_status
  on public.account_deletion_requests(status, requested_at);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "profiles read own account deletion request"
  on public.account_deletion_requests;
create policy "profiles read own account deletion request"
  on public.account_deletion_requests for select to authenticated
  using (profile_id = auth.uid());

revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;

create or replace function public.request_account_deletion_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requester uuid := auth.uid();
  request_id uuid;
begin
  if requester is null then
    raise exception 'Authentication required';
  end if;

  insert into public.account_deletion_requests (profile_id, status, requested_at)
  values (requester, 'requested', now())
  on conflict (profile_id)
  do update set
    status = case
      when public.account_deletion_requests.status = 'completed'
        then public.account_deletion_requests.status
      else 'requested'
    end,
    requested_at = case
      when public.account_deletion_requests.status = 'completed'
        then public.account_deletion_requests.requested_at
      else now()
    end
  returning id into request_id;

  update public.mobile_push_tokens
  set enabled = false, updated_at = now()
  where profile_id = requester;

  return jsonb_build_object(
    'request_id', request_id,
    'status', 'requested'
  );
end;
$$;

revoke all on function public.request_account_deletion_v1()
  from public, anon;
grant execute on function public.request_account_deletion_v1()
  to authenticated;

create or replace function public.notify_customer_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_profile_id uuid;
  notification_type_value text;
  title_ka_value text;
  title_en_value text;
  body_ka_value text;
  body_en_value text;
  order_label text;
begin
  if old.fulfillment_status is not distinct from new.fulfillment_status
    or new.fulfillment_status not in (
      'in_production',
      'quality_check',
      'ready_for_delivery',
      'out_for_delivery',
      'delivered'
    )
  then
    return new;
  end if;

  select customer.profile_id
  into customer_profile_id
  from public.customers customer
  join public.profiles profile
    on profile.id = customer.profile_id
   and profile.is_active is true
  where customer.id = new.customer_id;

  if customer_profile_id is null then
    return new;
  end if;

  order_label := coalesce(new.tracking_code, left(new.id::text, 8));
  if new.fulfillment_status = 'in_production' then
    notification_type_value := 'customer_production_started';
    title_ka_value := 'შეკვეთა წარმოებაშია';
    title_en_value := 'Production has started';
    body_ka_value := 'შეკვეთა #' || order_label || ' უკვე მზადდება.';
    body_en_value := 'Order #' || order_label || ' is now being produced.';
  elsif new.fulfillment_status = 'quality_check' then
    notification_type_value := 'customer_quality_check';
    title_ka_value := 'ხარისხის შემოწმება';
    title_en_value := 'Quality check';
    body_ka_value := 'შეკვეთა #' || order_label || ' ხარისხის შემოწმებას გადის.';
    body_en_value := 'Order #' || order_label || ' is undergoing quality checks.';
  elsif new.fulfillment_status = 'ready_for_delivery' then
    notification_type_value := 'customer_ready_for_delivery';
    title_ka_value := 'შეკვეთა მზად არის';
    title_en_value := 'Your order is ready';
    body_ka_value := 'შეკვეთა #' || order_label || ' მზადაა საკურიეროსთვის.';
    body_en_value := 'Order #' || order_label || ' is ready for courier handoff.';
  elsif new.fulfillment_status = 'out_for_delivery' then
    notification_type_value := 'customer_out_for_delivery';
    title_ka_value := 'შეკვეთა კურიერს გადაეცა';
    title_en_value := 'Your order is with the courier';
    body_ka_value := 'შეკვეთა #' || order_label || ' გადაეცა საკურიერო მომსახურებას.';
    body_en_value := 'Order #' || order_label || ' has been handed to the courier.';
  else
    notification_type_value := 'customer_delivered';
    title_ka_value := 'შეკვეთა მიწოდებულია';
    title_en_value := 'Your order was delivered';
    body_ka_value := 'შეკვეთა #' || order_label || ' წარმატებით მიწოდებულია.';
    body_en_value := 'Order #' || order_label || ' was delivered successfully.';
  end if;

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
  ) values (
    customer_profile_id,
    new.id,
    notification_type_value,
    title_ka_value,
    title_en_value,
    body_ka_value,
    body_en_value,
    '/account/orders',
    jsonb_build_object(
      'order_id', new.id,
      'tracking_code', new.tracking_code,
      'fulfillment_status', new.fulfillment_status
    ),
    'customer:order_status:' || new.id::text || ':'
      || new.fulfillment_status || ':' || customer_profile_id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function public.notify_mobile_customer_payment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_profile_id uuid;
  order_label text;
begin
  if old.payment_status is not distinct from new.payment_status
    or new.payment_status <> 'paid'
    or new.test_mode is true
    or not exists (
      select 1
      from public.payment_attempts attempt
      where attempt.order_id = new.id
        and attempt.provider in ('tbc', 'bog')
        and attempt.status = 'paid'
        and attempt.signature_verified is true
        and attempt.currency = 'GEL'
        and attempt.amount = new.total
    )
  then
    return new;
  end if;

  select customer.profile_id
  into customer_profile_id
  from public.customers customer
  join public.profiles profile
    on profile.id = customer.profile_id
   and profile.is_active is true
  where customer.id = new.customer_id;

  if customer_profile_id is null then
    return new;
  end if;

  order_label := coalesce(new.tracking_code, left(new.id::text, 8));
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
  ) values
  (
    customer_profile_id,
    new.id,
    'customer_order_received',
    'შეკვეთა მიღებულია',
    'Order received',
    'შეკვეთა #' || order_label || ' მიღებულია და წარმოებისთვის მზადდება.',
    'Order #' || order_label || ' was received and is being prepared for production.',
    '/account/orders',
    jsonb_build_object('order_id', new.id, 'tracking_code', new.tracking_code),
    'customer:order_received:' || new.id::text || ':' || customer_profile_id::text
  ),
  (
    customer_profile_id,
    new.id,
    'customer_payment_confirmed',
    'გადახდა დადასტურებულია',
    'Payment confirmed',
    'შეკვეთა #' || order_label || '-ის გადახდა უსაფრთხოდ დადასტურდა.',
    'Payment for order #' || order_label || ' was confirmed securely.',
    '/account/orders',
    jsonb_build_object('order_id', new.id, 'tracking_code', new.tracking_code),
    'customer:payment_confirmed:' || new.id::text || ':' || customer_profile_id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_mobile_customer_on_payment
  on public.orders;
create trigger notify_mobile_customer_on_payment
after update of payment_status on public.orders
for each row
execute function public.notify_mobile_customer_payment_confirmed();

commit;
