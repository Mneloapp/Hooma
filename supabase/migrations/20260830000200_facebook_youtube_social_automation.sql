-- Dedicated Facebook Page Reels and YouTube Shorts automation surfaces.
-- Both providers remain fail-closed behind independent OAuth/network/review/
-- publishing switches. Existing TikTok and Instagram records are untouched.

begin;

alter table public.social_encryption_nonces
  drop constraint if exists social_encryption_nonces_provider_check;
alter table public.social_encryption_nonces
  add constraint social_encryption_nonces_provider_check
  check (provider in ('tiktok', 'instagram', 'facebook', 'youtube'));

alter table public.social_oauth_states
  drop constraint if exists social_oauth_states_provider_check;
alter table public.social_oauth_states
  add constraint social_oauth_states_provider_check
  check (provider in ('tiktok', 'instagram', 'facebook', 'youtube'));

alter table public.social_connections
  drop constraint if exists social_connections_provider_check;
alter table public.social_connections
  add constraint social_connections_provider_check
  check (provider in ('tiktok', 'instagram', 'facebook', 'youtube'));

alter table public.social_publish_jobs
  drop constraint if exists social_publish_jobs_provider_check;
alter table public.social_publish_jobs
  add constraint social_publish_jobs_provider_check
  check (provider in ('tiktok', 'instagram', 'facebook', 'youtube'));

-- Replace only the provider URL check; its generated name differs between
-- restored environments, so identify it by its exact semantic markers.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.social_publish_jobs'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%provider_url%'
    and pg_get_constraintdef(con.oid) ilike '%tiktok.com%'
    and pg_get_constraintdef(con.oid) ilike '%instagram.com%'
  limit 1;
  if constraint_name is not null then
    execute format(
      'alter table public.social_publish_jobs drop constraint %I',
      constraint_name
    );
  end if;
end;
$$;

alter table public.social_publish_jobs
  add constraint social_publish_jobs_provider_url_v2_check
  check (
    provider_url is null
    or (provider = 'tiktok' and provider_url ~ '^https://(www\.)?tiktok\.com/')
    or (provider = 'instagram' and provider_url ~ '^https://(www\.)?instagram\.com/')
    or (provider = 'facebook' and provider_url ~ '^https://(www\.)?facebook\.com/')
    or (provider = 'youtube' and provider_url ~ '^https://(www\.)?(youtube\.com|youtu\.be)/')
  );

-- Every non-TikTok destination requires the immutable licensed pre-mixed
-- master. Silent uploads and TikTok-only CML receipts cannot cross platforms.
alter table public.social_publish_jobs
  add constraint social_publish_jobs_external_music_v1_check
  check (provider = 'tiktok' or music_mode = 'HOOMA_OWNED_MASTER');

create or replace function public.consume_external_social_oauth_state_v1(
  requested_provider text,
  requested_state_hash text,
  requested_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_state public.social_oauth_states%rowtype;
begin
  if requested_provider <> 'facebook'
    or requested_state_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.profiles
      where id = requested_actor_id and role = 'owner' and is_active is true
    )
  then return false; end if;

  select * into matched_state
  from public.social_oauth_states
  where provider = requested_provider
    and state_hash = requested_state_hash
    and actor_id = requested_actor_id
    and redirect_uri = 'https://hooma.ge/api/social/oauth/facebook/callback'
    and consumed_at is null
    and expires_at > now()
  for update;
  if matched_state.state_hash is null then return false; end if;

  update public.social_oauth_states set consumed_at = now()
  where state_hash = matched_state.state_hash;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    requested_actor_id, 'social_oauth_state_consumed',
    'social_connection', requested_provider,
    jsonb_build_object('provider', requested_provider)
  );
  return true;
end;
$$;

