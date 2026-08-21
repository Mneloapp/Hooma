-- Crash-safe TikTok Accounts API publish lifecycle plus immutable T+2/24/72h
-- metrics. First publish dispatch is authorized exactly once; ambiguous intent
-- is never auto-replayed.

begin;

create table if not exists public.social_tiktok_publish_lifecycles (
  job_id uuid primary key references public.social_publish_jobs(id) on delete restrict,
  publish_operation_id uuid not null default extensions.gen_random_uuid(),
  publish_idempotency_key text not null unique
    check (char_length(trim(publish_idempotency_key)) between 16 and 300),
  publish_request_sha256 text not null check (publish_request_sha256 ~ '^[a-f0-9]{64}$'),
  phase text not null check (phase in (
    'PUBLISH_INTENT_RECORDED', 'PROCESSING_REMOTE', 'PUBLISHED', 'FAILED'
  )),
  provider_publish_id text,
  provider_request_id text,
  provider_response_sha256 text
    check (provider_response_sha256 is null or provider_response_sha256 ~ '^[a-f0-9]{64}$'),
  provider_status text,
  provider_post_id text,
  provider_url text,
  failure_reason text,
  poll_count integer not null default 0 check (poll_count between 0 and 100),
  next_poll_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9_.:~-]{1,120}$'),
  check (provider_publish_id is null or provider_publish_id ~ '^[A-Za-z0-9._:~-]{1,256}$'),
  check (provider_post_id is null or provider_post_id ~ '^[1-9][0-9]{7,39}$'),
  check (provider_url is null or provider_url ~ '^https://(www\.)?tiktok\.com/'),
  check (failure_reason is null or failure_reason ~ '^[A-Za-z0-9_.:~-]{1,120}$'),
  check (
    (phase = 'PUBLISH_INTENT_RECORDED'
      and provider_publish_id is null and provider_post_id is null and next_poll_at is null)
    or (phase = 'PROCESSING_REMOTE'
      and provider_publish_id is not null and provider_post_id is null and next_poll_at is not null)
    or (phase = 'PUBLISHED'
      and provider_publish_id is not null and provider_post_id is not null
      and provider_url is not null and next_poll_at is null)
    or (phase = 'FAILED'
      and provider_publish_id is not null and failure_reason is not null and next_poll_at is null)
  )
);

alter table public.social_tiktok_publish_lifecycles enable row level security;
revoke all on table public.social_tiktok_publish_lifecycles
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.social_tiktok_publish_lifecycles
  to service_role;

create or replace function public.social_tiktok_lifecycle_response(
  lifecycle public.social_tiktok_publish_lifecycles,
  dispatch_allowed boolean
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', lifecycle.job_id,
    'phase', lifecycle.phase,
    'publish_operation_id', lifecycle.publish_operation_id,
    'publish_request_sha256', lifecycle.publish_request_sha256,
    'provider_publish_id', lifecycle.provider_publish_id,
    'provider_request_id', lifecycle.provider_request_id,
    'provider_response_sha256', lifecycle.provider_response_sha256,
    'provider_status', lifecycle.provider_status,
    'provider_post_id', lifecycle.provider_post_id,
    'provider_url', lifecycle.provider_url,
    'failure_reason', lifecycle.failure_reason,
    'poll_count', lifecycle.poll_count,
    'next_poll_at', lifecycle.next_poll_at,
    'dispatch_allowed', dispatch_allowed
  );
$$;

create or replace function public.begin_tiktok_publish_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_event_idempotency_key text,
  requested_receipt_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  replay_receipt public.social_publish_receipts%rowtype;
  expected_payload jsonb;
