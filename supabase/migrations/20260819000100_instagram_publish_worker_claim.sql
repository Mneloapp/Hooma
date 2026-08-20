-- Lease resumable Instagram lifecycle work without ever re-authorizing a
-- provider side effect. First dispatch permission remains exclusively in the
-- begin_* lifecycle RPCs, which re-check all mutable policy gates.

begin;

create or replace function public.claim_due_instagram_publish_work_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_instagram_publish_lifecycles%rowtype;
  new_claim_id uuid := extensions.gen_random_uuid();
begin
  select job.*
  into selected_job
  from public.social_publish_jobs job
  join public.social_instagram_publish_lifecycles lifecycle
    on lifecycle.job_id = job.id
  where job.provider = 'instagram'
    and job.state = 'publishing'
    and job.provider_post_id is null
    and (job.claim_expires_at is null or job.claim_expires_at <= now())
    and (
      (lifecycle.phase = 'CONTAINER_PROCESSING'
        and lifecycle.next_poll_at is not null
        and lifecycle.next_poll_at <= now())
      or (lifecycle.phase in (
        'CREATE_INTENT_RECORDED',
        'MEDIA_PUBLISH_INTENT_RECORDED',
        'MEDIA_PUBLISH_OUTCOME_UNKNOWN'
      ) and lifecycle.updated_at <= now() - interval '30 seconds')
      or lifecycle.phase in (
        'CONTAINER_READY',
        'CONTAINER_FAILED',
        'MEDIA_PUBLISH_CONFIRMED',
        'MEDIA_PUBLISH_REJECTED'
      )
    )
  order by coalesce(lifecycle.next_poll_at, lifecycle.updated_at), job.id
  limit 1
  for update of job skip locked;

  if selected_job.id is null then
    return null;
  end if;

  select lifecycle.*
  into selected_lifecycle
  from public.social_instagram_publish_lifecycles lifecycle
  where lifecycle.job_id = selected_job.id
  for update;

  update public.social_publish_jobs job
  set claim_id = new_claim_id,
      claimed_at = clock_timestamp(),
      claim_expires_at = now() + interval '5 minutes'
  where job.id = selected_job.id
  returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'CLAIMED',
    'instagram-resume-claim:' || new_claim_id::text,
    'SERVICE',
    jsonb_build_object(
      'claim_id', new_claim_id,
      'claim_expires_at', selected_job.claim_expires_at,
      'lifecycle_phase', selected_lifecycle.phase,
      'resume_action', public.social_instagram_resume_action(selected_lifecycle.phase)
    )
  );

  return to_jsonb(selected_job) || jsonb_build_object(
    'instagram_lifecycle',
    public.social_instagram_lifecycle_response(selected_lifecycle, false)
  );
end;
$$;

revoke all on function public.claim_due_instagram_publish_work_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_due_instagram_publish_work_v1()
  to service_role;

comment on function public.claim_due_instagram_publish_work_v1() is
  'Leases due Instagram reconciliation or continuation work. It never grants a new remote dispatch.';

commit;
