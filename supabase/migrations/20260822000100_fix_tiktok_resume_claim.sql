-- Fixes production TikTok resume claims. The original function used the same
-- identifier for a PL/pgSQL row variable and a joined table alias, causing
-- PostgreSQL 42702 before any TikTok preflight or remote mutation could run.
create or replace function public.claim_due_tiktok_publish_work_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  selected_lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  new_claim_id uuid := extensions.gen_random_uuid();
begin
  select job.* into selected_job
  from public.social_publish_jobs job
  join public.social_tiktok_publish_lifecycles lifecycle_row
    on lifecycle_row.job_id = job.id
  where job.provider = 'tiktok' and job.state = 'publishing'
    and job.provider_post_id is null
    and (job.claim_expires_at is null or job.claim_expires_at <= now())
    and (
      (lifecycle_row.phase = 'PROCESSING_REMOTE'
        and lifecycle_row.next_poll_at <= now())
      or (lifecycle_row.phase = 'PUBLISH_INTENT_RECORDED'
        and lifecycle_row.updated_at <= now() - interval '30 seconds')
      or lifecycle_row.phase in ('PUBLISHED', 'FAILED')
    )
  order by coalesce(lifecycle_row.next_poll_at, lifecycle_row.updated_at), job.id
  limit 1 for update of job skip locked;

  if selected_job.id is null then return null; end if;

  select lifecycle_row.* into selected_lifecycle
  from public.social_tiktok_publish_lifecycles lifecycle_row
  where lifecycle_row.job_id = selected_job.id
  for update;

  update public.social_publish_jobs set
    claim_id = new_claim_id,
    claimed_at = clock_timestamp(),
    claim_expires_at = now() + interval '5 minutes'
  where id = selected_job.id returning * into selected_job;

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id, 'CLAIMED', 'tiktok-resume-claim:' || new_claim_id::text,
    'SERVICE', jsonb_build_object(
      'claim_id', new_claim_id,
      'claim_expires_at', selected_job.claim_expires_at,
      'lifecycle_phase', selected_lifecycle.phase
    )
  );

  return to_jsonb(selected_job) || jsonb_build_object(
    'tiktok_lifecycle',
    public.social_tiktok_lifecycle_response(selected_lifecycle, false)
  );
end;
$$;

revoke all on function public.claim_due_tiktok_publish_work_v1()
  from public, anon, authenticated;
grant execute on function public.claim_due_tiktok_publish_work_v1()
  to service_role;

comment on function public.claim_due_tiktok_publish_work_v1() is
  'Claims resumable TikTok publish lifecycle work without identifier ambiguity.';
