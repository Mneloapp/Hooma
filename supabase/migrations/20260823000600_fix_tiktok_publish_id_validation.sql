-- PostgreSQL ARE repetition bounds stop at 255. The original {1,256}
-- expression therefore raised SQLSTATE 2201B exactly when TikTok returned a
-- valid share ID. Keep the 256-character contract with a separate length gate.

begin;

alter table public.social_tiktok_publish_lifecycles
  drop constraint if exists social_tiktok_publish_lifecycles_provider_publish_id_check;

alter table public.social_tiktok_publish_lifecycles
  add constraint social_tiktok_publish_lifecycles_provider_publish_id_check
  check (
    provider_publish_id is null
    or (
      char_length(provider_publish_id) between 1 and 256
      and provider_publish_id ~ '^[A-Za-z0-9._:~-]+$'
    )
  );

create or replace function public.record_tiktok_publish_accepted_v1(
  requested_job_id uuid,
  requested_claim_id uuid,
  requested_operation_id uuid,
  requested_provider_publish_id text,
  requested_provider_request_id text,
  requested_provider_response_sha256 text,
  requested_event_idempotency_key text,
  requested_event_payload jsonb,
  requested_next_poll_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  lifecycle public.social_tiktok_publish_lifecycles%rowtype;
  replay_event public.social_publish_audit_events%rowtype;
  expected_event jsonb;
begin
  if char_length(coalesce(requested_provider_publish_id, '')) not between 1 and 256
    or requested_provider_publish_id !~ '^[A-Za-z0-9._:~-]+$'
    or requested_provider_response_sha256 !~ '^[a-f0-9]{64}$'
    or (requested_provider_request_id is not null
      and requested_provider_request_id !~ '^[A-Za-z0-9_.:~-]{1,120}$')
    or char_length(trim(requested_event_idempotency_key)) not between 16 and 300
    or requested_next_poll_at <= now()
    or requested_next_poll_at > now() + interval '10 minutes'
    or jsonb_typeof(requested_event_payload) <> 'object'
    or public.social_json_is_redacted(requested_event_payload) is not true
  then raise exception 'TIKTOK_PUBLISH_ACCEPTED_INVALID'; end if;
  expected_event := requested_event_payload || jsonb_build_object(
    'provider_publish_id', requested_provider_publish_id,
    'provider_request_id', requested_provider_request_id,
    'provider_response_sha256', requested_provider_response_sha256,
    'next_poll_at', requested_next_poll_at
  );
  select * into selected_job from public.social_publish_jobs
  where id = requested_job_id for update;
  select * into lifecycle from public.social_tiktok_publish_lifecycles
  where job_id = requested_job_id for update;
  if selected_job.id is null or selected_job.provider <> 'tiktok'
    or selected_job.state <> 'publishing'
    or selected_job.claim_id is distinct from requested_claim_id
    or lifecycle.publish_operation_id is distinct from requested_operation_id
  then raise exception 'TIKTOK_PUBLISH_ACCEPTED_NOT_AUTHORIZED'; end if;
  if lifecycle.phase <> 'PUBLISH_INTENT_RECORDED' then
    select * into replay_event from public.social_publish_audit_events
    where event_idempotency_key = requested_event_idempotency_key;
    if lifecycle.provider_publish_id = requested_provider_publish_id
      and lifecycle.provider_request_id is not distinct from requested_provider_request_id
      and lifecycle.provider_response_sha256 = requested_provider_response_sha256
      and replay_event.job_id = requested_job_id
      and replay_event.event_type = 'TIKTOK_PUBLISH_ACCEPTED'
      and replay_event.event_data = expected_event
    then return public.social_tiktok_lifecycle_response(lifecycle, false); end if;
    raise exception 'TIKTOK_PUBLISH_ACCEPTED_CONFLICT';
  end if;
  update public.social_tiktok_publish_lifecycles set
    phase = 'PROCESSING_REMOTE',
    provider_publish_id = requested_provider_publish_id,
    provider_request_id = requested_provider_request_id,
    provider_response_sha256 = requested_provider_response_sha256,
    provider_status = 'PROCESSING_REMOTE',
    next_poll_at = requested_next_poll_at,
    updated_at = clock_timestamp()
  where job_id = requested_job_id returning * into lifecycle;
  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    requested_job_id, 'TIKTOK_PUBLISH_ACCEPTED', requested_event_idempotency_key,
    'PROVIDER', expected_event
  );
  return public.social_tiktok_lifecycle_response(lifecycle, false);
end;
$$;

revoke all on function public.record_tiktok_publish_accepted_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.record_tiktok_publish_accepted_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) to service_role;

comment on function public.record_tiktok_publish_accepted_v1(
  uuid, uuid, uuid, text, text, text, text, jsonb, timestamptz
) is 'Records a TikTok accepted share ID with an explicit 256-character length bound and PostgreSQL-safe character validation.';

commit;
