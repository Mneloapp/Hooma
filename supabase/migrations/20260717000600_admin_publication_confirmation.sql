-- One-time Admin/Owner confirmation for externally sourced Draft publication.
-- This keeps the existing source-rights and technical publication gates, while replacing
-- the old separate license form with one explicit, auditable confirmation at Publish time.

create table if not exists public.catalog_publication_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  source_snapshot jsonb not null,
  publication_authority_confirmed boolean not null check (publication_authority_confirmed is true),
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_catalog_publication_reviews_updated_at on public.catalog_publication_reviews;
create trigger set_catalog_publication_reviews_updated_at
before update on public.catalog_publication_reviews
for each row execute function public.set_updated_at();

alter table public.catalog_publication_reviews enable row level security;
revoke all on public.catalog_publication_reviews from public, anon, authenticated;
grant all on public.catalog_publication_reviews to service_role;

create or replace function public.confirm_and_publish_catalog_product(
  requested_product_id uuid,
  actor_profile_id uuid,
  confirmed_publication_authority boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  source_snapshot jsonb;
  publication_result jsonb;
  reviewed_at_value timestamptz := now();
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin');
  if actor_role is null then
    raise exception 'Only an active Admin or Owner may confirm publication review';
  end if;
  if confirmed_publication_authority is not true then
    raise exception 'An explicit confirmation is required';
  end if;
  perform 1 from public.products where id = requested_product_id for update;
  if not found then
    raise exception 'Product was not found';
  end if;
  if exists (
    select 1 from public.product_sources
    where product_id = requested_product_id and license_status = 'rejected'
  ) then
    raise exception 'A rejected source cannot be confirmed through publication';
  end if;

  select jsonb_agg(jsonb_build_object(
    'source_id', source.id,
    'platform', source.platform,
    'source_url', source.source_url,
    'source_model_id', source.source_model_id,
    'creator_name', source.creator_name,
    'previous_license_status', source.license_status,
    'reviewed_at', reviewed_at_value
  ) order by source.created_at)
  into source_snapshot
  from public.product_sources source
  where source.product_id = requested_product_id;
  if source_snapshot is null then
    raise exception 'Product source was not found';
  end if;

  insert into public.catalog_publication_reviews (
    product_id, source_snapshot, publication_authority_confirmed, reviewed_by, reviewed_at
  ) values (
    requested_product_id, source_snapshot, true, actor_profile_id, reviewed_at_value
  )
  on conflict (product_id) do update
  set source_snapshot = excluded.source_snapshot,
      publication_authority_confirmed = true,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at;

  update public.product_sources
  set license_status = 'verified',
      commercial_use_allowed = true,
      media_use_allowed = true,
      verified_by = actor_profile_id,
      verified_at = reviewed_at_value
  where product_id = requested_product_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_publication_review_confirmed',
    'product',
    requested_product_id::text,
    jsonb_build_object(
      'actor_role', actor_role,
      'publication_authority_confirmed', true,
      'source_snapshot', source_snapshot,
      'reviewed_at', reviewed_at_value
    )
  );

  publication_result := public.set_catalog_publication(
    requested_product_id,
    true,
    actor_profile_id
  );

  return jsonb_build_object(
    'product_id', requested_product_id,
    'reviewed_by', actor_profile_id,
    'reviewed_at', reviewed_at_value,
    'publication', publication_result
  );
end;
$$;

revoke all on function public.confirm_and_publish_catalog_product(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.confirm_and_publish_catalog_product(uuid, uuid, boolean) to service_role;