begin
  if requested_request_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(trim(requested_idempotency_key)) not between 16 and 300
    or char_length(trim(requested_event_idempotency_key)) not between 16 and 300
    or jsonb_typeof(requested_receipt_payload) <> 'object'
    or public.social_json_is_redacted(requested_receipt_payload) is not true
  then raise exception 'TIKTOK_PUBLISH_INTENT_INVALID'; end if;
  expected_payload := requested_receipt_payload || jsonb_build_object(
    'provider', 'tiktok',
    'publish_request_sha256', requested_request_sha256
  );

  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> 'tiktok'
  then raise exception 'TIKTOK_JOB_NOT_FOUND'; end if;

  select * into lifecycle from public.social_tiktok_publish_lifecycles
  where job_id = selected_job.id for update;
  if lifecycle.job_id is not null then
    select * into replay_receipt from public.social_publish_receipts
    where event_idempotency_key = requested_event_idempotency_key;
    if lifecycle.publish_idempotency_key = requested_idempotency_key
      and lifecycle.publish_request_sha256 = requested_request_sha256
      and replay_receipt.job_id = selected_job.id
      and replay_receipt.event_type = 'PUBLISH_REQUESTED'
      and replay_receipt.payload = expected_payload
    then return public.social_tiktok_lifecycle_response(lifecycle, false); end if;
    raise exception 'TIKTOK_PUBLISH_INTENT_CONFLICT';
  end if;

  if selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or selected_job.claim_expires_at <= now()
    or selected_job.scheduled_at > now()
    or selected_job.publish_not_after < now()
    or selected_job.publishing_allowed is not true
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> selected_job.content_fingerprint
    or selected_job.rights_status <> 'CLEARED'
    or selected_job.visual_claims_status <> 'CLEARED'
    or selected_job.remote_duplicate_status <> 'CLEAR'
    or selected_job.remote_duplicate_receipt_sha256 is null
    or selected_job.provider_post_id is not null
    or public.social_music_receipt_is_valid(
      selected_job.music_receipt, 'tiktok', selected_job.music_mode, selected_job.video_sha256
    ) is not true
    or not exists (
      select 1 from public.products product
      where product.id = selected_job.product_id and product.status = 'active'
    )
    or not exists (
      select 1 from public.social_connections connection
      where connection.provider = 'tiktok'
        and connection.external_account_id = selected_job.account_id
        and connection.status = 'active'
        and connection.access_expires_at > now() + interval '5 minutes'
    )
  then raise exception 'TIKTOK_PUBLISH_DISPATCH_NOT_AUTHORIZED'; end if;

  insert into public.social_tiktok_publish_lifecycles (
    job_id, publish_idempotency_key, publish_request_sha256, phase
  ) values (
    selected_job.id, requested_idempotency_key, requested_request_sha256,
    'PUBLISH_INTENT_RECORDED'
  ) returning * into lifecycle;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key, payload
  ) values (
    selected_job.id, selected_job.attempts, 'PUBLISH_REQUESTED',
    requested_event_idempotency_key, expected_payload
  );
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'TIKTOK_PUBLISH_INTENT_RECORDED',
    'tiktok-publish-intent-audit:' || lifecycle.publish_operation_id::text,
    'SERVICE', jsonb_build_object(
      'publish_operation_id', lifecycle.publish_operation_id,
      'publish_request_sha256', requested_request_sha256
    )
  );
  return public.social_tiktok_lifecycle_response(lifecycle, true);
end;
$$;

create or replace function public.record_tiktok_publish_accepted_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_provider_publish_id text,
  requested_provider_request_id text,
  requested_provider_response_sha256 text,
  requested_event_idempotency_key text,
  requested_event_payload jsonb,
  requested_next_poll_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  replay_event public.social_publish_audit_events%rowtype;
  expected_event jsonb;
