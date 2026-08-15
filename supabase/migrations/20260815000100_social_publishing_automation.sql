-- Hooma-owned TikTok and Instagram organic publishing automation.
-- Provider credentials are encrypted by server code before reaching Postgres.
-- No table in this migration is accessible to browser roles.

begin;

create extension if not exists "pgcrypto";

-- Provider responses, identity snapshots and audit payloads must be explicitly
-- redacted before persistence. This is a backstop; the worker must still build
-- payloads from an allowlist rather than logging raw HTTP bodies or headers.
create or replace function public.social_json_is_redacted(payload jsonb)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select payload::text !~*
    '"(access[_-]?token|refresh[_-]?token|authorization|cookie|client[_-]?secret|password|otp|verification[_-]?code)"[[:space:]]*:';
$$;

-- Exact app-side envelope contract. AES-GCM keys remain in an external KMS or
-- secret manager; only ciphertext and non-secret key metadata enter Postgres.
create or replace function public.social_aes_gcm_envelope_is_valid(envelope jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(envelope) <> 'object' then return false; end if;
  if not envelope ?& array[
    'algorithm', 'key_id', 'key_version', 'nonce_b64',
    'ciphertext_b64', 'tag_b64', 'aad_sha256'
  ] then return false; end if;
  if exists (
    select 1
    from jsonb_object_keys(envelope) as supplied(key_name)
    where supplied.key_name <> all(array[
      'algorithm', 'key_id', 'key_version', 'nonce_b64',
      'ciphertext_b64', 'tag_b64', 'aad_sha256'
    ]::text[])
  ) then return false; end if;

  return coalesce(
    envelope ->> 'algorithm' = 'AES-256-GCM'
    and char_length(trim(envelope ->> 'key_id')) between 3 and 200
    and jsonb_typeof(envelope -> 'key_version') = 'number'
    and (envelope ->> 'key_version')::integer > 0
    and envelope ->> 'nonce_b64' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and envelope ->> 'ciphertext_b64' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and envelope ->> 'tag_b64' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and octet_length(decode(envelope ->> 'nonce_b64', 'base64')) = 12
    and octet_length(decode(envelope ->> 'ciphertext_b64', 'base64')) between 1 and 65536
    and octet_length(decode(envelope ->> 'tag_b64', 'base64')) = 16
    and envelope ->> 'aad_sha256' ~ '^[a-f0-9]{64}$',
    false
  );
exception when others then
  return false;
end;
$$;

create or replace function public.social_music_receipt_is_valid(
  receipt jsonb,
  requested_provider text,
  requested_mode text,
  requested_video_sha256 text
)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(receipt) <> 'object'
    or coalesce((receipt ->> 'immutable')::boolean, false) is not true
    or receipt #>> '{context,platform}' is distinct from requested_provider
  then return false; end if;

  if requested_mode = 'HOOMA_OWNED_MASTER' then
    return coalesce(
      receipt ->> 'receiptType' = 'HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE'
      and coalesce((receipt #>> '{track,commercialUseAllowed}')::boolean, false) is true
      and receipt #>> '{track,license,status}' = 'VERIFIED'
      and coalesce((receipt #>> '{track,license,commercialUseAllowed}')::boolean, false) is true
      and (receipt #> '{track,license,platforms}') ? requested_provider
      and receipt #>> '{output,sha256}' = requested_video_sha256
      and receipt #>> '{track,trackSha256}' ~ '^[a-f0-9]{64}$'
      and receipt #>> '{track,license,receiptSha256}' ~ '^[a-f0-9]{64}$',
      false
    );
  end if;

  if requested_mode = 'TIKTOK_CML' and requested_provider = 'tiktok' then
    return coalesce(
      receipt ->> 'receiptType' = 'TIKTOK_COMMERCIAL_MUSIC_SELECTION'
      and receipt ->> 'status' = 'APPROVED'
      and char_length(trim(coalesce(receipt ->> 'trackId', ''))) > 0,
      false
    );
  end if;

  return false;
exception when others then
  return false;
end;
$$;

-- Permanent nonce registry: the same key/version/96-bit nonce may never be
-- reused, including after token rotation or OAuth-state cleanup.
create table if not exists public.social_encryption_nonces (
  key_id text not null,
  key_version integer not null check (key_version > 0),
  nonce_b64 text not null,
  provider text not null check (provider in ('tiktok', 'instagram')),
  secret_kind text not null check (secret_kind in ('access_token', 'refresh_token', 'pkce_verifier')),
  context_id text not null,
  envelope_sha256 text not null check (envelope_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (key_id, key_version, nonce_b64)
);

create or replace function public.register_social_encryption_nonce(
  requested_provider text,
  requested_secret_kind text,
  requested_context_id text,
  envelope jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.social_aes_gcm_envelope_is_valid(envelope) then
    raise exception 'INVALID_AES_GCM_ENVELOPE';
  end if;

  insert into public.social_encryption_nonces (
    key_id, key_version, nonce_b64, provider, secret_kind,
    context_id, envelope_sha256
  ) values (
    envelope ->> 'key_id',
    (envelope ->> 'key_version')::integer,
    envelope ->> 'nonce_b64',
    requested_provider,
    requested_secret_kind,
    requested_context_id,
    encode(digest(convert_to(envelope::text, 'UTF8'), 'sha256'), 'hex')
  );
exception when unique_violation then
  raise exception 'AES_GCM_NONCE_REUSE_BLOCKED';
end;
$$;

create table if not exists public.social_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('tiktok', 'instagram')),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null check (redirect_uri ~ '^https://'),
  pkce_verifier_enc jsonb not null
    check (public.social_aes_gcm_envelope_is_valid(pkce_verifier_enc)),
  requested_scopes text[] not null default '{}'::text[],
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '15 minutes'),
  check (consumed_at is null or consumed_at >= created_at)
);

create or replace function public.social_register_oauth_state_nonce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.register_social_encryption_nonce(
    new.provider,
    'pkce_verifier',
    new.state_hash,
    new.pkce_verifier_enc
  );
  return new;
end;
$$;

drop trigger if exists social_register_oauth_state_nonce
  on public.social_oauth_states;
create trigger social_register_oauth_state_nonce
before insert on public.social_oauth_states
for each row execute function public.social_register_oauth_state_nonce();

create table if not exists public.social_connections (
  provider text primary key check (provider in ('tiktok', 'instagram')),
  external_account_id text not null,
  username text not null check (username = 'hooma.ge'),
  token_type text not null,
  scopes text[] not null default '{}'::text[],
  access_token_enc jsonb not null
    check (public.social_aes_gcm_envelope_is_valid(access_token_enc)),
  refresh_token_enc jsonb
    check (
      refresh_token_enc is null
      or public.social_aes_gcm_envelope_is_valid(refresh_token_enc)
    ),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  issued_at timestamptz not null,
  refresh_after timestamptz not null,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'revoked')),
  token_version bigint not null default 1 check (token_version > 0),
  refresh_lease_id uuid,
  refresh_lease_until timestamptz,
  connected_by uuid not null references public.profiles(id) on delete restrict,
  identity_snapshot jsonb not null default '{}'::jsonb
    check (public.social_json_is_redacted(identity_snapshot)),
  last_refreshed_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_account_id),
  check (access_expires_at > issued_at),
  check (refresh_after > issued_at),
  check (refresh_expires_at is null or refresh_expires_at > issued_at),
  check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$')
);

create or replace function public.social_guard_connection_secrets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'SOCIAL_CONNECTIONS_MAY_NOT_BE_DELETED';
  end if;

  if tg_op = 'UPDATE' then
    if old.provider is distinct from new.provider
      or old.external_account_id is distinct from new.external_account_id
      or old.username is distinct from new.username
      or old.connected_by is distinct from new.connected_by
    then
      raise exception 'SOCIAL_CONNECTION_IDENTITY_IS_IMMUTABLE';
    end if;

    if old.access_token_enc is distinct from new.access_token_enc
      or old.refresh_token_enc is distinct from new.refresh_token_enc
    then
      if new.token_version <> old.token_version + 1
        or new.issued_at <= old.issued_at
        or new.last_refreshed_at is null
      then
        raise exception 'SOCIAL_TOKEN_ROTATION_METADATA_INVALID';
      end if;
    elsif new.token_version <> old.token_version then
      raise exception 'SOCIAL_TOKEN_VERSION_CHANGED_WITHOUT_ROTATION';
    end if;
  end if;

  if tg_op = 'INSERT' or old.access_token_enc is distinct from new.access_token_enc then
    perform public.register_social_encryption_nonce(
      new.provider,
      'access_token',
      new.provider || ':' || new.external_account_id || ':v' || new.token_version::text,
      new.access_token_enc
    );
  end if;

  if new.refresh_token_enc is not null
    and (tg_op = 'INSERT' or old.refresh_token_enc is distinct from new.refresh_token_enc)
  then
    perform public.register_social_encryption_nonce(
      new.provider,
      'refresh_token',
      new.provider || ':' || new.external_account_id || ':v' || new.token_version::text,
      new.refresh_token_enc
    );
  end if;

  return new;
end;
$$;

drop trigger if exists social_guard_connection_secrets
  on public.social_connections;
create trigger social_guard_connection_secrets
before insert or update or delete on public.social_connections
for each row execute function public.social_guard_connection_secrets();

create table if not exists public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id text not null unique check (char_length(post_id) between 8 and 160),
  provider text not null check (provider in ('tiktok', 'instagram')),
  account_id text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code text not null,
  product_url text not null check (product_url ~ '^https://(www\.)?hooma\.ge/product/'),
  scheduled_at timestamptz not null,
  publish_not_after timestamptz not null,
  state text not null default 'waiting_for_approval' check (
    state in (
      'waiting_for_approval', 'approved', 'media_staged', 'claimed',
      'publishing', 'published', 'retry_wait', 'failed',
      'blocked_policy', 'blocked_remote_uncertain', 'cancelled'
    )
  ),
  publishing_allowed boolean not null default false,
  approval_status text not null default 'WAITING_FOR_GIORGI'
    check (approval_status in ('WAITING_FOR_GIORGI', 'APPROVED_EXACT', 'REVOKED')),
  approval_fingerprint text check (approval_fingerprint is null or approval_fingerprint ~ '^[a-f0-9]{64}$'),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  video_object_path text not null,
  video_sha256 text not null check (video_sha256 ~ '^[a-f0-9]{64}$'),
  cover_object_path text,
  cover_sha256 text check (cover_sha256 is null or cover_sha256 ~ '^[a-f0-9]{64}$'),
  caption text not null check (char_length(caption) between 1 and 2200),
  caption_sha256 text not null check (caption_sha256 ~ '^[a-f0-9]{64}$'),
  music_mode text not null check (music_mode in ('TIKTOK_CML', 'HOOMA_OWNED_MASTER')),
  music_receipt jsonb not null
    check (jsonb_typeof(music_receipt) = 'object'),
  music_receipt_sha256 text not null check (music_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  rights_status text not null default 'HOLD'
    check (rights_status in ('HOLD', 'CLEARED')),
  visual_claims_status text not null default 'HOLD'
    check (visual_claims_status in ('HOLD', 'CLEARED')),
  settings jsonb not null default '{}'::jsonb
    check (public.social_json_is_redacted(settings)),
  settings_sha256 text not null check (settings_sha256 ~ '^[a-f0-9]{64}$'),
  content_fingerprint text not null check (content_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null unique
    check (char_length(trim(idempotency_key)) between 16 and 240),
  attempts integer not null default 0 check (attempts between 0 and 10),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  claim_id uuid,
  claim_expires_at timestamptz,
  remote_duplicate_status text not null default 'UNKNOWN'
    check (remote_duplicate_status in ('UNKNOWN', 'CLEAR', 'DUPLICATE')),
  remote_duplicate_checked_at timestamptz,
  remote_duplicate_receipt_sha256 text
    check (
      remote_duplicate_receipt_sha256 is null
      or remote_duplicate_receipt_sha256 ~ '^[a-f0-9]{64}$'
    ),
  provider_publish_id text,
  provider_post_id text,
  provider_url text check (provider_url is null or provider_url ~ '^https://'),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'),
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 2000),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (provider, account_id)
    references public.social_connections(provider, external_account_id)
    on delete restrict,
  check (publish_not_after >= scheduled_at),
  check (attempts <= max_attempts),
  check (
    video_object_path !~ '(^/|(^|/)\.\.(/|$))'
    and char_length(video_object_path) <= 1024
  ),
  check (
    (cover_object_path is null and cover_sha256 is null)
    or (
      cover_object_path is not null
      and cover_object_path !~ '(^/|(^|/)\.\.(/|$))'
      and char_length(cover_object_path) <= 1024
      and cover_sha256 is not null
    )
  ),
  check (provider <> 'instagram' or music_mode = 'HOOMA_OWNED_MASTER'),
  check (
    (publishing_allowed is false)
    or (
      approval_status = 'APPROVED_EXACT'
      and approval_fingerprint = content_fingerprint
      and rights_status = 'CLEARED'
      and visual_claims_status = 'CLEARED'
    )
  ),
  check (
    state not in ('approved', 'media_staged', 'claimed', 'publishing', 'published', 'retry_wait')
    or approval_status = 'APPROVED_EXACT'
  ),
  check (
    state <> 'publishing'
    or remote_duplicate_status = 'CLEAR'
  ),
  check (
    state <> 'published'
    or (
      provider_post_id is not null
      and provider_url is not null
      and published_at is not null
      and remote_duplicate_status = 'CLEAR'
    )
  ),
  check (
    provider_url is null
    or (provider = 'tiktok' and provider_url ~ '^https://(www\.)?tiktok\.com/')
    or (provider = 'instagram' and provider_url ~ '^https://(www\.)?instagram\.com/')
  ),
  check (
    (
      approval_status = 'APPROVED_EXACT'
      and approved_by is not null
      and approved_at is not null
      and approval_fingerprint = content_fingerprint
    )
    or approval_status <> 'APPROVED_EXACT'
  )
);

create table if not exists public.social_publish_receipts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.social_publish_jobs(id) on delete restrict,
  chain_position integer not null default 0 check (chain_position > 0),
  attempt_number integer not null check (attempt_number between 0 and 10),
  event_type text not null check (
    event_type in (
      'PREFLIGHT_PASSED', 'PUBLISH_REQUESTED', 'PUBLISH_SUCCEEDED',
      'PUBLISH_FAILED', 'REMOTE_RESULT_UNCERTAIN', 'REMOTE_VERIFIED',
      'REMOTE_DUPLICATE_FOUND', 'CANCELLED', 'ANALYTICS_SNAPSHOT'
    )
  ),
  event_idempotency_key text not null unique
    check (char_length(trim(event_idempotency_key)) between 16 and 300),
  provider_request_id text,
  provider_publish_id text,
  provider_post_id text,
  payload jsonb not null default '{}'::jsonb
    check (public.social_json_is_redacted(payload)),
  payload_sha256 text not null default repeat('0', 64)
    check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  previous_receipt_sha256 text
    check (
      previous_receipt_sha256 is null
      or previous_receipt_sha256 ~ '^[a-f0-9]{64}$'
    ),
  receipt_sha256 text not null default repeat('0', 64)
    check (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(job_id, chain_position),
  unique(job_id, event_type, attempt_number, payload_sha256)
);

create unique index if not exists idx_social_publish_receipts_one_success
  on public.social_publish_receipts(job_id)
  where event_type = 'PUBLISH_SUCCEEDED';

create table if not exists public.social_publish_audit_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.social_publish_jobs(id) on delete restrict,
  chain_position integer not null default 0 check (chain_position > 0),
  event_type text not null check (char_length(trim(event_type)) between 3 and 120),
  event_idempotency_key text not null unique
    check (char_length(trim(event_idempotency_key)) between 16 and 300),
  actor_type text not null check (actor_type in ('HUMAN', 'SERVICE', 'PROVIDER')),
  actor_id uuid references public.profiles(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb
    check (public.social_json_is_redacted(event_data)),
  event_data_sha256 text not null default repeat('0', 64)
    check (event_data_sha256 ~ '^[a-f0-9]{64}$'),
  previous_event_sha256 text
    check (
      previous_event_sha256 is null
      or previous_event_sha256 ~ '^[a-f0-9]{64}$'
    ),
  event_sha256 text not null default repeat('0', 64)
    check (event_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(job_id, chain_position),
  check (actor_type <> 'HUMAN' or actor_id is not null)
);

create or replace function public.social_guard_publish_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  calculated_caption_sha256 text;
  calculated_music_receipt_sha256 text;
  calculated_settings_sha256 text;
  calculated_content_fingerprint text;
begin
  if tg_op = 'DELETE' then
    raise exception 'SOCIAL_PUBLISH_JOBS_MAY_NOT_BE_DELETED';
  end if;

  if tg_op = 'UPDATE' and old.state = 'published' then
    raise exception 'PUBLISHED_SOCIAL_JOB_IS_IMMUTABLE';
  end if;

  if public.social_json_is_redacted(new.music_receipt) is not true
    or public.social_music_receipt_is_valid(
      new.music_receipt,
      new.provider,
      new.music_mode,
      new.video_sha256
    ) is not true
  then
    raise exception 'SOCIAL_MUSIC_RECEIPT_INVALID';
  end if;

  calculated_caption_sha256 := encode(
    digest(convert_to(new.caption, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_music_receipt_sha256 := encode(
    digest(convert_to(new.music_receipt::text, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_settings_sha256 := encode(
    digest(convert_to(new.settings::text, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_content_fingerprint := encode(
    digest(
      convert_to(
        concat_ws(
          chr(31),
          'hooma-social-content-v1',
          new.post_id,
          new.provider,
          new.account_id,
          new.product_id::text,
          new.product_code,
          new.product_url,
          to_char(
            new.scheduled_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          to_char(
            new.publish_not_after at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          new.video_object_path,
          new.video_sha256,
          coalesce(new.cover_object_path, ''),
          coalesce(new.cover_sha256, ''),
          calculated_caption_sha256,
          new.music_mode,
          calculated_music_receipt_sha256,
          new.rights_status,
          new.visual_claims_status,
          calculated_settings_sha256
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if tg_op = 'UPDATE'
    and old.approval_status = 'APPROVED_EXACT'
    and old.content_fingerprint is distinct from calculated_content_fingerprint
  then
    raise exception 'APPROVED_SOCIAL_CONTENT_CHANGED';
  end if;

  new.caption_sha256 := calculated_caption_sha256;
  new.music_receipt_sha256 := calculated_music_receipt_sha256;
  new.settings_sha256 := calculated_settings_sha256;
  new.content_fingerprint := calculated_content_fingerprint;
  new.updated_at := now();

  if new.approval_status = 'APPROVED_EXACT' then
    if new.approval_fingerprint is distinct from calculated_content_fingerprint then
      raise exception 'SOCIAL_APPROVAL_FINGERPRINT_MISMATCH';
    end if;
    if not exists (
      select 1
      from public.profiles
      where id = new.approved_by
        and role = 'owner'
        and is_active is true
    ) then
      raise exception 'ACTIVE_OWNER_APPROVAL_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.social_chain_publish_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_hash text;
  previous_position integer;
  current_fingerprint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.job_id::text, 701));

  select content_fingerprint into current_fingerprint
  from public.social_publish_jobs
  where id = new.job_id;
  if current_fingerprint is null then raise exception 'SOCIAL_JOB_NOT_FOUND'; end if;

  select receipt_sha256, chain_position
  into previous_hash, previous_position
  from public.social_publish_receipts
  where job_id = new.job_id
  order by chain_position desc
  limit 1;

  new.payload_sha256 := encode(
    digest(convert_to(new.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.chain_position := coalesce(previous_position, 0) + 1;
  new.previous_receipt_sha256 := previous_hash;
  new.created_at := clock_timestamp();
  new.receipt_sha256 := encode(
    digest(
      convert_to(
        concat_ws(
          chr(31),
          'hooma-social-receipt-v1',
          new.id::text,
          new.job_id::text,
          new.chain_position::text,
          new.attempt_number::text,
          new.event_type,
          new.event_idempotency_key,
          coalesce(new.provider_request_id, ''),
          coalesce(new.provider_publish_id, ''),
          coalesce(new.provider_post_id, ''),
          new.payload_sha256,
          current_fingerprint,
          coalesce(new.previous_receipt_sha256, ''),
          new.created_at::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create or replace function public.social_chain_publish_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_hash text;
  previous_position integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.job_id::text, 702));

  select event_sha256, chain_position
  into previous_hash, previous_position
  from public.social_publish_audit_events
  where job_id = new.job_id
  order by chain_position desc
  limit 1;

  new.event_data_sha256 := encode(
    digest(convert_to(new.event_data::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.chain_position := coalesce(previous_position, 0) + 1;
  new.previous_event_sha256 := previous_hash;
  new.created_at := clock_timestamp();
  new.event_sha256 := encode(
    digest(
      convert_to(
        concat_ws(
          chr(31),
          'hooma-social-audit-v1',
          new.id::text,
          new.job_id::text,
          new.chain_position::text,
          new.event_type,
          new.event_idempotency_key,
          new.actor_type,
          coalesce(new.actor_id::text, ''),
          new.event_data_sha256,
          coalesce(new.previous_event_sha256, ''),
          new.created_at::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create or replace function public.social_reject_immutable_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'SOCIAL_RECEIPTS_AND_AUDIT_ARE_APPEND_ONLY';
end;
$$;

drop trigger if exists social_guard_publish_job on public.social_publish_jobs;
create trigger social_guard_publish_job
before insert or update or delete on public.social_publish_jobs
for each row execute function public.social_guard_publish_job();

drop trigger if exists social_chain_publish_receipt on public.social_publish_receipts;
create trigger social_chain_publish_receipt
before insert on public.social_publish_receipts
for each row execute function public.social_chain_publish_receipt();

drop trigger if exists social_publish_receipts_immutable on public.social_publish_receipts;
create trigger social_publish_receipts_immutable
before update or delete on public.social_publish_receipts
for each row execute function public.social_reject_immutable_mutation();

drop trigger if exists social_chain_publish_audit_event on public.social_publish_audit_events;
create trigger social_chain_publish_audit_event
before insert on public.social_publish_audit_events
for each row execute function public.social_chain_publish_audit_event();

drop trigger if exists social_publish_audit_immutable on public.social_publish_audit_events;
create trigger social_publish_audit_immutable
before update or delete on public.social_publish_audit_events
for each row execute function public.social_reject_immutable_mutation();

create index if not exists idx_social_oauth_states_expiry
  on public.social_oauth_states(provider, expires_at)
  where consumed_at is null;
create index if not exists idx_social_connections_refresh
  on public.social_connections(status, refresh_after);
create index if not exists idx_social_publish_jobs_due
  on public.social_publish_jobs(provider, state, scheduled_at, next_attempt_at)
  where publishing_allowed = true;
create index if not exists idx_social_publish_jobs_product
  on public.social_publish_jobs(product_id, created_at desc);
create unique index if not exists idx_social_publish_jobs_remote_post
  on public.social_publish_jobs(provider, provider_post_id)
  where provider_post_id is not null;
create index if not exists idx_social_publish_receipts_job_created
  on public.social_publish_receipts(job_id, created_at desc);
create index if not exists idx_social_publish_audit_job_created
  on public.social_publish_audit_events(job_id, created_at desc);

drop trigger if exists set_social_connections_updated_at on public.social_connections;
create trigger set_social_connections_updated_at before update on public.social_connections
for each row execute function public.set_updated_at();

drop trigger if exists set_social_publish_jobs_updated_at on public.social_publish_jobs;

alter table public.social_oauth_states enable row level security;
alter table public.social_oauth_states force row level security;
alter table public.social_encryption_nonces enable row level security;
alter table public.social_encryption_nonces force row level security;
alter table public.social_connections enable row level security;
alter table public.social_connections force row level security;
alter table public.social_publish_jobs enable row level security;
alter table public.social_publish_jobs force row level security;
alter table public.social_publish_receipts enable row level security;
alter table public.social_publish_receipts force row level security;
alter table public.social_publish_audit_events enable row level security;
alter table public.social_publish_audit_events force row level security;

revoke all on public.social_oauth_states from public, anon, authenticated;
revoke all on public.social_encryption_nonces from public, anon, authenticated;
revoke all on public.social_connections from public, anon, authenticated;
revoke all on public.social_publish_jobs from public, anon, authenticated;
revoke all on public.social_publish_receipts from public, anon, authenticated;
revoke all on public.social_publish_audit_events from public, anon, authenticated;
grant select, insert, delete on public.social_oauth_states to service_role;
grant select on public.social_encryption_nonces to service_role;
grant select on public.social_connections to service_role;
grant select, insert on public.social_publish_jobs to service_role;
grant select, insert on public.social_publish_receipts to service_role;
grant select, insert on public.social_publish_audit_events to service_role;
grant usage, select on sequence public.social_publish_receipts_id_seq to service_role;
grant usage, select on sequence public.social_publish_audit_events_id_seq to service_role;

create or replace function public.consume_social_oauth_state(
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
  if requested_provider not in ('tiktok', 'instagram')
    or requested_state_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.profiles
      where id = requested_actor_id
        and role = 'owner'
        and is_active is true
    )
  then return false; end if;

  select * into matched_state
  from public.social_oauth_states
  where provider = requested_provider
    and state_hash = requested_state_hash
    and actor_id = requested_actor_id
    and consumed_at is null
    and expires_at > now()
  for update;

  if matched_state.state_hash is null then return false; end if;

  update public.social_oauth_states
  set consumed_at = now()
  where state_hash = matched_state.state_hash;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    requested_actor_id,
    'social_oauth_state_consumed',
    'social_connection',
    requested_provider,
    jsonb_build_object('provider', requested_provider)
  );
  return true;
end;
$$;

create or replace function public.claim_social_connection_refresh(
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
  if requested_lease_seconds < 30 or requested_lease_seconds > 600 then
    raise exception 'Invalid refresh lease duration';
  end if;

  select * into selected_connection
  from public.social_connections
  where provider = requested_provider
    and status = 'active'
    and refresh_after <= now()
    and (refresh_lease_until is null or refresh_lease_until < now())
  for update skip locked;

  if selected_connection.provider is null then return null; end if;

  update public.social_connections
  set refresh_lease_id = new_lease_id,
      refresh_lease_until = now() + make_interval(secs => requested_lease_seconds)
  where provider = selected_connection.provider
  returning * into selected_connection;

  return to_jsonb(selected_connection);
end;
$$;

create or replace function public.upsert_social_connection(
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
  if requested_provider not in ('tiktok', 'instagram')
      or requested_username <> 'hooma.ge'
      or requested_token_type <> 'Bearer'
      or requested_external_account_id is null
      or length(requested_external_account_id) not between 1 and 256
      or requested_scopes is null
      or cardinality(requested_scopes) = 0
      or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
      or (
        requested_refresh_token_enc is not null
        and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc)
      )
      or requested_access_expires_at <= requested_issued_at
      or requested_refresh_after <= requested_issued_at
      or (requested_refresh_expires_at is not null and requested_refresh_expires_at <= requested_issued_at)
      or jsonb_typeof(requested_identity_snapshot) <> 'object' then
    return false;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = requested_connected_by and role = 'owner' and is_active = true
  ) then
    return false;
  end if;

  insert into public.social_connections (
    provider, external_account_id, username, token_type, scopes,
    access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at,
    issued_at, refresh_after, status, connected_by, identity_snapshot,
    last_refreshed_at, last_verified_at, last_error_code
  ) values (
    requested_provider, requested_external_account_id, requested_username,
    requested_token_type, requested_scopes, requested_access_token_enc,
    requested_refresh_token_enc, requested_access_expires_at,
    requested_refresh_expires_at, requested_issued_at, requested_refresh_after,
    'active', requested_connected_by, requested_identity_snapshot,
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
    refresh_expires_at = excluded.refresh_expires_at,
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
    requested_connected_by,
    'social_connection_authorized',
    'social_connection',
    requested_provider,
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

create or replace function public.complete_social_connection_refresh(
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
declare
  changed_rows integer;
begin
  if requested_provider not in ('tiktok', 'instagram')
      or requested_username <> 'hooma.ge'
      or requested_scopes is null
      or cardinality(requested_scopes) = 0
      or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
      or (
        requested_refresh_token_enc is not null
        and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc)
      )
      or requested_access_expires_at <= requested_issued_at
      or requested_refresh_after <= requested_issued_at
      or (requested_refresh_expires_at is not null and requested_refresh_expires_at <= requested_issued_at)
      or jsonb_typeof(requested_identity_snapshot) <> 'object' then
    return false;
  end if;

  update public.social_connections set
    username = requested_username,
    scopes = requested_scopes,
    access_token_enc = requested_access_token_enc,
    refresh_token_enc = coalesce(requested_refresh_token_enc, refresh_token_enc),
    access_expires_at = requested_access_expires_at,
    refresh_expires_at = requested_refresh_expires_at,
    issued_at = requested_issued_at,
    refresh_after = requested_refresh_after,
    token_version = token_version + 1,
    refresh_lease_id = null,
    refresh_lease_until = null,
    identity_snapshot = requested_identity_snapshot,
    last_refreshed_at = requested_issued_at,
    last_verified_at = requested_issued_at,
    last_error_code = null
  where provider = requested_provider
    and status = 'active'
    and token_version = requested_token_version
    and refresh_lease_id = requested_lease_id
    and refresh_lease_until > now();
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then return false; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null,
    'social_connection_token_refreshed',
    'social_connection',
    requested_provider,
    jsonb_build_object(
      'provider', requested_provider,
      'scope_count', cardinality(requested_scopes),
      'access_expires_at', requested_access_expires_at,
      'initiator', 'system_cron'
    )
  );
  return true;
end;
$$;

create or replace function public.fail_social_connection_refresh(
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
declare
  changed_rows integer;
begin
  if requested_provider not in ('tiktok', 'instagram')
      or requested_error_code !~ '^[A-Z0-9_]{3,80}$'
      or requested_retry_after <= now() then
    return false;
  end if;

  update public.social_connections set
    status = case when requested_reauthorization_required then 'reauth_required' else status end,
    refresh_after = requested_retry_after,
    refresh_lease_id = null,
    refresh_lease_until = null,
    last_error_code = requested_error_code
  where provider = requested_provider
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
    'social_connection',
    requested_provider,
    jsonb_build_object(
      'provider', requested_provider,
      'error_code', requested_error_code,
      'reauthorization_required', requested_reauthorization_required,
      'retry_after', requested_retry_after,
      'initiator', 'system_cron'
    )
  );
  return true;
end;
$$;

-- Exact approval is the only browser-callable surface in this migration. The
-- owner must supply the fingerprint currently visible in the review pack.
create or replace function public.approve_social_publish_job(
  requested_job_id uuid,
  expected_content_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_profile_id uuid := auth.uid();
  selected_job public.social_publish_jobs%rowtype;
begin
  if actor_profile_id is null or not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and role = 'owner'
      and is_active is true
  ) then
    raise exception 'ACTIVE_OWNER_APPROVAL_REQUIRED';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where id = requested_job_id
  for update;

  if selected_job.id is null then raise exception 'SOCIAL_JOB_NOT_FOUND'; end if;
  if selected_job.approval_status = 'APPROVED_EXACT'
    and selected_job.approval_fingerprint = expected_content_fingerprint
  then return to_jsonb(selected_job); end if;

  if selected_job.state <> 'waiting_for_approval'
    or expected_content_fingerprint !~ '^[a-f0-9]{64}$'
    or expected_content_fingerprint <> selected_job.content_fingerprint
    or selected_job.rights_status <> 'CLEARED'
    or selected_job.visual_claims_status <> 'CLEARED'
    or selected_job.publish_not_after < now()
    or not exists (
      select 1 from public.products
      where id = selected_job.product_id and status = 'active'
    )
    or not exists (
      select 1 from public.social_connections
      where provider = selected_job.provider
        and external_account_id = selected_job.account_id
        and status = 'active'
    )
  then
    raise exception 'SOCIAL_JOB_APPROVAL_PRECONDITIONS_FAILED';
  end if;

  update public.social_publish_jobs
  set approval_status = 'APPROVED_EXACT',
      approval_fingerprint = expected_content_fingerprint,
      approved_by = actor_profile_id,
      approved_at = now(),
      publishing_allowed = true,
      state = 'approved',
      next_attempt_at = scheduled_at
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, actor_id, event_data
  ) values (
    selected_job.id,
    'APPROVED_EXACT',
    'social-approval:' || selected_job.id::text || ':' || selected_job.content_fingerprint,
    'HUMAN',
    actor_profile_id,
    jsonb_build_object(
      'content_fingerprint', selected_job.content_fingerprint,
      'provider', selected_job.provider,
      'scheduled_at', selected_job.scheduled_at
    )
  ) on conflict (event_idempotency_key) do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'social_publish_job_approved_exact',
    'social_publish_job',
    selected_job.id::text,
    jsonb_build_object(
      'provider', selected_job.provider,
      'content_fingerprint', selected_job.content_fingerprint
    )
  );

  return to_jsonb(selected_job);
end;
$$;

create or replace function public.claim_due_social_publish_job(
  requested_provider text,
  requested_worker_window_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  new_claim_id uuid := gen_random_uuid();
begin
  -- This parameter is a claim lease, not permission to publish a late post.
  -- The immutable per-job publish_not_after remains authoritative.
  if requested_provider not in ('tiktok', 'instagram')
    or requested_worker_window_minutes < 1
    or requested_worker_window_minutes > 10
  then
    raise exception 'INVALID_SOCIAL_CLAIM_REQUEST';
  end if;

  select job.* into selected_job
  from public.social_publish_jobs job
  join public.social_connections connection
    on connection.provider = job.provider
   and connection.external_account_id = job.account_id
   and connection.status = 'active'
   and connection.access_expires_at > now() + interval '5 minutes'
  join public.products product
    on product.id = job.product_id
   and product.status = 'active'
  where job.provider = requested_provider
    and job.state in ('approved', 'media_staged', 'retry_wait')
    and job.publishing_allowed = true
    and job.approval_status = 'APPROVED_EXACT'
    and job.approval_fingerprint = job.content_fingerprint
    and job.rights_status = 'CLEARED'
    and job.visual_claims_status = 'CLEARED'
    and job.scheduled_at <= now()
    and job.publish_not_after >= now()
    and coalesce(job.next_attempt_at, job.scheduled_at) <= now()
    and job.attempts < job.max_attempts
    and job.provider_post_id is null
    and job.remote_duplicate_status <> 'DUPLICATE'
  order by job.scheduled_at, job.id
  limit 1
  for update of job skip locked;

  if selected_job.id is null then return null; end if;

  update public.social_publish_jobs
  set state = 'claimed',
      attempts = attempts + 1,
      claimed_at = now(),
      claim_id = new_claim_id,
      claim_expires_at = now() + make_interval(mins => requested_worker_window_minutes),
      remote_duplicate_status = 'UNKNOWN',
      remote_duplicate_checked_at = null,
      remote_duplicate_receipt_sha256 = null,
      last_error_code = null,
      last_error_message = null
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'CLAIMED',
    'social-claim:' || selected_job.id::text || ':' || selected_job.attempts::text,
    'SERVICE',
    jsonb_build_object(
      'attempt_number', selected_job.attempts,
      'claim_id', selected_job.claim_id,
      'claim_expires_at', selected_job.claim_expires_at
    )
  );

  return to_jsonb(selected_job);
end;
$$;

-- The worker calls this only after exact hash/ffprobe/account/product checks
-- and a fresh provider-side duplicate lookup. It moves the job to the
-- ambiguous-side-effect boundary; jobs in publishing are never auto-retried.
create or replace function public.authorize_social_publish_job(
  requested_job_id uuid,
  requested_claim_id uuid,
  observed_video_sha256 text,
  observed_content_fingerprint text,
  qa_receipt_sha256 text,
  remote_duplicate_receipt_sha256 text,
  preflight_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
begin
  if observed_video_sha256 !~ '^[a-f0-9]{64}$'
    or observed_content_fingerprint !~ '^[a-f0-9]{64}$'
    or qa_receipt_sha256 !~ '^[a-f0-9]{64}$'
    or remote_duplicate_receipt_sha256 !~ '^[a-f0-9]{64}$'
    or public.social_json_is_redacted(preflight_payload) is not true
  then raise exception 'SOCIAL_PREFLIGHT_INVALID'; end if;

  select * into selected_job
  from public.social_publish_jobs
  where id = requested_job_id
  for update;

  if selected_job.id is null then raise exception 'SOCIAL_JOB_NOT_FOUND'; end if;
  if selected_job.state = 'publishing'
    and selected_job.claim_id = requested_claim_id
    and exists (
      select 1 from public.social_publish_receipts
      where job_id = selected_job.id
        and attempt_number = selected_job.attempts
        and event_type = 'PREFLIGHT_PASSED'
    )
  then return to_jsonb(selected_job); end if;

  if selected_job.state <> 'claimed'
    or selected_job.claim_id is distinct from requested_claim_id
    or selected_job.claim_expires_at < now()
    or selected_job.publish_not_after < now()
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> selected_job.content_fingerprint
    or selected_job.video_sha256 <> observed_video_sha256
    or selected_job.content_fingerprint <> observed_content_fingerprint
    or selected_job.rights_status <> 'CLEARED'
    or selected_job.visual_claims_status <> 'CLEARED'
    or not exists (
      select 1 from public.products
      where id = selected_job.product_id and status = 'active'
    )
    or not exists (
      select 1 from public.social_connections
      where provider = selected_job.provider
        and external_account_id = selected_job.account_id
        and status = 'active'
        and access_expires_at > now() + interval '5 minutes'
    )
  then raise exception 'SOCIAL_PREFLIGHT_STATE_MISMATCH'; end if;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key, payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'PREFLIGHT_PASSED',
    'social-preflight:' || selected_job.id::text || ':' || selected_job.attempts::text,
    preflight_payload || jsonb_build_object(
      'qa_receipt_sha256', qa_receipt_sha256,
      'remote_duplicate_receipt_sha256', remote_duplicate_receipt_sha256,
      'content_fingerprint', selected_job.content_fingerprint
    )
  );

  update public.social_publish_jobs
  set state = 'publishing',
      remote_duplicate_status = 'CLEAR',
      remote_duplicate_checked_at = now(),
      remote_duplicate_receipt_sha256 = remote_duplicate_receipt_sha256,
      claim_expires_at = now() + interval '5 minutes'
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'PREFLIGHT_PASSED',
    'social-preflight-audit:' || selected_job.id::text || ':' || selected_job.attempts::text,
    'SERVICE',
    jsonb_build_object(
      'attempt_number', selected_job.attempts,
      'content_fingerprint', selected_job.content_fingerprint,
      'remote_duplicate_receipt_sha256', remote_duplicate_receipt_sha256
    )
  );

  return to_jsonb(selected_job);
end;
$$;

create or replace function public.block_social_publish_remote_duplicate(
  requested_job_id uuid,
  requested_claim_id uuid,
  duplicate_receipt_sha256 text,
  duplicate_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
begin
  if duplicate_receipt_sha256 !~ '^[a-f0-9]{64}$'
    or public.social_json_is_redacted(duplicate_payload) is not true
  then raise exception 'SOCIAL_DUPLICATE_RECEIPT_INVALID'; end if;

  select * into selected_job
  from public.social_publish_jobs where id = requested_job_id for update;
  if selected_job.id is null
    or selected_job.state <> 'claimed'
    or selected_job.claim_id is distinct from requested_claim_id
  then raise exception 'SOCIAL_DUPLICATE_STATE_MISMATCH'; end if;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key, payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'REMOTE_DUPLICATE_FOUND',
    'social-duplicate:' || selected_job.id::text || ':' || selected_job.attempts::text,
    duplicate_payload || jsonb_build_object(
      'duplicate_receipt_sha256', duplicate_receipt_sha256
    )
  );

  update public.social_publish_jobs
  set state = 'blocked_policy',
      publishing_allowed = false,
      remote_duplicate_status = 'DUPLICATE',
      remote_duplicate_checked_at = now(),
      remote_duplicate_receipt_sha256 = duplicate_receipt_sha256,
      claim_expires_at = null,
      next_attempt_at = null,
      last_error_code = 'REMOTE_DUPLICATE_FOUND',
      last_error_message = 'A matching remote post already exists; no publish request was sent.'
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'REMOTE_DUPLICATE_FOUND',
    'social-duplicate-audit:' || selected_job.id::text || ':' || selected_job.attempts::text,
    'SERVICE',
    jsonb_build_object('attempt_number', selected_job.attempts)
  );

  return to_jsonb(selected_job);
end;
$$;

create or replace function public.complete_social_publish_job(
  requested_job_id uuid,
  requested_claim_id uuid,
  provider_request_id text,
  provider_request_sha256 text,
  requested_provider_publish_id text,
  requested_provider_post_id text,
  requested_provider_url text,
  provider_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
begin
  if provider_request_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(trim(coalesce(requested_provider_post_id, ''))) < 1
    or requested_provider_url !~ '^https://'
    or public.social_json_is_redacted(provider_payload) is not true
  then raise exception 'SOCIAL_PUBLISH_RESULT_INVALID'; end if;

  select * into selected_job
  from public.social_publish_jobs where id = requested_job_id for update;

  if selected_job.id is null then raise exception 'SOCIAL_JOB_NOT_FOUND'; end if;
  if selected_job.state = 'published' then
    if selected_job.provider_post_id = requested_provider_post_id
      and selected_job.provider_url = requested_provider_url
    then return to_jsonb(selected_job); end if;
    raise exception 'SOCIAL_REMOTE_RESULT_CONFLICT';
  end if;

  if selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> selected_job.content_fingerprint
    or selected_job.remote_duplicate_status <> 'CLEAR'
    or not exists (
      select 1 from public.social_publish_receipts
      where job_id = selected_job.id
        and attempt_number = selected_job.attempts
        and event_type = 'PREFLIGHT_PASSED'
    )
  then raise exception 'SOCIAL_PUBLISH_COMPLETION_NOT_AUTHORIZED'; end if;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key,
    provider_request_id, provider_publish_id, provider_post_id, payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    'PUBLISH_SUCCEEDED',
    'social-publish-success:' || selected_job.id::text,
    nullif(trim(provider_request_id), ''),
    nullif(trim(requested_provider_publish_id), ''),
    requested_provider_post_id,
    provider_payload || jsonb_build_object(
      'provider_request_sha256', provider_request_sha256,
      'provider_url', requested_provider_url
    )
  );

  update public.social_publish_jobs
  set state = 'published',
      publishing_allowed = false,
      provider_publish_id = nullif(trim(requested_provider_publish_id), ''),
      provider_post_id = requested_provider_post_id,
      provider_url = requested_provider_url,
      published_at = now(),
      claim_expires_at = null,
      next_attempt_at = null,
      last_error_code = null,
      last_error_message = null
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'PUBLISHED',
    'social-published:' || selected_job.id::text,
    'PROVIDER',
    jsonb_build_object(
      'provider_post_id', selected_job.provider_post_id,
      'provider_url', selected_job.provider_url,
      'published_at', selected_job.published_at
    )
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    selected_job.approved_by,
    'social_publish_job_published',
    'social_publish_job',
    selected_job.id::text,
    jsonb_build_object(
      'provider', selected_job.provider,
      'provider_post_id', selected_job.provider_post_id,
      'content_fingerprint', selected_job.content_fingerprint
    )
  );

  return to_jsonb(selected_job);
end;
$$;

-- A failure is retryable only when the worker knows no remote side effect
-- occurred. Timeouts and ambiguous responses are permanently blocked pending
-- remote verification, never automatically retried.
create or replace function public.fail_social_publish_job(
  requested_job_id uuid,
  requested_claim_id uuid,
  provider_request_id text,
  requested_error_code text,
  provider_payload jsonb,
  remote_side_effect_possible boolean,
  requested_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  next_state text;
begin
  if requested_error_code !~ '^[A-Z0-9_]{3,80}$'
    or public.social_json_is_redacted(provider_payload) is not true
  then raise exception 'SOCIAL_FAILURE_RECEIPT_INVALID'; end if;

  select * into selected_job
  from public.social_publish_jobs where id = requested_job_id for update;
  if selected_job.id is null
    or selected_job.state not in ('claimed', 'publishing')
    or selected_job.claim_id is distinct from requested_claim_id
  then raise exception 'SOCIAL_FAILURE_STATE_MISMATCH'; end if;

  if remote_side_effect_possible then
    next_state := 'blocked_remote_uncertain';
  elsif selected_job.attempts < selected_job.max_attempts
    and requested_retry_at is not null
    and requested_retry_at >= now()
    and requested_retry_at <= selected_job.publish_not_after
  then
    next_state := 'retry_wait';
  else
    next_state := 'failed';
  end if;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key,
    provider_request_id, payload
  ) values (
    selected_job.id,
    selected_job.attempts,
    case when remote_side_effect_possible
      then 'REMOTE_RESULT_UNCERTAIN'
      else 'PUBLISH_FAILED'
    end,
    'social-publish-failure:' || selected_job.id::text || ':' || selected_job.attempts::text,
    nullif(trim(provider_request_id), ''),
    provider_payload || jsonb_build_object(
      'error_code', requested_error_code,
      'remote_side_effect_possible', remote_side_effect_possible
    )
  );

  update public.social_publish_jobs
  set state = next_state,
      publishing_allowed = (next_state = 'retry_wait'),
      next_attempt_at = case when next_state = 'retry_wait' then requested_retry_at else null end,
      claim_expires_at = null,
      remote_duplicate_status = case
        when next_state = 'retry_wait' then 'UNKNOWN'
        else remote_duplicate_status
      end,
      remote_duplicate_checked_at = case
        when next_state = 'retry_wait' then null
        else remote_duplicate_checked_at
      end,
      remote_duplicate_receipt_sha256 = case
        when next_state = 'retry_wait' then null
        else remote_duplicate_receipt_sha256
      end,
      last_error_code = case
        when remote_side_effect_possible then 'REMOTE_RESULT_UNCERTAIN'
        else requested_error_code
      end,
      last_error_message = case
        when remote_side_effect_possible
          then 'Remote result is uncertain; verify the provider account before any retry.'
        else 'The provider rejected the request without a confirmed remote side effect.'
      end
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    selected_job.last_error_code,
    'social-publish-failure-audit:' || selected_job.id::text || ':' || selected_job.attempts::text,
    'SERVICE',
    jsonb_build_object(
      'state', selected_job.state,
      'attempt_number', selected_job.attempts,
      'remote_side_effect_possible', remote_side_effect_possible
    )
  );

  return to_jsonb(selected_job);
end;
$$;

revoke all on function public.consume_social_oauth_state(text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_social_connection_refresh(text, integer) from public, anon, authenticated;
revoke all on function public.upsert_social_connection(text, text, text, text, text[], jsonb, jsonb, timestamptz, timestamptz, timestamptz, timestamptz, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_social_connection_refresh(text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.fail_social_connection_refresh(text, uuid, bigint, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.social_json_is_redacted(jsonb) from public, anon, authenticated;
revoke all on function public.social_aes_gcm_envelope_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.social_music_receipt_is_valid(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.register_social_encryption_nonce(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.social_register_oauth_state_nonce() from public, anon, authenticated;
revoke all on function public.social_guard_connection_secrets() from public, anon, authenticated;
revoke all on function public.social_guard_publish_job() from public, anon, authenticated;
revoke all on function public.social_chain_publish_receipt() from public, anon, authenticated;
revoke all on function public.social_chain_publish_audit_event() from public, anon, authenticated;
revoke all on function public.social_reject_immutable_mutation() from public, anon, authenticated;
revoke all on function public.approve_social_publish_job(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_social_publish_job(text, integer) from public, anon, authenticated;
revoke all on function public.authorize_social_publish_job(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.block_social_publish_remote_duplicate(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_social_publish_job(uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_social_publish_job(uuid, uuid, text, text, jsonb, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_social_oauth_state(text, text, uuid) to service_role;
grant execute on function public.claim_social_connection_refresh(text, integer) to service_role;
grant execute on function public.social_json_is_redacted(jsonb) to service_role;
grant execute on function public.social_aes_gcm_envelope_is_valid(jsonb) to service_role;
grant execute on function public.social_music_receipt_is_valid(jsonb, text, text, text) to service_role;
grant execute on function public.upsert_social_connection(text, text, text, text, text[], jsonb, jsonb, timestamptz, timestamptz, timestamptz, timestamptz, uuid, jsonb) to service_role;
grant execute on function public.complete_social_connection_refresh(text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz, timestamptz, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.fail_social_connection_refresh(text, uuid, bigint, text, boolean, timestamptz) to service_role;
grant execute on function public.approve_social_publish_job(uuid, text) to authenticated;
grant execute on function public.claim_due_social_publish_job(text, integer) to service_role;
grant execute on function public.authorize_social_publish_job(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.block_social_publish_remote_duplicate(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.complete_social_publish_job(uuid, uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.fail_social_publish_job(uuid, uuid, text, text, jsonb, boolean, timestamptz) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-publishing-staging',
  'social-publishing-staging',
  false,
  536870912,
  array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no storage.objects policies: only the server-side service role
-- may stage media or issue short-lived signed provider URLs.

comment on table public.social_encryption_nonces is
  'Permanent AES-256-GCM nonce registry. Rows are append-only and never contain plaintext secrets.';
comment on table public.social_connections is
  'Hooma social OAuth connections with exact AES-256-GCM envelopes; service-role only.';
comment on table public.social_publish_jobs is
  'Exact-fingerprint, owner-approved, fail-closed TikTok and Instagram publish queue.';
comment on table public.social_publish_receipts is
  'Append-only hash-chained redacted publishing receipts.';
comment on table public.social_publish_audit_events is
  'Append-only hash-chained social publishing audit events.';

commit;
