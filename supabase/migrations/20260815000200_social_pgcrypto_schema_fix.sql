-- Qualify pgcrypto explicitly inside the affected social SECURITY DEFINER
-- functions. Supabase installs pgcrypto in the extensions schema, while their
-- deliberately narrow search_path excludes that schema.

begin;

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
    encode(
      extensions.digest(convert_to(envelope::text, 'UTF8'), 'sha256'),
      'hex'
    )
  );
exception when unique_violation then
  raise exception 'AES_GCM_NONCE_REUSE_BLOCKED';
end;
$$;

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
    extensions.digest(convert_to(new.caption, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_music_receipt_sha256 := encode(
    extensions.digest(convert_to(new.music_receipt::text, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_settings_sha256 := encode(
    extensions.digest(convert_to(new.settings::text, 'UTF8'), 'sha256'),
    'hex'
  );
  calculated_content_fingerprint := encode(
    extensions.digest(
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
    extensions.digest(convert_to(new.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.chain_position := coalesce(previous_position, 0) + 1;
  new.previous_receipt_sha256 := previous_hash;
  new.created_at := clock_timestamp();
  new.receipt_sha256 := encode(
    extensions.digest(
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
    extensions.digest(convert_to(new.event_data::text, 'UTF8'), 'sha256'),
    'hex'
  );
  new.chain_position := coalesce(previous_position, 0) + 1;
  new.previous_event_sha256 := previous_hash;
  new.created_at := clock_timestamp();
  new.event_sha256 := encode(
    extensions.digest(
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

revoke all on function public.register_social_encryption_nonce(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.register_social_encryption_nonce(text, text, text, jsonb)
  to service_role;

commit;
