-- Durable in-app notifications for production operators and order customers.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  notification_type text not null check (notification_type in ('operator_order_paid', 'customer_order_status')),
  title_ka text not null,
  title_en text not null,
  body_ka text not null,
  body_en text not null,
  href text not null check (href ~ '^/[^/\\]'),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_profile_id, created_at desc);
create index if not exists idx_notifications_recipient_unread
  on public.notifications(recipient_profile_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "profiles read own notifications" on public.notifications;
create policy "profiles read own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_profile_id = auth.uid());

drop policy if exists "profiles mark own notifications read" on public.notifications;
create policy "profiles mark own notifications read"
  on public.notifications
  for update
  to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create or replace function public.enqueue_paid_order_notifications(requested_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  inserted_count integer := 0;
begin
  select *
  into order_record
  from public.orders
  where id = requested_order_id;

  if order_record.id is null
    or order_record.test_mode is true
    or order_record.payment_status is distinct from 'paid'
    or not exists (
      select 1
      from public.payment_attempts attempt
      where attempt.order_id = requested_order_id
        and attempt.provider in ('tbc', 'bog')
        and attempt.currency = 'GEL'
        and attempt.status = 'paid'
        and attempt.signature_verified is true
        and attempt.amount = order_record.total
    )
  then
    return 0;
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
  )
  select
    profile.id,
    order_record.id,
    'operator_order_paid',
    'ახალი გადახდილი შეკვეთა',
    'New paid order',
    'შეკვეთა #' || coalesce(order_record.tracking_code, left(order_record.id::text, 8))
      || ' გადახდილია და მზადაა წარმოებაში დასადასტურებლად.',
    'Order #' || coalesce(order_record.tracking_code, left(order_record.id::text, 8))
      || ' is paid and ready for production confirmation.',
    '/admin/orders',
    jsonb_build_object(
      'order_id', order_record.id,
      'tracking_code', order_record.tracking_code,
      'total', order_record.total,
      'payment_status', order_record.payment_status
    ),
    'operator:paid_order:' || order_record.id::text || ':' || profile.id::text
  from public.profiles profile
  where profile.role = 'production_operator'
    and profile.is_active is true
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.enqueue_paid_order_notifications(uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_paid_order_notifications(uuid)
  to service_role;

create or replace function public.notify_operators_from_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.payment_status = 'paid' then
      perform public.enqueue_paid_order_notifications(new.id);
    end if;
  elsif old.payment_status is distinct from new.payment_status
    and new.payment_status = 'paid'
  then
    perform public.enqueue_paid_order_notifications(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_operators_from_payment_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'paid' and new.signature_verified is true then
    perform public.enqueue_paid_order_notifications(new.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_operators_on_paid_order_insert on public.orders;
create trigger notify_operators_on_paid_order_insert
after insert on public.orders
for each row
execute function public.notify_operators_from_order_payment();

drop trigger if exists notify_operators_on_paid_order_update on public.orders;
create trigger notify_operators_on_paid_order_update
after update of payment_status on public.orders
for each row
execute function public.notify_operators_from_order_payment();

drop trigger if exists notify_operators_on_verified_payment_attempt on public.payment_attempts;
create trigger notify_operators_on_verified_payment_attempt
after insert or update of status, signature_verified, amount on public.payment_attempts
for each row
execute function public.notify_operators_from_payment_attempt();

create or replace function public.notify_customer_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_profile_id uuid;
  title_ka_value text;
  title_en_value text;
  body_ka_value text;
  body_en_value text;
begin
  if old.fulfillment_status is not distinct from new.fulfillment_status
    or new.fulfillment_status not in ('in_production', 'ready_for_delivery', 'out_for_delivery')
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

  if new.fulfillment_status = 'in_production' then
    title_ka_value := 'შეკვეთა წარმოებაშია';
    title_en_value := 'Your order is in production';
    body_ka_value := 'შეკვეთა #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' უკვე მზადდება.';
    body_en_value := 'Order #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' is now being produced.';
  elsif new.fulfillment_status = 'ready_for_delivery' then
    title_ka_value := 'შეკვეთა მზად არის';
    title_en_value := 'Your order is ready';
    body_ka_value := 'შეკვეთა #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' მზადაა საკურიეროსთვის.';
    body_en_value := 'Order #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' is ready for courier handoff.';
  else
    title_ka_value := 'შეკვეთა კურიერს გადაეცა';
    title_en_value := 'Your order was handed to the courier';
    body_ka_value := 'შეკვეთა #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' გადაეცა საკურიერო მომსახურებას.';
    body_en_value := 'Order #' || coalesce(new.tracking_code, left(new.id::text, 8))
      || ' has been handed to the courier.';
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
    'customer_order_status',
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
    'customer:order_status:' || new.id::text || ':' || new.fulfillment_status || ':' || customer_profile_id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_customer_on_order_status on public.orders;
create trigger notify_customer_on_order_status
after update of fulfillment_status on public.orders
for each row
execute function public.notify_customer_from_order_status();

comment on table public.notifications is
  'Durable in-app notifications scoped to one authenticated profile. Order triggers create idempotent operator and customer events.';