create or replace function public.consume_youtube_social_oauth_state_v1(
  requested_state_hash text,
  requested_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_state public.social_oauth_states%rowtype;
begin
  if requested_state_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.profiles
      where id = requested_actor_id and role = 'owner' and is_active is true
    )
  then return null; end if;

  select * into matched_state
  from public.social_oauth_states
  where provider = 'youtube'
    and state_hash = requested_state_hash
    and actor_id = requested_actor_id
    and redirect_uri = 'https://hooma.ge/api/social/oauth/youtube/callback'
    and consumed_at is null
    and expires_at > now()
  for update;
  if matched_state.state_hash is null then return null; end if;

  update public.social_oauth_states set consumed_at = now()
  where state_hash = matched_state.state_hash;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    requested_actor_id, 'social_oauth_state_consumed',
    'social_connection', 'youtube',
    jsonb_build_object('provider', 'youtube', 'pkce', true)
  );
  return jsonb_build_object(
    'consumed', true,
    'pkce_verifier_enc', matched_state.pkce_verifier_enc
  );
end;
$$;

create or replace function public.upsert_external_social_connection_v1(
  requested_provider text,
  requested_external_account_id text,
  requested_username text,
  requested_token_type text,
  requested_scopes text[],
  requested_access_token_enc jsonb,
  requested_refresh_token_enc jsonb,
  requested_access_expires_at timestamptz,
  requested_refresh_expires_at timestamptz,
  requested_issued_at timestamptz,
  requested_refresh_after timestamptz,
  requested_connected_by uuid,
  requested_identity_snapshot jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if requested_provider not in ('facebook', 'youtube')
    or requested_username <> 'hooma.ge'
    or requested_token_type <> 'Bearer'
    or requested_external_account_id is null
    or length(requested_external_account_id) not between 5 and 256
    or (requested_provider = 'facebook' and requested_external_account_id !~ '^[1-9][0-9]{4,255}$')
    or (requested_provider = 'youtube' and requested_external_account_id !~ '^UC[A-Za-z0-9_-]{22}$')
    or requested_scopes is null
    or cardinality(requested_scopes) = 0
    or cardinality(requested_scopes) <> cardinality(array(select distinct unnest(requested_scopes)))
    or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
    or (requested_provider = 'facebook' and requested_refresh_token_enc is not null)
    or (requested_provider = 'youtube' and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc))
    or requested_access_expires_at <= requested_issued_at
    or requested_refresh_after <= requested_issued_at
    or requested_refresh_after >= requested_access_expires_at
    or requested_refresh_expires_at is not null
    or jsonb_typeof(requested_identity_snapshot) <> 'object'
    or public.social_json_is_redacted(requested_identity_snapshot) is not true
  then return false; end if;
  if not exists (
    select 1 from public.profiles
    where id = requested_connected_by and role = 'owner' and is_active = true
  ) then return false; end if;

  insert into public.social_connections (
    provider, external_account_id, username, token_type, scopes,
    access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at,
    issued_at, refresh_after, status, connected_by, identity_snapshot,
    last_refreshed_at, last_verified_at, last_error_code
  ) values (
    requested_provider, requested_external_account_id, requested_username,
    requested_token_type, requested_scopes, requested_access_token_enc,
    requested_refresh_token_enc, requested_access_expires_at, null,
    requested_issued_at, requested_refresh_after, 'active',
    requested_connected_by, requested_identity_snapshot,
    requested_issued_at, requested_issued_at, null
  )
  on conflict (provider) do update set
    external_account_id = excluded.external_account_id,
    username = excluded.username,
    token_type = excluded.token_type,
    scopes = excluded.scopes,
    access_token_enc = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    access_expires_at = excluded.access_expires_at,
    refresh_expires_at = null,
    issued_at = excluded.issued_at,
    refresh_after = excluded.refresh_after,
    status = 'active',
    token_version = public.social_connections.token_version + 1,
    refresh_lease_id = null,
    refresh_lease_until = null,
    connected_by = excluded.connected_by,
    identity_snapshot = excluded.identity_snapshot,
    last_refreshed_at = excluded.last_refreshed_at,
    last_verified_at = excluded.last_verified_at,
    last_error_code = null;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    requested_connected_by, 'social_connection_authorized',
    'social_connection', requested_provider,
    jsonb_build_object(
      'provider', requested_provider,
      'username', requested_username,
      'external_account_id', requested_external_account_id,
      'scope_count', cardinality(requested_scopes),
      'access_expires_at', requested_access_expires_at
    )
  );
  return true;
