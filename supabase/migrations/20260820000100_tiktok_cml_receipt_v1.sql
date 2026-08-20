-- Bind TikTok publish jobs to the exact immutable CML v1 receipt consumed by
-- the Organic Accounts adapter. Publishing remains controlled by application
-- kill switches; this migration does not register or invoke a provider worker.

begin;

create or replace function public.social_jsonb_has_exact_keys(
  payload jsonb,
  expected_keys text[]
)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select jsonb_typeof(payload) = 'object'
    and payload ?& expected_keys
    and not exists (
      select 1
      from jsonb_object_keys(payload) as supplied(key_name)
      where supplied.key_name <> all(expected_keys)
    );
$$;

create or replace function public.social_tiktok_cml_receipt_v1_is_valid(
  receipt jsonb,
  requested_account_id text,
  requested_post_id text,
  requested_video_sha256 text,
  requested_caption_sha256 text,
  requested_content_fingerprint text
)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  selected_at timestamptz;
  valid_until timestamptz;
  selection_payload text;
  calculated_selection_fingerprint text;
begin
  if public.social_jsonb_has_exact_keys(
      receipt,
      array[
        'schemaVersion', 'receiptType', 'immutable', 'status', 'context',
        'track', 'mix', 'binding', 'selectedAt', 'validUntil',
        'selectionFingerprint'
      ]
    ) is not true
    or public.social_jsonb_has_exact_keys(
      receipt -> 'context', array['platform', 'accountId', 'postId']
    ) is not true
    or public.social_jsonb_has_exact_keys(
      receipt -> 'track',
      array[
        'musicSoundId', 'region', 'placement', 'commercialUseAllowed',
        'catalogEvidenceSha256'
      ]
    ) is not true
    or public.social_jsonb_has_exact_keys(
      receipt -> 'mix',
      array['musicSoundVolume', 'videoOriginalSoundVolume']
    ) is not true
    or public.social_jsonb_has_exact_keys(
      receipt -> 'binding',
      array[
        'contentFingerprint', 'approvalFingerprint', 'videoSha256',
        'captionSha256'
      ]
    ) is not true
  then return false; end if;

  if jsonb_typeof(receipt -> 'schemaVersion') <> 'number'
    or (receipt ->> 'schemaVersion')::integer <> 1
    or receipt ->> 'receiptType' <> 'TIKTOK_COMMERCIAL_MUSIC_SELECTION'
    or jsonb_typeof(receipt -> 'immutable') <> 'boolean'
    or (receipt ->> 'immutable')::boolean is not true
    or receipt ->> 'status' <> 'APPROVED'
    or receipt #>> '{context,platform}' <> 'tiktok'
    or receipt #>> '{context,accountId}' is distinct from requested_account_id
    or receipt #>> '{context,postId}' is distinct from requested_post_id
    or requested_account_id !~ '^[A-Za-z0-9._:~-]{1,256}$'
    or requested_post_id !~ '^[A-Za-z0-9._:~-]{1,160}$'
    or receipt #>> '{track,musicSoundId}' !~ '^[A-Za-z0-9._:~-]{1,256}$'
    or receipt #>> '{track,region}' !~ '^[A-Z]{2}$'
    or receipt #>> '{track,placement}' <> 'ORGANIC'
    or jsonb_typeof(receipt #> '{track,commercialUseAllowed}') <> 'boolean'
    or (receipt #>> '{track,commercialUseAllowed}')::boolean is not true
    or receipt #>> '{track,catalogEvidenceSha256}' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(receipt #> '{mix,musicSoundVolume}') <> 'number'
    or (receipt #>> '{mix,musicSoundVolume}')::numeric % 1 <> 0
    or (receipt #>> '{mix,musicSoundVolume}')::integer not between 1 and 100
    or jsonb_typeof(receipt #> '{mix,videoOriginalSoundVolume}') <> 'number'
    or (receipt #>> '{mix,videoOriginalSoundVolume}')::numeric % 1 <> 0
    or (receipt #>> '{mix,videoOriginalSoundVolume}')::integer not between 0 and 100
    or requested_video_sha256 !~ '^[a-f0-9]{64}$'
    or requested_caption_sha256 !~ '^[a-f0-9]{64}$'
    or requested_content_fingerprint !~ '^[a-f0-9]{64}$'
    or receipt #>> '{binding,contentFingerprint}' is distinct from requested_content_fingerprint
    or receipt #>> '{binding,approvalFingerprint}' is distinct from requested_content_fingerprint
    or receipt #>> '{binding,videoSha256}' is distinct from requested_video_sha256
    or receipt #>> '{binding,captionSha256}' is distinct from requested_caption_sha256
    or receipt ->> 'selectionFingerprint' !~ '^[a-f0-9]{64}$'
    or receipt ->> 'selectedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or receipt ->> 'validUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  then return false; end if;

  selected_at := (receipt ->> 'selectedAt')::timestamptz;
  valid_until := (receipt ->> 'validUntil')::timestamptz;
  if valid_until <= selected_at then return false; end if;

  -- This is the adapter's stableJson(selectionFingerprintPayload(receipt))
  -- byte-for-byte: object keys are lexical, strings are safe constrained
  -- above, and selectionFingerprint itself is intentionally omitted.
  selection_payload := format(
    '{"binding":{"approvalFingerprint":"%s","captionSha256":"%s","contentFingerprint":"%s","videoSha256":"%s"},"context":{"accountId":"%s","platform":"tiktok","postId":"%s"},"immutable":true,"mix":{"musicSoundVolume":%s,"videoOriginalSoundVolume":%s},"receiptType":"TIKTOK_COMMERCIAL_MUSIC_SELECTION","schemaVersion":1,"selectedAt":"%s","status":"APPROVED","track":{"catalogEvidenceSha256":"%s","commercialUseAllowed":true,"musicSoundId":"%s","placement":"ORGANIC","region":"%s"},"validUntil":"%s"}',
    requested_content_fingerprint,
    requested_caption_sha256,
    requested_content_fingerprint,
    requested_video_sha256,
    requested_account_id,
    requested_post_id,
    (receipt #>> '{mix,musicSoundVolume}')::integer,
    (receipt #>> '{mix,videoOriginalSoundVolume}')::integer,
    receipt ->> 'selectedAt',
    receipt #>> '{track,catalogEvidenceSha256}',
    receipt #>> '{track,musicSoundId}',
    receipt #>> '{track,region}',
    receipt ->> 'validUntil'
  );
  calculated_selection_fingerprint := encode(
    extensions.digest(convert_to(selection_payload, 'UTF8'), 'sha256'),
    'hex'
  );

  return receipt ->> 'selectionFingerprint' = calculated_selection_fingerprint;
exception when others then
  return false;
end;
$$;

-- Keep the existing public signature fail-closed for callers that do not yet
-- have the complete job binding. Exact binding is enforced by the job guard.
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
    return public.social_tiktok_cml_receipt_v1_is_valid(
      receipt,
      receipt #>> '{context,accountId}',
      receipt #>> '{context,postId}',
      requested_video_sha256,
      receipt #>> '{binding,captionSha256}',
      receipt #>> '{binding,contentFingerprint}'
    );
  end if;

  return false;
exception when others then
  return false;
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
  calculated_music_approval_sha256 text;
  calculated_settings_sha256 text;
  calculated_content_fingerprint text;
begin
  if tg_op = 'DELETE' then
    raise exception 'SOCIAL_PUBLISH_JOBS_MAY_NOT_BE_DELETED';
  end if;

  if tg_op = 'UPDATE' and old.state = 'published' then
    raise exception 'PUBLISHED_SOCIAL_JOB_IS_IMMUTABLE';
  end if;

  if public.social_json_is_redacted(new.music_receipt) is not true then
    raise exception 'SOCIAL_MUSIC_RECEIPT_INVALID';
  end if;

  calculated_caption_sha256 := encode(
    extensions.digest(convert_to(new.caption, 'UTF8'), 'sha256'), 'hex'
  );
  calculated_music_receipt_sha256 := encode(
    extensions.digest(convert_to(new.music_receipt::text, 'UTF8'), 'sha256'), 'hex'
  );
  calculated_settings_sha256 := encode(
    extensions.digest(convert_to(new.settings::text, 'UTF8'), 'sha256'), 'hex'
  );

  if new.provider = 'tiktok' and new.music_mode = 'TIKTOK_CML' then
    -- This approval hash deliberately excludes binding and
    -- selectionFingerprint. Both are derived only after this content
    -- fingerprint exists. The complete receipt is frozen once approved and
    -- its adapter-computed selectionFingerprint is revalidated before use.
    calculated_music_approval_sha256 := encode(
      extensions.digest(
        convert_to(
          concat_ws(
            chr(31),
            'hooma-tiktok-cml-approval-v1',
            new.music_receipt ->> 'schemaVersion',
            new.music_receipt ->> 'receiptType',
            new.music_receipt ->> 'immutable',
            new.music_receipt ->> 'status',
            new.music_receipt #>> '{context,platform}',
            new.music_receipt #>> '{context,accountId}',
            new.music_receipt #>> '{context,postId}',
            new.music_receipt #>> '{track,musicSoundId}',
            new.music_receipt #>> '{track,region}',
            new.music_receipt #>> '{track,placement}',
            new.music_receipt #>> '{track,commercialUseAllowed}',
            new.music_receipt #>> '{track,catalogEvidenceSha256}',
            new.music_receipt #>> '{mix,musicSoundVolume}',
            new.music_receipt #>> '{mix,videoOriginalSoundVolume}',
            new.music_receipt ->> 'selectedAt',
            new.music_receipt ->> 'validUntil'
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  else
    calculated_music_approval_sha256 := calculated_music_receipt_sha256;
  end if;

  calculated_content_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          chr(31),
          case
            when new.provider = 'tiktok' and new.music_mode = 'TIKTOK_CML'
              then 'hooma-social-content-v2-tiktok-cml'
            else 'hooma-social-content-v1'
          end,
          new.post_id,
          new.provider,
          new.account_id,
          new.product_id::text,
          new.product_code,
          new.product_url,
          to_char(new.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          to_char(new.publish_not_after at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          new.video_object_path,
          new.video_sha256,
          coalesce(new.cover_object_path, ''),
          coalesce(new.cover_sha256, ''),
          calculated_caption_sha256,
          new.music_mode,
          calculated_music_approval_sha256,
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

  if new.provider = 'tiktok' and new.music_mode = 'TIKTOK_CML' then
    if public.social_tiktok_cml_receipt_v1_is_valid(
      new.music_receipt,
      new.account_id,
      new.post_id,
      new.video_sha256,
      calculated_caption_sha256,
      calculated_content_fingerprint
    ) is not true
      or (new.music_receipt ->> 'selectedAt')::timestamptz > now() + interval '5 minutes'
      or (new.music_receipt ->> 'validUntil')::timestamptz <= now()
    then
      raise exception 'SOCIAL_TIKTOK_CML_V1_RECEIPT_INVALID';
    end if;
  elsif public.social_music_receipt_is_valid(
    new.music_receipt,
    new.provider,
    new.music_mode,
    new.video_sha256
  ) is not true then
    raise exception 'SOCIAL_MUSIC_RECEIPT_INVALID';
  end if;

  if tg_op = 'UPDATE'
    and old.approval_status = 'APPROVED_EXACT'
    and (
      old.content_fingerprint is distinct from calculated_content_fingerprint
      or old.music_receipt is distinct from new.music_receipt
    )
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
      where id = new.approved_by and role = 'owner' and is_active is true
    ) then
      raise exception 'ACTIVE_OWNER_APPROVAL_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

-- Existing shallow CML rows are intentionally not grandfathered in. The
-- constraint is NOT VALID so migration deployment itself is non-destructive,
-- while every new or modified row must satisfy the exact v1 contract.
alter table public.social_publish_jobs
  add constraint social_publish_jobs_tiktok_cml_v1_receipt
  check (
    provider <> 'tiktok'
    or music_mode <> 'TIKTOK_CML'
    or public.social_tiktok_cml_receipt_v1_is_valid(
      music_receipt,
      account_id,
      post_id,
      video_sha256,
      caption_sha256,
      content_fingerprint
    )
  ) not valid;

revoke all on function public.social_jsonb_has_exact_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.social_tiktok_cml_receipt_v1_is_valid(jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.social_jsonb_has_exact_keys(jsonb, text[]) to service_role;
grant execute on function public.social_tiktok_cml_receipt_v1_is_valid(jsonb, text, text, text, text, text) to service_role;

comment on function public.social_tiktok_cml_receipt_v1_is_valid(jsonb, text, text, text, text, text) is
  'Validates the exact immutable TikTok CML v1 receipt and its non-circular job binding.';

commit;
