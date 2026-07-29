-- Atomically reserve public storefront-assistant requests before any paid model call.
-- Only privacy-preserving HMAC client keys and counters are stored; chat text is never logged.

create index if not exists idx_audit_log_action_created
  on public.audit_log(action, created_at desc);

create or replace function public.reserve_storefront_assistant_request(
  requested_client_key text,
  assistant_request_id uuid,
  message_characters integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  client_ten_minute_count integer;
  client_daily_count integer;
  global_hourly_count integer;
  global_daily_count integer;
begin
  if requested_client_key is null
    or requested_client_key !~ '^[0-9a-f]{64}$'
    or assistant_request_id is null
    or coalesce(message_characters, 0) not between 1 and 800 then
    raise exception 'Invalid storefront assistant reservation';
  end if;

  -- Serialize reservations so concurrent serverless instances cannot overspend
  -- either a per-client allowance or Hooma's global budget circuit breaker.
  perform pg_advisory_xact_lock(hashtextextended('hooma:storefront_assistant:global', 0));

  select count(*)::integer
  into global_hourly_count
  from public.audit_log
  where action = 'storefront_assistant_requested'
    and created_at >= now() - interval '1 hour';

  if global_hourly_count >= 300 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'global_hourly_limit',
      'retry_after_seconds', 3600
    );
  end if;

  select count(*)::integer
  into global_daily_count
  from public.audit_log
  where action = 'storefront_assistant_requested'
    and created_at >= now() - interval '24 hours';

  if global_daily_count >= 2000 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'global_daily_limit',
      'retry_after_seconds', 21600
    );
  end if;

  select count(*)::integer
  into client_ten_minute_count
  from public.audit_log
  where action = 'storefront_assistant_requested'
    and created_at >= now() - interval '10 minutes'
    and metadata ->> 'client_key' = requested_client_key;

  if client_ten_minute_count >= 15 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'client_ten_minute_limit',
      'retry_after_seconds', 600
    );
  end if;

  select count(*)::integer
  into client_daily_count
  from public.audit_log
  where action = 'storefront_assistant_requested'
    and created_at >= now() - interval '24 hours'
    and metadata ->> 'client_key' = requested_client_key;

  if client_daily_count >= 60 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'client_daily_limit',
      'retry_after_seconds', 21600
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null,
    'storefront_assistant_requested',
    'storefront_assistant',
    assistant_request_id::text,
    jsonb_build_object(
      'client_key', requested_client_key,
      'message_characters', message_characters
    )
  );

  return jsonb_build_object(
    'allowed', true,
    'reason', 'reserved',
    'client_requests_in_ten_minutes', client_ten_minute_count + 1,
    'client_requests_in_day', client_daily_count + 1,
    'global_requests_in_hour', global_hourly_count + 1,
    'global_requests_in_day', global_daily_count + 1
  );
end;
$$;

revoke all on function public.reserve_storefront_assistant_request(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_storefront_assistant_request(text, uuid, integer)
  to service_role;
