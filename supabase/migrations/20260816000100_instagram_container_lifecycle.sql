-- Crash-safe Instagram content-container lifecycle.
--
-- This migration is deliberately database-only. It does not enable publishing,
-- wire a provider adapter, or change the existing social job `published`
-- transition. A future worker must still use the existing completion RPC after
-- it has independently reconciled a confirmed Instagram media_publish result.

begin;

-- Dedicated receipt kinds make the two remote side-effect boundaries visible
-- in the existing immutable, hash-chained social receipt ledger.
alter table public.social_publish_receipts
  drop constraint if exists social_publish_receipts_event_type_check;

alter table public.social_publish_receipts
  add constraint social_publish_receipts_event_type_check check (
    event_type in (
      'PREFLIGHT_PASSED', 'PUBLISH_REQUESTED', 'PUBLISH_SUCCEEDED',
      'PUBLISH_FAILED', 'REMOTE_RESULT_UNCERTAIN', 'REMOTE_VERIFIED',
      'REMOTE_DUPLICATE_FOUND', 'CANCELLED', 'ANALYTICS_SNAPSHOT',
      'INSTAGRAM_CONTAINER_CREATE_INTENT', 'INSTAGRAM_CONTAINER_CREATED',
      'INSTAGRAM_CONTAINER_STATUS', 'INSTAGRAM_MEDIA_PUBLISH_INTENT',
      'INSTAGRAM_MEDIA_PUBLISH_RESULT'
    )
  );

