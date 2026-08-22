-- Corrects a narrowly validated reconciliation false negative without
-- rewriting the immutable Instagram lifecycle history. The caller must supply
-- independently verified remote media evidence; this function never performs
-- or authorizes a provider mutation.
create or replace function public.correct_instagram_false_negative_publication_v1(
  requested_job_id uuid,
  requested_provider_post_id text,
  requested_provider_permalink text,
  requested_published_at timestamptz,
  requested_evidence_sha256 text
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
  if coalesce(requested_provider_post_id ~ '^[1-9][0-9]{0,255}$', false) is not true
    or coalesce(requested_provider_permalink ~ '^https://(www\.)?instagram\.com/', false) is not true
    or requested_published_at is null
    or coalesce(requested_evidence_sha256 ~ '^[a-f0-9]{64}$', false) is not true
  then
    raise exception 'INSTAGRAM_FALSE_NEGATIVE_EVIDENCE_INVALID';
  end if;

  select job.* into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id
  for update;

  select lifecycle.* into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = requested_job_id
  for update;

  if selected_job.state = 'published'
    and selected_job.provider_post_id = requested_provider_post_id
    and selected_job.provider_url = requested_provider_permalink
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
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'failed'
    or selected_job.last_error_code <> 'INSTAGRAM_REMOTE_PUBLISH_NOT_FOUND'
    or selected_job.provider_post_id is not null
    or requested_published_at < selected_job.scheduled_at
    or requested_published_at > selected_job.publish_not_after
    or selected_lifecycle.job_id is null
    or selected_lifecycle.phase <> 'MEDIA_PUBLISH_REJECTED'
    or selected_lifecycle.media_publish_outcome <> 'REJECTED_NO_SIDE_EFFECT'
    or selected_lifecycle.media_publish_operation_id is null
    or selected_lifecycle.provider_container_id is null
    or exists (
      select 1 from public.social_publish_jobs other_job
      where other_job.id <> requested_job_id
        and other_job.provider = 'instagram'
        and other_job.provider_post_id = requested_provider_post_id
    )
  then
    raise exception 'INSTAGRAM_FALSE_NEGATIVE_CORRECTION_NOT_ALLOWED';
  end if;

  update public.social_publish_jobs job
  set state = 'published',
      provider_publish_id = selected_lifecycle.provider_container_id,
      provider_post_id = requested_provider_post_id,
      provider_url = requested_provider_permalink,
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
    job_id, attempt_number, event_type, event_idempotency_key,
    provider_publish_id, provider_post_id, payload
  ) values (
    requested_job_id,
    selected_job.attempts,
    'REMOTE_VERIFIED',
    'instagram-false-negative-corrected:' || requested_job_id::text,
    selected_lifecycle.provider_container_id,
    requested_provider_post_id,
    jsonb_build_object(
      'schema', 'instagram-false-negative-correction-v1',
      'evidence_sha256', requested_evidence_sha256,
      'provider_permalink', requested_provider_permalink,
      'published_at', requested_published_at,
      'remote_dispatch_allowed', false
    )
  );

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    requested_job_id,
    'INSTAGRAM_FALSE_NEGATIVE_CORRECTED',
    'instagram-false-negative-corrected:' || requested_job_id::text,
    'SERVICE',
    jsonb_build_object(
      'state', selected_job.state,
      'provider_post_id', requested_provider_post_id,
      'evidence_sha256', requested_evidence_sha256,
      'remote_dispatch_allowed', false
    )
  );

  return jsonb_build_object(
    'job_id', requested_job_id,
    'state', selected_job.state,
    'provider_post_id', selected_job.provider_post_id,
    'provider_url', selected_job.provider_url,
    'corrected', true,
    'remote_dispatch_allowed', false
  );
end;
$$;

revoke all on function public.correct_instagram_false_negative_publication_v1(
  uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.correct_instagram_false_negative_publication_v1(
  uuid, text, text, timestamptz, text
) to service_role;

comment on function public.correct_instagram_false_negative_publication_v1(
  uuid, text, text, timestamptz, text
) is 'Records independently verified Instagram publication evidence after a narrowly validated caption-normalization false negative; never dispatches remotely.';
