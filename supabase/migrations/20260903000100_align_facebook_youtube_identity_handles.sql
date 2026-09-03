-- Pin external OAuth writes to Hooma's verified provider-specific identities.
-- The public Meta Page and YouTube channel use different handles from the
-- Instagram/TikTok @hooma.ge identity.

begin;

create or replace function public.upsert_external_social_connection_v1(
  requested_provider text,
  requested_external_account_id text,
  requested_username text,
  requested_token_type text,
  requested_scopes text[],
  requested_access_token_enc jsonb,
  requested_refresh_token_enc jsonb,
  requested_access_expires_at timestamptz,
  requested_refresh_expires_at timestamptz,
  requested_issued_at timestamptz,
  requested_refresh_after timestamptz,
  requested_connected_by uuid,
  requested_identity_snapshot jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if requested_provider not in ('facebook', 'youtube')
    or (requested_provider = 'facebook' and (
      requested_external_account_id <> '1183394631514623'
      or requested_username <> 'hoomageorgia'
    ))
    or (requested_provider = 'youtube' and (
      requested_external_account_id <> 'UCDv_CqLgtUlMUfFg7VAs4aQ'
      or requested_username <> 'hoomastore'
    ))
    or requested_token_type <> 'Bearer'
    or requested_external_account_id is null
    or length(requested_external_account_id) not between 5 and 256
    or (requested_provider = 'facebook' and requested_external_account_id !~ '^[1-9][0-9]{4,255}$')
    or (requested_provider = 'youtube' and requested_external_account_id !~ '^UC[A-Za-z0-9_-]{22}$')
    or requested_scopes is null
    or cardinality(requested_scopes) = 0
    or cardinality(requested_scopes) <> cardinality(array(select distinct unnest(requested_scopes)))
    or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
    or (requested_provider = 'facebook' and requested_refresh_token_enc is not null)
    or (requested_provider = 'youtube' and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc))
    or requested_access_expires_at <= requested_issued_at
    or requested_refresh_after <= requested_issued_at
    or requested_refresh_after >= requested_access_expires_at
    or requested_refresh_expires_at is not null
    or jsonb_typeof(requested_identity_snapshot) <> 'object'
    or public.social_json_is_redacted(requested_identity_snapshot) is not true
  then return false; end if;
  if not exists (
    select 1 from public.profiles
    where id = requested_connected_by and role = 'owner' and is_active = true
  ) then return false; end if;

  insert into public.social_connections (
    provider, external_account_id, username, token_type, scopes,
    access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at,
    issued_at, refresh_after, status, connected_by, identity_snapshot,
    last_refreshed_at, last_verified_at, last_error_code
  ) values (
    requested_provider, requested_external_account_id, requested_username,
    requested_token_type, requested_scopes, requested_access_token_enc,
    requested_refresh_token_enc, requested_access_expires_at, null,
    requested_issued_at, requested_refresh_after, 'active',
    requested_connected_by, requested_identity_snapshot,
    requested_issued_at, requested_issued_at, null
  )
  on conflict (provider) do update set
    external_account_id = excluded.external_account_id,
    username = excluded.username,
    token_type = excluded.token_type,
    scopes = excluded.scopes,
    access_token_enc = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    access_expires_at = excluded.access_expires_at,
    refresh_expires_at = null,
    issued_at = excluded.issued_at,
    refresh_after = excluded.refresh_after,
    status = 'active',
    token_version = public.social_connections.token_version + 1,
    refresh_lease_id = null,
    refresh_lease_until = null,
    connected_by = excluded.connected_by,
    identity_snapshot = excluded.identity_snapshot,
    last_refreshed_at = excluded.last_refreshed_at,
    last_verified_at = excluded.last_verified_at,
    last_error_code = null;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    requested_connected_by, 'social_connection_authorized',
    'social_connection', requested_provider,
    jsonb_build_object(
      'provider', requested_provider,
      'username', requested_username,
      'external_account_id', requested_external_account_id,
      'scope_count', cardinality(requested_scopes),
      'access_expires_at', requested_access_expires_at
    )
  );
  return true;
end;
$$;

create or replace function public.complete_external_social_connection_refresh_v1(
  requested_provider text,
  requested_lease_id uuid,
  requested_token_version bigint,
  requested_username text,
  requested_scopes text[],
  requested_access_token_enc jsonb,
  requested_refresh_token_enc jsonb,
  requested_access_expires_at timestamptz,
  requested_refresh_expires_at timestamptz,
  requested_issued_at timestamptz,
  requested_refresh_after timestamptz,
  requested_identity_snapshot jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed_rows integer;
begin
  if requested_provider <> 'youtube'
    or requested_username <> 'hoomastore'
    or requested_scopes is null or cardinality(requested_scopes) = 0
    or not public.social_aes_gcm_envelope_is_valid(requested_access_token_enc)
    or (requested_refresh_token_enc is not null and not public.social_aes_gcm_envelope_is_valid(requested_refresh_token_enc))
    or requested_access_expires_at <= requested_issued_at
    or requested_refresh_after <= requested_issued_at
    or requested_refresh_after >= requested_access_expires_at
    or requested_refresh_expires_at is not null
    or jsonb_typeof(requested_identity_snapshot) <> 'object'
    or public.social_json_is_redacted(requested_identity_snapshot) is not true
  then return false; end if;

  update public.social_connections set
    username = requested_username,
    scopes = requested_scopes,
    access_token_enc = requested_access_token_enc,
    refresh_token_enc = coalesce(requested_refresh_token_enc, refresh_token_enc),
    access_expires_at = requested_access_expires_at,
    refresh_expires_at = null,
    issued_at = requested_issued_at,
    refresh_after = requested_refresh_after,
    token_version = token_version + 1,
    refresh_lease_id = null,
    refresh_lease_until = null,
    identity_snapshot = requested_identity_snapshot,
    last_refreshed_at = requested_issued_at,
    last_verified_at = requested_issued_at,
    last_error_code = null
  where provider = 'youtube'
    and external_account_id = 'UCDv_CqLgtUlMUfFg7VAs4aQ'
    and status = 'active'
    and token_version = requested_token_version
    and refresh_lease_id = requested_lease_id
    and refresh_lease_until > now()
    and refresh_token_enc is not null;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then return false; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    null, 'social_connection_token_refreshed', 'social_connection', 'youtube',
    jsonb_build_object(
      'provider', 'youtube', 'scope_count', cardinality(requested_scopes),
      'access_expires_at', requested_access_expires_at, 'initiator', 'system_cron'
    )
  );
  return true;
end;
$$;

revoke all on function public.upsert_external_social_connection_v1(
  text, text, text, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.complete_external_social_connection_refresh_v1(
  text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.upsert_external_social_connection_v1(
  text, text, text, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, uuid, jsonb
) to service_role;
grant execute on function public.complete_external_social_connection_refresh_v1(
  text, uuid, bigint, text, text[], jsonb, jsonb, timestamptz,
  timestamptz, timestamptz, timestamptz, jsonb
) to service_role;

commit;
