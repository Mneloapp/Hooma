-- Immutable T+2h/T+24h/T+72h Instagram insights snapshots.

begin;

create or replace function public.claim_due_instagram_analytics_v1()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'job_id', job.id,
    'account_id', job.account_id,
    'media_id', job.provider_post_id,
    'horizon', horizon.name,
    'due_at', job.updated_at + horizon.delay
  )
  from public.social_publish_jobs job
  cross join lateral (
    values
      ('T2H'::text, interval '2 hours', 1),
      ('T24H'::text, interval '24 hours', 2),
      ('T72H'::text, interval '72 hours', 3)
  ) as horizon(name, delay, priority)
  where job.provider = 'instagram'
    and job.state = 'published'
    and job.provider_post_id is not null
    and job.updated_at + horizon.delay <= now()
    and not exists (
      select 1
      from public.social_publish_receipts receipt
      where receipt.event_idempotency_key =
        'instagram-analytics:' || job.id::text || ':' || lower(horizon.name)
    )
  order by job.updated_at + horizon.delay, horizon.priority, job.id
  limit 1;
$$;

create or replace function public.record_instagram_analytics_snapshot_v1(
  requested_job_id uuid,
  requested_media_id text,
  requested_horizon text,
  requested_captured_at timestamptz,
  requested_metrics jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_job public.social_publish_jobs%rowtype;
  event_key text;
  payload jsonb;
  replay_receipt public.social_publish_receipts%rowtype;
  expected_delay interval;
  expected_keys text[] := array[
    'views', 'reach', 'likes', 'comments', 'shares', 'saved',
    'total_interactions', 'follows', 'reels_video_view_total_time',
    'reels_average_watch_time', 'clips_replays_count',
    'reels_aggregated_all_plays_count'
  ];
begin
  expected_delay := case requested_horizon
    when 'T2H' then interval '2 hours'
    when 'T24H' then interval '24 hours'
    when 'T72H' then interval '72 hours'
    else null
  end;
  if expected_delay is null
    or coalesce(requested_media_id ~ '^[1-9][0-9]{0,255}$', false) is not true
    or requested_captured_at < now() - interval '10 minutes'
    or requested_captured_at > now() + interval '1 minute'
    or jsonb_typeof(requested_metrics) <> 'object'
    or not (requested_metrics ?& expected_keys)
    or (select count(*) from jsonb_object_keys(requested_metrics))
      <> array_length(expected_keys, 1)
    or exists (
      select 1
      from jsonb_each(requested_metrics) metric
      where jsonb_typeof(metric.value) not in ('null', 'number')
        or (
          jsonb_typeof(metric.value) = 'number'
          and (metric.value #>> '{}')::numeric < 0
        )
    )
  then
    raise exception 'INSTAGRAM_ANALYTICS_SNAPSHOT_INVALID';
  end if;

  select * into selected_job
  from public.social_publish_jobs job
  where job.id = requested_job_id;

  if selected_job.id is null
    or selected_job.provider <> 'instagram'
    or selected_job.state <> 'published'
    or selected_job.provider_post_id is distinct from requested_media_id
    or selected_job.updated_at + expected_delay > requested_captured_at
  then
    raise exception 'INSTAGRAM_ANALYTICS_SNAPSHOT_NOT_AUTHORIZED';
  end if;

  event_key := 'instagram-analytics:' || selected_job.id::text || ':' || lower(requested_horizon);
  payload := jsonb_build_object(
    'schema', 'instagram-insights-snapshot-v1',
    'horizon', requested_horizon,
    'captured_at', requested_captured_at,
    'media_id', requested_media_id,
    'metrics', requested_metrics
  );

  if public.social_json_is_redacted(payload) is not true then
    raise exception 'INSTAGRAM_ANALYTICS_SNAPSHOT_INVALID';
  end if;

  select receipt.* into replay_receipt
  from public.social_publish_receipts receipt
  where receipt.event_idempotency_key = event_key;

  if replay_receipt.id is not null then
    if replay_receipt.job_id = selected_job.id
      and replay_receipt.event_type = 'ANALYTICS_SNAPSHOT'
      and replay_receipt.provider_post_id is not distinct from requested_media_id
      and replay_receipt.payload = payload
    then
      return true;
    end if;
    raise exception 'INSTAGRAM_ANALYTICS_SNAPSHOT_CONFLICT';
  end if;

  insert into public.social_publish_receipts (
    job_id, attempt_number, event_type, event_idempotency_key,
    provider_post_id, payload
  ) values (
    selected_job.id, selected_job.attempts, 'ANALYTICS_SNAPSHOT', event_key,
    requested_media_id, payload
  );

  insert into public.social_publish_audit_events (
    job_id, event_type, event_idempotency_key, actor_type, event_data
  ) values (
    selected_job.id,
    'ANALYTICS_SNAPSHOT',
    'instagram-analytics-audit:' || selected_job.id::text || ':' || lower(requested_horizon),
    'PROVIDER',
    jsonb_build_object(
      'horizon', requested_horizon,
      'captured_at', requested_captured_at,
      'media_id', requested_media_id
    )
  );

  return true;
end;
$$;

revoke all on function public.claim_due_instagram_analytics_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.record_instagram_analytics_snapshot_v1(
  uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.claim_due_instagram_analytics_v1()
  to service_role;
grant execute on function public.record_instagram_analytics_snapshot_v1(
  uuid, text, text, timestamptz, jsonb
) to service_role;

commit;
