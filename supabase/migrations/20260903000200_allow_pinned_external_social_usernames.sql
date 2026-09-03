-- Allow each social provider to persist only its pinned canonical username.
-- The original Instagram/TikTok-only table constraint still required
-- username = 'hooma.ge', which rejected valid Facebook and YouTube OAuth
-- connections after those providers were added.

begin;

alter table public.social_connections
  drop constraint if exists social_connections_username_check;
alter table public.social_connections
  drop constraint if exists social_connections_username_v2_check;

alter table public.social_connections
  add constraint social_connections_username_v2_check
  check (
    (provider in ('tiktok', 'instagram') and username = 'hooma.ge')
    or (provider = 'facebook' and username = 'hoomageorgia')
    or (provider = 'youtube' and username = 'hoomastore')
  );

commit;
