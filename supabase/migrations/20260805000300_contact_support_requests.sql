-- Durable public contact requests with atomic, privacy-preserving rate limits.
-- Browser roles cannot insert or mutate rows; the public form reaches these
-- functions only through Hooma's trusted server using the service role.

create table if not exists public.contact_requests (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 5 and 254),
  phone text check (phone is null or char_length(phone) between 1 and 30),
  topic text not null check (topic in (
    'order', 'payment_refund', 'delivery', 'product_quality',
    'account_privacy', 'hooma_plus', 'partnership', 'other'
  )),
  subject text not null check (char_length(subject) between 3 and 140),
  order_reference text check (
    order_reference is null or char_length(order_reference) between 1 and 64
  ),
  message text not null check (char_length(message) between 20 and 4000),
  language text not null check (language in ('ka', 'en')),
  client_key text not null check (client_key ~ '^[0-9a-f]{64}$'),
  email_key text not null check (email_key ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check (
    status in ('received', 'email_sending', 'email_sent', 'delivery_failed', 'resolved')
  ),
  email_attempts integer not null default 0 check (email_attempts >= 0),
  provider_email_id text,
  provider_http_status integer,
  last_error_code text,
  email_attempted_at timestamptz,
  email_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_requests_created
  on public.contact_requests(created_at desc, id);
create index if not exists idx_contact_requests_client_created
  on public.contact_requests(client_key, created_at desc);
create index if not exists idx_contact_requests_email_created
  on public.contact_requests(email_key, created_at desc);
create index if not exists idx_contact_requests_status_created
  on public.contact_requests(status, created_at desc);

drop trigger if exists set_contact_requests_updated_at on public.contact_requests;
create trigger set_contact_requests_updated_at
  before update on public.contact_requests
  for each row execute function public.set_updated_at();

alter table public.contact_requests enable row level security;

drop policy if exists "authorized staff read contact requests" on public.contact_requests;
create policy "authorized staff read contact requests"
  on public.contact_requests
  for select
  using (public.has_staff_role(array['owner', 'admin', 'support']));

revoke all on public.contact_requests from public, anon, authenticated;
grant select (
  id, name, email, phone, topic, subject, order_reference, message, language,
  status, email_attempts, provider_http_status, last_error_code,
  email_attempted_at, email_sent_at, resolved_at, created_at, updated_at
) on public.contact_requests to authenticated;
grant select, insert, update on public.contact_requests to service_role;

create or replace function public.reserve_contact_request_v1(
  requested_id uuid,
  requested_client_key text,
  requested_email_key text,
  requested_payload_hash text,
  requested_name text,
  requested_email text,
  requested_phone text,
  requested_topic text,
  requested_subject text,
  requested_order_reference text,
  requested_message text,
  requested_language text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_request public.contact_requests%rowtype;
  client_ten_minute_count integer;
  client_daily_count integer;
  email_daily_count integer;
  global_hourly_count integer;
  global_daily_count integer;
begin
  if requested_id is null
    or requested_client_key is null or requested_client_key !~ '^[0-9a-f]{64}$'
    or requested_email_key is null or requested_email_key !~ '^[0-9a-f]{64}$'
    or requested_payload_hash is null or requested_payload_hash !~ '^[0-9a-f]{64}$'
    or coalesce(char_length(requested_name), 0) not between 2 and 100
    or coalesce(char_length(requested_email), 0) not between 5 and 254
    or requested_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>.]+([.][^[:space:]@<>.]+)+$'
    or (requested_phone is not null and char_length(requested_phone) not between 1 and 30)
    or requested_topic not in (
      'order', 'payment_refund', 'delivery', 'product_quality',
      'account_privacy', 'hooma_plus', 'partnership', 'other'
    )
    or coalesce(char_length(requested_subject), 0) not between 3 and 140
    or (requested_order_reference is not null and char_length(requested_order_reference) not between 1 and 64)
    or coalesce(char_length(requested_message), 0) not between 20 and 4000
    or requested_language not in ('ka', 'en') then
    raise exception 'Invalid contact request';
  end if;

  -- One lock makes replays and all public rate-limit counters atomic across
  -- concurrent serverless instances.
  perform pg_advisory_xact_lock(hashtextextended('hooma:contact-support:global', 0));

  select * into existing_request
  from public.contact_requests
  where id = requested_id;

  if found then
    -- Exact payload identity is authoritative for idempotent replay. Client and
    -- email HMACs are creation-time rate-limit keys and may change after an IP
    -- change or planned secret rotation.
    if existing_request.payload_hash <> requested_payload_hash then
      raise exception 'Contact request replay mismatch';
    end if;
    if existing_request.status in ('email_sent', 'resolved') then
      return jsonb_build_object(
        'allowed', true,
        'replayed', true,
        'should_send', false,
        'status', existing_request.status,
        'email_attempts', existing_request.email_attempts
      );
    end if;

    if existing_request.status = 'email_sending'
      and existing_request.email_attempted_at > now() - interval '2 minutes' then
      return jsonb_build_object(
        'allowed', true,
        'replayed', true,
        'should_send', false,
        'reason', 'delivery_in_progress',
        'retry_after_seconds', 15,
        'status', existing_request.status,
        'email_attempts', existing_request.email_attempts
      );
    end if;

    if existing_request.email_attempts >= 3 then
      return jsonb_build_object(
        'allowed', true,
        'replayed', true,
        'should_send', false,
        'reason', 'delivery_attempts_exhausted',
        'status', existing_request.status,
        'email_attempts', existing_request.email_attempts
      );
    end if;

    update public.contact_requests
    set status = 'email_sending',
        email_attempts = email_attempts + 1,
        email_attempted_at = now()
    where id = requested_id
    returning * into existing_request;

    return jsonb_build_object(
      'allowed', true,
      'replayed', true,
      'should_send', true,
      'status', existing_request.status,
      'email_attempts', existing_request.email_attempts
    );
  end if;

  select count(*)::integer into global_hourly_count
  from public.contact_requests
  where created_at >= now() - interval '1 hour';
  if global_hourly_count >= 100 then
    return jsonb_build_object('allowed', false, 'reason', 'global_hourly_limit', 'retry_after_seconds', 3600);
  end if;

  select count(*)::integer into global_daily_count
  from public.contact_requests
  where created_at >= now() - interval '24 hours';
  if global_daily_count >= 500 then
    return jsonb_build_object('allowed', false, 'reason', 'global_daily_limit', 'retry_after_seconds', 21600);
  end if;

  select count(*)::integer into client_ten_minute_count
  from public.contact_requests
  where client_key = requested_client_key
    and created_at >= now() - interval '10 minutes';
  if client_ten_minute_count >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'client_ten_minute_limit', 'retry_after_seconds', 600);
  end if;

  select count(*)::integer into client_daily_count
  from public.contact_requests
  where client_key = requested_client_key
    and created_at >= now() - interval '24 hours';
  if client_daily_count >= 10 then
    return jsonb_build_object('allowed', false, 'reason', 'client_daily_limit', 'retry_after_seconds', 21600);
  end if;

  select count(*)::integer into email_daily_count
  from public.contact_requests
  where email_key = requested_email_key
    and created_at >= now() - interval '24 hours';
  if email_daily_count >= 5 then
    return jsonb_build_object('allowed', false, 'reason', 'email_daily_limit', 'retry_after_seconds', 21600);
  end if;

  insert into public.contact_requests (
    id, name, email, phone, topic, subject, order_reference, message, language,
    client_key, email_key, payload_hash, status, email_attempts, email_attempted_at
  ) values (
    requested_id, requested_name, lower(requested_email), requested_phone,
    requested_topic, requested_subject, requested_order_reference,
    requested_message, requested_language, requested_client_key,
    requested_email_key, requested_payload_hash, 'email_sending', 1, now()
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null,
    'contact_request_received',
    'contact_request',
    requested_id::text,
    jsonb_build_object(
      'client_key', requested_client_key,
      'topic', requested_topic,
      'message_characters', char_length(requested_message),
      'has_order_reference', requested_order_reference is not null
    )
  );

  return jsonb_build_object(
    'allowed', true,
    'replayed', false,
    'should_send', true,
    'status', 'email_sending',
    'email_attempts', 1
  );
