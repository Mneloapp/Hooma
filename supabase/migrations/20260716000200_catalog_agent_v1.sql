-- Catalog Agent V1: a least-privilege machine principal, resumable category jobs,
-- and an auditable staging queue. Machine credentials never become Supabase users.

create table if not exists public.catalog_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  token_prefix text not null unique check (char_length(token_prefix) between 8 and 24),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] not null default array['jobs:claim', 'drafts:create']::text[],
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scopes <@ array['jobs:claim', 'drafts:create']::text[])
);

create table if not exists public.catalog_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.catalog_agents(id) on delete restrict,
  source_platform text not null check (source_platform in ('makerworld', 'printables', 'thingiverse', 'other')),
  source_url text not null check (source_url ~ '^https://'),
  category_id uuid not null references public.categories(id) on delete restrict,
  category_label text not null check (char_length(trim(category_label)) between 2 and 240),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  max_products integer not null default 500 check (max_products between 1 and 10000),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  draft_count integer not null default 0 check (draft_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  worker_name text,
  cursor jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_agent_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.catalog_agent_jobs(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  source_model_id text,
  source_title text,
  status text not null default 'discovered'
    check (status in ('discovered', 'processing', 'draft_created', 'needs_review', 'duplicate', 'failed')),
  extracted_payload jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}'::text[],
  source_import_id uuid references public.source_imports(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  error_message text,
  attempts integer not null default 0 check (attempts between 0 and 20),
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, source_url)
);

create index if not exists idx_catalog_agents_active on public.catalog_agents(is_active, created_at);
create index if not exists idx_catalog_agent_jobs_agent_status on public.catalog_agent_jobs(agent_id, status, created_at);
create index if not exists idx_catalog_agent_items_job_status on public.catalog_agent_items(job_id, status, created_at);
create index if not exists idx_catalog_agent_items_source_model on public.catalog_agent_items(source_model_id) where source_model_id is not null;

drop trigger if exists set_catalog_agents_updated_at on public.catalog_agents;
create trigger set_catalog_agents_updated_at before update on public.catalog_agents
for each row execute function public.set_updated_at();
drop trigger if exists set_catalog_agent_jobs_updated_at on public.catalog_agent_jobs;
create trigger set_catalog_agent_jobs_updated_at before update on public.catalog_agent_jobs
for each row execute function public.set_updated_at();
drop trigger if exists set_catalog_agent_items_updated_at on public.catalog_agent_items;
create trigger set_catalog_agent_items_updated_at before update on public.catalog_agent_items
for each row execute function public.set_updated_at();

alter table public.catalog_agents enable row level security;
alter table public.catalog_agent_jobs enable row level security;
alter table public.catalog_agent_items enable row level security;

revoke all on public.catalog_agents from public, anon, authenticated;
revoke all on public.catalog_agent_jobs from public, anon, authenticated;
revoke all on public.catalog_agent_items from public, anon, authenticated;
grant all on public.catalog_agents to service_role;
grant all on public.catalog_agent_jobs to service_role;
grant all on public.catalog_agent_items to service_role;

create or replace function public.claim_catalog_agent_job(
  requested_agent_id uuid,
  requested_worker_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_agent_jobs%rowtype;
begin
  if not exists (
    select 1 from public.catalog_agents
    where id = requested_agent_id and is_active = true and 'jobs:claim' = any(scopes)
  ) then raise exception 'Inactive or unauthorized catalog agent'; end if;

  select * into selected_job
  from public.catalog_agent_jobs
  where agent_id = requested_agent_id and status = 'running'
  order by claimed_at nulls last, created_at
  limit 1
  for update skip locked;

  if selected_job.id is null then
    select * into selected_job
    from public.catalog_agent_jobs
    where agent_id = requested_agent_id and status = 'queued'
    order by created_at
    limit 1
    for update skip locked;
  end if;

  if selected_job.id is null then return null; end if;

  update public.catalog_agent_jobs
  set status = 'running',
      worker_name = left(nullif(trim(requested_worker_name), ''), 120),
      claimed_at = coalesce(claimed_at, now()),
      heartbeat_at = now(),
      error_message = null
  where id = selected_job.id
  returning * into selected_job;

  update public.catalog_agents set last_seen_at = now() where id = requested_agent_id;
  return to_jsonb(selected_job);
end;
$$;

create or replace function public.claim_catalog_agent_item(
  requested_agent_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_item public.catalog_agent_items%rowtype;
begin
  if not exists (
    select 1
    from public.catalog_agent_jobs job
    join public.catalog_agents agent on agent.id = job.agent_id
    where job.id = requested_job_id
      and job.agent_id = requested_agent_id
      and job.status = 'running'
      and agent.is_active = true
      and 'drafts:create' = any(agent.scopes)
  ) then raise exception 'Catalog job is not available to this agent'; end if;

  select * into selected_item
  from public.catalog_agent_items
  where job_id = requested_job_id
    and (
      status = 'discovered'
      or (status = 'processing' and processing_started_at < now() - interval '20 minutes')
    )
  order by created_at
  limit 1
  for update skip locked;

  if selected_item.id is null then return null; end if;

  update public.catalog_agent_items
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = now(),
      error_message = null
  where id = selected_item.id
  returning * into selected_item;

  update public.catalog_agent_jobs set heartbeat_at = now() where id = requested_job_id;
  return to_jsonb(selected_item);
end;
$$;

create or replace function public.refresh_catalog_agent_job_counters(requested_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counters jsonb;
begin
  select jsonb_build_object(
    'discovered_count', count(*),
    'processed_count', count(*) filter (where status in ('draft_created', 'needs_review', 'duplicate', 'failed')),
    'draft_count', count(*) filter (where status = 'draft_created'),
    'review_count', count(*) filter (where status = 'needs_review'),
    'duplicate_count', count(*) filter (where status = 'duplicate'),
    'failed_count', count(*) filter (where status = 'failed'),
    'pending_count', count(*) filter (where status in ('discovered', 'processing'))
  ) into counters
  from public.catalog_agent_items
  where job_id = requested_job_id;

  update public.catalog_agent_jobs
  set discovered_count = (counters->>'discovered_count')::integer,
      processed_count = (counters->>'processed_count')::integer,
      draft_count = (counters->>'draft_count')::integer,
      review_count = (counters->>'review_count')::integer,
      duplicate_count = (counters->>'duplicate_count')::integer,
      failed_count = (counters->>'failed_count')::integer,
      heartbeat_at = case when status = 'running' then now() else heartbeat_at end
  where id = requested_job_id;

  return counters;
end;
$$;

revoke all on function public.claim_catalog_agent_job(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_catalog_agent_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_catalog_agent_job_counters(uuid) from public, anon, authenticated;
grant execute on function public.claim_catalog_agent_job(uuid, text) to service_role;
grant execute on function public.claim_catalog_agent_item(uuid, uuid) to service_role;
grant execute on function public.refresh_catalog_agent_job_counters(uuid) to service_role;