begin
  if requested_provider_publish_id !~ '^[A-Za-z0-9._:~-]{1,256}$'
    or requested_provider_response_sha256 !~ '^[a-f0-9]{64}$'
    or (requested_provider_request_id is not null
      and requested_provider_request_id !~ '^[A-Za-z0-9_.:~-]{1,120}$')
    or char_length(trim(requested_event_idempotency_key)) not between 16 and 300
    or requested_next_poll_at <= now()
    or requested_next_poll_at > now() + interval '10 minutes'
    or jsonb_typeof(requested_event_payload) <> 'object'
    or public.social_json_is_redacted(requested_event_payload) is not true
  then raise exception 'TIKTOK_PUBLISH_ACCEPTED_INVALID'; end if;
  expected_event := requested_event_payload || jsonb_build_object(
    'provider_publish_id', requested_provider_publish_id,
    'provider_request_id', requested_provider_request_id,
    'provider_response_sha256', requested_provider_response_sha256,
    'next_poll_at', requested_next_poll_at
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  select * into lifecycle from public.social_tiktok_publish_lifecycles
  where job_id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> 'tiktok'
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or lifecycle.publish_operation_id is distinct from requested_operation_id
  then raise exception 'TIKTOK_PUBLISH_ACCEPTED_NOT_AUTHORIZED'; end if;
  if lifecycle.phase <> 'PUBLISH_INTENT_RECORDED' then
    select * into replay_event from public.social_publish_audit_events
    where event_idempotency_key = requested_event_idempotency_key;
    if lifecycle.provider_publish_id = requested_provider_publish_id
      and lifecycle.provider_request_id is not distinct from requested_provider_request_id
      and lifecycle.provider_response_sha256 = requested_provider_response_sha256
      and replay_event.job_id = requested_job_id
      and replay_event.event_type = 'TIKTOK_PUBLISH_ACCEPTED'
      and replay_event.event_data = expected_event
    then return public.social_tiktok_lifecycle_response(lifecycle, false); end if;
    raise exception 'TIKTOK_PUBLISH_ACCEPTED_CONFLICT';
  end if;
  update public.social_tiktok_publish_lifecycles set
    phase = 'PROCESSING_REMOTE',
    provider_publish_id = requested_provider_publish_id,
    provider_request_id = requested_provider_request_id,
    provider_response_sha256 = requested_provider_response_sha256,
    provider_status = 'PROCESSING_REMOTE',
    next_poll_at = requested_next_poll_at,
    updated_at = clock_timestamp()
  where job_id = requested_job_id returning * into lifecycle;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    requested_job_id, 'TIKTOK_PUBLISH_ACCEPTED', requested_event_idempotency_key,
    'PROVIDER', expected_event
  );
  return public.social_tiktok_lifecycle_response(lifecycle, false);
end;
$$;

create or replace function public.record_tiktok_publish_status_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_status text,
  requested_provider_request_id text,
  requested_provider_response_sha256 text,
  requested_provider_post_id text,
  requested_provider_url text,
  requested_failure_reason text,
  requested_event_idempotency_key text,
  requested_event_payload jsonb,
  requested_next_poll_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  replay_event public.social_publish_audit_events%rowtype;
  expected_event jsonb;
begin
  if requested_status not in ('PROCESSING_REMOTE', 'PUBLISHED', 'FAILED')
    or requested_provider_response_sha256 !~ '^[a-f0-9]{64}$'
    or (requested_provider_request_id is not null
      and requested_provider_request_id !~ '^[A-Za-z0-9_.:~-]{1,120}$')
    or (requested_status = 'PROCESSING_REMOTE' and (
      requested_next_poll_at is null or requested_next_poll_at <= now()
      or requested_next_poll_at > now() + interval '10 minutes'
    ))
    or (requested_status <> 'PROCESSING_REMOTE' and requested_next_poll_at is not null)
    or (requested_status = 'PUBLISHED' and (
      requested_provider_post_id !~ '^[1-9][0-9]{7,39}$'
      or requested_provider_url !~ '^https://(www\.)?tiktok\.com/'
      or requested_failure_reason is not null
    ))
    or (requested_status = 'FAILED' and (
      requested_failure_reason !~ '^[A-Za-z0-9_.:~-]{1,120}$'
      or requested_provider_post_id is not null or requested_provider_url is not null
    ))
    or jsonb_typeof(requested_event_payload) <> 'object'
    or public.social_json_is_redacted(requested_event_payload) is not true
  then raise exception 'TIKTOK_PUBLISH_STATUS_INVALID'; end if;
  expected_event := requested_event_payload || jsonb_build_object(
    'provider_status', requested_status,
    'provider_request_id', requested_provider_request_id,
    'provider_response_sha256', requested_provider_response_sha256,
    'provider_post_id', requested_provider_post_id,
    'provider_url', requested_provider_url,
    'failure_reason', requested_failure_reason,
    'next_poll_at', requested_next_poll_at
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  select * into lifecycle from public.social_tiktok_publish_lifecycles
  where job_id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> 'tiktok'
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or lifecycle.publish_operation_id is distinct from requested_operation_id
  then raise exception 'TIKTOK_PUBLISH_STATUS_NOT_AUTHORIZED'; end if;
  select * into replay_event from public.social_publish_audit_events
  where event_idempotency_key = requested_event_idempotency_key;
  if replay_event.id is not null then
    if replay_event.job_id = requested_job_id
      and replay_event.event_type = 'TIKTOK_PUBLISH_STATUS'
      and replay_event.event_data = expected_event
    then return public.social_tiktok_lifecycle_response(lifecycle, false); end if;
    raise exception 'TIKTOK_PUBLISH_STATUS_CONFLICT';
  end if;
  if lifecycle.phase <> 'PROCESSING_REMOTE'
  then raise exception 'TIKTOK_PUBLISH_STATUS_CONFLICT'; end if;
  update public.social_tiktok_publish_lifecycles set
    phase = case requested_status
      when 'PUBLISHED' then 'PUBLISHED'
      when 'FAILED' then 'FAILED'
      else 'PROCESSING_REMOTE'
    end,
    provider_request_id = coalesce(requested_provider_request_id, provider_request_id),
    provider_response_sha256 = requested_provider_response_sha256,
    provider_status = requested_status,
    provider_post_id = requested_provider_post_id,
    provider_url = requested_provider_url,
    failure_reason = requested_failure_reason,
    poll_count = poll_count + 1,
    next_poll_at = requested_next_poll_at,
    updated_at = clock_timestamp()
  where job_id = requested_job_id returning * into lifecycle;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    requested_job_id, 'TIKTOK_PUBLISH_STATUS', requested_event_idempotency_key,
    'PROVIDER', expected_event
  );
  return public.social_tiktok_lifecycle_response(lifecycle, false);
