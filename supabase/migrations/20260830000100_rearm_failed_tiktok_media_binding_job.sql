-- Re-arm an exact-approved TikTok job only after Hooma rejected its canonical
-- `video-<sha256>.mp4` staging name before any provider publish intent existed.
-- The owner-requested replacement window creates a new content fingerprint,
-- so approval is explicitly revoked, recalculated, and re-issued in one
-- locked transaction with immutable audit evidence.

begin;

create or replace function public.rearm_failed_tiktok_media_binding_job_v1(
  requested_post_id text,
  expected_content_fingerprint text,
  expected_campaign_approval_fingerprint text,
  expected_video_sha256 text,
  expected_attempts integer,
  requested_publish_not_after timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  approving_owner_id uuid;
  approval_timestamp timestamptz := clock_timestamp();
  approved_window_text text;
  approval_timestamp_text text;
  retry_event_key text;
begin
  if requested_post_id !~ '^P-[0-9]{8}-TT-[0-9]{4}-[A-Z0-9-]+$'
    or expected_content_fingerprint !~ '^[a-f0-9]{64}$'
    or expected_campaign_approval_fingerprint !~ '^[a-f0-9]{64}$'
    or expected_video_sha256 !~ '^[a-f0-9]{64}$'
    or expected_attempts <> 1
    or requested_publish_not_after <= now() + interval '15 minutes'
    or requested_publish_not_after > now() + interval '3 hours'
    or (requested_publish_not_after at time zone 'Asia/Tbilisi')::date
      <> (now() at time zone 'Asia/Tbilisi')::date
  then
    raise exception 'TIKTOK_MEDIA_BINDING_RETRY_REQUEST_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where post_id = requested_post_id
  for update;

  if selected_job.id is null then
    raise exception 'TIKTOK_MEDIA_BINDING_RETRY_JOB_NOT_FOUND';
  end if;

  retry_event_key :=
    'tiktok-media-binding-retry:' || selected_job.id::text || ':' || expected_attempts::text;

  if selected_job.provider = 'tiktok'
    and selected_job.state = 'approved'
    and selected_job.publishing_allowed is true
    and selected_job.approval_status = 'APPROVED_EXACT'
    and selected_job.attempts = expected_attempts
    and selected_job.publish_not_after = requested_publish_not_after
    and selected_job.last_error_code is null
    and exists (
      select 1
      from public.social_publish_audit_events audit
      where audit.job_id = selected_job.id
        and audit.event_idempotency_key = retry_event_key
        and audit.event_data ->> 'prior_content_fingerprint' = expected_content_fingerprint
    )
  then
    return to_jsonb(selected_job);
  end if;

  if selected_job.provider <> 'tiktok'
    or selected_job.state <> 'failed'
    or selected_job.last_error_code <> 'TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH'
    or selected_job.publishing_allowed is not false
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> expected_content_fingerprint
    or selected_job.content_fingerprint <> expected_content_fingerprint
    or selected_job.settings ->> 'campaignApprovalFingerprint'
      <> expected_campaign_approval_fingerprint
    or selected_job.video_sha256 <> expected_video_sha256
    or selected_job.video_object_path
      not like ('%/video-' || expected_video_sha256 || '.mp4')
    or selected_job.music_mode <> 'HOOMA_OWNED_MASTER'
    or selected_job.music_receipt ->> 'receiptType'
      <> 'HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE'
    or selected_job.music_receipt #>> '{context,platform}' <> 'tiktok'
    or selected_job.music_receipt #>> '{context,postId}' <> selected_job.post_id
    or selected_job.music_receipt #>> '{output,sha256}' <> selected_job.video_sha256
    or selected_job.settings #>> '{approvedPublishWindow,timezone}' <> 'Asia/Tbilisi'
    or selected_job.settings #>> '{exactCreativeApproval,owner}' <> 'Giorgi'
    or selected_job.settings #>> '{exactCreativeApproval,status}' <> 'APPROVED_EXACT'
    or selected_job.rights_status <> 'CLEARED'
    or selected_job.visual_claims_status <> 'CLEARED'
    or selected_job.attempts <> expected_attempts
    or selected_job.attempts >= selected_job.max_attempts
    or selected_job.scheduled_at > now()
    or selected_job.publish_not_after >= now()
    or selected_job.provider_publish_id is not null
    or selected_job.provider_post_id is not null
    or selected_job.provider_url is not null
    or selected_job.published_at is not null
    or exists (
      select 1
      from public.social_tiktok_publish_lifecycles lifecycle
      where lifecycle.job_id = selected_job.id
    )
    or exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.job_id = selected_job.id
        and receipt.event_type in ('PUBLISH_SUCCEEDED', 'REMOTE_VERIFIED')
    )
    or not exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.job_id = selected_job.id
        and receipt.attempt_number = expected_attempts
        and receipt.event_type = 'PUBLISH_FAILED'
        and receipt.payload ->> 'error_code' = 'TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH'
        and receipt.payload ->> 'remote_side_effect_possible' = 'false'
        and receipt.provider_request_id is null
        and receipt.provider_publish_id is null
        and receipt.provider_post_id is null
    )
    or not exists (
      select 1
      from public.products product
      where product.id = selected_job.product_id
        and product.status = 'active'
    )
    or not exists (
      select 1
      from public.social_connections connection
      where connection.provider = 'tiktok'
        and connection.external_account_id = selected_job.account_id
        and connection.status = 'active'
        and lower(trim(connection.username)) = 'hooma.ge'
        and connection.access_expires_at > now() + interval '15 minutes'
    )
    or not exists (
      select 1
      from public.profiles owner_profile
      where owner_profile.id = selected_job.approved_by
        and owner_profile.role = 'owner'
        and owner_profile.is_active is true
    )
  then
    raise exception 'TIKTOK_MEDIA_BINDING_RETRY_NOT_AUTHORIZED';
  end if;

  approving_owner_id := selected_job.approved_by;
  approved_window_text :=
    to_char(
      requested_publish_not_after at time zone 'Asia/Tbilisi',
      'YYYY-MM-DD"T"HH24:MI:SS'
    ) || '+04:00';
  approval_timestamp_text :=
    to_char(approval_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Revoke without changing content first. The immutable-content trigger then
  -- permits the replacement window to receive a new fingerprint.
  update public.social_publish_jobs
  set approval_status = 'REVOKED',
      approval_fingerprint = null,
      approved_at = null,
      publishing_allowed = false,
      state = 'waiting_for_approval',
      next_attempt_at = null
  where id = selected_job.id
  returning * into selected_job;

  update public.social_publish_jobs
  set publish_not_after = requested_publish_not_after,
      settings = jsonb_set(
        jsonb_set(
          selected_job.settings,
          '{approvedPublishWindow,publishNotAfter}',
          to_jsonb(approved_window_text),
          false
        ),
        '{exactCreativeApproval,approvedAt}',
        to_jsonb(approval_timestamp_text),
        false
      )
  where id = selected_job.id
  returning * into selected_job;

  update public.social_publish_jobs
  set approval_status = 'APPROVED_EXACT',
      approval_fingerprint = selected_job.content_fingerprint,
      approved_by = approving_owner_id,
      approved_at = approval_timestamp,
      publishing_allowed = true,
      state = 'approved',
      next_attempt_at = now(),
      claimed_at = null,
      claim_id = null,
      claim_expires_at = null,
      remote_duplicate_status = 'UNKNOWN',
      remote_duplicate_checked_at = null,
      remote_duplicate_receipt_sha256 = null,
      last_error_code = null,
      last_error_message = null
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'TIKTOK_MEDIA_BINDING_RETRY_ARMED',
    retry_event_key,
    'SERVICE',
    jsonb_build_object(
      'post_id', selected_job.post_id,
      'attempt_number', expected_attempts,
      'reason', 'TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH',
      'prior_content_fingerprint', expected_content_fingerprint,
      'new_content_fingerprint', selected_job.content_fingerprint,
      'campaign_approval_fingerprint', expected_campaign_approval_fingerprint,
      'publish_not_after', selected_job.publish_not_after,
      'remote_publish_intent_absent', true,
      'remote_side_effect_possible', false,
      'approval_channel', 'CODEX_OWNER_DIRECT_REQUEST'
    )
  ) on conflict (event_idempotency_key) do nothing;

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    actor_id,
    event_data
  ) values (
    selected_job.id,
    'APPROVED_EXACT',
    'social-approval:' || selected_job.id::text || ':' || selected_job.content_fingerprint,
    'HUMAN',
    approving_owner_id,
    jsonb_build_object(
      'content_fingerprint', selected_job.content_fingerprint,
      'prior_content_fingerprint', expected_content_fingerprint,
      'provider', selected_job.provider,
      'scheduled_at', selected_job.scheduled_at,
      'publish_not_after', selected_job.publish_not_after,
      'reason', 'OWNER_REQUESTED_SAME_DAY_TIKTOK_RETRY',
      'campaign_approval_fingerprint', expected_campaign_approval_fingerprint
    )
  ) on conflict (event_idempotency_key) do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    approving_owner_id,
    'social_tiktok_media_binding_retry_owner_requested',
    'social_publish_job',
    selected_job.id::text,
    jsonb_build_object(
      'provider', selected_job.provider,
      'post_id', selected_job.post_id,
      'attempt_number', expected_attempts,
      'prior_content_fingerprint', expected_content_fingerprint,
      'content_fingerprint', selected_job.content_fingerprint,
      'publish_not_after', selected_job.publish_not_after,
      'remote_side_effect_possible', false
    )
  );

  return to_jsonb(selected_job);
end;
$$;

revoke all on function public.rearm_failed_tiktok_media_binding_job_v1(
  text, text, text, text, integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.rearm_failed_tiktok_media_binding_job_v1(
  text, text, text, text, integer, timestamptz
) to service_role;

comment on function public.rearm_failed_tiktok_media_binding_job_v1(
  text, text, text, text, integer, timestamptz
) is
  'Re-arms one exact failed TikTok campaign job after a local media-name rejection proved no remote side effect, issuing a new owner-requested same-day approval window.';

commit;
