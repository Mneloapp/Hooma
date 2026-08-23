-- Permit one additional audited retry after the Supabase UTC timestamp shape
-- caused the local TikTok provider gate to fail before remote publish intent.

begin;

create or replace function public.rearm_failed_tiktok_policy_job_v2(
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
begin
  if requested_post_id !~ '^P-[0-9]{8}-TT-[0-9]{4}-[A-Z0-9-]+$'
    or expected_content_fingerprint !~ '^[a-f0-9]{64}$'
    or expected_attempts not between 1 and 2
  then
    raise exception 'TIKTOK_POLICY_RETRY_REQUEST_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where post_id = requested_post_id
  for update;

  if selected_job.id is null then
    raise exception 'TIKTOK_POLICY_RETRY_JOB_NOT_FOUND';
  end if;

  if selected_job.provider <> 'tiktok'
    or selected_job.state <> 'failed'
    or selected_job.last_error_code <> 'POLICY_GATE_MISMATCH'
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
    or exists (
      select 1 from public.social_tiktok_publish_lifecycles lifecycle
      where lifecycle.job_id = selected_job.id
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
    or (
      expected_attempts = 2
      and not exists (
        select 1
        from public.social_publish_audit_events audit
        where audit.job_id = selected_job.id
          and audit.event_type = 'POLICY_GATE_RETRY_ARMED'
          and audit.event_idempotency_key = 'tiktok-policy-retry:' || selected_job.id::text || ':1'
      )
    )
  then
    raise exception 'TIKTOK_POLICY_RETRY_NOT_AUTHORIZED';
  end if;

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

  insert into public.social_publish_audit_events (
    job_id,
    event_type,
    event_idempotency_key,
    actor_type,
    event_data
  ) values (
    selected_job.id,
    'POLICY_GATE_RETRY_ARMED',
    'tiktok-policy-retry:' || selected_job.id::text || ':' || expected_attempts::text,
    'SERVICE',
    jsonb_build_object(
      'post_id', selected_job.post_id,
      'attempt_number', selected_job.attempts,
      'reason', 'POLICY_GATE_MISMATCH',
      'repair_code', 'SUPABASE_UTC_TIMESTAMP_NORMALIZATION',
      'remote_publish_intent_absent', true
    )
  ) on conflict (event_idempotency_key) do nothing;

  return to_jsonb(selected_job);
end;
$$;

revoke all on function public.rearm_failed_tiktok_policy_job_v2(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rearm_failed_tiktok_policy_job_v2(text, text, integer)
  to service_role;

commit;