end;
$$;

create or replace function public.claim_due_tiktok_publish_work_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  new_claim_id uuid := extensions.gen_random_uuid();
begin
  select job.* into selected_job
  from public.social_publish_jobs job
  join public.social_tiktok_publish_lifecycles lifecycle on lifecycle.job_id = job.id
  where job.provider = 'tiktok' and job.state = 'publishing'
    and job.provider_post_id is null
    and (job.claim_expires_at is null or job.claim_expires_at <= now())
    and (
      (lifecycle.phase = 'PROCESSING_REMOTE' and lifecycle.next_poll_at <= now())
      or (lifecycle.phase = 'PUBLISH_INTENT_RECORDED'
        and lifecycle.updated_at <= now() - interval '30 seconds')
      or lifecycle.phase in ('PUBLISHED', 'FAILED')
    )
  order by coalesce(lifecycle.next_poll_at, lifecycle.updated_at), job.id
  limit 1 for update of job skip locked;
  if selected_job.id is null then return null; end if;
  select * into lifecycle from public.social_tiktok_publish_lifecycles
  where job_id = selected_job.id for update;
  update public.social_publish_jobs set
    claim_id = new_claim_id,
    claimed_at = clock_timestamp(),
    claim_expires_at = now() + interval '5 minutes'
  where id = selected_job.id returning * into selected_job;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'CLAIMED', 'tiktok-resume-claim:' || new_claim_id::text,
    'SERVICE', jsonb_build_object(
      'claim_id', new_claim_id,
      'claim_expires_at', selected_job.claim_expires_at,
      'lifecycle_phase', lifecycle.phase
    )
  );
  return to_jsonb(selected_job) || jsonb_build_object(
    'tiktok_lifecycle', public.social_tiktok_lifecycle_response(lifecycle, false)
  );
end;
$$;

create or replace function public.claim_due_tiktok_analytics_v1()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', job.id, 'account_id', job.account_id,
    'post_id', job.provider_post_id, 'horizon', horizon.name
  )
  from public.social_publish_jobs job
  cross join lateral (values
    ('T2H'::text, interval '2 hours', 1),
    ('T24H'::text, interval '24 hours', 2),
    ('T72H'::text, interval '72 hours', 3)
  ) as horizon(name, delay, priority)
  where job.provider = 'tiktok' and job.state = 'published'
    and job.provider_post_id is not null
    and job.updated_at + horizon.delay <= now()
    and not exists (
      select 1 from public.social_publish_receipts receipt
      where receipt.event_idempotency_key =
        'tiktok-analytics:' || job.id::text || ':' || lower(horizon.name)
    )
  order by job.updated_at + horizon.delay, horizon.priority, job.id
  limit 1;
$$;

