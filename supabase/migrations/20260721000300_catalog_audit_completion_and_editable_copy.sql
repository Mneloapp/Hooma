-- Catalog audit completion and editable copy.
--
-- A successful AI result is a permanent audit completion even when a human
-- has not applied it yet. Application remains a separate, explicit action.

alter table public.products
  add column if not exists catalog_audit_attempted_at timestamptz,
  add column if not exists catalog_audit_attempted_item_id uuid,
  add column if not exists catalog_audit_completed_at timestamptz,
  add column if not exists catalog_audit_completed_item_id uuid;

-- Backfill one canonical successful result per product. Preserve an explicit
-- applied marker first, then prefer a current ready result and the latest usable
-- result. This avoids letting an older row displace a newer paid delivery.
with canonical_result as (
  select distinct on (item.product_id)
    item.product_id,
    item.id as audit_item_id,
    item.current_snapshot->>'variant_id' as variant_id
  from public.catalog_product_audit_items item
  join public.products existing_product on existing_product.id = item.product_id
  left join public.product_variants ranked_variant
    on ranked_variant.id = case
      when coalesce(item.current_snapshot->>'variant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item.current_snapshot->>'variant_id')::uuid
      else null
    end
    and ranked_variant.product_id = item.product_id
  where item.status in ('ready', 'applied', 'rejected')
  order by
    item.product_id,
    case
      when item.id = existing_product.catalog_audit_applied_item_id then 0
      when item.status = 'ready'
        and ranked_variant.id is not null
        and existing_product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 1
      when item.status = 'ready' then 2
      when item.status = 'applied' then 3
      else 4
    end,
    greatest(
      coalesce(item.processed_at, '-infinity'::timestamptz),
      coalesce(item.reviewed_at, '-infinity'::timestamptz),
      coalesce(item.updated_at, '-infinity'::timestamptz),
      coalesce(item.created_at, '-infinity'::timestamptz)
    ) desc,
    item.id desc
)
update public.catalog_product_audit_items item
set review_overrides = coalesce(item.review_overrides, '{}'::jsonb) || jsonb_build_object(
      'completion_backfill_snapshot_current',
      product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and variant.id is not null
        and variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz
    )
from canonical_result result
join public.products product on product.id = result.product_id
left join public.product_variants variant
  on variant.id = nullif(result.variant_id, '')::uuid
  and variant.product_id = result.product_id
where item.id = result.audit_item_id
  and item.status = 'ready';

with canonical_result as (
  select distinct on (item.product_id)
    item.product_id,
    item.id as audit_item_id,
    coalesce(item.processed_at, item.reviewed_at, item.created_at, item.updated_at, now()) as completed_at
  from public.catalog_product_audit_items item
  join public.products existing_product on existing_product.id = item.product_id
  left join public.product_variants ranked_variant
    on ranked_variant.id = case
      when coalesce(item.current_snapshot->>'variant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item.current_snapshot->>'variant_id')::uuid
      else null
    end
    and ranked_variant.product_id = item.product_id
  where item.status in ('ready', 'applied', 'rejected')
  order by
    item.product_id,
    case
      when item.id = existing_product.catalog_audit_applied_item_id then 0
      when item.status = 'ready'
        and ranked_variant.id is not null
        and existing_product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 1
      when item.status = 'ready' then 2
      when item.status = 'applied' then 3
      else 4
    end,
    greatest(
      coalesce(item.processed_at, '-infinity'::timestamptz),
      coalesce(item.reviewed_at, '-infinity'::timestamptz),
      coalesce(item.updated_at, '-infinity'::timestamptz),
      coalesce(item.created_at, '-infinity'::timestamptz)
    ) desc,
    item.id desc
)
update public.products product
set catalog_audit_attempted_at = result.completed_at,
    catalog_audit_attempted_item_id = result.audit_item_id,
    catalog_audit_completed_at = result.completed_at,
    catalog_audit_completed_item_id = result.audit_item_id
from canonical_result result
where product.id = result.product_id
  and product.catalog_audit_completed_at is null;

-- Products have a generic updated_at trigger. Keep the optimistic-concurrency
-- timestamp of a canonical ready result aligned with this metadata-only write,
-- otherwise applying that result would always look stale.
update public.catalog_product_audit_items item
set current_snapshot = jsonb_set(
      coalesce(item.current_snapshot, '{}'::jsonb),
      '{product_updated_at}',
      to_jsonb(product.updated_at),
      true
    )
from public.products product
where item.id = product.catalog_audit_completed_item_id
  and item.product_id = product.id
  and item.status = 'ready'
  and coalesce((item.review_overrides->>'completion_backfill_snapshot_current')::boolean, false);

-- Keep a successful historical audit permanently completed, but do not allow a
-- result based on stale product data to overwrite later human edits.
update public.catalog_product_audit_items item
set status = 'failed',
    review_visible = true,
    error_message = 'Product or active variant changed after this audit result; result retained but cannot be applied'
from public.products product
where item.id = product.catalog_audit_completed_item_id
  and item.product_id = product.id
  and item.status = 'ready'
  and not coalesce((item.review_overrides->>'completion_backfill_snapshot_current')::boolean, false);

-- A processing or failed row means the product may already have crossed the
-- model hand-off boundary. Prefer a snapshot-current processing row (the best
-- evidence of an in-flight paid request), then any other processing row, rather
-- than allowing failed history to steal canonical ownership.
with canonical_attempt as (
  select distinct on (item.product_id)
    item.product_id,
    item.id as audit_item_id,
    item.current_snapshot->>'variant_id' as variant_id
  from public.catalog_product_audit_items item
  join public.products product on product.id = item.product_id
  left join public.product_variants ranked_variant
    on ranked_variant.id = case
      when coalesce(item.current_snapshot->>'variant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item.current_snapshot->>'variant_id')::uuid
      else null
    end
    and ranked_variant.product_id = item.product_id
  where product.catalog_audit_attempted_at is null
    and item.status in ('processing', 'failed')
  order by
    item.product_id,
    case
      when item.status = 'processing'
        and ranked_variant.id is not null
        and product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 0
      when item.status = 'processing' then 1
      when ranked_variant.id is not null
        and product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 2
      else 3
    end,
    greatest(
      coalesce(item.processing_started_at, '-infinity'::timestamptz),
      coalesce(item.processed_at, '-infinity'::timestamptz),
      coalesce(item.updated_at, '-infinity'::timestamptz),
      coalesce(item.created_at, '-infinity'::timestamptz)
    ) desc,
    item.id desc
)
update public.catalog_product_audit_items item
set review_overrides = coalesce(item.review_overrides, '{}'::jsonb) || jsonb_build_object(
      'attempt_backfill_snapshot_current',
      product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and variant.id is not null
        and variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz
    )
from canonical_attempt attempt
join public.products product on product.id = attempt.product_id
left join public.product_variants variant
  on variant.id::text = attempt.variant_id
  and variant.product_id = attempt.product_id
where item.id = attempt.audit_item_id;

with canonical_attempt as (
  select distinct on (item.product_id)
    item.product_id,
    item.id as audit_item_id,
    coalesce(item.processing_started_at, item.processed_at, item.created_at, item.updated_at, now()) as attempted_at
  from public.catalog_product_audit_items item
  join public.products product on product.id = item.product_id
  left join public.product_variants ranked_variant
    on ranked_variant.id = case
      when coalesce(item.current_snapshot->>'variant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item.current_snapshot->>'variant_id')::uuid
      else null
    end
    and ranked_variant.product_id = item.product_id
  where product.catalog_audit_attempted_at is null
    and item.status in ('processing', 'failed')
  order by
    item.product_id,
    case
      when item.status = 'processing'
        and ranked_variant.id is not null
        and product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 0
      when item.status = 'processing' then 1
      when ranked_variant.id is not null
        and product.updated_at is not distinct from nullif(item.current_snapshot->>'product_updated_at', '')::timestamptz
        and ranked_variant.updated_at is not distinct from nullif(item.current_snapshot->>'variant_updated_at', '')::timestamptz then 2
      else 3
    end,
    greatest(
      coalesce(item.processing_started_at, '-infinity'::timestamptz),
      coalesce(item.processed_at, '-infinity'::timestamptz),
      coalesce(item.updated_at, '-infinity'::timestamptz),
      coalesce(item.created_at, '-infinity'::timestamptz)
    ) desc,
    item.id desc
)
update public.products product
set catalog_audit_attempted_at = attempt.attempted_at,
    catalog_audit_attempted_item_id = attempt.audit_item_id
from canonical_attempt attempt
where product.id = attempt.product_id
  and product.catalog_audit_attempted_at is null;

-- The attempt marker is metadata and therefore advances products.updated_at.
-- Rebase only snapshots that were current immediately before that write.
update public.catalog_product_audit_items item
set current_snapshot = jsonb_set(
      coalesce(item.current_snapshot, '{}'::jsonb),
      '{product_updated_at}',
      to_jsonb(product.updated_at),
      true
    )
from public.products product
where item.id = product.catalog_audit_attempted_item_id
  and item.product_id = product.id
  and item.status in ('processing', 'failed')
  and coalesce((item.review_overrides->>'attempt_backfill_snapshot_current')::boolean, false);

-- Remove legacy concurrent results from the active queue, while preserving all
-- rows as immutable cost/history evidence.
update public.catalog_product_audit_items item
set status = 'skipped',
    review_visible = false,
    processed_at = coalesce(item.processed_at, now()),
    error_message = 'Product already has a canonical successful catalog audit'
from public.products product
where product.id = item.product_id
  and product.catalog_audit_attempted_at is not null
  and item.id is distinct from product.catalog_audit_attempted_item_id
  and item.status in ('processing', 'ready');

-- A completed canonical result is only visible while it is awaiting review.
update public.catalog_product_audit_items item
set review_visible = false
from public.products product
where product.id = item.product_id
  and item.id = product.catalog_audit_completed_item_id
  and item.status in ('applied', 'rejected');

alter table public.products
  drop constraint if exists products_catalog_audit_attempt_marker_check;
alter table public.products
  add constraint products_catalog_audit_attempt_marker_check
  check (
    (catalog_audit_attempted_at is null) = (catalog_audit_attempted_item_id is null)
  );

alter table public.products
  drop constraint if exists products_catalog_audit_completion_marker_check;
alter table public.products
  add constraint products_catalog_audit_completion_marker_check
  check (
    ((catalog_audit_completed_at is null) = (catalog_audit_completed_item_id is null))
    and (
      catalog_audit_completed_at is null
      or (
        catalog_audit_attempted_at is not null
        and catalog_audit_attempted_item_id = catalog_audit_completed_item_id
      )
    )
  );

-- Once an at-most-once hand-off or completion is recorded, no ordinary update
-- may clear it or point it at another audit item. New markers may still be set
-- from null by the begin/result RPCs and by the rolling-deploy compatibility
-- trigger. Product deletion remains unaffected.
create or replace function public.protect_catalog_audit_product_markers_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (old.catalog_audit_attempted_at is not null
      and new.catalog_audit_attempted_at is distinct from old.catalog_audit_attempted_at)
    or (old.catalog_audit_attempted_item_id is not null
      and new.catalog_audit_attempted_item_id is distinct from old.catalog_audit_attempted_item_id) then
    raise exception 'Catalog audit attempt marker is immutable once set';
  end if;

  if (old.catalog_audit_completed_at is not null
      and new.catalog_audit_completed_at is distinct from old.catalog_audit_completed_at)
    or (old.catalog_audit_completed_item_id is not null
      and new.catalog_audit_completed_item_id is distinct from old.catalog_audit_completed_item_id) then
    raise exception 'Catalog audit completion marker is immutable once set';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_catalog_audit_product_markers on public.products;
create trigger protect_catalog_audit_product_markers
before update of catalog_audit_attempted_at, catalog_audit_attempted_item_id,
  catalog_audit_completed_at, catalog_audit_completed_item_id
on public.products
for each row execute function public.protect_catalog_audit_product_markers_v1();

drop index if exists public.idx_products_catalog_audit_pending_cursor;
create index idx_products_catalog_audit_pending_cursor
  on public.products(status, coalesce(created_at, '-infinity'::timestamptz), id)
  where catalog_audit_attempted_at is null and catalog_audit_completed_at is null;

-- Audit jobs commonly include more than one product status. With status as the
-- leading key PostgreSQL cannot stream the global created_at/id order across
-- those statuses and may repeatedly sort the remaining catalog. This second
-- partial index owns the keyset walk; status remains included for index-level
-- filtering while the status-led index above serves job counts/status subsets.
drop index if exists public.idx_products_catalog_audit_global_cursor;
create index idx_products_catalog_audit_global_cursor
  on public.products((coalesce(created_at, '-infinity'::timestamptz)), id)
  include (status)
  where catalog_audit_attempted_at is null and catalog_audit_completed_at is null;

create unique index if not exists idx_products_catalog_audit_attempted_item
  on public.products(catalog_audit_attempted_item_id)
  where catalog_audit_attempted_item_id is not null;

-- This is the final database-level protection against two workers spending AI
-- tokens on the same product. Ready remains included until human review ends.
create unique index if not exists idx_catalog_product_audit_items_one_live_product
  on public.catalog_product_audit_items(product_id)
  where status in ('processing', 'ready');

-- Hot-path transitions adjust the materialized counters in O(1). The existing
-- full refresh remains the reconciliation primitive used by job completion and
-- infrequent human review actions.
create or replace function public.adjust_catalog_product_audit_job_counters_v1(
  requested_job_id uuid,
  previous_status text,
  next_status text,
  transition_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  valid_statuses constant text[] := array['processing', 'ready', 'applied', 'rejected', 'skipped', 'failed'];
  terminal_statuses constant text[] := array['ready', 'applied', 'rejected', 'skipped', 'failed'];
begin
  if transition_count is null or transition_count < 0 then
    raise exception 'Catalog audit transition count is invalid';
  end if;
  if transition_count = 0 or previous_status is not distinct from next_status then return; end if;
  if (previous_status is not null and not (previous_status = any(valid_statuses)))
    or (next_status is not null and not (next_status = any(valid_statuses))) then
    raise exception 'Catalog audit transition status is invalid';
  end if;

  update public.catalog_product_audit_jobs
  set processed_count = greatest(0, processed_count + transition_count * (
        case when next_status = any(terminal_statuses) then 1 else 0 end
        - case when previous_status = any(terminal_statuses) then 1 else 0 end
      )),
      ready_count = greatest(0, ready_count + transition_count * (
        case when next_status = 'ready' then 1 else 0 end
        - case when previous_status = 'ready' then 1 else 0 end
      )),
      applied_count = greatest(0, applied_count + transition_count * (
        case when next_status = 'applied' then 1 else 0 end
        - case when previous_status = 'applied' then 1 else 0 end
      )),
      rejected_count = greatest(0, rejected_count + transition_count * (
        case when next_status = 'rejected' then 1 else 0 end
        - case when previous_status = 'rejected' then 1 else 0 end
      )),
      skipped_count = greatest(0, skipped_count + transition_count * (
        case when next_status = 'skipped' then 1 else 0 end
        - case when previous_status = 'skipped' then 1 else 0 end
      )),
      failed_count = greatest(0, failed_count + transition_count * (
        case when next_status = 'failed' then 1 else 0 end
        - case when previous_status = 'failed' then 1 else 0 end
      )),
      heartbeat_at = case when status = 'running' then now() else heartbeat_at end
  where id = requested_job_id;
  if not found then raise exception 'Catalog audit job not found'; end if;
end;
$$;

create or replace function public.refresh_catalog_product_audit_job_counters(requested_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counters jsonb;
begin
  -- Lock first so a reconciliation cannot overwrite a concurrent O(1) delta
  -- with a snapshot taken before that transition committed.
  perform 1
  from public.catalog_product_audit_jobs job
  where job.id = requested_job_id
  for update;
  if not found then raise exception 'Catalog audit job not found'; end if;

  select jsonb_build_object(
    'processed_count', count(*) filter (where status in ('ready', 'applied', 'rejected', 'skipped', 'failed')),
    'ready_count', count(*) filter (where status = 'ready'),
    'applied_count', count(*) filter (where status = 'applied'),
    'rejected_count', count(*) filter (where status = 'rejected'),
    'skipped_count', count(*) filter (where status = 'skipped'),
    'failed_count', count(*) filter (where status = 'failed'),
    'processing_count', count(*) filter (where status = 'processing')
  ) into counters
  from public.catalog_product_audit_items
  where job_id = requested_job_id;

  update public.catalog_product_audit_jobs
  set processed_count = (counters->>'processed_count')::integer,
      ready_count = (counters->>'ready_count')::integer,
      applied_count = (counters->>'applied_count')::integer,
      rejected_count = (counters->>'rejected_count')::integer,
      skipped_count = (counters->>'skipped_count')::integer,
      failed_count = (counters->>'failed_count')::integer,
      heartbeat_at = case when status = 'running' then now() else heartbeat_at end
  where id = requested_job_id;

  return counters;
end;
$$;

-- During a rolling deploy an old API process may still perform a direct
-- processing -> ready update. Canonicalize that paid result inside the same
-- transaction so it cannot become a ready row with no product marker.
create or replace function public.protect_legacy_catalog_audit_ready_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  marker_product_updated_at timestamptz;
  snapshot_is_current boolean := false;
begin
  if not (
    (new.status = 'processing' and new.current_snapshot is distinct from old.current_snapshot)
    or (new.status = 'ready' and old.status <> 'ready')
  ) then return new; end if;

  select product.* into product_record
  from public.products product
  where product.id = new.product_id
  for update;
  if product_record.id is null then raise exception 'Catalog audit product not found'; end if;

  -- A rolling-deploy legacy claim route writes the snapshot directly before it
  -- returns the item to its worker. Treat that write as the model hand-off and
  -- seal the permanent attempt marker in the same transaction. The new begin
  -- RPC has already set this marker, so its own snapshot update is a no-op here.
  if new.status = 'processing' then
    if product_record.catalog_audit_attempted_item_id = new.id
      and product_record.catalog_audit_attempted_at is not null then
      return new;
    end if;
    if product_record.catalog_audit_attempted_at is not null then
      raise exception 'Product already has a different canonical catalog audit attempt';
    end if;
    if new.current_snapshot is null
      or jsonb_typeof(new.current_snapshot) <> 'object'
      or coalesce(new.current_snapshot->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or nullif(new.current_snapshot->>'product_updated_at', '') is null
      or nullif(new.current_snapshot->>'variant_updated_at', '') is null
      or jsonb_typeof(new.current_snapshot->'gallery_images') <> 'array' then
      raise exception 'Legacy catalog audit snapshot is invalid';
    end if;

    select variant.* into variant_record
    from public.product_variants variant
    where variant.id = (new.current_snapshot->>'variant_id')::uuid
      and variant.product_id = new.product_id
    for update;
    snapshot_is_current := variant_record.id is not null
      and product_record.updated_at is not distinct from (new.current_snapshot->>'product_updated_at')::timestamptz
      and variant_record.updated_at is not distinct from (new.current_snapshot->>'variant_updated_at')::timestamptz;

    update public.products
    set catalog_audit_attempted_at = now(),
        catalog_audit_attempted_item_id = new.id
    where id = new.product_id
      and catalog_audit_attempted_at is null
    returning updated_at into marker_product_updated_at;
    if marker_product_updated_at is null then
      raise exception 'Catalog audit attempt changed concurrently';
    end if;
    if snapshot_is_current then
      new.current_snapshot := jsonb_set(
        new.current_snapshot,
        '{product_updated_at}',
        to_jsonb(marker_product_updated_at),
        true
      );
    end if;
    return new;
  end if;

  if (product_record.catalog_audit_attempted_item_id is not null
      and product_record.catalog_audit_attempted_item_id <> new.id)
    or (product_record.catalog_audit_completed_item_id is not null
      and product_record.catalog_audit_completed_item_id <> new.id) then
    new.status := 'skipped';
    new.review_visible := false;
    new.processed_at := coalesce(new.processed_at, now());
    new.error_message := 'Product already has a different canonical catalog audit attempt';
    return new;
  end if;

  if coalesce(new.current_snapshot->>'variant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select variant.* into variant_record
    from public.product_variants variant
    where variant.id = (new.current_snapshot->>'variant_id')::uuid
      and variant.product_id = new.product_id
    for update;
  end if;

  snapshot_is_current := variant_record.id is not null
    and product_record.updated_at is not distinct from nullif(new.current_snapshot->>'product_updated_at', '')::timestamptz
    and variant_record.updated_at is not distinct from nullif(new.current_snapshot->>'variant_updated_at', '')::timestamptz;

  if not snapshot_is_current then
    if product_record.catalog_audit_attempted_item_id is null then
      update public.products
      set catalog_audit_attempted_at = now(),
          catalog_audit_attempted_item_id = new.id
      where id = new.product_id;
    end if;
    new.status := 'failed';
    new.review_visible := true;
    new.processed_at := coalesce(new.processed_at, now());
    new.error_message := 'Product or active variant changed during legacy audit delivery; result retained but not marked complete';
    return new;
  end if;

  if product_record.catalog_audit_attempted_item_id is null
    or product_record.catalog_audit_completed_item_id is null then
    update public.products
    set catalog_audit_attempted_at = coalesce(catalog_audit_attempted_at, now()),
        catalog_audit_attempted_item_id = coalesce(catalog_audit_attempted_item_id, new.id),
        catalog_audit_completed_at = coalesce(catalog_audit_completed_at, now()),
        catalog_audit_completed_item_id = coalesce(catalog_audit_completed_item_id, new.id)
    where id = new.product_id
    returning updated_at into marker_product_updated_at;
  else
    marker_product_updated_at := product_record.updated_at;
  end if;

  new.current_snapshot := jsonb_set(
    coalesce(new.current_snapshot, '{}'::jsonb),
    '{product_updated_at}',
    to_jsonb(marker_product_updated_at),
    true
  );
  return new;
end;
$$;

drop trigger if exists protect_legacy_catalog_audit_ready on public.catalog_product_audit_items;
create trigger protect_legacy_catalog_audit_ready
before update of status, current_snapshot on public.catalog_product_audit_items
for each row execute function public.protect_legacy_catalog_audit_ready_transition();

create or replace function public.create_catalog_product_audit_job_v1(
  actor_profile_id uuid,
  requested_agent_id uuid,
  requested_product_statuses text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_statuses text[];
  product_total integer;
  new_job public.catalog_product_audit_jobs%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  if not exists (
    select 1 from public.catalog_agents
    where id = requested_agent_id
      and is_active = true
      and 'audits:process' = any(scopes)
  ) then raise exception 'Active audit-capable catalog agent is required'; end if;

  normalized_statuses := array(
    select distinct trim(status_name)
    from unnest(coalesce(requested_product_statuses, '{}'::text[])) as requested(status_name)
    where trim(status_name) in ('active', 'draft', 'archived', 'coming_soon')
    order by trim(status_name)
  );
  if cardinality(normalized_statuses) = 0 then
    raise exception 'At least one product status is required';
  end if;

  select count(*)::integer into product_total
  from public.products
  where status = any(normalized_statuses)
    and catalog_audit_attempted_at is null
    and catalog_audit_completed_at is null;

  insert into public.catalog_product_audit_jobs (
    agent_id, product_statuses, total_count, created_by, snapshot_at
  ) values (
    requested_agent_id, normalized_statuses, product_total, actor_profile_id, now()
  ) returning * into new_job;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_audit_job_created',
    'catalog_product_audit_job',
    new_job.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'product_statuses', to_jsonb(normalized_statuses),
      'total_count', product_total,
      'previously_attempted_products_excluded', true
    )
  );

  return jsonb_build_object('id', new_job.id, 'total_count', product_total);
end;
$$;

create or replace function public.claim_catalog_product_audit_item(
  requested_agent_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  selected_item public.catalog_product_audit_items%rowtype;
  selected_product public.products%rowtype;
  stale_item_id uuid;
  stale_product_id uuid;
  competing_item_id uuid;
  competing_job_id uuid;
  changed_count integer := 0;
begin
  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and job.status = 'running'
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then raise exception 'Catalog audit job is not available'; end if;

  -- A sealed claim is never returned again. After a conservative timeout it is
  -- made visible as failed so the job can finish; an eventual paid result is
  -- still allowed to upgrade this same canonical item to ready.
  update public.catalog_product_audit_items item
  set status = 'failed',
      review_visible = true,
      processed_at = now(),
      error_message = 'Sealed catalog audit attempt timed out; a late result will still be accepted'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id = product.catalog_audit_attempted_item_id
    and item.status = 'processing'
    and item.processing_started_at < now() - interval '2 hours';
  get diagnostics changed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'failed', changed_count
  );

  -- Clear only non-canonical live rows. A sealed processing row is never
  -- reclaimed or displaced: it may still deliver a paid result much later.
  update public.catalog_product_audit_items item
  set status = 'skipped',
      review_visible = false,
      processed_at = coalesce(item.processed_at, now()),
      error_message = 'Product already has a different canonical catalog audit attempt'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id is distinct from product.catalog_audit_attempted_item_id
    and item.status = 'processing'
    and product.catalog_audit_attempted_at is not null;
  get diagnostics changed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'skipped', changed_count
  );

  -- Only an unsealed preparation row is retryable. Because the claim endpoint
  -- never returns an item until begin_catalog_product_audit_attempt_v1 seals it,
  -- retrying this row cannot duplicate a model request.
  select item.id, item.product_id into stale_item_id, stale_product_id
  from public.catalog_product_audit_items item
  join public.products product on product.id = item.product_id
  where item.job_id = requested_job_id
    and item.status = 'processing'
    and item.processing_started_at < now() - interval '20 minutes'
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
  order by item.processing_started_at, item.id
  limit 1;

  if stale_item_id is not null then
    select product.* into selected_product
    from public.products product
    where product.id = stale_product_id
    for update;

    if selected_product.id is not null then
      select * into selected_item
      from public.catalog_product_audit_items item
      where item.id = stale_item_id
        and item.job_id = requested_job_id
        and item.status = 'processing'
        and item.processing_started_at < now() - interval '20 minutes'
      for update;

      if selected_item.id is not null and selected_product.catalog_audit_attempted_at is not null then
        update public.catalog_product_audit_items
        set status = 'skipped',
            review_visible = false,
            processed_at = coalesce(processed_at, now()),
            error_message = 'Product already has a canonical catalog audit attempt'
        where id = selected_item.id;
        perform public.adjust_catalog_product_audit_job_counters_v1(
          requested_job_id, 'processing', 'skipped', 1
        );
        return to_jsonb(selected_item) || jsonb_build_object('status', 'skipped');
      end if;

      if selected_item.id is not null then
        update public.catalog_product_audit_items
        set attempts = attempts + 1,
            processing_started_at = now(),
            current_snapshot = '{}'::jsonb,
            error_message = null
        where id = selected_item.id
        returning * into selected_item;
        update public.catalog_product_audit_jobs set heartbeat_at = now() where id = requested_job_id;
        return to_jsonb(selected_item);
      end if;
    end if;
  end if;

  select product.* into selected_product
  from public.products product
  where product.status = any(selected_job.product_statuses)
    and product.catalog_audit_attempted_at is null
    and product.catalog_audit_completed_at is null
    and coalesce(product.created_at, '-infinity'::timestamptz) <= selected_job.snapshot_at
    and (
      selected_job.cursor_created_at is null
      or (coalesce(product.created_at, '-infinity'::timestamptz), product.id)
        > (selected_job.cursor_created_at, selected_job.cursor_product_id)
    )
  order by coalesce(product.created_at, '-infinity'::timestamptz), product.id
  limit 1
  for update of product;

  if selected_product.id is null then return null; end if;

  select item.id, item.job_id into competing_item_id, competing_job_id
  from public.catalog_product_audit_items item
  where item.product_id = selected_product.id
    and item.status in ('processing', 'ready')
  order by item.created_at, item.id
  limit 1;

  if competing_item_id is not null then
    if competing_job_id = requested_job_id then
      raise exception 'Audit cursor attempted to claim the same live product twice';
    end if;

    insert into public.catalog_product_audit_items (
      job_id,
      product_id,
      status,
      review_visible,
      processed_at,
      error_message
    ) values (
      selected_job.id,
      selected_product.id,
      'skipped',
      false,
      now(),
      'Product is already being audited by another job'
    )
    on conflict (job_id, product_id) do nothing
    returning * into selected_item;

    update public.catalog_product_audit_jobs
    set cursor_created_at = coalesce(selected_product.created_at, '-infinity'::timestamptz),
        cursor_product_id = selected_product.id,
        heartbeat_at = now()
    where id = selected_job.id;

    if selected_item.id is not null then
      perform public.adjust_catalog_product_audit_job_counters_v1(
        requested_job_id, null, 'skipped', 1
      );
      return to_jsonb(selected_item);
    end if;
    return jsonb_build_object(
      'id', competing_item_id,
      'job_id', requested_job_id,
      'product_id', selected_product.id,
      'status', 'skipped'
    );
  end if;

  insert into public.catalog_product_audit_items (job_id, product_id)
  values (selected_job.id, selected_product.id)
  on conflict do nothing
  returning * into selected_item;

  update public.catalog_product_audit_jobs
  set cursor_created_at = coalesce(selected_product.created_at, '-infinity'::timestamptz),
      cursor_product_id = selected_product.id,
      heartbeat_at = now()
  where id = selected_job.id;

  if selected_item.id is null then
    -- A database constraint won an unexpected race. Never return a processing
    -- item owned elsewhere, because that could spend a second model request.
    return jsonb_build_object(
      'id', gen_random_uuid(),
      'job_id', requested_job_id,
      'product_id', selected_product.id,
      'status', 'skipped'
    );
  end if;

  return to_jsonb(selected_item);
end;
$$;

create or replace function public.begin_catalog_product_audit_attempt_v1(
  requested_agent_id uuid,
  requested_job_id uuid,
  requested_item_id uuid,
  requested_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  audit_item public.catalog_product_audit_items%rowtype;
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  requested_product_id uuid;
  attempted_product_updated_at timestamptz;
  sealed_snapshot jsonb;
begin
  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id;
  if requested_product_id is null then raise exception 'Catalog audit item not found'; end if;

  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and job.status = 'running'
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then raise exception 'Catalog audit job is not available'; end if;

  select product.* into product_record
  from public.products product
  where product.id = requested_product_id
  for update;
  if product_record.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  select * into audit_item
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id
    and item.product_id = product_record.id
  for update;
  if audit_item.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  if product_record.catalog_audit_attempted_item_id = audit_item.id
    and product_record.catalog_audit_attempted_at is not null then
    return jsonb_build_object(
      'status', audit_item.status,
      'product_id', product_record.id,
      'current_snapshot', audit_item.current_snapshot,
      'sealed', true,
      'idempotent', true
    );
  end if;

  if product_record.catalog_audit_attempted_at is not null then
    if audit_item.status = 'processing' then
      update public.catalog_product_audit_items
      set status = 'skipped',
          review_visible = false,
          processed_at = now(),
          error_message = 'Product already has a different canonical catalog audit attempt'
      where id = audit_item.id;
      perform public.adjust_catalog_product_audit_job_counters_v1(
        requested_job_id, 'processing', 'skipped', 1
      );
    end if;
    return jsonb_build_object('status', 'skipped', 'product_id', product_record.id, 'idempotent', true);
  end if;

  if audit_item.status <> 'processing' then
    return jsonb_build_object(
      'status', audit_item.status,
      'product_id', product_record.id,
      'idempotent', true
    );
  end if;

  if requested_snapshot is null
    or jsonb_typeof(requested_snapshot) <> 'object'
    or coalesce(requested_snapshot->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or nullif(requested_snapshot->>'product_updated_at', '') is null
    or nullif(requested_snapshot->>'variant_updated_at', '') is null
    or jsonb_typeof(requested_snapshot->'gallery_images') <> 'array' then
    raise exception 'Catalog audit snapshot is invalid';
  end if;

  select variant.* into variant_record
  from public.product_variants variant
  where variant.id = (requested_snapshot->>'variant_id')::uuid
    and variant.product_id = product_record.id
    and variant.is_active = true
  for update;

  if variant_record.id is null
    or product_record.updated_at is distinct from (requested_snapshot->>'product_updated_at')::timestamptz
    or variant_record.updated_at is distinct from (requested_snapshot->>'variant_updated_at')::timestamptz then
    update public.catalog_product_audit_items
    set status = 'skipped',
        review_visible = false,
        processed_at = now(),
        error_message = 'Product or active variant changed while preparing its catalog audit'
    where id = audit_item.id;
    perform public.adjust_catalog_product_audit_job_counters_v1(
      requested_job_id, 'processing', 'skipped', 1
    );
    return jsonb_build_object('status', 'skipped', 'product_id', product_record.id, 'idempotent', false);
  end if;

  update public.products
  set catalog_audit_attempted_at = now(),
      catalog_audit_attempted_item_id = audit_item.id
  where id = product_record.id
    and catalog_audit_attempted_at is null
  returning updated_at into attempted_product_updated_at;
  if attempted_product_updated_at is null then
    raise exception 'Catalog audit attempt changed concurrently; retry claim preparation';
  end if;

  sealed_snapshot := jsonb_set(
    requested_snapshot,
    '{product_updated_at}',
    to_jsonb(attempted_product_updated_at),
    true
  );
  update public.catalog_product_audit_items
  set current_snapshot = sealed_snapshot,
      error_message = null
  where id = audit_item.id
    and status = 'processing';

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    selected_job.created_by,
    'catalog_product_audit_attempted',
    'product',
    product_record.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'audit_job_id', requested_job_id,
      'audit_item_id', audit_item.id,
      'at_most_once', true
    )
  );

  return jsonb_build_object(
    'status', 'processing',
    'product_id', product_record.id,
    'current_snapshot', sealed_snapshot,
    'sealed', true,
    'idempotent', false
  );
end;
$$;

create or replace function public.finalize_catalog_product_audit_item_v1(
  requested_agent_id uuid,
  requested_job_id uuid,
  requested_item_id uuid,
  requested_terminal_status text,
  requested_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  audit_item public.catalog_product_audit_items%rowtype;
  product_record public.products%rowtype;
  requested_product_id uuid;
begin
  if requested_terminal_status not in ('skipped', 'failed') then
    raise exception 'Catalog audit terminal status is invalid';
  end if;

  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then raise exception 'Catalog audit job is not available to this agent'; end if;

  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id;
  if requested_product_id is null then
    return jsonb_build_object('status', 'gone', 'product_id', null, 'idempotent', true);
  end if;

  select product.* into product_record
  from public.products product
  where product.id = requested_product_id
  for update;
  if product_record.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  select * into audit_item
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id
    and item.product_id = product_record.id
  for update;
  if audit_item.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  if audit_item.status in ('ready', 'applied', 'rejected', 'skipped')
    or (audit_item.status = 'failed' and requested_terminal_status = 'failed') then
    return jsonb_build_object(
      'status', audit_item.status,
      'product_id', product_record.id,
      'idempotent', true
    );
  end if;
  if audit_item.status <> 'processing' then
    raise exception 'Catalog audit item cannot transition to the requested terminal status';
  end if;

  if requested_terminal_status = 'skipped' then
    if selected_job.status <> 'running' then raise exception 'Catalog audit job is not running'; end if;
    if product_record.catalog_audit_attempted_item_id = audit_item.id then
      return jsonb_build_object(
        'status', 'processing',
        'product_id', product_record.id,
        'sealed', true,
        'idempotent', true
      );
    end if;
  else
    if product_record.catalog_audit_attempted_item_id is distinct from audit_item.id
      or product_record.catalog_audit_attempted_at is null then
      raise exception 'Only the canonical attempted audit item can record a model failure';
    end if;
  end if;

  update public.catalog_product_audit_items
  set status = requested_terminal_status,
      review_visible = requested_terminal_status = 'failed',
      processed_at = now(),
      error_message = left(coalesce(nullif(trim(requested_error_message), ''), 'Catalog audit did not complete'), 500)
  where id = audit_item.id
    and status = 'processing';

  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', requested_terminal_status, 1
  );
  return jsonb_build_object(
    'status', requested_terminal_status,
    'product_id', product_record.id,
    'idempotent', false
  );
end;
$$;

-- The admin cancellation action can call this RPC to close preparation rows
-- without clearing permanent attempt ownership. Late paid results for sealed
-- rows remain valid because the result recorder does not require a running job.
create or replace function public.cancel_catalog_product_audit_job_v1(
  actor_profile_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  unsealed_count integer := 0;
  sealed_count integer := 0;
  transitioned boolean := false;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  where job.id = requested_job_id
  for update;
  if selected_job.id is null then raise exception 'Catalog audit job not found'; end if;

  update public.catalog_product_audit_items item
  set status = 'skipped',
      review_visible = false,
      processed_at = now(),
      error_message = 'Catalog audit job was cancelled before the model attempt was sealed'
  where item.job_id = requested_job_id
    and item.status = 'processing'
    and not exists (
      select 1
      from public.products product
      where product.id = item.product_id
        and product.catalog_audit_attempted_item_id = item.id
    );
  get diagnostics unsealed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'skipped', unsealed_count
  );

  update public.catalog_product_audit_items item
  set status = 'failed',
      review_visible = true,
      processed_at = now(),
      error_message = 'Catalog audit job was cancelled after the model attempt was sealed; a late result will still be accepted'
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id = product.catalog_audit_attempted_item_id
    and item.status = 'processing';
  get diagnostics sealed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'failed', sealed_count
  );

  if selected_job.status in ('queued', 'running') then
    update public.catalog_product_audit_jobs
    set status = 'cancelled',
        completed_at = now(),
        heartbeat_at = case when selected_job.status = 'running' then now() else heartbeat_at end
    where id = requested_job_id;
    transitioned := true;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_profile_id,
      'catalog_product_audit_job_cancelled',
      'catalog_product_audit_job',
      requested_job_id::text,
      jsonb_build_object(
        'unsealed_items_skipped', unsealed_count,
        'sealed_items_failed', sealed_count,
        'late_results_remain_accepted', true
      )
    );
  end if;

  return jsonb_build_object(
    'status', case when transitioned then 'cancelled' else selected_job.status end,
    'idempotent', not transitioned,
    'unsealed_items_skipped', unsealed_count,
    'sealed_items_failed', sealed_count
  );
end;
$$;

-- Atomically close an audit job under the same job lock used by claim, begin,
-- and result delivery. Any preparation row that never crossed the paid-model
-- boundary is skipped; a sealed row becomes visible failed but retains its
-- canonical ownership so a late paid result can still upgrade it to ready.
create or replace function public.complete_catalog_product_audit_job_v1(
  requested_agent_id uuid,
  requested_job_id uuid,
  requested_status text,
  requested_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  counters jsonb;
  unsealed_count integer := 0;
  sealed_count integer := 0;
  normalized_error text;
begin
  if requested_status not in ('completed', 'failed') then
    raise exception 'Catalog audit completion status is invalid';
  end if;
  normalized_error := case
    when requested_status = 'failed' then left(
      coalesce(nullif(trim(requested_error_message), ''), 'Worker reported a failure'),
      500
    )
    else null
  end;

  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then
    raise exception 'Catalog audit job is not available to this agent';
  end if;
  if selected_job.status = 'queued' then
    raise exception 'Catalog audit job has not started';
  end if;

  -- Cancellation already terminalizes its items. Return its winning status if
  -- it raced this delivery instead of overwriting that administrative action.
  if selected_job.status = 'cancelled' then
    counters := public.refresh_catalog_product_audit_job_counters(requested_job_id);
    return jsonb_build_object(
      'status', 'cancelled',
      'counters', counters,
      'idempotent', true,
      'unsealed_items_skipped', 0,
      'sealed_items_failed', 0
    );
  end if;

  update public.catalog_product_audit_items item
  set status = 'skipped',
      review_visible = false,
      processed_at = now(),
      error_message = case
        when requested_status = 'failed'
          then 'Catalog audit job failed before this model attempt was sealed'
        else 'Catalog audit job completed before this model attempt was sealed'
      end
  where item.job_id = requested_job_id
    and item.status = 'processing'
    and not exists (
      select 1
      from public.products product
      where product.id = item.product_id
        and product.catalog_audit_attempted_item_id = item.id
    );
  get diagnostics unsealed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'skipped', unsealed_count
  );

  update public.catalog_product_audit_items item
  set status = 'failed',
      review_visible = true,
      processed_at = now(),
      error_message = case
        when requested_status = 'failed'
          then 'Catalog audit job failed after the model attempt was sealed; a late result will still be accepted'
        else 'Catalog audit job completed before the sealed result arrived; a late result will still be accepted'
      end
  from public.products product
  where item.job_id = requested_job_id
    and item.product_id = product.id
    and item.id = product.catalog_audit_attempted_item_id
    and item.status = 'processing';
  get diagnostics sealed_count = row_count;
  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, 'processing', 'failed', sealed_count
  );

  -- Completion is the deliberate O(N) reconciliation boundary. It runs while
  -- the job row is locked, so no claim/result delta can be lost underneath it.
  counters := public.refresh_catalog_product_audit_job_counters(requested_job_id);

  if selected_job.status in ('completed', 'failed') then
    return jsonb_build_object(
      'status', selected_job.status,
      'counters', counters,
      'idempotent', true,
      'unsealed_items_skipped', unsealed_count,
      'sealed_items_failed', sealed_count
    );
  end if;
  if selected_job.status <> 'running' then
    raise exception 'Catalog audit job cannot be completed from its current status';
  end if;

  update public.catalog_product_audit_jobs
  set status = requested_status,
      total_count = case
        when requested_status = 'completed'
          then least(total_count, coalesce((counters->>'processed_count')::integer, processed_count))
        else total_count
      end,
      error_message = normalized_error,
      completed_at = now(),
      heartbeat_at = now()
  where id = requested_job_id
    and status = 'running';
  if not found then
    raise exception 'Catalog audit job status changed concurrently';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    selected_job.created_by,
    case
      when requested_status = 'completed' then 'catalog_product_audit_job_completed'
      else 'catalog_product_audit_job_failed'
    end,
    'catalog_product_audit_job',
    requested_job_id::text,
    jsonb_build_object(
      'catalog_agent_id', requested_agent_id,
      'counters', counters,
      'error', normalized_error,
      'unsealed_items_skipped', unsealed_count,
      'sealed_items_failed', sealed_count,
      'late_results_remain_accepted', true
    )
  );

  return jsonb_build_object(
    'status', requested_status,
    'counters', counters,
    'idempotent', false,
    'unsealed_items_skipped', unsealed_count,
    'sealed_items_failed', sealed_count
  );
end;
$$;

create or replace function public.record_catalog_product_audit_result_v1(
  requested_agent_id uuid,
  requested_job_id uuid,
  requested_item_id uuid,
  requested_suggestion jsonb,
  requested_confidence numeric,
  requested_warnings text[],
  requested_model_name text,
  requested_provider_response_id text,
  requested_processing_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_job public.catalog_product_audit_jobs%rowtype;
  audit_item public.catalog_product_audit_items%rowtype;
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  requested_product_id uuid;
  completed_product_updated_at timestamptz;
  previous_item_status text;
  dimension_x numeric;
  dimension_y numeric;
  dimension_z numeric;
begin
  -- Lock order is job -> product -> item, matching claim/application.
  select job.* into selected_job
  from public.catalog_product_audit_jobs job
  join public.catalog_agents agent on agent.id = job.agent_id
  where job.id = requested_job_id
    and job.agent_id = requested_agent_id
    and agent.is_active = true
    and 'audits:process' = any(agent.scopes)
  for update of job;
  if selected_job.id is null then raise exception 'Catalog audit job is not available to this agent'; end if;

  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id;
  if requested_product_id is null then
    return jsonb_build_object('status', 'gone', 'product_id', null, 'idempotent', true);
  end if;

  select product.* into product_record
  from public.products product
  where product.id = requested_product_id
  for update;
  if product_record.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  select * into audit_item
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.job_id = requested_job_id
    and item.product_id = product_record.id
  for update;
  if audit_item.id is null then
    return jsonb_build_object('status', 'gone', 'product_id', requested_product_id, 'idempotent', true);
  end if;

  previous_item_status := audit_item.status;

  -- A replay after the job has completed must be harmless and successful.
  if audit_item.status in ('ready', 'applied', 'rejected', 'failed')
    and product_record.catalog_audit_completed_item_id = audit_item.id then
    return jsonb_build_object(
      'status', audit_item.status,
      'product_id', product_record.id,
      'idempotent', true
    );
  end if;

  if product_record.catalog_audit_attempted_at is not null
    and product_record.catalog_audit_attempted_item_id is distinct from audit_item.id then
    if audit_item.status in ('processing', 'ready', 'failed') then
      update public.catalog_product_audit_items
      set status = 'skipped',
          review_visible = false,
          processed_at = coalesce(processed_at, now()),
          error_message = 'Product already has a different canonical catalog audit attempt'
      where id = audit_item.id;
      perform public.adjust_catalog_product_audit_job_counters_v1(
        requested_job_id, previous_item_status, 'skipped', 1
      );
    end if;
    return jsonb_build_object(
      'status', 'skipped',
      'product_id', product_record.id,
      'idempotent', true
    );
  end if;

  if audit_item.status not in ('processing', 'failed') then
    raise exception 'Only a processing or failed catalog audit item can record a result';
  end if;
  -- Attempt ownership, not mutable job status, authorizes a paid result. This
  -- accepts a valid late delivery after cancellation/failure/completion without
  -- ever opening a second model attempt.
  if product_record.catalog_audit_attempted_at is null
    or product_record.catalog_audit_attempted_item_id is distinct from audit_item.id then
    raise exception 'Only the canonical attempted audit item can record a result';
  end if;

  -- If the database commit succeeded but the HTTP response was lost, replaying
  -- the same retained stale analysis must not add another log or mutate counts.
  if audit_item.status = 'failed'
    and audit_item.suggestion = requested_suggestion
    and audit_item.provider_response_id is not distinct from left(nullif(trim(requested_provider_response_id), ''), 300)
    and audit_item.model_name is not distinct from left(nullif(trim(requested_model_name), ''), 200)
    and audit_item.processed_at is not null then
    return jsonb_build_object(
      'status', 'failed',
      'product_id', product_record.id,
      'idempotent', true,
      'stale', true
    );
  end if;

  if requested_suggestion is null or jsonb_typeof(requested_suggestion) <> 'object' then
    raise exception 'Catalog audit suggestion must be an object';
  end if;
  if char_length(trim(coalesce(requested_suggestion->>'name_ka', ''))) not between 2 and 160
    or char_length(trim(coalesce(requested_suggestion->>'name_en', ''))) not between 2 and 160 then
    raise exception 'Catalog audit names are invalid';
  end if;
  if char_length(trim(coalesce(requested_suggestion->>'description_ka', ''))) not between 10 and 800
    or char_length(trim(coalesce(requested_suggestion->>'description_en', ''))) not between 10 and 800 then
    raise exception 'Catalog audit descriptions are invalid';
  end if;
  if jsonb_typeof(requested_suggestion->'dimensions_mm') <> 'object'
    or not (requested_suggestion->'dimensions_mm' ? 'x')
    or not (requested_suggestion->'dimensions_mm' ? 'y')
    or not (requested_suggestion->'dimensions_mm' ? 'z')
    or jsonb_typeof(requested_suggestion#>'{dimensions_mm,x}') <> 'number'
    or jsonb_typeof(requested_suggestion#>'{dimensions_mm,y}') <> 'number'
    or jsonb_typeof(requested_suggestion#>'{dimensions_mm,z}') <> 'number' then
    raise exception 'Catalog audit dimensions are invalid';
  end if;
  dimension_x := (requested_suggestion#>>'{dimensions_mm,x}')::numeric;
  dimension_y := (requested_suggestion#>>'{dimensions_mm,y}')::numeric;
  dimension_z := (requested_suggestion#>>'{dimensions_mm,z}')::numeric;
  if dimension_x is null or dimension_x not between 1 and 5000
    or dimension_y is null or dimension_y not between 1 and 5000
    or dimension_z is null or dimension_z not between 1 and 5000 then
    raise exception 'Catalog audit dimensions are invalid';
  end if;
  if jsonb_typeof(requested_suggestion->'kept_image_urls') <> 'array'
    or jsonb_array_length(requested_suggestion->'kept_image_urls') not between 1 and 12
    or nullif(trim(requested_suggestion->>'hero_image_url'), '') is null
    or not exists (
      select 1
      from jsonb_array_elements_text(requested_suggestion->'kept_image_urls') kept(media_url)
      where kept.media_url = requested_suggestion->>'hero_image_url'
    ) then
    raise exception 'Catalog audit media selection is invalid';
  end if;
  if requested_confidence is null or requested_confidence not between 0 and 1 then
    raise exception 'Catalog audit confidence is invalid';
  end if;
  if cardinality(coalesce(requested_warnings, '{}'::text[])) > 20 then
    raise exception 'Catalog audit warnings are invalid';
  end if;
  if requested_processing_ms is not null and requested_processing_ms < 0 then
    raise exception 'Catalog audit processing time is invalid';
  end if;

  -- Validate the exact claimed product/variant versions before replacing the
  -- snapshot timestamp with our own completion-marker write. A paid result is
  -- retained for diagnosis, but never marked canonical when its source changed.
  select variant.* into variant_record
  from public.product_variants variant
  where variant.id = nullif(audit_item.current_snapshot->>'variant_id', '')::uuid
    and variant.product_id = audit_item.product_id
  for update;

  if variant_record.id is null
    or product_record.updated_at is distinct from nullif(audit_item.current_snapshot->>'product_updated_at', '')::timestamptz
    or variant_record.updated_at is distinct from nullif(audit_item.current_snapshot->>'variant_updated_at', '')::timestamptz then
    update public.catalog_product_audit_items
    set status = 'failed',
        review_visible = true,
        suggestion = requested_suggestion,
        confidence = requested_confidence,
        warnings = coalesce(requested_warnings, '{}'::text[]),
        model_name = left(nullif(trim(requested_model_name), ''), 200),
        provider_response_id = left(nullif(trim(requested_provider_response_id), ''), 300),
        processing_ms = requested_processing_ms,
        processed_at = now(),
        error_message = 'Product or active variant changed during audit; result was retained but not marked complete'
    where id = audit_item.id;

    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      selected_job.created_by,
      'catalog_product_audit_result_stale',
      'product',
      product_record.id::text,
      jsonb_build_object(
        'agent_id', requested_agent_id,
        'audit_job_id', requested_job_id,
        'audit_item_id', audit_item.id,
        'model_name', left(nullif(trim(requested_model_name), ''), 200),
        'provider_response_id', left(nullif(trim(requested_provider_response_id), ''), 300),
        'snapshot_product_updated_at', audit_item.current_snapshot->>'product_updated_at',
        'current_product_updated_at', product_record.updated_at,
        'snapshot_variant_updated_at', audit_item.current_snapshot->>'variant_updated_at',
        'current_variant_updated_at', variant_record.updated_at
      )
    );

    perform public.adjust_catalog_product_audit_job_counters_v1(
      requested_job_id, previous_item_status, 'failed', 1
    );
    return jsonb_build_object(
      'status', 'failed',
      'product_id', product_record.id,
      'idempotent', false,
      'stale', true
    );
  end if;

  update public.products
  set catalog_audit_completed_at = now(),
      catalog_audit_completed_item_id = audit_item.id
  where id = product_record.id
    and catalog_audit_attempted_item_id = audit_item.id
    and catalog_audit_completed_at is null
  returning updated_at into completed_product_updated_at;
  if completed_product_updated_at is null then
    raise exception 'Catalog audit completion changed concurrently; retry result submission';
  end if;

  update public.catalog_product_audit_items
  set status = 'ready',
      current_snapshot = jsonb_set(
        coalesce(current_snapshot, '{}'::jsonb),
        '{product_updated_at}',
        to_jsonb(completed_product_updated_at),
        true
      ),
      suggestion = requested_suggestion,
      confidence = requested_confidence,
      warnings = coalesce(requested_warnings, '{}'::text[]),
      model_name = left(nullif(trim(requested_model_name), ''), 200),
      provider_response_id = left(nullif(trim(requested_provider_response_id), ''), 300),
      processing_ms = requested_processing_ms,
      processed_at = now(),
      error_message = null,
      review_visible = true
  where id = audit_item.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    selected_job.created_by,
    'catalog_product_audit_completed',
    'product',
    product_record.id::text,
    jsonb_build_object(
      'agent_id', requested_agent_id,
      'audit_job_id', requested_job_id,
      'audit_item_id', audit_item.id,
      'model_name', left(nullif(trim(requested_model_name), ''), 200),
      'provider_response_id', left(nullif(trim(requested_provider_response_id), ''), 300),
      'confidence', requested_confidence,
      'applied', false
    )
  );

  perform public.adjust_catalog_product_audit_job_counters_v1(
    requested_job_id, previous_item_status, 'ready', 1
  );
  return jsonb_build_object(
    'status', 'ready',
    'product_id', product_record.id,
    'idempotent', false
  );
end;
$$;

create or replace function public.apply_catalog_product_audit_item_v3(
  actor_profile_id uuid,
  requested_item_id uuid,
  requested_kept_image_urls text[],
  requested_name_ka text,
  requested_name_en text,
  requested_description_ka text,
  requested_description_en text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_item public.catalog_product_audit_items%rowtype;
  product_record public.products%rowtype;
  requested_product_id uuid;
  locked_job_ids uuid[];
  effective_name_ka text := trim(requested_name_ka);
  effective_name_en text := trim(requested_name_en);
  effective_description_ka text := trim(requested_description_ka);
  effective_description_en text := trim(requested_description_en);
  application_result jsonb;
  effective_review_overrides jsonb;
  applied_log_id bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'Active catalog management access is required'; end if;

  if effective_name_ka is null
    or effective_name_en is null
    or char_length(effective_name_ka) not between 2 and 160
    or char_length(effective_name_en) not between 2 and 160 then
    raise exception 'Product names must contain between 2 and 160 characters';
  end if;
  if effective_description_ka is null
    or effective_description_en is null
    or char_length(effective_description_ka) not between 10 and 800
    or char_length(effective_description_en) not between 10 and 800 then
    raise exception 'Product descriptions must contain between 10 and 800 characters';
  end if;

  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id;
  if requested_product_id is null then raise exception 'Catalog audit item not found'; end if;

  select coalesce(array_agg(distinct item.job_id order by item.job_id), '{}'::uuid[])
  into locked_job_ids
  from public.catalog_product_audit_items item
  where item.product_id = requested_product_id;

  -- Acquire the same locks as v2 before checking canonical ownership. Calling
  -- v2 below is re-entrant for locks already held by this transaction.
  perform 1
  from public.catalog_product_audit_jobs job
  where job.id = any(locked_job_ids)
  order by job.id
  for update;

  select product.* into product_record
  from public.products product
  where product.id = requested_product_id
  for update;
  if product_record.id is null then raise exception 'Catalog audit product not found'; end if;

  select * into audit_item
  from public.catalog_product_audit_items item
  where item.id = requested_item_id
    and item.product_id = product_record.id
  for update;
  if audit_item.id is null then raise exception 'Catalog audit item not found'; end if;

  if audit_item.status = 'applied'
    and product_record.catalog_audit_applied_item_id = audit_item.id then
    return jsonb_build_object(
      'product_id', product_record.id,
      'already_applied', true,
      'name_ka', product_record.name_ka,
      'name_en', product_record.hooma_name
    );
  end if;
  if audit_item.status <> 'ready' then raise exception 'Only ready audit items can be applied'; end if;
  if product_record.catalog_audit_completed_at is null
    or product_record.catalog_audit_completed_item_id is distinct from audit_item.id then
    raise exception 'Only the canonical completed audit result can be applied';
  end if;

  application_result := public.apply_catalog_product_audit_item_v2(
    actor_profile_id,
    requested_item_id,
    requested_kept_image_urls
  );

  if coalesce((application_result->>'already_applied')::boolean, false) then
    return application_result;
  end if;

  update public.products
  set name_ka = effective_name_ka,
      hooma_name = effective_name_en,
      short_description_ka = effective_description_ka,
      long_description_ka = effective_description_ka,
      short_description = effective_description_en,
      long_description = effective_description_en
  where id = product_record.id;

  update public.catalog_product_audit_items
  set review_overrides = coalesce(review_overrides, '{}'::jsonb) || jsonb_build_object(
        'manual_copy_override', true,
        'name_ka', effective_name_ka,
        'name_en', effective_name_en,
        'description_ka', effective_description_ka,
        'description_en', effective_description_en
      )
  where id = audit_item.id
  returning review_overrides into effective_review_overrides;

  select log.id into applied_log_id
  from public.audit_log log
  where log.action = 'catalog_product_audit_applied'
    and log.entity_type = 'product'
    and log.entity_id = product_record.id::text
    and log.metadata->>'audit_item_id' = audit_item.id::text
  order by log.id desc
  limit 1
  for update;

  if applied_log_id is not null then
    update public.audit_log
    set metadata = metadata || jsonb_build_object(
      'review_overrides', effective_review_overrides
    )
    where id = applied_log_id;
  end if;

  return application_result || jsonb_build_object(
    'name_ka', effective_name_ka,
    'name_en', effective_name_en,
    'description_ka', effective_description_ka,
    'description_en', effective_description_en
  );
end;
$$;

do $$
declare
  affected_job_id uuid;
begin
  for affected_job_id in
    select job.id
    from public.catalog_product_audit_jobs job
    order by job.id
  loop
    perform public.refresh_catalog_product_audit_job_counters(affected_job_id);
  end loop;
end;
$$;

revoke all on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.claim_catalog_product_audit_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_catalog_product_audit_attempt_v1(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_catalog_product_audit_item_v1(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_catalog_product_audit_job_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_catalog_product_audit_job_v1(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_catalog_product_audit_result_v1(uuid, uuid, uuid, jsonb, numeric, text[], text, text, integer) from public, anon, authenticated;
revoke all on function public.apply_catalog_product_audit_item_v3(uuid, uuid, text[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.adjust_catalog_product_audit_job_counters_v1(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.refresh_catalog_product_audit_job_counters(uuid) from public, anon, authenticated;
revoke all on function public.protect_legacy_catalog_audit_ready_transition() from public, anon, authenticated;
revoke all on function public.protect_catalog_audit_product_markers_v1() from public, anon, authenticated;
grant execute on function public.create_catalog_product_audit_job_v1(uuid, uuid, text[]) to service_role;
grant execute on function public.claim_catalog_product_audit_item(uuid, uuid) to service_role;
grant execute on function public.begin_catalog_product_audit_attempt_v1(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.finalize_catalog_product_audit_item_v1(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.cancel_catalog_product_audit_job_v1(uuid, uuid) to service_role;
grant execute on function public.complete_catalog_product_audit_job_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.record_catalog_product_audit_result_v1(uuid, uuid, uuid, jsonb, numeric, text[], text, text, integer) to service_role;
grant execute on function public.apply_catalog_product_audit_item_v3(uuid, uuid, text[], text, text, text, text) to service_role;
grant execute on function public.refresh_catalog_product_audit_job_counters(uuid) to service_role;
