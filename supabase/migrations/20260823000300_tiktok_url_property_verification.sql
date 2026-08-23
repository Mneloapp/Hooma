-- Persist only the public file-verification material returned by TikTok. The
-- app secret never enters this table and the row is service-role-only.

begin;

create table if not exists public.social_tiktok_url_property_verifications (
  property_url text primary key
    check (property_url = 'https://hooma.ge/api/social/tiktok/media/'),
  property_type integer not null check (property_type = 2),
  property_status integer not null check (property_status in (0, 1, 2)),
  file_name text not null unique
    check (file_name ~ '^[A-Za-z0-9._=-]{1,240}$'),
  signature text not null
    check (char_length(signature) between 1 and 4096),
  provider_request_id text
    check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9_.:~-]{1,120}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_tiktok_url_property_verifications enable row level security;
revoke all on table public.social_tiktok_url_property_verifications
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.social_tiktok_url_property_verifications
  to service_role;

comment on table public.social_tiktok_url_property_verifications is
  'Public TikTok URL-prefix verification file material; app credentials are never persisted.';

commit;