create or replace function public.record_tiktok_analytics_snapshot_v1(
  requested_job_id uuid,
  requested_post_id text,
  requested_horizon text,
  requested_captured_at timestamptz,
  requested_metrics jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  expected_delay interval;
  event_key text;
  payload jsonb;
  replay_receipt public.social_publish_receipts%rowtype;
  expected_keys text[] := array[
    'views', 'likes', 'comments', 'shares', 'favorites', 'reach',
    'total_time_watched', 'average_time_watched', 'full_video_watched_rate',
    'new_followers', 'profile_views', 'website_clicks'
  ];
begin
  expected_delay := case requested_horizon
    when 'T2H' then interval '2 hours'
    when 'T24H' then interval '24 hours'
    when 'T72H' then interval '72 hours'
    else null end;
  if expected_delay is null
    or requested_post_id !~ '^[1-9][0-9]{7,39}$'
    or requested_captured_at < now() - interval '10 minutes'
    or requested_captured_at > now() + interval '1 minute'
    or jsonb_typeof(requested_metrics) <> 'object'
    or not (requested_metrics ?& expected_keys)
    or (select count(*) from jsonb_object_keys(requested_metrics)) <> array_length(expected_keys, 1)
    or exists (
      select 1 from jsonb_each(requested_metrics) metric
      where jsonb_typeof(metric.value) not in ('null', 'number')
        or (jsonb_typeof(metric.value) = 'number' and (metric.value #>> '{}')::numeric < 0)
    )
    or (requested_metrics ->> 'full_video_watched_rate')::numeric > 1
  then raise exception 'TIKTOK_ANALYTICS_SNAPSHOT_INVALID'; end if;
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id;
  if selected_job.id is null or selected_job.provider <> 'tiktok'
    or selected_job.state <> 'published'
    or selected_job.provider_post_id is distinct from requested_post_id
    or selected_job.updated_at + expected_delay > requested_captured_at
  then raise exception 'TIKTOK_ANALYTICS_SNAPSHOT_NOT_AUTHORIZED'; end if;
  event_key := 'tiktok-analytics:' || selected_job.id::text || ':' || lower(requested_horizon);
  payload := jsonb_build_object(
    'schema', 'tiktok-insights-snapshot-v1',
    'horizon', requested_horizon,
    'captured_at', requested_captured_at,
    'post_id', requested_post_id,
    'metrics', requested_metrics
  );
  if public.social_json_is_redacted(payload) is not true
  then raise exception 'TIKTOK_ANALYTICS_SNAPSHOT_INVALID'; end if;
  select * into replay_receipt from public.social_publish_receipts
  where event_idempotency_key = event_key;
  if replay_receipt.id is not null then
    if replay_receipt.job_id = selected_job.id
      and replay_receipt.event_type = 'ANALYTICS_SNAPSHOT'
      and replay_receipt.provider_post_id is not distinct from requested_post_id
      and replay_receipt.payload = payload
    then return true; end if;
    raise exception 'TIKTOK_ANALYTICS_SNAPSHOT_CONFLICT';
  end if;
  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key,
    provider_post_id, payload
  ) values (
    selected_job.id, selected_job.attempts, 'ANALYTICS_SNAPSHOT', event_key,
    requested_post_id, payload
  );
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'ANALYTICS_SNAPSHOT',
    'tiktok-analytics-audit:' || selected_job.id::text || ':' || lower(requested_horizon),
    'PROVIDER', jsonb_build_object(
      'horizon', requested_horizon,
      'captured_at', requested_captured_at,
      'post_id', requested_post_id
    )
  );
  return true;
end;
$$;

revoke all on function public.social_tiktok_lifecycle_response(
  public.social_tiktok_publish_lifecycles, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.begin_tiktok_publish_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.record_tiktok_publish_accepted_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.record_tiktok_publish_status_v1(
  uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_tiktok_publish_work_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_due_tiktok_analytics_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.record_tiktok_analytics_snapshot_v1(
  uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.begin_tiktok_publish_v1(
  uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.record_tiktok_publish_accepted_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.record_tiktok_publish_status_v1(
  uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.claim_due_tiktok_publish_work_v1() to service_role;
grant execute on function public.claim_due_tiktok_analytics_v1() to service_role;
grant execute on function public.record_tiktok_analytics_snapshot_v1(
  uuid, text, text, timestamptz, jsonb
) to service_role;

comment on table public.social_tiktok_publish_lifecycles is
  'Immutable-bound TikTok Accounts API publish intent, accepted share ID, status and final outcome.';

commit;
