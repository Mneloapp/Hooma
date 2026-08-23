-- Re-arm a TikTok job only when an earlier publish request was explicitly
-- rejected with provider code 40002 before the Hooma URL-prefix property was
-- verified. The immutable receipt/audit chains preserve the rejected attempt;
-- only the resumable lifecycle row is cleared so the worker can perform a new
-- duplicate check and create a fresh publish intent.

begin;

create or replace function public.reconcile_tiktok_verified_url_rejection_v1(
  requested_post_id text,
  expected_content_fingerprint text,
  expected_attempts integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  rejection_receipt public.social_publish_receipts%rowtype;
  verification_row public.social_tiktok_url_property_verifications%rowtype;
begin
  if requested_post_id !~ '^P-[0-9]{8}-TT-[0-9]{4}-[A-Z0-9-]+$'
    or expected_content_fingerprint !~ '^[a-f0-9]{64}$'
    or expected_attempts not between 1 and 9
  then
    raise exception 'TIKTOK_URL_REJECTION_RECONCILIATION_REQUEST_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where post_id = requested_post_id
  for update;

  if selected_job.id is null then
    raise exception 'TIKTOK_URL_REJECTION_RECONCILIATION_JOB_NOT_FOUND';
  end if;

  select * into selected_lifecycle
  from public.social_tiktok_publish_lifecycles
  where job_id = selected_job.id
  for update;

  select * into rejection_receipt
  from public.social_publish_receipts
  where job_id = selected_job.id
    and attempt_number = expected_attempts
    and event_type = 'REMOTE_RESULT_UNCERTAIN'
  order by chain_position desc
  limit 1;

  select * into verification_row
  from public.social_tiktok_url_property_verifications
  where property_url = 'https://hooma.ge/api/social/tiktok/media/'
  for update;

  if selected_job.provider <> 'tiktok'
    or selected_job.state <> 'blocked_remote_uncertain'
    or selected_job.last_error_code <> 'REMOTE_RESULT_UNCERTAIN'
    or selected_job.publishing_allowed is not false
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.approval_fingerprint <> expected_content_fingerprint
    or selected_job.content_fingerprint <> expected_content_fingerprint
    or selected_job.rights_status <> 'CLEARED'
    or selected_job.visual_claims_status <> 'CLEARED'
    or selected_job.attempts <> expected_attempts
    or selected_job.attempts >= selected_job.max_attempts
    or selected_job.scheduled_at > now()
    or selected_job.publish_not_after < now()
    or selected_job.provider_publish_id is not null
    or selected_job.provider_post_id is not null
    or selected_job.published_at is not null
    or selected_job.remote_duplicate_status <> 'CLEAR'
    or selected_job.remote_duplicate_checked_at is null
    or selected_lifecycle.job_id is null
    or selected_lifecycle.phase <> 'PUBLISH_INTENT_RECORDED'
    or selected_lifecycle.provider_publish_id is not null
    or selected_lifecycle.provider_post_id is not null
    or rejection_receipt.id is null
    or rejection_receipt.provider_request_id is null
    or rejection_receipt.payload ->> 'error_code' is distinct from '40002'
    or rejection_receipt.payload ->> 'remote_side_effect_possible' is distinct from 'true'
    or verification_row.property_url is null
    or verification_row.property_type <> 2
    or verification_row.property_status <> 1
    or verification_row.updated_at <= rejection_receipt.created_at
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
        and receipt.event_type = 'PREFLIGHT_PASSED'
    )
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
  then
    raise exception 'TIKTOK_URL_REJECTION_RECONCILIATION_NOT_AUTHORIZED';
  end if;

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'TIKTOK_URL_REJECTION_RECONCILED',
    'tiktok-url-rejection-reconciled:' || selected_job.id::text || ':' || expected_attempts::text,
    'SERVICE',
    jsonb_build_object(
      'post_id', selected_job.post_id,
      'attempt_number', expected_attempts,
      'provider_error_code', '40002',
      'provider_request_id', rejection_receipt.provider_request_id,
      'publish_operation_id', selected_lifecycle.publish_operation_id,
      'publish_request_sha256', selected_lifecycle.publish_request_sha256,
      'url_property', verification_row.property_url,
      'url_property_type', verification_row.property_type,
      'url_property_status', verification_row.property_status,
      'url_property_verified_after_rejection', true,
      'next_action', 'FRESH_DUPLICATE_CHECK_AND_NEW_PUBLISH_INTENT'
    )
  );

  delete from public.social_tiktok_publish_lifecycles
  where job_id = selected_job.id;

  update public.social_publish_jobs
  set state = 'approved',
      publishing_allowed = true,
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

  return to_jsonb(selected_job);
end;
$$;

revoke all on function public.reconcile_tiktok_verified_url_rejection_v1(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_tiktok_verified_url_rejection_v1(text, text, integer)
  to service_role;

comment on function public.reconcile_tiktok_verified_url_rejection_v1(text, text, integer) is
  'Re-arms an explicitly rejected TikTok URL publish only after the exact Hooma URL-prefix property becomes verified.';

commit;
