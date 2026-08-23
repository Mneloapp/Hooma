-- Records independently observed TikTok publication evidence after the
-- provider accepted the post but the accepted-share-id RPC failed. This never
-- authorizes or performs another TikTok dispatch.

begin;

create or replace function public.reconcile_visible_tiktok_publication_v1(
  requested_job_id uuid,
  requested_provider_post_id text,
  requested_provider_url text,
  requested_published_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  failure_receipt public.social_publish_receipts%rowtype;
  normalized_caption_sha256 text;
  evidence_sha256 text;
  reconciled_publish_id text;
begin
  if coalesce(requested_provider_post_id ~ '^[1-9][0-9]{7,39}$', false) is not true
    or requested_provider_url is distinct from
      'https://www.tiktok.com/@hooma.ge/video/' || requested_provider_post_id
    or requested_published_at is null
  then
    raise exception 'TIKTOK_VISIBLE_PUBLICATION_EVIDENCE_INVALID';
  end if;

  select job.* into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  select lifecycle.* into selected_lifecycle
  from public.social_tiktok_publish_lifecycles lifecycle
  where lifecycle.job_id = requested_job_id
  for update;

  select receipt.* into failure_receipt
  from public.social_publish_receipts receipt
  where receipt.job_id = requested_job_id
    and receipt.attempt_number = selected_job.attempts
    and receipt.event_type = 'REMOTE_RESULT_UNCERTAIN'
  order by receipt.chain_position desc
  limit 1;

  if selected_job.state = 'published'
    and selected_job.provider_post_id = requested_provider_post_id
    and selected_job.provider_url = requested_provider_url
  then
    return jsonb_build_object(
      'job_id', requested_job_id,
      'state', selected_job.state,
      'provider_post_id', selected_job.provider_post_id,
      'provider_url', selected_job.provider_url,
      'corrected', false,
      'remote_dispatch_allowed', false
    );
  end if;

  if selected_job.id is null
    or selected_job.provider <> 'tiktok'
    or selected_job.state <> 'blocked_remote_uncertain'
    or selected_job.last_error_code <> 'REMOTE_RESULT_UNCERTAIN'
    or selected_job.provider_publish_id is not null
    or selected_job.provider_post_id is not null
    or selected_job.published_at is not null
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> selected_job.content_fingerprint
    or selected_job.remote_duplicate_status <> 'CLEAR'
    or selected_lifecycle.job_id is null
    or selected_lifecycle.phase <> 'PUBLISH_INTENT_RECORDED'
    or selected_lifecycle.provider_publish_id is not null
    or selected_lifecycle.provider_post_id is not null
    or failure_receipt.id is null
    or failure_receipt.provider_request_id is not null
    or failure_receipt.payload ->> 'error_code' is distinct from 'SOCIAL_DATABASE_RPC_FAILED'
    or failure_receipt.payload ->> 'remote_side_effect_possible' is distinct from 'true'
    or requested_published_at < selected_job.scheduled_at
    or requested_published_at > selected_job.publish_not_after
    or requested_published_at < selected_lifecycle.created_at
    or requested_published_at > selected_lifecycle.created_at + interval '10 minutes'
    or not exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.job_id = selected_job.id
        and receipt.attempt_number = selected_job.attempts
        and receipt.event_type = 'PUBLISH_REQUESTED'
    )
    or not exists (
      select 1
      from public.social_tiktok_url_property_verifications verification
      where verification.property_url = 'https://hooma.ge/api/social/tiktok/media/'
        and verification.property_type = 2
        and verification.property_status = 1
        and verification.updated_at <= selected_lifecycle.created_at
    )
    or exists (
      select 1
      from public.social_publish_jobs other_job
      where other_job.id <> requested_job_id
        and other_job.provider = 'tiktok'
        and other_job.provider_post_id = requested_provider_post_id
    )
    or exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.job_id = selected_job.id
        and receipt.event_type in ('PUBLISH_SUCCEEDED', 'REMOTE_VERIFIED')
    )
  then
    raise exception 'TIKTOK_VISIBLE_PUBLICATION_RECONCILIATION_NOT_ALLOWED';
  end if;

  normalized_caption_sha256 := encode(
    digest(
      convert_to(
        regexp_replace(trim(selected_job.caption), '[[:space:]]+', ' ', 'g'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  reconciled_publish_id := 'remote-verified:' || requested_provider_post_id;
  evidence_sha256 := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'schema', 'tiktok-visible-publication-v1',
          'job_id', selected_job.id,
          'post_id', selected_job.post_id,
          'provider_post_id', requested_provider_post_id,
          'provider_url', requested_provider_url,
          'published_at', requested_published_at,
          'content_fingerprint', selected_job.content_fingerprint,
          'video_sha256', selected_job.video_sha256,
          'normalized_caption_sha256', normalized_caption_sha256,
          'publish_operation_id', selected_lifecycle.publish_operation_id,
          'publish_request_sha256', selected_lifecycle.publish_request_sha256
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  update public.social_tiktok_publish_lifecycles lifecycle
  set phase = 'PUBLISHED',
      provider_publish_id = reconciled_publish_id,
      provider_request_id = null,
      provider_response_sha256 = evidence_sha256,
      provider_status = 'PUBLISHED',
      provider_post_id = requested_provider_post_id,
      provider_url = requested_provider_url,
      failure_reason = null,
      next_poll_at = null,
      updated_at = clock_timestamp()
  where lifecycle.job_id = requested_job_id;

  update public.social_publish_jobs job
  set state = 'published',
      publishing_allowed = false,
      provider_publish_id = reconciled_publish_id,
      provider_post_id = requested_provider_post_id,
      provider_url = requested_provider_url,
      published_at = requested_published_at,
      last_error_code = null,
      last_error_message = null,
      next_attempt_at = null,
      claim_id = null,
      claimed_at = null,
      claim_expires_at = null,
      updated_at = clock_timestamp()
  where job.id = requested_job_id
  returning * into selected_job;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    provider_publish_id,
    provider_post_id,
    payload
  ) values (
    requested_job_id,
    selected_job.attempts,
    'REMOTE_VERIFIED',
    'tiktok-visible-publication-reconciled:' || requested_job_id::text,
    reconciled_publish_id,
    requested_provider_post_id,
    jsonb_build_object(
      'schema', 'tiktok-visible-publication-v1',
      'evidence_sha256', evidence_sha256,
      'provider_url', requested_provider_url,
      'published_at', requested_published_at,
      'normalized_caption_sha256', normalized_caption_sha256,
      'remote_dispatch_allowed', false
    )
  );

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    requested_job_id,
    'TIKTOK_VISIBLE_PUBLICATION_RECONCILED',
    'tiktok-visible-publication-reconciled:' || requested_job_id::text,
    'SERVICE',
    jsonb_build_object(
      'state', selected_job.state,
      'provider_post_id', requested_provider_post_id,
      'evidence_sha256', evidence_sha256,
      'remote_dispatch_allowed', false
    )
  );

  return jsonb_build_object(
    'job_id', requested_job_id,
    'state', selected_job.state,
    'provider_post_id', selected_job.provider_post_id,
    'provider_url', selected_job.provider_url,
    'evidence_sha256', evidence_sha256,
    'corrected', true,
    'remote_dispatch_allowed', false
  );
end;
$$;

revoke all on function public.reconcile_visible_tiktok_publication_v1(
  uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_visible_tiktok_publication_v1(
  uuid, text, text, timestamptz
) to service_role;

comment on function public.reconcile_visible_tiktok_publication_v1(
  uuid, text, text, timestamptz
) is 'Records independently verified TikTok publication evidence after a DB receipt failure; never dispatches remotely.';

commit;