end;
$$;

create or replace function public.claim_external_social_connection_refresh_v1(
  requested_provider text,
  requested_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_connection public.social_connections%rowtype;
  new_lease_id uuid := gen_random_uuid();
begin
  if requested_provider <> 'youtube'
    or requested_lease_seconds < 30 or requested_lease_seconds > 600
  then raise exception 'INVALID_EXTERNAL_REFRESH_CLAIM'; end if;
  select * into selected_connection
  from public.social_connections
  where provider = 'youtube'
    and status = 'active'
    and refresh_token_enc is not null
    and refresh_after <= now()
    and (refresh_lease_until is null or refresh_lease_until < now())
  for update skip locked;
  if selected_connection.provider is null then return null; end if;

  update public.social_connections
  set refresh_lease_id = new_lease_id,
      refresh_lease_until = now() + make_interval(secs => requested_lease_seconds)
  where provider = 'youtube'
  returning * into selected_connection;
  return to_jsonb(selected_connection);
end;
$$;

create or replace function public.complete_external_social_connection_refresh_v1(
  requested_provider text,
  requested_lease_id uuid,
  requested_token_version bigint,
  requested_username text,
  requested_scopes text[],
  requested_access_token_enc jsonb,
  requested_refresh_token_enc jsonb,
  requested_access_expires_at timestamptz,
  requested_refresh_expires_at timestamptz,
  requested_issued_at timestamptz,
  requested_refresh_after timestamptz,
  requested_identity_snapshot jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed_rows integer;
begin
  if requested_provider <> 'youtube'
    or requested_username <> 'hooma.ge'
    or requested_scopes is null or cardinality(requested_scopes) = 0
    or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
    or (requested_refresh_token_enc is not null and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc))
    or requested_access_expires_at <= requested_issued_at
    or requested_refresh_after <= requested_issued_at
    or requested_refresh_after >= requested_access_expires_at
    or requested_refresh_expires_at is not null
    or jsonb_typeof(requested_identity_snapshot) <> 'object'
    or public.social_json_is_redacted(requested_identity_snapshot) is not true
  then return false; end if;

  update public.social_connections set
    username = requested_username,
    scopes = requested_scopes,
    access_token_enc = requested_access_token_enc,
    refresh_token_enc = coalesce(requested_refresh_token_enc, refresh_token_enc),
    access_expires_at = requested_access_expires_at,
    refresh_expires_at = null,
    issued_at = requested_issued_at,
    refresh_after = requested_refresh_after,
    token_version = token_version + 1,
    refresh_lease_id = null,
    refresh_lease_until = null,
    identity_snapshot = requested_identity_snapshot,
    last_refreshed_at = requested_issued_at,
    last_verified_at = requested_issued_at,
    last_error_code = null
  where provider = 'youtube'
    and status = 'active'
    and token_version = requested_token_version
    and refresh_lease_id = requested_lease_id
    and refresh_lease_until > now()
    and refresh_token_enc is not null;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then return false; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null, 'social_connection_token_refreshed', 'social_connection', 'youtube',
    jsonb_build_object(
      'provider', 'youtube', 'scope_count', cardinality(requested_scopes),
      'access_expires_at', requested_access_expires_at, 'initiator', 'system_cron'
    )
  );
  return true;
end;
$$;