end;
$$;

create or replace function public.record_contact_email_result_v1(
  requested_id uuid,
  requested_outcome text,
  requested_provider_email_id text,
  requested_provider_http_status integer,
  requested_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.contact_requests%rowtype;
begin
  if requested_id is null
    or requested_outcome not in ('sent', 'failed')
    or (requested_outcome = 'sent' and coalesce(char_length(requested_provider_email_id), 0) not between 1 and 200)
    or (requested_provider_email_id is not null and char_length(requested_provider_email_id) > 200)
    or (requested_provider_http_status is not null and requested_provider_http_status not between 100 and 599)
    or coalesce(char_length(requested_error_code), 0) not between 1 and 80 then
    raise exception 'Invalid contact email result';
  end if;

  select * into request_row
  from public.contact_requests
  where id = requested_id
  for update;
  if not found then raise exception 'Contact request not found'; end if;

  if request_row.status in ('email_sent', 'resolved') then
    return jsonb_build_object(
      'request_id', request_row.id,
      'status', request_row.status,
      'email_attempts', request_row.email_attempts
    );
  end if;

  if requested_outcome = 'failed' and request_row.status <> 'email_sending' then
    raise exception 'Contact email delivery is not claimed';
  end if;

  update public.contact_requests
  set status = case when requested_outcome = 'sent' then 'email_sent' else 'delivery_failed' end,
      provider_email_id = case when requested_outcome = 'sent' then requested_provider_email_id else provider_email_id end,
      provider_http_status = requested_provider_http_status,
      last_error_code = case when requested_outcome = 'sent' then null else requested_error_code end,
      email_attempted_at = now(),
      email_sent_at = case when requested_outcome = 'sent' then coalesce(email_sent_at, now()) else email_sent_at end
  where id = requested_id
  returning * into request_row;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null,
    case when requested_outcome = 'sent' then 'contact_email_sent' else 'contact_email_delivery_failed' end,
    'contact_request',
    requested_id::text,
    jsonb_build_object(
      'http_status', requested_provider_http_status,
      'error_code', case when requested_outcome = 'failed' then requested_error_code else null end,
      'email_attempts', request_row.email_attempts
    )
  );

  return jsonb_build_object(
    'request_id', request_row.id,
    'status', request_row.status,
    'email_attempts', request_row.email_attempts
  );
end;
$$;

revoke all on function public.reserve_contact_request_v1(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_contact_request_v1(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.record_contact_email_result_v1(
  uuid, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.record_contact_email_result_v1(
  uuid, text, text, integer, text
) to service_role;

comment on table public.contact_requests is
  'General Hooma support requests submitted through /contact. PII is protected by RLS and never copied into audit metadata.';
