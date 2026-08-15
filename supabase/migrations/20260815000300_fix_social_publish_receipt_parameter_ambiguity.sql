-- Preserve the public RPC signature while qualifying its sixth parameter.
-- The social_publish_jobs table has a column with the same name, so an
-- unqualified UPDATE assignment raises SQLSTATE 42702 at runtime.

begin;

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
    or authorize_social_publish_job.remote_duplicate_receipt_sha256 !~ '^[a-f0-9]{64}$'
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
      'remote_duplicate_receipt_sha256',
      authorize_social_publish_job.remote_duplicate_receipt_sha256,
      'content_fingerprint', selected_job.content_fingerprint
    )
  );

  update public.social_publish_jobs
  set state = 'publishing',
      remote_duplicate_status = 'CLEAR',
      remote_duplicate_checked_at = now(),
      remote_duplicate_receipt_sha256 =
        authorize_social_publish_job.remote_duplicate_receipt_sha256,
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
      'remote_duplicate_receipt_sha256',
      authorize_social_publish_job.remote_duplicate_receipt_sha256
    )
  );

  return to_jsonb(selected_job);
end;
$$;

commit;