create or replace function public.fail_external_social_connection_refresh_v1(
  requested_provider text,
  requested_lease_id uuid,
  requested_token_version bigint,
  requested_error_code text,
  requested_reauthorization_required boolean,
  requested_retry_after timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed_rows integer;
begin
  if requested_provider <> 'youtube'
    or requested_error_code !~ '^[A-Z0-9_]{3,80}$'
    or requested_retry_after <= now()
  then return false; end if;
  update public.social_connections set
    status = case when requested_reauthorization_required then 'reauth_required' else status end,
    refresh_after = requested_retry_after,
    refresh_lease_id = null,
    refresh_lease_until = null,
    last_error_code = requested_error_code
  where provider = 'youtube'
    and status = 'active'
    and token_version = requested_token_version
    and refresh_lease_id = requested_lease_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then return false; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null,
    case when requested_reauthorization_required
      then 'social_connection_reauthorization_required'
      else 'social_connection_token_refresh_failed'
    end,
    'social_connection', 'youtube',
    jsonb_build_object(
      'provider', 'youtube', 'error_code', requested_error_code,
      'reauthorization_required', requested_reauthorization_required,
      'retry_after', requested_retry_after, 'initiator', 'system_cron'
    )
  );
  return true;
end;
$$;

revoke all on function public.consume_external_social_oauth_state_v1(text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_youtube_social_oauth_state_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.upsert_external_social_connection_v1(
  text, text, text, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.claim_external_social_connection_refresh_v1(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_external_social_connection_refresh_v1(
  text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.fail_external_social_connection_refresh_v1(
  text, uuid, bigint, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.consume_external_social_oauth_state_v1(text, text, uuid)
  to service_role;
grant execute on function public.consume_youtube_social_oauth_state_v1(text, uuid)
  to service_role;
grant execute on function public.upsert_external_social_connection_v1(
  text, text, text, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, uuid, jsonb
) to service_role;
grant execute on function public.claim_external_social_connection_refresh_v1(text, integer)
  to service_role;
grant execute on function public.complete_external_social_connection_refresh_v1(
  text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, jsonb
) to service_role;
grant execute on function public.fail_external_social_connection_refresh_v1(
  text, uuid, bigint, text, boolean, timestamptz
) to service_role;

commit;

begin;

create table if not exists public.social_external_publish_lifecycles (
  job_id uuid primary key references public.social_publish_jobs(id) on delete restrict,
  provider text not null check (provider in ('facebook', 'youtube')),
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
  unique (provider, publish_operation_id),
  check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9_.:~-]{1,120}$'),
  check (
    provider_publish_id is null
    or (provider = 'facebook' and provider_publish_id ~ '^[1-9][0-9]{0,255}$')
    or (provider = 'youtube' and provider_publish_id ~ '^[A-Za-z0-9_-]{11}$')
  ),
  check (
    provider_post_id is null
    or (provider = 'facebook' and provider_post_id ~ '^[1-9][0-9]{0,255}$')
    or (provider = 'youtube' and provider_post_id ~ '^[A-Za-z0-9_-]{11}$')
  ),
  check (
    provider_url is null
    or (provider = 'facebook' and provider_url ~ '^https://(www\.)?facebook\.com/')
    or (provider = 'youtube' and provider_url ~ '^https://(www\.)?(youtube\.com|youtu\.be)/')
  ),
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

alter table public.social_external_publish_lifecycles enable row level security;
alter table public.social_external_publish_lifecycles force row level security;
revoke all on public.social_external_publish_lifecycles
  from public, anon, authenticated, service_role;
grant select, insert, update on public.social_external_publish_lifecycles to service_role;

create or replace function public.social_external_lifecycle_response(
  lifecycle public.social_external_publish_lifecycles,
  dispatch_allowed boolean
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', lifecycle.job_id,
    'provider', lifecycle.provider,
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

create or replace function public.claim_due_external_social_publish_job_v1(
  requested_provider text,
  requested_worker_window_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  new_claim_id uuid := extensions.gen_random_uuid();
begin
  if requested_provider not in ('facebook', 'youtube')
    or requested_worker_window_minutes < 1
    or requested_worker_window_minutes > 10
  then raise exception 'INVALID_EXTERNAL_SOCIAL_CLAIM_REQUEST'; end if;

  select job.* into selected_job
  from public.social_publish_jobs job
  join public.social_connections connection
    on connection.provider = job.provider
   and connection.external_account_id = job.account_id
   and connection.status = 'active'
   and connection.access_expires_at > now() + interval '10 minutes'
  join public.products product
    on product.id = job.product_id and product.status = 'active'
  where job.provider = requested_provider
    and job.state in ('approved', 'media_staged', 'retry_wait')
    and job.publishing_allowed is true
    and job.approval_status = 'APPROVED_EXACT'
    and job.approval_fingerprint = job.content_fingerprint
    and job.rights_status = 'CLEARED'
    and job.visual_claims_status = 'CLEARED'
    and job.music_mode = 'HOOMA_OWNED_MASTER'
    and job.scheduled_at <= now()
    and job.publish_not_after >= now()
    and coalesce(job.next_attempt_at, job.scheduled_at) <= now()
    and job.attempts < job.max_attempts
    and job.provider_post_id is null
    and job.remote_duplicate_status <> 'DUPLICATE'
  order by job.scheduled_at, job.id
  limit 1 for update of job skip locked;
  if selected_job.id is null then return null; end if;

  update public.social_publish_jobs set
    state = 'claimed', attempts = attempts + 1, claimed_at = now(),
    claim_id = new_claim_id,
    claim_expires_at = now() + make_interval(mins => requested_worker_window_minutes),
    remote_duplicate_status = 'UNKNOWN', remote_duplicate_checked_at = null,
    remote_duplicate_receipt_sha256 = null,
    last_error_code = null, last_error_message = null
  where id = selected_job.id returning * into selected_job;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'CLAIMED',
    requested_provider || '-claim:' || selected_job.id::text || ':' || selected_job.attempts::text,
    'SERVICE', jsonb_build_object(
      'attempt_number', selected_job.attempts, 'claim_id', selected_job.claim_id,
      'claim_expires_at', selected_job.claim_expires_at
    )
  );
  return to_jsonb(selected_job);
end;
$$;

create or replace function public.begin_external_social_publish_v1(
  requested_provider text,
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
  lifecycle public.social_external_publish_lifecycles%rowtype;
  replay_receipt public.social_publish_receipts%rowtype;
  expected_payload jsonb;
begin
  if requested_provider not in ('facebook', 'youtube')
    or requested_request_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(trim(requested_idempotency_key)) not between 16 and 300
    or char_length(trim(requested_event_idempotency_key)) not between 16 and 300
    or jsonb_typeof(requested_receipt_payload) <> 'object'
    or public.social_json_is_redacted(requested_receipt_payload) is not true
  then raise exception 'EXTERNAL_PUBLISH_INTENT_INVALID'; end if;
  expected_payload := requested_receipt_payload || jsonb_build_object(
    'provider', requested_provider, 'publish_request_sha256', requested_request_sha256
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> requested_provider
  then raise exception 'EXTERNAL_JOB_NOT_FOUND'; end if;
  select * into lifecycle from public.social_external_publish_lifecycles
  where job_id = selected_job.id for update;
  if lifecycle.job_id is not null then
    select * into replay_receipt from public.social_publish_receipts
    where event_idempotency_key = requested_event_idempotency_key;
    if lifecycle.provider = requested_provider
      and lifecycle.publish_idempotency_key = requested_idempotency_key
      and lifecycle.publish_request_sha256 = requested_request_sha256
      and replay_receipt.job_id = selected_job.id
      and replay_receipt.event_type = 'PUBLISH_REQUESTED'
      and replay_receipt.payload = expected_payload
    then return public.social_external_lifecycle_response(lifecycle, false); end if;
    raise exception 'EXTERNAL_PUBLISH_INTENT_CONFLICT';
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
    or selected_job.music_mode <> 'HOOMA_OWNED_MASTER'
    or public.social_music_receipt_is_valid(
      selected_job.music_receipt, requested_provider,
      selected_job.music_mode, selected_job.video_sha256
    ) is not true
    or not exists (
      select 1 from public.products product
      where product.id = selected_job.product_id and product.status = 'active'
    )
    or not exists (
      select 1 from public.social_connections connection
      where connection.provider = requested_provider
        and connection.external_account_id = selected_job.account_id
        and connection.status = 'active'
        and connection.access_expires_at > now() + interval '10 minutes'
    )
  then raise exception 'EXTERNAL_PUBLISH_DISPATCH_NOT_AUTHORIZED'; end if;

  insert into public.social_external_publish_lifecycles (
    job_id, provider, publish_idempotency_key, publish_request_sha256, phase
  ) values (
    selected_job.id, requested_provider, requested_idempotency_key,
    requested_request_sha256, 'PUBLISH_INTENT_RECORDED'
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
    selected_job.id, upper(requested_provider) || '_PUBLISH_INTENT_RECORDED',
    requested_provider || '-publish-intent-audit:' || lifecycle.publish_operation_id::text,
    'SERVICE', jsonb_build_object(
      'publish_operation_id', lifecycle.publish_operation_id,
      'publish_request_sha256', requested_request_sha256
    )
  );
  return public.social_external_lifecycle_response(lifecycle, true);
end;
$$;

create or replace function public.record_external_social_publish_accepted_v1(
  requested_provider text,
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_provider_publish_id text,
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
  lifecycle public.social_external_publish_lifecycles%rowtype;
  expected_event jsonb;
begin
  if requested_provider not in ('facebook', 'youtube')
    or (requested_provider = 'facebook' and requested_provider_publish_id !~ '^[1-9][0-9]{0,255}$')
    or (requested_provider = 'youtube' and requested_provider_publish_id !~ '^[A-Za-z0-9_-]{11}$')
    or requested_provider_response_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(trim(requested_event_idempotency_key)) not between 16 and 300
    or requested_next_poll_at <= now()
    or requested_next_poll_at > now() + interval '10 minutes'
    or jsonb_typeof(requested_event_payload) <> 'object'
    or public.social_json_is_redacted(requested_event_payload) is not true
  then raise exception 'EXTERNAL_PUBLISH_ACCEPTED_INVALID'; end if;
  expected_event := requested_event_payload || jsonb_build_object(
    'provider_publish_id', requested_provider_publish_id,
    'provider_response_sha256', requested_provider_response_sha256,
    'next_poll_at', requested_next_poll_at
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  select * into lifecycle from public.social_external_publish_lifecycles
  where job_id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> requested_provider
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or lifecycle.provider is distinct from requested_provider
    or lifecycle.publish_operation_id is distinct from requested_operation_id
    or lifecycle.phase <> 'PUBLISH_INTENT_RECORDED'
  then raise exception 'EXTERNAL_PUBLISH_ACCEPTED_NOT_AUTHORIZED'; end if;
  update public.social_external_publish_lifecycles set
    phase = 'PROCESSING_REMOTE', provider_publish_id = requested_provider_publish_id,
    provider_response_sha256 = requested_provider_response_sha256,
    provider_status = 'PROCESSING_REMOTE', next_poll_at = requested_next_poll_at,
    updated_at = clock_timestamp()
  where job_id = requested_job_id returning * into lifecycle;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    requested_job_id, upper(requested_provider) || '_PUBLISH_ACCEPTED',
    requested_event_idempotency_key, 'PROVIDER', expected_event
  );
  return public.social_external_lifecycle_response(lifecycle, false);
end;
$$;

create or replace function public.record_external_social_publish_status_v1(
  requested_provider text,
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_status text,
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
  lifecycle public.social_external_publish_lifecycles%rowtype;
  expected_event jsonb;
begin
  if requested_provider not in ('facebook', 'youtube')
    or requested_status not in ('PROCESSING_REMOTE', 'PUBLISHED', 'FAILED')
    or requested_provider_response_sha256 !~ '^[a-f0-9]{64}$'
    or (requested_status = 'PROCESSING_REMOTE' and (
      requested_next_poll_at is null or requested_next_poll_at <= now()
      or requested_next_poll_at > now() + interval '10 minutes'
    ))
    or (requested_status <> 'PROCESSING_REMOTE' and requested_next_poll_at is not null)
    or (requested_status = 'PUBLISHED' and (
      requested_failure_reason is not null
      or (requested_provider = 'facebook' and (
        requested_provider_post_id !~ '^[1-9][0-9]{0,255}$'
        or requested_provider_url !~ '^https://(www\.)?facebook\.com/'
      ))
      or (requested_provider = 'youtube' and (
        requested_provider_post_id !~ '^[A-Za-z0-9_-]{11}$'
        or requested_provider_url !~ '^https://(www\.)?(youtube\.com|youtu\.be)/'
      ))
    ))
    or (requested_status = 'FAILED' and (
      requested_failure_reason !~ '^[A-Za-z0-9_.:~-]{1,120}$'
      or requested_provider_post_id is not null or requested_provider_url is not null
    ))
    or jsonb_typeof(requested_event_payload) <> 'object'
    or public.social_json_is_redacted(requested_event_payload) is not true
  then raise exception 'EXTERNAL_PUBLISH_STATUS_INVALID'; end if;
  expected_event := requested_event_payload || jsonb_build_object(
    'provider_status', requested_status,
    'provider_response_sha256', requested_provider_response_sha256,
    'provider_post_id', requested_provider_post_id,
    'provider_url', requested_provider_url,
    'failure_reason', requested_failure_reason,
    'next_poll_at', requested_next_poll_at
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  select * into lifecycle from public.social_external_publish_lifecycles
  where job_id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> requested_provider
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or lifecycle.provider is distinct from requested_provider
    or lifecycle.publish_operation_id is distinct from requested_operation_id
    or lifecycle.phase <> 'PROCESSING_REMOTE'
  then raise exception 'EXTERNAL_PUBLISH_STATUS_NOT_AUTHORIZED'; end if;
  update public.social_external_publish_lifecycles set
    phase = requested_status,
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
    requested_job_id, upper(requested_provider) || '_PUBLISH_STATUS',
    requested_event_idempotency_key, 'PROVIDER', expected_event
  );
  return public.social_external_lifecycle_response(lifecycle, false);
end;
$$;

create or replace function public.claim_due_external_social_publish_work_v1(
  requested_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_external_publish_lifecycles%rowtype;
  new_claim_id uuid := extensions.gen_random_uuid();
begin
  if requested_provider not in ('facebook', 'youtube')
  then raise exception 'INVALID_EXTERNAL_SOCIAL_RESUME_REQUEST'; end if;
  select job.* into selected_job
  from public.social_publish_jobs job
  join public.social_external_publish_lifecycles lifecycle on lifecycle.job_id = job.id
  where job.provider = requested_provider and job.state = 'publishing'
    and lifecycle.provider = requested_provider
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
  select * into lifecycle from public.social_external_publish_lifecycles
  where job_id = selected_job.id for update;
  update public.social_publish_jobs set
    claim_id = new_claim_id, claimed_at = clock_timestamp(),
    claim_expires_at = now() + interval '5 minutes'
  where id = selected_job.id returning * into selected_job;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'CLAIMED',
    requested_provider || '-resume-claim:' || new_claim_id::text,
    'SERVICE', jsonb_build_object(
      'claim_id', new_claim_id, 'claim_expires_at', selected_job.claim_expires_at,
      'lifecycle_phase', lifecycle.phase
    )
  );
  return to_jsonb(selected_job) || jsonb_build_object(
    'external_lifecycle', public.social_external_lifecycle_response(lifecycle, false)
  );
end;
$$;

create or replace function public.claim_due_external_social_analytics_v1(
  requested_provider text
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', job.id, 'provider', job.provider,
    'account_id', job.account_id, 'post_id', job.provider_post_id,
    'horizon', horizon.name
  )
  from public.social_publish_jobs job
  cross join lateral (values
    ('T2H'::text, interval '2 hours', 1),
    ('T24H'::text, interval '24 hours', 2),
    ('T72H'::text, interval '72 hours', 3)
  ) as horizon(name, delay, priority)
  where requested_provider in ('facebook', 'youtube')
    and job.provider = requested_provider and job.state = 'published'
    and job.provider_post_id is not null
    and job.updated_at + horizon.delay <= now()
    and not exists (
      select 1 from public.social_publish_receipts receipt
      where receipt.event_idempotency_key =
        requested_provider || '-analytics:' || job.id::text || ':' || lower(horizon.name)
    )
  order by job.updated_at + horizon.delay, horizon.priority, job.id
  limit 1;
$$;

create or replace function public.record_external_social_analytics_snapshot_v1(
  requested_provider text,
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
  expected_keys text[] := array['views', 'likes', 'comments', 'shares', 'reach', 'favorites'];
begin
  expected_delay := case requested_horizon
    when 'T2H' then interval '2 hours'
    when 'T24H' then interval '24 hours'
    when 'T72H' then interval '72 hours'
    else null end;
  if requested_provider not in ('facebook', 'youtube')
    or expected_delay is null
    or (requested_provider = 'facebook' and requested_post_id !~ '^[1-9][0-9]{0,255}$')
    or (requested_provider = 'youtube' and requested_post_id !~ '^[A-Za-z0-9_-]{11}$')
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
  then raise exception 'EXTERNAL_ANALYTICS_SNAPSHOT_INVALID'; end if;
  select * into selected_job from public.social_publish_jobs where id = requested_job_id;
  if selected_job.id is null or selected_job.provider <> requested_provider
    or selected_job.state <> 'published'
    or selected_job.provider_post_id is distinct from requested_post_id
    or selected_job.updated_at + expected_delay > requested_captured_at
  then raise exception 'EXTERNAL_ANALYTICS_SNAPSHOT_NOT_AUTHORIZED'; end if;
  event_key := requested_provider || '-analytics:' || selected_job.id::text || ':' || lower(requested_horizon);
  payload := jsonb_build_object(
    'schema', requested_provider || '-insights-snapshot-v1',
    'horizon', requested_horizon, 'captured_at', requested_captured_at,
    'post_id', requested_post_id, 'metrics', requested_metrics
  );
  if public.social_json_is_redacted(payload) is not true
  then raise exception 'EXTERNAL_ANALYTICS_SNAPSHOT_INVALID'; end if;
  select * into replay_receipt from public.social_publish_receipts
  where event_idempotency_key = event_key;
  if replay_receipt.id is not null then
    if replay_receipt.job_id = selected_job.id
      and replay_receipt.event_type = 'ANALYTICS_SNAPSHOT'
      and replay_receipt.provider_post_id is not distinct from requested_post_id
      and replay_receipt.payload = payload
    then return true; end if;
    raise exception 'EXTERNAL_ANALYTICS_SNAPSHOT_CONFLICT';
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
    requested_provider || '-analytics-audit:' || selected_job.id::text || ':' || lower(requested_horizon),
    'PROVIDER', jsonb_build_object(
      'provider', requested_provider, 'horizon', requested_horizon,
      'captured_at', requested_captured_at, 'post_id', requested_post_id
    )
  );
  return true;
end;
$$;

revoke all on function public.social_external_lifecycle_response(
  public.social_external_publish_lifecycles, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_external_social_publish_job_v1(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_external_social_publish_v1(
  text, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.record_external_social_publish_accepted_v1(
  text, uuid, uuid, uuid, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.record_external_social_publish_status_v1(
  text, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_external_social_publish_work_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_due_external_social_analytics_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_external_social_analytics_snapshot_v1(
  text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.claim_due_external_social_publish_job_v1(text, integer)
  to service_role;
grant execute on function public.begin_external_social_publish_v1(
  text, uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.record_external_social_publish_accepted_v1(
  text, uuid, uuid, uuid, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.record_external_social_publish_status_v1(
  text, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.claim_due_external_social_publish_work_v1(text)
  to service_role;
grant execute on function public.claim_due_external_social_analytics_v1(text)
  to service_role;
grant execute on function public.record_external_social_analytics_snapshot_v1(
  text, uuid, text, text, timestamptz, jsonb
) to service_role;

comment on table public.social_external_publish_lifecycles is
  'Crash-safe, exact-approval-bound Facebook Reels and YouTube Shorts publish intent and reconciliation state.';

commit;
