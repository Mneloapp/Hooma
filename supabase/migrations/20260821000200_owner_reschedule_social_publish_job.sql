-- Atomically preserves an approved future job as cancelled before an exact
-- replacement receives a new post/idempotency identity.

create or replace function public.cancel_social_publish_job_for_replacement(
  requested_old_post_id text,
  requested_new_post_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_profile_id uuid := auth.uid();
  selected_job public.social_publish_jobs%rowtype;
  expected_message text := 'Rescheduled to ' || requested_new_post_id;
begin
  if actor_profile_id is null or not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and role = 'owner'
      and is_active is true
  ) then
    raise exception 'ACTIVE_OWNER_APPROVAL_REQUIRED';
  end if;

  if requested_old_post_id !~ '^P-[0-9]{8}-(IG|TT)-[0-9]{4}-[A-Z0-9-]+$'
    or requested_new_post_id !~ '^P-[0-9]{8}-(IG|TT)-[0-9]{4}-[A-Z0-9-]+$'
    or requested_old_post_id = requested_new_post_id
    or substring(requested_old_post_id from 12 for 2)
      <> substring(requested_new_post_id from 12 for 2)
  then
    raise exception 'SOCIAL_REPLACEMENT_ID_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs
  where post_id = requested_old_post_id
  for update;

  if selected_job.id is null then raise exception 'SOCIAL_JOB_NOT_FOUND'; end if;

  if selected_job.state = 'cancelled'
    and selected_job.approval_status = 'REVOKED'
    and selected_job.publishing_allowed is false
    and selected_job.last_error_code = 'OWNER_RESCHEDULED'
    and selected_job.last_error_message = expected_message
  then
    return to_jsonb(selected_job);
  end if;

  if selected_job.state <> 'approved'
    or selected_job.approval_status <> 'APPROVED_EXACT'
    or selected_job.publishing_allowed is not true
    or selected_job.scheduled_at <= now()
    or selected_job.attempts <> 0
    or selected_job.claim_id is not null
    or selected_job.provider_publish_id is not null
    or selected_job.provider_post_id is not null
    or selected_job.published_at is not null
  then
    raise exception 'SOCIAL_REPLACEMENT_PRECONDITIONS_FAILED';
  end if;

  update public.social_publish_jobs
  set state = 'cancelled',
      publishing_allowed = false,
      approval_status = 'REVOKED',
      next_attempt_at = null,
      last_error_code = 'OWNER_RESCHEDULED',
      last_error_message = expected_message
  where id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_receipts (
    job_id,
    attempt_number,
    event_type,
    event_idempotency_key,
    payload
  ) values (
    selected_job.id,
    0,
    'CANCELLED',
    'social-owner-reschedule-receipt:' || selected_job.id::text || ':' || requested_new_post_id,
    jsonb_build_object(
      'reason', 'OWNER_RESCHEDULED',
      'old_post_id', requested_old_post_id,
      'replacement_post_id', requested_new_post_id,
      'provider', selected_job.provider
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
    'OWNER_RESCHEDULED',
    'social-owner-reschedule-audit:' || selected_job.id::text || ':' || requested_new_post_id,
    'HUMAN',
    actor_profile_id,
    jsonb_build_object(
      'old_post_id', requested_old_post_id,
      'replacement_post_id', requested_new_post_id,
      'provider', selected_job.provider
    )
  ) on conflict (event_idempotency_key) do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'social_publish_job_owner_rescheduled',
    'social_publish_job',
    selected_job.id::text,
    jsonb_build_object(
      'provider', selected_job.provider,
      'old_post_id', requested_old_post_id,
      'replacement_post_id', requested_new_post_id
    )
  );

  return to_jsonb(selected_job);
end;
$$;

revoke all on function public.cancel_social_publish_job_for_replacement(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_social_publish_job_for_replacement(text, text)
  to authenticated;