create table public.social_instagram_publish_lifecycles (
  job_id uuid primary key
    references public.social_publish_jobs(id) on delete restrict,
  phase text not null default 'CREATE_INTENT_RECORDED' check (
    phase in (
      'CREATE_INTENT_RECORDED',
      'CONTAINER_PROCESSING',
      'CONTAINER_READY',
      'CONTAINER_FAILED',
      'MEDIA_PUBLISH_INTENT_RECORDED',
      'MEDIA_PUBLISH_OUTCOME_UNKNOWN',
      'MEDIA_PUBLISH_CONFIRMED',
      'MEDIA_PUBLISH_REJECTED'
    )
  ),
  container_create_operation_id uuid not null
    default extensions.gen_random_uuid(),
  container_create_idempotency_key text not null unique check (
    char_length(container_create_idempotency_key) between 16 and 300
    and container_create_idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  container_create_request_sha256 text not null
    check (container_create_request_sha256 ~ '^[a-f0-9]{64}$'),
  container_create_intent_at timestamptz not null default clock_timestamp(),
  provider_container_id text unique
    check (provider_container_id is null or provider_container_id ~ '^[1-9][0-9]{0,255}$'),
  provider_container_status text check (
    provider_container_status is null
    or provider_container_status in ('IN_PROGRESS', 'FINISHED', 'ERROR', 'EXPIRED')
  ),
  provider_container_request_id text check (
    provider_container_request_id is null
    or (
      char_length(provider_container_request_id) between 1 and 240
      and provider_container_request_id ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  container_recorded_at timestamptz,
  last_polled_at timestamptz,
  next_poll_at timestamptz,
  poll_count integer not null default 0 check (poll_count between 0 and 1000),
  media_publish_operation_id uuid unique,
  media_publish_idempotency_key text unique check (
    media_publish_idempotency_key is null
    or (
      char_length(media_publish_idempotency_key) between 16 and 300
      and media_publish_idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  media_publish_request_sha256 text
    check (media_publish_request_sha256 is null or media_publish_request_sha256 ~ '^[a-f0-9]{64}$'),
  media_publish_intent_at timestamptz,
  media_publish_outcome text check (
    media_publish_outcome is null
    or media_publish_outcome in ('CONFIRMED', 'UNKNOWN', 'REJECTED_NO_SIDE_EFFECT')
  ),
  media_publish_outcome_at timestamptz,
  provider_publish_request_id text check (
    provider_publish_request_id is null
    or (
      char_length(provider_publish_request_id) between 1 and 240
      and provider_publish_request_id ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  provider_post_id text unique
    check (provider_post_id is null or provider_post_id ~ '^[1-9][0-9]{0,255}$'),
  provider_permalink text check (
    provider_permalink is null
    or provider_permalink ~ '^https://(www\.)?instagram\.com/'
  ),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'
  ),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (provider_container_id is null
      and provider_container_status is null
      and container_recorded_at is null)
    or
    (provider_container_id is not null
      and provider_container_status is not null
      and container_recorded_at is not null)
  ),
  check (
    phase <> 'CREATE_INTENT_RECORDED'
    or provider_container_id is null
  ),
  check (
    phase not in (
      'CONTAINER_PROCESSING', 'CONTAINER_READY', 'CONTAINER_FAILED',
      'MEDIA_PUBLISH_INTENT_RECORDED', 'MEDIA_PUBLISH_OUTCOME_UNKNOWN',
      'MEDIA_PUBLISH_CONFIRMED', 'MEDIA_PUBLISH_REJECTED'
    )
    or provider_container_id is not null
  ),
  check (
    phase not in (
      'CONTAINER_READY', 'MEDIA_PUBLISH_INTENT_RECORDED',
      'MEDIA_PUBLISH_OUTCOME_UNKNOWN', 'MEDIA_PUBLISH_CONFIRMED',
      'MEDIA_PUBLISH_REJECTED'
    )
    or provider_container_status = 'FINISHED'
  ),
  check (
    phase <> 'CONTAINER_PROCESSING'
    or (provider_container_status = 'IN_PROGRESS' and next_poll_at is not null)
  ),
  check (
    phase = 'CONTAINER_PROCESSING'
    or next_poll_at is null
  ),
  check (
    (media_publish_operation_id is null
      and media_publish_idempotency_key is null
      and media_publish_request_sha256 is null
      and media_publish_intent_at is null)
    or
    (media_publish_operation_id is not null
      and media_publish_idempotency_key is not null
      and media_publish_request_sha256 is not null
      and media_publish_intent_at is not null)
  ),
  check (
    phase not in (
      'MEDIA_PUBLISH_INTENT_RECORDED', 'MEDIA_PUBLISH_OUTCOME_UNKNOWN',
      'MEDIA_PUBLISH_CONFIRMED', 'MEDIA_PUBLISH_REJECTED'
    )
    or media_publish_operation_id is not null
  ),
  check (
    (phase = 'MEDIA_PUBLISH_INTENT_RECORDED'
      and media_publish_outcome is null
      and media_publish_outcome_at is null
      and provider_post_id is null
      and provider_permalink is null)
    or phase <> 'MEDIA_PUBLISH_INTENT_RECORDED'
  ),
  check (
    (phase = 'MEDIA_PUBLISH_OUTCOME_UNKNOWN'
      and media_publish_outcome = 'UNKNOWN'
      and media_publish_outcome_at is not null
      and provider_post_id is null
      and provider_permalink is null)
    or phase <> 'MEDIA_PUBLISH_OUTCOME_UNKNOWN'
  ),
  check (
    (phase = 'MEDIA_PUBLISH_CONFIRMED'
      and media_publish_outcome = 'CONFIRMED'
      and media_publish_outcome_at is not null
      and provider_post_id is not null
      and provider_permalink is not null)
    or phase <> 'MEDIA_PUBLISH_CONFIRMED'
  ),
  check (
    (phase = 'MEDIA_PUBLISH_REJECTED'
      and media_publish_outcome = 'REJECTED_NO_SIDE_EFFECT'
      and media_publish_outcome_at is not null
      and provider_post_id is null
      and provider_permalink is null)
    or phase <> 'MEDIA_PUBLISH_REJECTED'
  )
);

create index idx_social_instagram_lifecycles_resume
  on public.social_instagram_publish_lifecycles(phase, next_poll_at, updated_at);

create or replace function public.social_instagram_resume_action(requested_phase text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case requested_phase
    when 'CREATE_INTENT_RECORDED' then 'RECONCILE_CONTAINER_CREATE'
    when 'CONTAINER_PROCESSING' then 'POLL_CONTAINER'
    when 'CONTAINER_READY' then 'BEGIN_MEDIA_PUBLISH'
    when 'CONTAINER_FAILED' then 'STOP_CONTAINER_FAILED'
    when 'MEDIA_PUBLISH_INTENT_RECORDED' then 'RECONCILE_MEDIA_PUBLISH'
    when 'MEDIA_PUBLISH_OUTCOME_UNKNOWN' then 'RECONCILE_MEDIA_PUBLISH'
    when 'MEDIA_PUBLISH_CONFIRMED' then 'COMPLETE_EXISTING_SOCIAL_JOB'
    when 'MEDIA_PUBLISH_REJECTED' then 'FAIL_WITHOUT_REMOTE_SIDE_EFFECT'
    else 'STOP_INVALID_STATE'
  end;
$$;

create or replace function public.social_instagram_lifecycle_response(
  lifecycle public.social_instagram_publish_lifecycles,
  dispatch_allowed boolean
)
returns jsonb
language sql
stable
strict
set search_path = public, pg_temp
as $$
  select to_jsonb(lifecycle) || jsonb_build_object(
    'dispatch_allowed', dispatch_allowed,
    'resume_action', public.social_instagram_resume_action(lifecycle.phase)
  );
$$;

create or replace function public.social_guard_instagram_publish_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'INSTAGRAM_PUBLISH_LIFECYCLE_MAY_NOT_BE_DELETED';
  end if;

  if old.job_id is distinct from new.job_id
    or old.container_create_operation_id is distinct from new.container_create_operation_id
    or old.container_create_idempotency_key is distinct from new.container_create_idempotency_key
    or old.container_create_request_sha256 is distinct from new.container_create_request_sha256
    or old.container_create_intent_at is distinct from new.container_create_intent_at
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATE_IDENTITY_IS_IMMUTABLE';
  end if;

  if old.provider_container_id is not null
    and old.provider_container_id is distinct from new.provider_container_id
  then
    raise exception 'INSTAGRAM_PROVIDER_CONTAINER_ID_IS_IMMUTABLE';
  end if;

  if old.provider_container_request_id is not null
    and old.provider_container_request_id
      is distinct from new.provider_container_request_id
  then
    raise exception 'INSTAGRAM_PROVIDER_CONTAINER_REQUEST_ID_IS_IMMUTABLE';
  end if;

  if old.container_recorded_at is not null
    and old.container_recorded_at is distinct from new.container_recorded_at
  then
    raise exception 'INSTAGRAM_CONTAINER_RECORDED_AT_IS_IMMUTABLE';
  end if;

  if old.provider_container_status in ('FINISHED', 'ERROR', 'EXPIRED')
    and old.provider_container_status is distinct from new.provider_container_status
  then
    raise exception 'INSTAGRAM_PROVIDER_CONTAINER_STATUS_IS_FINAL';
  end if;

  if old.media_publish_operation_id is not null
    and (
      old.media_publish_operation_id is distinct from new.media_publish_operation_id
      or old.media_publish_idempotency_key is distinct from new.media_publish_idempotency_key
      or old.media_publish_request_sha256 is distinct from new.media_publish_request_sha256
      or old.media_publish_intent_at is distinct from new.media_publish_intent_at
    )
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_IDENTITY_IS_IMMUTABLE';
  end if;

  if old.media_publish_outcome in ('CONFIRMED', 'REJECTED_NO_SIDE_EFFECT')
    and (
      old.media_publish_outcome is distinct from new.media_publish_outcome
      or old.provider_post_id is distinct from new.provider_post_id
      or old.provider_permalink is distinct from new.provider_permalink
    )
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_IS_FINAL';
  end if;

  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger social_guard_instagram_publish_lifecycle
before update or delete on public.social_instagram_publish_lifecycles
for each row execute function public.social_guard_instagram_publish_lifecycle();

-- Records the create-container intent before the worker crosses the first
-- remote boundary. Only the first exact call may dispatch. A replay is a
-- resume/reconciliation request and must never blindly create a second
-- container, because Instagram does not provide a transactional handshake
-- with this database.
create or replace function public.begin_instagram_container_create_v1(
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
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
begin
  if coalesce(
      char_length(requested_idempotency_key) between 16 and 300
      and requested_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(requested_request_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(
      char_length(requested_event_idempotency_key) between 16 and 300
      and requested_event_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(jsonb_typeof(requested_receipt_payload) = 'object', false) is not true
    or public.social_json_is_redacted(requested_receipt_payload) is not true
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATE_INTENT_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where id = requested_job_id
  for update;

  if selected_job.id is null then
    raise exception 'SOCIAL_JOB_NOT_FOUND';
  end if;
  if selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.publishing_allowed is not true
    or selected_job.claim_id is distinct from requested_claim_id
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> selected_job.content_fingerprint
    or selected_job.remote_duplicate_status <> 'CLEAR'
    or not exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.job_id = selected_job.id
        and receipt.attempt_number = selected_job.attempts
        and receipt.event_type = 'PREFLIGHT_PASSED'
    )
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATE_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  if selected_lifecycle.job_id is not null then
    if selected_lifecycle.container_create_idempotency_key
        is distinct from requested_idempotency_key
      or selected_lifecycle.container_create_request_sha256
        is distinct from requested_request_sha256
    then
      raise exception 'INSTAGRAM_CONTAINER_CREATE_IDEMPOTENCY_CONFLICT';
    end if;

    return public.social_instagram_lifecycle_response(selected_lifecycle, false);
  end if;

  if exists (
    select 1
    from public.social_publish_receipts receipt
    where receipt.event_idempotency_key = requested_event_idempotency_key
  ) then
    raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT';
  end if;

  insert into public.social_instagram_publish_lifecycles (
    job_id,
    container_create_idempotency_key,
    container_create_request_sha256
  ) values (
    selected_job.id,
    requested_idempotency_key,
    requested_request_sha256
  )
  returning * into selected_lifecycle;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'INSTAGRAM_CONTAINER_CREATE_INTENT',
    requested_event_idempotency_key,
    requested_receipt_payload || jsonb_build_object(
      'stage', 'container_create',
      'operation_id', selected_lifecycle.container_create_operation_id,
      'request_sha256', requested_request_sha256,
      'dispatch_allowed', true
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'INSTAGRAM_CONTAINER_CREATE_INTENT',
    'instagram-audit:' || encode(
      extensions.digest(convert_to(requested_event_idempotency_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    'SERVICE',
    jsonb_build_object(
      'operation_id', selected_lifecycle.container_create_operation_id,
      'request_sha256', requested_request_sha256,
      'phase', selected_lifecycle.phase
    )
  );

  return public.social_instagram_lifecycle_response(selected_lifecycle, true);
end;
$$;

-- Read-only resume decision for a worker restart. It does not extend a claim
-- and never grants permission to dispatch a remote side effect.
create or replace function public.get_instagram_publish_resume_v1(
  requested_job_id uuid,
  requested_claim_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
begin
  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
  then
    raise exception 'INSTAGRAM_LIFECYCLE_RESUME_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id;

  if selected_lifecycle.job_id is null then
    return jsonb_build_object(
      'job_id', selected_job.id,
      'dispatch_allowed', false,
      'resume_action', 'BEGIN_CONTAINER_CREATE'
    );
  end if;

  return public.social_instagram_lifecycle_response(selected_lifecycle, false);
end;
$$;

-- Persists the provider container ID and initial status atomically with its
-- immutable receipt/audit evidence. This is the first database call after a
-- successful create-container HTTP response.
create or replace function public.record_instagram_container_created_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_provider_container_id text,
  requested_provider_status text,
  requested_provider_request_id text,
  requested_event_idempotency_key text,
  requested_receipt_payload jsonb,
  requested_next_poll_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
  next_phase text;
  replay_job_id uuid;
  replay_event_type text;
begin
  if coalesce(
      requested_provider_container_id ~ '^[1-9][0-9]{0,255}$',
      false
    ) is not true
    or coalesce(
      requested_provider_status in ('IN_PROGRESS', 'FINISHED', 'ERROR', 'EXPIRED'),
      false
    ) is not true
    or (
      requested_provider_request_id is not null
      and (
        char_length(requested_provider_request_id) not between 1 and 240
        or requested_provider_request_id !~ '^[A-Za-z0-9._:-]+$'
      )
    )
    or coalesce(
      char_length(requested_event_idempotency_key) between 16 and 300
      and requested_event_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(jsonb_typeof(requested_receipt_payload) = 'object', false) is not true
    or public.social_json_is_redacted(requested_receipt_payload) is not true
    or (
      requested_provider_status = 'IN_PROGRESS'
      and (
        requested_next_poll_at is null
        or requested_next_poll_at <= now()
        or requested_next_poll_at > now() + interval '24 hours'
      )
    )
    or (requested_provider_status <> 'IN_PROGRESS' and requested_next_poll_at is not null)
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATED_RESULT_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.publishing_allowed is not true
    or selected_job.claim_id is distinct from requested_claim_id
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATED_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  if selected_lifecycle.job_id is null
    or selected_lifecycle.container_create_operation_id
      is distinct from requested_operation_id
  then
    raise exception 'INSTAGRAM_CONTAINER_CREATE_OPERATION_MISMATCH';
  end if;

  if selected_lifecycle.provider_container_id is not null then
    if selected_lifecycle.provider_container_id
      is distinct from requested_provider_container_id
    then
      raise exception 'INSTAGRAM_PROVIDER_CONTAINER_CONFLICT';
    end if;
    return public.social_instagram_lifecycle_response(selected_lifecycle, false);
  end if;

  select receipt.job_id, receipt.event_type
  into replay_job_id, replay_event_type
  from public.social_publish_receipts receipt
  where receipt.event_idempotency_key = requested_event_idempotency_key;

  if replay_job_id is not null then
    raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT';
  end if;

  next_phase := case requested_provider_status
    when 'IN_PROGRESS' then 'CONTAINER_PROCESSING'
    when 'FINISHED' then 'CONTAINER_READY'
    else 'CONTAINER_FAILED'
  end;

  update public.social_instagram_publish_lifecycles lifecycle
  set provider_container_id = requested_provider_container_id,
      provider_container_status = requested_provider_status,
      provider_container_request_id = requested_provider_request_id,
      container_recorded_at = clock_timestamp(),
      next_poll_at = requested_next_poll_at,
      phase = next_phase,
      last_error_code = case requested_provider_status
        when 'ERROR' then 'INSTAGRAM_CONTAINER_ERROR'
        when 'EXPIRED' then 'INSTAGRAM_CONTAINER_EXPIRED'
        else null
      end
  where lifecycle.job_id = selected_job.id
  returning * into selected_lifecycle;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    provider_request_id,
    provider_publish_id,
    payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'INSTAGRAM_CONTAINER_CREATED',
    requested_event_idempotency_key,
    requested_provider_request_id,
    requested_provider_container_id,
    requested_receipt_payload || jsonb_build_object(
      'stage', 'container_create_result',
      'operation_id', selected_lifecycle.container_create_operation_id,
      'provider_container_id', requested_provider_container_id,
      'provider_container_status', requested_provider_status,
      'next_poll_at', requested_next_poll_at
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'INSTAGRAM_CONTAINER_CREATED',
    'instagram-audit:' || encode(
      extensions.digest(convert_to(requested_event_idempotency_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    'PROVIDER',
    jsonb_build_object(
      'operation_id', selected_lifecycle.container_create_operation_id,
      'provider_container_id', requested_provider_container_id,
      'provider_container_status', requested_provider_status,
      'phase', selected_lifecycle.phase
    )
  );

  return public.social_instagram_lifecycle_response(selected_lifecycle, false);
end;
$$;

-- Applies one idempotent provider-status observation. FINISHED and failure
-- states are monotonic; a later poll can never move the container backwards.
create or replace function public.record_instagram_container_status_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_provider_container_id text,
  requested_provider_status text,
  requested_provider_request_id text,
  requested_event_idempotency_key text,
  requested_receipt_payload jsonb,
  requested_next_poll_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
  next_phase text;
  replay_job_id uuid;
  replay_event_type text;
begin
  if coalesce(
      requested_provider_container_id ~ '^[1-9][0-9]{0,255}$',
      false
    ) is not true
    or coalesce(
      requested_provider_status in ('IN_PROGRESS', 'FINISHED', 'ERROR', 'EXPIRED'),
      false
    ) is not true
    or (
      requested_provider_request_id is not null
      and (
        char_length(requested_provider_request_id) not between 1 and 240
        or requested_provider_request_id !~ '^[A-Za-z0-9._:-]+$'
      )
    )
    or coalesce(
      char_length(requested_event_idempotency_key) between 16 and 300
      and requested_event_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(jsonb_typeof(requested_receipt_payload) = 'object', false) is not true
    or public.social_json_is_redacted(requested_receipt_payload) is not true
    or (
      requested_provider_status = 'IN_PROGRESS'
      and (
        requested_next_poll_at is null
        or requested_next_poll_at <= now()
        or requested_next_poll_at > now() + interval '24 hours'
      )
    )
    or (requested_provider_status <> 'IN_PROGRESS' and requested_next_poll_at is not null)
  then
    raise exception 'INSTAGRAM_CONTAINER_STATUS_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.publishing_allowed is not true
    or selected_job.claim_id is distinct from requested_claim_id
  then
    raise exception 'INSTAGRAM_CONTAINER_STATUS_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  if selected_lifecycle.job_id is null
    or selected_lifecycle.container_create_operation_id
      is distinct from requested_operation_id
    or selected_lifecycle.provider_container_id
      is distinct from requested_provider_container_id
  then
    raise exception 'INSTAGRAM_CONTAINER_STATUS_OPERATION_MISMATCH';
  end if;

  select receipt.job_id, receipt.event_type
  into replay_job_id, replay_event_type
  from public.social_publish_receipts receipt
  where receipt.event_idempotency_key = requested_event_idempotency_key;

  if replay_job_id is not null then
    if replay_job_id = selected_job.id
      and replay_event_type = 'INSTAGRAM_CONTAINER_STATUS'
    then
      return public.social_instagram_lifecycle_response(selected_lifecycle, false);
    end if;
    raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT';
  end if;

  if selected_lifecycle.phase <> 'CONTAINER_PROCESSING' then
    if selected_lifecycle.provider_container_status = requested_provider_status then
      return public.social_instagram_lifecycle_response(selected_lifecycle, false);
    end if;
    raise exception 'INSTAGRAM_CONTAINER_STATUS_IS_TERMINAL';
  end if;

  next_phase := case requested_provider_status
    when 'IN_PROGRESS' then 'CONTAINER_PROCESSING'
    when 'FINISHED' then 'CONTAINER_READY'
    else 'CONTAINER_FAILED'
  end;

  update public.social_instagram_publish_lifecycles lifecycle
  set provider_container_status = requested_provider_status,
      last_polled_at = clock_timestamp(),
      next_poll_at = requested_next_poll_at,
      poll_count = lifecycle.poll_count + 1,
      phase = next_phase,
      last_error_code = case requested_provider_status
        when 'ERROR' then 'INSTAGRAM_CONTAINER_ERROR'
        when 'EXPIRED' then 'INSTAGRAM_CONTAINER_EXPIRED'
        else null
      end
  where lifecycle.job_id = selected_job.id
  returning * into selected_lifecycle;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    provider_request_id,
    provider_publish_id,
    payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'INSTAGRAM_CONTAINER_STATUS',
    requested_event_idempotency_key,
    requested_provider_request_id,
    requested_provider_container_id,
    requested_receipt_payload || jsonb_build_object(
      'stage', 'container_status',
      'operation_id', selected_lifecycle.container_create_operation_id,
      'provider_container_id', requested_provider_container_id,
      'provider_container_status', requested_provider_status,
      'poll_count', selected_lifecycle.poll_count,
      'next_poll_at', requested_next_poll_at
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'INSTAGRAM_CONTAINER_STATUS',
    'instagram-audit:' || encode(
      extensions.digest(convert_to(requested_event_idempotency_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    'PROVIDER',
    jsonb_build_object(
      'provider_container_id', requested_provider_container_id,
      'provider_container_status', requested_provider_status,
      'poll_count', selected_lifecycle.poll_count,
      'phase', selected_lifecycle.phase
    )
  );

  return public.social_instagram_lifecycle_response(selected_lifecycle, false);
end;
$$;

-- Persists the exact media_publish intent before the final remote call. The
-- operation ID is separate from container creation so an ambiguous final call
-- can be reconciled without creating or publishing anything again.
create or replace function public.begin_instagram_media_publish_v1(
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
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
begin
  if coalesce(
      char_length(requested_idempotency_key) between 16 and 300
      and requested_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(requested_request_sha256 ~ '^[a-f0-9]{64}$', false) is not true
    or coalesce(
      char_length(requested_event_idempotency_key) between 16 and 300
      and requested_event_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(jsonb_typeof(requested_receipt_payload) = 'object', false) is not true
    or public.social_json_is_redacted(requested_receipt_payload) is not true
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_INTENT_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.publishing_allowed is not true
    or selected_job.claim_id is distinct from requested_claim_id
    or selected_job.remote_duplicate_status <> 'CLEAR'
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  if selected_lifecycle.job_id is null then
    raise exception 'INSTAGRAM_CONTAINER_LIFECYCLE_NOT_FOUND';
  end if;

  if selected_lifecycle.media_publish_operation_id is not null then
    if selected_lifecycle.media_publish_idempotency_key
        is distinct from requested_idempotency_key
      or selected_lifecycle.media_publish_request_sha256
        is distinct from requested_request_sha256
    then
      raise exception 'INSTAGRAM_MEDIA_PUBLISH_IDEMPOTENCY_CONFLICT';
    end if;

    return public.social_instagram_lifecycle_response(selected_lifecycle, false);
  end if;

  if selected_lifecycle.phase <> 'CONTAINER_READY'
    or selected_lifecycle.provider_container_status <> 'FINISHED'
    or selected_lifecycle.provider_container_id is null
  then
    raise exception 'INSTAGRAM_CONTAINER_NOT_READY';
  end if;

  if exists (
    select 1
    from public.social_publish_receipts receipt
    where receipt.event_idempotency_key = requested_event_idempotency_key
  ) then
    raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT';
  end if;

  update public.social_instagram_publish_lifecycles lifecycle
  set media_publish_operation_id = extensions.gen_random_uuid(),
      media_publish_idempotency_key = requested_idempotency_key,
      media_publish_request_sha256 = requested_request_sha256,
      media_publish_intent_at = clock_timestamp(),
      phase = 'MEDIA_PUBLISH_INTENT_RECORDED',
      last_error_code = null
  where lifecycle.job_id = selected_job.id
  returning * into selected_lifecycle;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    provider_publish_id,
    payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'INSTAGRAM_MEDIA_PUBLISH_INTENT',
    requested_event_idempotency_key,
    selected_lifecycle.provider_container_id,
    requested_receipt_payload || jsonb_build_object(
      'stage', 'media_publish',
      'operation_id', selected_lifecycle.media_publish_operation_id,
      'provider_container_id', selected_lifecycle.provider_container_id,
      'request_sha256', requested_request_sha256,
      'dispatch_allowed', true
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'INSTAGRAM_MEDIA_PUBLISH_INTENT',
    'instagram-audit:' || encode(
      extensions.digest(convert_to(requested_event_idempotency_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    'SERVICE',
    jsonb_build_object(
      'operation_id', selected_lifecycle.media_publish_operation_id,
      'provider_container_id', selected_lifecycle.provider_container_id,
      'request_sha256', requested_request_sha256,
      'phase', selected_lifecycle.phase
    )
  );

  return public.social_instagram_lifecycle_response(selected_lifecycle, true);
end;
$$;

-- Records the final provider outcome without changing the generic social job.
-- UNKNOWN is intentionally distinct from rejection: it requires owned-media
-- reconciliation and may later advance to CONFIRMED, but it can never be
-- re-dispatched. Only the unchanged generic completion RPC may mark the job
-- itself published after this lifecycle reaches MEDIA_PUBLISH_CONFIRMED.
create or replace function public.record_instagram_media_publish_outcome_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_outcome text,
  requested_provider_request_id text,
  requested_provider_post_id text,
  requested_provider_permalink text,
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
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
  next_phase text;
  replay_job_id uuid;
  replay_event_type text;
begin
  if coalesce(
      requested_outcome in ('CONFIRMED', 'UNKNOWN', 'REJECTED_NO_SIDE_EFFECT'),
      false
    ) is not true
    or (
      requested_provider_request_id is not null
      and (
        char_length(requested_provider_request_id) not between 1 and 240
        or requested_provider_request_id !~ '^[A-Za-z0-9._:-]+$'
      )
    )
    or coalesce(
      char_length(requested_event_idempotency_key) between 16 and 300
      and requested_event_idempotency_key ~ '^[A-Za-z0-9._:-]+$',
      false
    ) is not true
    or coalesce(jsonb_typeof(requested_receipt_payload) = 'object', false) is not true
    or public.social_json_is_redacted(requested_receipt_payload) is not true
    or (
      requested_outcome = 'CONFIRMED'
      and (
        coalesce(requested_provider_post_id ~ '^[1-9][0-9]{0,255}$', false) is not true
        or coalesce(
          requested_provider_permalink ~ '^https://(www\.)?instagram\.com/',
          false
        ) is not true
      )
    )
    or (
      requested_outcome <> 'CONFIRMED'
      and (requested_provider_post_id is not null or requested_provider_permalink is not null)
    )
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'publishing'
    or selected_job.publishing_allowed is not true
    or selected_job.claim_id is distinct from requested_claim_id
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_NOT_AUTHORIZED';
  end if;

  select * into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  if selected_lifecycle.job_id is null
    or selected_lifecycle.media_publish_operation_id
      is distinct from requested_operation_id
  then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OPERATION_MISMATCH';
  end if;

  select receipt.job_id, receipt.event_type
  into replay_job_id, replay_event_type
  from public.social_publish_receipts receipt
  where receipt.event_idempotency_key = requested_event_idempotency_key;

  if replay_job_id is not null then
    if replay_job_id = selected_job.id
      and replay_event_type = 'INSTAGRAM_MEDIA_PUBLISH_RESULT'
    then
      return public.social_instagram_lifecycle_response(selected_lifecycle, false);
    end if;
    raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT';
  end if;

  if selected_lifecycle.media_publish_outcome in ('CONFIRMED', 'REJECTED_NO_SIDE_EFFECT') then
    if selected_lifecycle.media_publish_outcome = requested_outcome
      and selected_lifecycle.provider_post_id is not distinct from requested_provider_post_id
      and selected_lifecycle.provider_permalink is not distinct from requested_provider_permalink
    then
      return public.social_instagram_lifecycle_response(selected_lifecycle, false);
    end if;
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_CONFLICT';
  end if;

  if selected_lifecycle.phase not in (
    'MEDIA_PUBLISH_INTENT_RECORDED', 'MEDIA_PUBLISH_OUTCOME_UNKNOWN'
  ) then
    raise exception 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_STATE_MISMATCH';
  end if;

  next_phase := case requested_outcome
    when 'CONFIRMED' then 'MEDIA_PUBLISH_CONFIRMED'
    when 'UNKNOWN' then 'MEDIA_PUBLISH_OUTCOME_UNKNOWN'
    else 'MEDIA_PUBLISH_REJECTED'
  end;

  update public.social_instagram_publish_lifecycles lifecycle
  set media_publish_outcome = requested_outcome,
      media_publish_outcome_at = clock_timestamp(),
      provider_publish_request_id = coalesce(
        lifecycle.provider_publish_request_id,
        requested_provider_request_id
      ),
      provider_post_id = requested_provider_post_id,
      provider_permalink = requested_provider_permalink,
      phase = next_phase,
      last_error_code = case requested_outcome
        when 'UNKNOWN' then 'INSTAGRAM_MEDIA_PUBLISH_OUTCOME_UNKNOWN'
        when 'REJECTED_NO_SIDE_EFFECT' then 'INSTAGRAM_MEDIA_PUBLISH_REJECTED'
        else null
      end
  where lifecycle.job_id = selected_job.id
  returning * into selected_lifecycle;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    provider_request_id,
    provider_publish_id,
    provider_post_id,
    payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'INSTAGRAM_MEDIA_PUBLISH_RESULT',
    requested_event_idempotency_key,
    requested_provider_request_id,
    selected_lifecycle.provider_container_id,
    requested_provider_post_id,
    requested_receipt_payload || jsonb_build_object(
      'stage', 'media_publish_result',
      'operation_id', selected_lifecycle.media_publish_operation_id,
      'provider_container_id', selected_lifecycle.provider_container_id,
      'outcome', requested_outcome,
      'provider_permalink', requested_provider_permalink,
      'requires_reconciliation', requested_outcome = 'UNKNOWN'
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'INSTAGRAM_MEDIA_PUBLISH_RESULT',
    'instagram-audit:' || encode(
      extensions.digest(convert_to(requested_event_idempotency_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    'PROVIDER',
    jsonb_build_object(
      'operation_id', selected_lifecycle.media_publish_operation_id,
      'provider_container_id', selected_lifecycle.provider_container_id,
      'outcome', requested_outcome,
      'provider_post_id', requested_provider_post_id,
      'provider_permalink', requested_provider_permalink,
      'phase', selected_lifecycle.phase
    )
  );

  return public.social_instagram_lifecycle_response(selected_lifecycle, false);
end;
$$;

alter table public.social_instagram_publish_lifecycles enable row level security;
alter table public.social_instagram_publish_lifecycles force row level security;

-- All lifecycle reads and mutations go through narrow SECURITY DEFINER RPCs.
-- In particular, service_role receives no direct INSERT/UPDATE/DELETE grant.
revoke all on public.social_instagram_publish_lifecycles
  from public, anon, authenticated, service_role;

revoke all on function public.social_instagram_resume_action(text)
  from public, anon, authenticated, service_role;
revoke all on function public.social_instagram_lifecycle_response(
  public.social_instagram_publish_lifecycles,
  boolean
) from public, anon, authenticated, service_role;
revoke all on function public.social_guard_instagram_publish_lifecycle()
  from public, anon, authenticated, service_role;
revoke all on function public.begin_instagram_container_create_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.get_instagram_publish_resume_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_instagram_container_created_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.record_instagram_container_status_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.begin_instagram_media_publish_v1(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.record_instagram_media_publish_outcome_v1(
  uuid, uuid, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.begin_instagram_container_create_v1(
  uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.get_instagram_publish_resume_v1(uuid, uuid)
  to service_role;
grant execute on function public.record_instagram_container_created_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.record_instagram_container_status_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.begin_instagram_media_publish_v1(
  uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.record_instagram_media_publish_outcome_v1(
  uuid, uuid, uuid, text, text, text, text, text, jsonb
) to service_role;

comment on table public.social_instagram_publish_lifecycles is
  'Service-only current state for crash-safe Instagram container creation, polling, and the separate media_publish ambiguity boundary.';
comment on function public.begin_instagram_container_create_v1(
  uuid, uuid, text, text, text, jsonb
) is
  'Records exact container-create intent; only the first call returns dispatch_allowed=true.';
comment on function public.begin_instagram_media_publish_v1(
  uuid, uuid, text, text, text, jsonb
) is
  'Records exact media_publish intent; every replay is reconciliation-only and cannot authorize another dispatch.';
comment on function public.record_instagram_media_publish_outcome_v1(
  uuid, uuid, uuid, text, text, text, text, text, jsonb
) is
  'Persists CONFIRMED, UNKNOWN, or REJECTED_NO_SIDE_EFFECT without changing the generic social job published state.';

commit;
