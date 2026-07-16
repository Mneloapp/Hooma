-- Atomically reserve billable catalog-translation requests before calling the provider.

create index if not exists idx_audit_log_action_created
  on public.audit_log(action, created_at desc);

create or replace function public.reserve_catalog_translation_request(
  actor_profile_id uuid,
  translation_request_id uuid,
  source_host text,
  name_characters integer,
  description_characters integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_request_count integer;
  global_request_count integer;
begin
  if not exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an active Admin or Owner may translate catalog copy';
  end if;

  if translation_request_id is null
    or coalesce(char_length(trim(source_host)), 0) not between 1 and 253
    or coalesce(name_characters, 0) not between 2 and 160
    or coalesce(description_characters, 0) not between 10 and 3000 then
    raise exception 'Invalid catalog translation reservation';
  end if;

  -- Every reservation takes the global lock first, avoiding races and lock-order deadlocks.
  perform pg_advisory_xact_lock(hashtextextended('hooma:catalog_translation:global', 0));

  select count(*)::integer
  into global_request_count
  from public.audit_log
  where action = 'catalog_translation_requested'
    and created_at >= now() - interval '1 hour';

  if global_request_count >= 180 then
    return jsonb_build_object('allowed', false, 'reason', 'global_hourly_limit');
  end if;

  select count(*)::integer
  into actor_request_count
  from public.audit_log
  where actor_id = actor_profile_id
    and action = 'catalog_translation_requested'
    and created_at >= now() - interval '1 hour';

  if actor_request_count >= 60 then
    return jsonb_build_object('allowed', false, 'reason', 'actor_hourly_limit');
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_translation_requested',
    'catalog_translation',
    translation_request_id::text,
    jsonb_build_object(
      'provider', 'google-cloud-translation-basic-v2',
      'target_language', 'ka',
      'source_host', lower(trim(source_host)),
      'name_characters', name_characters,
      'description_characters', description_characters
    )
  );

  return jsonb_build_object(
    'allowed', true,
    'reason', 'reserved',
    'actor_requests_in_window', actor_request_count + 1,
    'global_requests_in_window', global_request_count + 1
  );
end;
$$;

revoke all on function public.reserve_catalog_translation_request(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_catalog_translation_request(uuid, uuid, text, integer, integer) to service_role;
