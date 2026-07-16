-- Manual production operations for Hooma V1.
-- Hooma owns the order/workflow state; an operator uses Bambu Studio separately
-- and reports the physical printer state through narrowly scoped server RPCs.

begin;

alter table public.print_jobs add column if not exists unit_number integer not null default 1 check (unit_number > 0);
alter table public.print_jobs add column if not exists attempt_number integer not null default 1 check (attempt_number > 0);
alter table public.print_jobs add column if not exists retry_of_job_id uuid references public.print_jobs(id) on delete restrict;
alter table public.print_jobs add column if not exists assigned_operator_id uuid references public.profiles(id) on delete set null;
alter table public.print_jobs add column if not exists source_url text;
alter table public.print_jobs add column if not exists source_platform text;
alter table public.print_jobs add column if not exists product_name_snapshot text;
alter table public.print_jobs add column if not exists sku_snapshot text;
alter table public.print_jobs add column if not exists variant_snapshot text;
alter table public.print_jobs add column if not exists lock_version integer not null default 1 check (lock_version > 0);

alter table public.print_jobs drop constraint if exists print_jobs_order_item_id_plate_number_key;
alter table public.print_jobs drop constraint if exists print_jobs_order_item_unit_plate_attempt_key;
alter table public.print_jobs add constraint print_jobs_order_item_unit_plate_attempt_key
  unique (order_item_id, unit_number, plate_number, attempt_number);

do $$
declare
  duplicate_printer uuid;
begin
  select printer_id into duplicate_printer
  from public.print_jobs
  where printer_id is not null and status in ('queued', 'preparing', 'printing', 'paused')
  group by printer_id
  having count(*) > 1
  limit 1;
  if duplicate_printer is not null then
    raise exception 'ACTIVE_PRINTER_COLLISION: resolve active jobs for printer % before applying this migration', duplicate_printer;
  end if;
end;
$$;

create unique index if not exists idx_print_jobs_one_active_per_printer
  on public.print_jobs(printer_id)
  where printer_id is not null and status in ('queued', 'preparing', 'printing', 'paused');

create unique index if not exists idx_print_jobs_one_active_attempt_per_unit
  on public.print_jobs(order_item_id, unit_number, plate_number)
  where status in ('awaiting_approval', 'queued', 'preparing', 'printing', 'paused');

create index if not exists idx_print_jobs_order_item_status
  on public.print_jobs(order_item_id, status);

do $$
declare
  duplicate_name text;
begin
  select lower(name) into duplicate_name
  from public.printers
  where is_active is true
  group by lower(name)
  having count(*) > 1
  limit 1;
  if duplicate_name is not null then
    raise exception 'ACTIVE_PRINTER_NAME_COLLISION: rename duplicate printer % before applying this migration', duplicate_name;
  end if;
end;
$$;

create unique index if not exists idx_printers_active_name_unique
  on public.printers(lower(name))
  where is_active is true;

alter table public.order_events add column if not exists event_key text;
create unique index if not exists idx_order_events_event_key
  on public.order_events(event_key)
  where event_key is not null;

create table if not exists public.production_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid unique not null,
  operation_type text not null check (operation_type in (
    'confirm_order', 'assign_job', 'start_job', 'release_job', 'complete_job', 'approve_qc',
    'fail_job', 'courier_handoff', 'mark_delivered',
    'register_printer', 'set_printer_status'
  )),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  print_job_id uuid references public.print_jobs(id) on delete restrict,
  printer_id uuid references public.printers(id) on delete restrict,
  request_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.delivery_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  courier_name text not null,
  courier_reference text,
  handed_off_by uuid not null references public.profiles(id) on delete restrict,
  handed_off_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.production_operations enable row level security;
alter table public.delivery_handoffs enable row level security;

-- Production reads and every mutation are served by authenticated server
-- components/actions. Remove legacy whole-row browser mutation paths.
drop policy if exists "admins manage orders" on public.orders;
drop policy if exists "admins manage order items" on public.order_items;
drop policy if exists "admins manage printers" on public.printers;
drop policy if exists "admins manage print jobs" on public.print_jobs;
drop policy if exists "admins manage order events" on public.order_events;
drop policy if exists "admins manage payment attempts" on public.payment_attempts;
drop policy if exists "admins create audit log" on public.audit_log;
drop policy if exists "admins manage product sources" on public.product_sources;
drop policy if exists "customers create own orders" on public.orders;
drop policy if exists "customers create order items for own orders" on public.order_items;
drop policy if exists "production staff read printers" on public.printers;
drop policy if exists "production staff read sources" on public.product_sources;

create policy "admin staff read orders" on public.orders for select using (public.is_admin());
create policy "admin staff read order items" on public.order_items for select using (public.is_admin());
create policy "admin staff read printers" on public.printers for select using (public.is_admin());
create policy "admin staff read print jobs" on public.print_jobs for select using (public.is_admin());
create policy "admin staff read order events" on public.order_events for select using (public.is_admin());
create policy "admin staff read payment attempts" on public.payment_attempts for select using (public.is_admin());
create policy "admin staff read product sources" on public.product_sources for select using (public.is_admin());

revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.printers from anon, authenticated;
revoke all on public.print_jobs from anon, authenticated;
revoke all on public.order_events from anon, authenticated;
revoke all on public.payment_attempts from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.product_sources from anon, authenticated;

grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.print_jobs to authenticated;
grant select on public.order_events to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.product_sources to authenticated;

-- Even read-only authenticated access cannot select the server credential
-- reference. Server/service-role queries are unaffected.
revoke select on public.printers from anon, authenticated;
grant select (
  id, name, manufacturer, model, serial_number_masked, status, capabilities,
  last_seen_at, is_active, created_at, updated_at
) on public.printers to authenticated;

drop policy if exists "customers read own order events" on public.order_events;
create policy "customers read own visible order events" on public.order_events
  for select using (
    is_customer_visible = true
    and exists (
      select 1
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = order_id and c.profile_id = auth.uid()
    )
  );

create or replace function public.production_actor_can_manage(actor_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin', 'production_operator')
  for share;
  return found;
end;
$$;

create or replace function public.claim_production_operation(
  requested_key uuid,
  requested_type text,
  actor_profile_id uuid,
  requested_order_id uuid default null,
  requested_job_id uuid default null,
  requested_printer_id uuid default null,
  requested_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_rows integer;
  existing_operation public.production_operations%rowtype;
begin
  if requested_key is null then
    raise exception 'OPERATION_KEY_REQUIRED';
  end if;

  insert into public.production_operations (
    idempotency_key, operation_type, actor_id, order_id, print_job_id, printer_id, request_payload
  ) values (
    requested_key, requested_type, actor_profile_id,
    requested_order_id, requested_job_id, requested_printer_id, coalesce(requested_payload, '{}'::jsonb)
  ) on conflict (idempotency_key) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 1 then
    return true;
  end if;

  select * into existing_operation
  from public.production_operations
  where idempotency_key = requested_key;

  if existing_operation.operation_type is distinct from requested_type
    or existing_operation.actor_id is distinct from actor_profile_id
    or existing_operation.order_id is distinct from requested_order_id
    or existing_operation.print_job_id is distinct from requested_job_id
    or existing_operation.printer_id is distinct from requested_printer_id
    or existing_operation.request_payload is distinct from coalesce(requested_payload, '{}'::jsonb) then
    raise exception 'OPERATION_KEY_CONFLICT';
  end if;
  if existing_operation.completed_at is null then raise exception 'OPERATION_IN_PROGRESS'; end if;

  return false;
end;
$$;

create or replace function public.finish_production_operation(requested_key uuid, operation_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.production_operations
  set result = coalesce(operation_result, '{}'::jsonb), completed_at = now()
  where idempotency_key = requested_key;
  return coalesce(operation_result, '{}'::jsonb);
end;
$$;

create or replace function public.confirm_order_for_manual_production(
  requested_order_id uuid,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  item_count integer;
  created_jobs integer;
  total_jobs integer;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'confirm_order', actor_profile_id, requested_order_id, null, null, '{}'::jsonb
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into order_record
  from public.orders
  where id = requested_order_id
  for update;

  if order_record.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_record.fulfillment_status not in ('order_received', 'confirmed', 'production_queued') then
    raise exception 'ORDER_STATE_CONFLICT';
  end if;
  if order_record.test_mode is not true and (
    order_record.payment_status is distinct from 'paid'
    or not exists (
      select 1 from public.payment_attempts pa
      where pa.order_id = requested_order_id
        and pa.provider in ('tbc', 'bog')
        and pa.currency = 'GEL'
        and pa.status = 'paid'
        and pa.signature_verified is true
        and pa.amount = order_record.total
    )
  ) then
    raise exception 'PAYMENT_REQUIRED';
  end if;

  select count(*) into item_count
  from public.order_items
  where order_id = requested_order_id;
  if item_count = 0 then raise exception 'ORDER_HAS_NO_ITEMS'; end if;

  -- A live catalog order must still be approved and commercially usable when
  -- the operator accepts it. Custom jobs have no product_id and use their
  -- separately verified quote workflow.
  if order_record.test_mode is not true and exists (
    select 1
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = requested_order_id
      and oi.product_id is not null
      and (
        p.id is null
        or p.status is distinct from 'active'
        or p.production_status <> 'approved'
        or oi.variant_id is null
        or not exists (
          select 1 from public.product_variants pv_ready
          where pv_ready.id = oi.variant_id
            and pv_ready.product_id = oi.product_id
            and pv_ready.is_active is true
        )
        or not exists (
          select 1
          from public.product_sources ps
          where ps.product_id = oi.product_id
            and ps.platform = 'makerworld'
            and ps.license_status in ('verified', 'not_required')
            and ps.commercial_use_allowed is true
            and ps.source_url ~* '^https://([a-z0-9-]+\.)*makerworld\.com/'
        )
      )
  ) then
    raise exception 'PRODUCT_NOT_PRODUCTION_READY';
  end if;
  if order_record.test_mode is not true and exists (
    select 1
    from public.order_items oi
    where oi.order_id = requested_order_id and oi.product_id is null
  ) and not exists (
    select 1
    from public.custom_quote_requests quote
    where quote.order_id = requested_order_id
      and quote.files_verified is true
      and quote.paid_at is not null
      and quote.status in ('paid', 'production_queued', 'in_production', 'quality_check', 'ready_for_delivery')
  ) then
    raise exception 'PRODUCT_NOT_PRODUCTION_READY';
  end if;

  insert into public.print_jobs (
    order_item_id, status, unit_number, plate_number, attempt_number,
    print_profile_path, estimated_minutes, material, color,
    source_url, source_platform, product_name_snapshot, sku_snapshot,
    variant_snapshot, operator_notes
  )
  select
    oi.id,
    'awaiting_approval',
    units.unit_number,
    plates.plate_number,
    1,
    pv.print_profile_path,
    coalesce(pv.estimated_print_minutes, p.estimated_print_minutes),
    oi.material,
    oi.color,
    source.source_url,
    source.platform,
    oi.product_name,
    oi.sku,
    oi.size_label,
    case when source.source_url is null
      then 'Manual V1 job. Verify the custom/test production file before starting.'
      else 'Manual V1 job. Open the reviewed source in Bambu Studio before confirming the physical start.'
    end
  from public.order_items oi
  left join public.product_variants pv on pv.id = oi.variant_id
  left join public.products p on p.id = oi.product_id
  cross join lateral generate_series(1, greatest(coalesce(oi.quantity, 1), 1)) as units(unit_number)
  cross join lateral generate_series(1, greatest(coalesce(pv.plate_count, 1), 1)) as plates(plate_number)
  left join lateral (
    select ps.source_url, ps.platform
    from public.product_sources ps
    where ps.product_id = oi.product_id
      and ps.platform = 'makerworld'
      and ps.license_status in ('verified', 'not_required')
      and ps.commercial_use_allowed is true
      and ps.source_url ~* '^https://([a-z0-9-]+\.)*makerworld\.com/'
    order by ps.verified_at desc nulls last, ps.created_at desc
    limit 1
  ) source on true
  where oi.order_id = requested_order_id
  on conflict on constraint print_jobs_order_item_unit_plate_attempt_key do nothing;

  get diagnostics created_jobs = row_count;
  select count(*) into total_jobs
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where oi.order_id = requested_order_id and pj.attempt_number = 1;

  update public.orders
  set fulfillment_status = 'production_queued',
      status = case when payment_status = 'paid' then 'paid' else 'confirmed' end,
      updated_at = now()
  where id = requested_order_id;

  update public.custom_quote_requests
  set status = 'production_queued', updated_at = now()
  where order_id = requested_order_id and status = 'paid';

  insert into public.order_events (
    order_id, event_key, event_type, customer_label_en, customer_label_ka,
    details, is_customer_visible, created_by
  ) values (
    requested_order_id,
    'order:' || requested_order_id::text || ':production_started',
    'production_started',
    'Production started',
    'წარმოება დაწყებულია',
    '{}'::jsonb,
    true,
    actor_profile_id
  ) on conflict do nothing;

  if order_record.fulfillment_status <> 'production_queued' or created_jobs > 0 then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_profile_id,
      'manual_production_confirmed',
      'order',
      requested_order_id::text,
      jsonb_build_object(
        'previous_fulfillment_status', order_record.fulfillment_status,
        'created_jobs', created_jobs,
        'total_jobs', total_jobs,
        'test_mode', order_record.test_mode
      )
    );
  end if;

  result_payload := jsonb_build_object(
    'order_id', requested_order_id,
    'fulfillment_status', 'production_queued',
    'created_jobs', created_jobs,
    'total_jobs', total_jobs
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.assign_manual_print_job(
  requested_job_id uuid,
  requested_printer_id uuid,
  expected_lock_version integer,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_record public.orders%rowtype;
  job_record record;
  printer_record public.printers%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'assign_job', actor_profile_id, null, requested_job_id, requested_printer_id,
    jsonb_build_object('expected_lock_version', expected_lock_version)
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select oi.order_id into order_uuid
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id;
  if order_uuid is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;

  select * into order_record from public.orders where id = order_uuid for update;
  select
    pj.*,
    oi.product_id,
    oi.variant_id,
    oi.production_notes,
    oi.order_id
  into job_record
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id
  for update of pj;
  select * into printer_record from public.printers where id = requested_printer_id for update;

  if job_record.id is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  if printer_record.id is null or printer_record.is_active is not true then raise exception 'PRINTER_NOT_AVAILABLE'; end if;
  if expected_lock_version is null or job_record.lock_version is distinct from expected_lock_version then raise exception 'STALE_PRINT_JOB'; end if;
  if job_record.status <> 'awaiting_approval' or job_record.printer_id is not null then raise exception 'PRINT_JOB_STATE_CONFLICT'; end if;
  if printer_record.status <> 'idle' then raise exception 'PRINTER_BUSY'; end if;
  if order_record.fulfillment_status not in ('production_queued', 'in_production') then raise exception 'ORDER_STATE_CONFLICT'; end if;
  if order_record.test_mode is not true and (
    order_record.payment_status is distinct from 'paid'
    or not exists (
      select 1 from public.payment_attempts pa
      where pa.order_id = order_uuid
        and pa.provider in ('tbc', 'bog')
        and pa.currency = 'GEL'
        and pa.status = 'paid'
        and pa.signature_verified is true
        and pa.amount = order_record.total
    )
  ) then raise exception 'PAYMENT_REQUIRED'; end if;
  if order_record.test_mode is not true and job_record.product_id is not null and not exists (
    select 1
    from public.products p
    join public.product_variants pv on pv.id = job_record.variant_id
      and pv.product_id = p.id and pv.is_active is true
    join public.product_sources ps on ps.product_id = p.id
    where p.id = job_record.product_id
      and p.status = 'active'
      and p.production_status = 'approved'
      and ps.platform = 'makerworld'
      and ps.license_status in ('verified', 'not_required')
      and ps.commercial_use_allowed is true
      and ps.source_url = job_record.source_url
      and ps.source_url ~* '^https://([a-z0-9-]+\.)*makerworld\.com/'
  ) then
    raise exception 'SOURCE_NOT_VERIFIED';
  end if;
  if order_record.test_mode is not true and job_record.product_id is null and not exists (
    select 1 from public.custom_quote_requests quote
    where quote.order_id = order_uuid
      and quote.files_verified is true
      and quote.paid_at is not null
      and quote.status in ('paid', 'production_queued', 'in_production', 'quality_check', 'ready_for_delivery')
  ) then
    raise exception 'PRODUCT_NOT_PRODUCTION_READY';
  end if;

  update public.print_jobs
  set printer_id = requested_printer_id,
      assigned_operator_id = actor_profile_id,
      status = 'preparing',
      approved_by = actor_profile_id,
      approved_at = coalesce(approved_at, now()),
      lock_version = lock_version + 1,
      updated_at = now()
  where id = requested_job_id;

  update public.printers
  set status = 'busy', updated_at = now()
  where id = requested_printer_id;

  update public.orders
  set fulfillment_status = 'in_production', status = 'processing', updated_at = now()
  where id = order_uuid;

  update public.custom_quote_requests
  set status = 'in_production', updated_at = now()
  where order_id = order_uuid and status = 'production_queued';

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_print_assigned',
    'print_job',
    requested_job_id::text,
    jsonb_build_object(
      'order_id', order_uuid,
      'printer_id', requested_printer_id,
      'previous_lock_version', expected_lock_version,
      'unit_number', job_record.unit_number,
      'plate_number', job_record.plate_number
    )
  );

  result_payload := jsonb_build_object(
    'print_job_id', requested_job_id,
    'order_id', order_uuid,
    'printer_id', requested_printer_id,
    'status', 'preparing',
    'lock_version', expected_lock_version + 1
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.start_manual_print_job(
  requested_job_id uuid,
  expected_lock_version integer,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_record public.orders%rowtype;
  job_record record;
  printer_record public.printers%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'start_job', actor_profile_id, null, requested_job_id, null,
    jsonb_build_object('expected_lock_version', expected_lock_version)
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select oi.order_id into order_uuid
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id;
  if order_uuid is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;

  select * into order_record from public.orders where id = order_uuid for update;
  select pj.*, oi.product_id, oi.variant_id
  into job_record
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id
  for update of pj;
  if job_record.id is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  if job_record.printer_id is null then raise exception 'PRINTER_NOT_AVAILABLE'; end if;
  select * into printer_record from public.printers where id = job_record.printer_id for update;

  if expected_lock_version is null or job_record.lock_version is distinct from expected_lock_version then raise exception 'STALE_PRINT_JOB'; end if;
  if job_record.status <> 'preparing' then raise exception 'PRINT_JOB_STATE_CONFLICT'; end if;
  if printer_record.id is null or printer_record.is_active is not true or printer_record.status <> 'busy' then raise exception 'PRINTER_NOT_AVAILABLE'; end if;
  if order_record.fulfillment_status <> 'in_production' then raise exception 'ORDER_STATE_CONFLICT'; end if;
  if order_record.test_mode is not true and (
    order_record.payment_status is distinct from 'paid'
    or not exists (
      select 1 from public.payment_attempts pa
      where pa.order_id = order_uuid
        and pa.provider in ('tbc', 'bog')
        and pa.currency = 'GEL'
        and pa.status = 'paid'
        and pa.signature_verified is true
        and pa.amount = order_record.total
    )
  ) then raise exception 'PAYMENT_REQUIRED'; end if;
  if order_record.test_mode is not true and job_record.product_id is not null and not exists (
    select 1
    from public.products p
    join public.product_variants pv on pv.id = job_record.variant_id
      and pv.product_id = p.id and pv.is_active is true
    join public.product_sources ps on ps.product_id = p.id
    where p.id = job_record.product_id
      and p.status = 'active'
      and p.production_status = 'approved'
      and ps.platform = 'makerworld'
      and ps.license_status in ('verified', 'not_required')
      and ps.commercial_use_allowed is true
      and ps.source_url = job_record.source_url
      and ps.source_url ~* '^https://([a-z0-9-]+\.)*makerworld\.com/'
  ) then raise exception 'SOURCE_NOT_VERIFIED'; end if;
  if order_record.test_mode is not true and job_record.product_id is null and not exists (
    select 1 from public.custom_quote_requests quote
    where quote.order_id = order_uuid
      and quote.files_verified is true
      and quote.paid_at is not null
      and quote.status in ('paid', 'production_queued', 'in_production', 'quality_check', 'ready_for_delivery')
  ) then raise exception 'PRODUCT_NOT_PRODUCTION_READY'; end if;

  update public.print_jobs
  set status = 'printing',
      started_at = coalesce(started_at, now()),
      lock_version = lock_version + 1,
      updated_at = now()
  where id = requested_job_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_physical_print_started',
    'print_job',
    requested_job_id::text,
    jsonb_build_object(
      'order_id', order_uuid,
      'printer_id', job_record.printer_id,
      'assigned_operator_id', job_record.assigned_operator_id,
      'previous_lock_version', expected_lock_version
    )
  );

  result_payload := jsonb_build_object(
    'print_job_id', requested_job_id,
    'order_id', order_uuid,
    'printer_id', job_record.printer_id,
    'status', 'printing',
    'lock_version', expected_lock_version + 1
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.release_manual_print_assignment(
  requested_job_id uuid,
  expected_lock_version integer,
  requested_reason text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_record public.orders%rowtype;
  job_record public.print_jobs%rowtype;
  reason_value text;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then raise exception 'PRODUCTION_FORBIDDEN'; end if;
  reason_value := nullif(left(trim(coalesce(requested_reason, '')), 500), '');
  if reason_value is null then raise exception 'RELEASE_REASON_REQUIRED'; end if;

  if not public.claim_production_operation(
    operation_key, 'release_job', actor_profile_id, null, requested_job_id, null,
    jsonb_build_object('expected_lock_version', expected_lock_version, 'reason', reason_value)
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select oi.order_id into order_uuid
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id;
  if order_uuid is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;

  select * into order_record from public.orders where id = order_uuid for update;
  select * into job_record from public.print_jobs where id = requested_job_id for update;
  if job_record.id is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  if expected_lock_version is null or job_record.lock_version is distinct from expected_lock_version then raise exception 'STALE_PRINT_JOB'; end if;
  if job_record.status <> 'preparing' or job_record.printer_id is null then raise exception 'PRINT_JOB_STATE_CONFLICT'; end if;

  perform 1 from public.printers where id = job_record.printer_id for update;

  update public.print_jobs
  set status = 'awaiting_approval',
      printer_id = null,
      assigned_operator_id = null,
      approved_by = null,
      approved_at = null,
      operator_notes = concat_ws(E'\n', nullif(operator_notes, ''), 'Assignment released: ' || reason_value),
      lock_version = lock_version + 1,
      updated_at = now()
  where id = requested_job_id;

  update public.printers set status = 'idle', updated_at = now()
  where id = job_record.printer_id;

  if not exists (
    select 1
    from public.print_jobs pj
    join public.order_items oi on oi.id = pj.order_item_id
    where oi.order_id = order_uuid
      and pj.status in ('preparing', 'printing', 'paused', 'completed', 'quality_check', 'approved')
  ) then
    update public.orders
    set fulfillment_status = 'production_queued',
        status = case when payment_status = 'paid' then 'paid' else 'confirmed' end,
        updated_at = now()
    where id = order_uuid;
    update public.custom_quote_requests
    set status = 'production_queued', updated_at = now()
    where order_id = order_uuid and status = 'in_production';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_print_assignment_released',
    'print_job',
    requested_job_id::text,
    jsonb_build_object('order_id', order_uuid, 'printer_id', job_record.printer_id, 'reason', reason_value)
  );

  result_payload := jsonb_build_object(
    'print_job_id', requested_job_id,
    'order_id', order_uuid,
    'status', 'awaiting_approval',
    'lock_version', expected_lock_version + 1
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.complete_manual_print_job(
  requested_job_id uuid,
  expected_lock_version integer,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_record public.orders%rowtype;
  job_record public.print_jobs%rowtype;
  all_jobs_finished boolean;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'complete_job', actor_profile_id, null, requested_job_id, null,
    jsonb_build_object('expected_lock_version', expected_lock_version)
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select oi.order_id into order_uuid
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id;
  if order_uuid is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;

  select * into order_record from public.orders where id = order_uuid for update;
  select * into job_record from public.print_jobs where id = requested_job_id for update;

  if job_record.id is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  if order_record.fulfillment_status <> 'in_production' then raise exception 'ORDER_STATE_CONFLICT'; end if;
  if expected_lock_version is null or job_record.lock_version is distinct from expected_lock_version then raise exception 'STALE_PRINT_JOB'; end if;
  if job_record.status not in ('printing', 'paused') then raise exception 'PRINT_JOB_STATE_CONFLICT'; end if;

  update public.print_jobs
  set status = 'completed',
      completed_at = now(),
      actual_minutes = greatest(0, floor(extract(epoch from (now() - coalesce(started_at, now()))) / 60)::integer),
      lock_version = lock_version + 1,
      updated_at = now()
  where id = requested_job_id;

  if job_record.printer_id is not null then
    update public.printers
    set status = 'idle', updated_at = now()
    where id = job_record.printer_id
      and not exists (
        select 1 from public.print_jobs active_job
        where active_job.printer_id = job_record.printer_id
          and active_job.id <> requested_job_id
          and active_job.status in ('queued', 'preparing', 'printing', 'paused')
      );
  end if;

  select not exists (
    select 1
    from public.print_jobs pj
    join public.order_items oi on oi.id = pj.order_item_id
    where oi.order_id = order_uuid
      and not exists (
        select 1 from public.print_jobs newer_attempt
        where newer_attempt.order_item_id = pj.order_item_id
          and newer_attempt.unit_number = pj.unit_number
          and newer_attempt.plate_number = pj.plate_number
          and newer_attempt.attempt_number > pj.attempt_number
      )
      and pj.status not in ('completed', 'quality_check', 'approved')
  ) into all_jobs_finished;

  if all_jobs_finished then
    update public.print_jobs pj
    set status = 'quality_check', lock_version = lock_version + 1, updated_at = now()
    from public.order_items oi
    where pj.order_item_id = oi.id
      and oi.order_id = order_uuid
      and pj.status = 'completed';

    update public.orders
    set fulfillment_status = 'quality_check', status = 'processing', updated_at = now()
    where id = order_uuid;

    update public.custom_quote_requests
    set status = 'quality_check', updated_at = now()
    where order_id = order_uuid and status in ('production_queued', 'in_production');

    insert into public.order_events (
      order_id, event_key, event_type, customer_label_en, customer_label_ka,
      details, is_customer_visible, created_by
    ) values (
      order_uuid,
      'order:' || order_uuid::text || ':quality_check',
      'quality_check',
      'Quality check in progress',
      'ხარისხის შემოწმება მიმდინარეობს',
      '{}'::jsonb,
      true,
      actor_profile_id
    ) on conflict do nothing;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_print_completed',
    'print_job',
    requested_job_id::text,
    jsonb_build_object(
      'order_id', order_uuid,
      'printer_id', job_record.printer_id,
      'all_jobs_finished', all_jobs_finished,
      'previous_lock_version', expected_lock_version
    )
  );

  result_payload := jsonb_build_object(
    'print_job_id', requested_job_id,
    'order_id', order_uuid,
    'status', case when all_jobs_finished then 'quality_check' else 'completed' end,
    'order_quality_check', all_jobs_finished
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.fail_manual_print_job(
  requested_job_id uuid,
  expected_lock_version integer,
  requested_failure_reason text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_record public.orders%rowtype;
  job_record public.print_jobs%rowtype;
  retry_job_uuid uuid;
  failure_reason_value text;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  failure_reason_value := nullif(left(trim(coalesce(requested_failure_reason, '')), 500), '');
  if failure_reason_value is null then raise exception 'FAILURE_REASON_REQUIRED'; end if;

  if not public.claim_production_operation(
    operation_key, 'fail_job', actor_profile_id, null, requested_job_id, null,
    jsonb_build_object(
      'expected_lock_version', expected_lock_version,
      'failure_reason', failure_reason_value
    )
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select oi.order_id into order_uuid
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where pj.id = requested_job_id;
  if order_uuid is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;

  select * into order_record from public.orders where id = order_uuid for update;
  select * into job_record from public.print_jobs where id = requested_job_id for update;
  if job_record.id is null then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
  if order_record.fulfillment_status <> 'in_production' then raise exception 'ORDER_STATE_CONFLICT'; end if;
  if expected_lock_version is null or job_record.lock_version is distinct from expected_lock_version then raise exception 'STALE_PRINT_JOB'; end if;
  if job_record.status not in ('printing', 'paused') then raise exception 'PRINT_JOB_STATE_CONFLICT'; end if;

  update public.print_jobs
  set status = 'failed',
      completed_at = now(),
      operator_notes = concat_ws(E'\n', nullif(operator_notes, ''), 'Failed: ' || failure_reason_value),
      lock_version = lock_version + 1,
      updated_at = now()
  where id = requested_job_id;

  if job_record.printer_id is not null then
    update public.printers set status = 'idle', updated_at = now()
    where id = job_record.printer_id;
  end if;

  insert into public.print_jobs (
    order_item_id, status, unit_number, plate_number, attempt_number,
    retry_of_job_id, print_profile_path, estimated_minutes, material, color,
    source_url, source_platform, product_name_snapshot, sku_snapshot,
    variant_snapshot, operator_notes
  ) values (
    job_record.order_item_id,
    'awaiting_approval',
    job_record.unit_number,
    job_record.plate_number,
    job_record.attempt_number + 1,
    job_record.id,
    job_record.print_profile_path,
    job_record.estimated_minutes,
    job_record.material,
    job_record.color,
    job_record.source_url,
    job_record.source_platform,
    job_record.product_name_snapshot,
    job_record.sku_snapshot,
    job_record.variant_snapshot,
    'Retry after failed attempt ' || job_record.attempt_number::text || ': ' || failure_reason_value
  ) returning id into retry_job_uuid;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_print_failed_retry_created',
    'print_job',
    requested_job_id::text,
    jsonb_build_object(
      'order_id', order_uuid,
      'printer_id', job_record.printer_id,
      'failure_reason', failure_reason_value,
      'retry_job_id', retry_job_uuid,
      'failed_attempt', job_record.attempt_number
    )
  );

  result_payload := jsonb_build_object(
    'failed_print_job_id', requested_job_id,
    'retry_print_job_id', retry_job_uuid,
    'order_id', order_uuid,
    'status', 'awaiting_approval'
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.approve_manual_order_qc(
  requested_order_id uuid,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  job_count integer;
  invalid_job_count integer;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'approve_qc', actor_profile_id, requested_order_id, null, null, '{}'::jsonb
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into order_record from public.orders where id = requested_order_id for update;
  if order_record.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_record.fulfillment_status <> 'quality_check' then raise exception 'ORDER_STATE_CONFLICT'; end if;

  select
    count(*),
    count(*) filter (where pj.status not in ('completed', 'quality_check', 'approved'))
  into job_count, invalid_job_count
  from public.print_jobs pj
  join public.order_items oi on oi.id = pj.order_item_id
  where oi.order_id = requested_order_id
    and not exists (
      select 1 from public.print_jobs newer_attempt
      where newer_attempt.order_item_id = pj.order_item_id
        and newer_attempt.unit_number = pj.unit_number
        and newer_attempt.plate_number = pj.plate_number
        and newer_attempt.attempt_number > pj.attempt_number
    );

  if job_count = 0 or invalid_job_count > 0 then raise exception 'QC_NOT_READY'; end if;

  update public.print_jobs pj
  set status = 'approved', lock_version = lock_version + 1, updated_at = now()
  from public.order_items oi
  where pj.order_item_id = oi.id
    and oi.order_id = requested_order_id
    and pj.status in ('completed', 'quality_check');

  update public.orders
  set fulfillment_status = 'ready_for_delivery', status = 'processing', updated_at = now()
  where id = requested_order_id;

  update public.custom_quote_requests
  set status = 'ready_for_delivery', updated_at = now()
  where order_id = requested_order_id and status = 'quality_check';

  insert into public.order_events (
    order_id, event_key, event_type, customer_label_en, customer_label_ka,
    details, is_customer_visible, created_by
  ) values (
    requested_order_id,
    'order:' || requested_order_id::text || ':ready_for_delivery',
    'ready_for_delivery',
    'Production completed — preparing courier handoff',
    'წარმოება დასრულებულია — მზადდება საკურიეროსთვის',
    '{}'::jsonb,
    true,
    actor_profile_id
  ) on conflict do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_quality_check_approved',
    'order',
    requested_order_id::text,
    jsonb_build_object('approved_jobs', job_count)
  );

  result_payload := jsonb_build_object(
    'order_id', requested_order_id,
    'fulfillment_status', 'ready_for_delivery',
    'approved_jobs', job_count
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.handoff_order_to_courier(
  requested_order_id uuid,
  requested_courier_name text,
  requested_courier_reference text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  courier_name_value text;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'courier_handoff', actor_profile_id, requested_order_id, null, null,
    jsonb_build_object(
      'courier_name', coalesce(requested_courier_name, ''),
      'courier_reference', coalesce(requested_courier_reference, '')
    )
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into order_record from public.orders where id = requested_order_id for update;
  if order_record.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_record.fulfillment_status <> 'ready_for_delivery' then raise exception 'ORDER_STATE_CONFLICT'; end if;

  courier_name_value := nullif(left(trim(coalesce(requested_courier_name, '')), 120), '');
  if courier_name_value is null then courier_name_value := 'საკურიერო მომსახურება'; end if;

  insert into public.delivery_handoffs (
    order_id, courier_name, courier_reference, handed_off_by
  ) values (
    requested_order_id,
    courier_name_value,
    nullif(left(trim(coalesce(requested_courier_reference, '')), 160), ''),
    actor_profile_id
  );

  update public.orders
  set fulfillment_status = 'out_for_delivery', status = 'shipped', updated_at = now()
  where id = requested_order_id;

  insert into public.order_events (
    order_id, event_key, event_type, customer_label_en, customer_label_ka,
    details, is_customer_visible, created_by
  ) values (
    requested_order_id,
    'order:' || requested_order_id::text || ':courier_handoff',
    'out_for_delivery',
    'Handed to courier service',
    'გადაეცა საკურიერო მომსახურებას',
    jsonb_strip_nulls(jsonb_build_object(
      'courier_name', courier_name_value,
      'courier_reference', nullif(left(trim(coalesce(requested_courier_reference, '')), 160), '')
    )),
    true,
    actor_profile_id
  ) on conflict do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'order_handed_to_courier',
    'order',
    requested_order_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'courier_name', courier_name_value,
      'courier_reference', nullif(left(trim(coalesce(requested_courier_reference, '')), 160), '')
    ))
  );

  result_payload := jsonb_build_object(
    'order_id', requested_order_id,
    'fulfillment_status', 'out_for_delivery',
    'courier_name', courier_name_value
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.mark_manual_order_delivered(
  requested_order_id uuid,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_record public.orders%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'mark_delivered', actor_profile_id, requested_order_id, null, null, '{}'::jsonb
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into order_record from public.orders where id = requested_order_id for update;
  if order_record.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_record.fulfillment_status <> 'out_for_delivery' then raise exception 'ORDER_STATE_CONFLICT'; end if;

  update public.orders
  set fulfillment_status = 'delivered', status = 'delivered', updated_at = now()
  where id = requested_order_id;

  update public.custom_quote_requests
  set status = 'delivered', updated_at = now()
  where order_id = requested_order_id and status = 'ready_for_delivery';

  insert into public.order_events (
    order_id, event_key, event_type, customer_label_en, customer_label_ka,
    details, is_customer_visible, created_by
  ) values (
    requested_order_id,
    'order:' || requested_order_id::text || ':delivered',
    'delivered',
    'Delivered',
    'შეკვეთა მიწოდებულია',
    '{}'::jsonb,
    true,
    actor_profile_id
  ) on conflict do nothing;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'order_delivery_confirmed',
    'order',
    requested_order_id::text,
    '{}'::jsonb
  );

  result_payload := jsonb_build_object(
    'order_id', requested_order_id,
    'fulfillment_status', 'delivered'
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.register_manual_printer(
  requested_name text,
  requested_model text,
  requested_serial_masked text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  printer_uuid uuid;
  name_value text;
  model_value text;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;

  if not public.claim_production_operation(
    operation_key, 'register_printer', actor_profile_id, null, null, null,
    jsonb_build_object(
      'name', coalesce(requested_name, ''),
      'model', coalesce(requested_model, ''),
      'serial_masked', coalesce(requested_serial_masked, '')
    )
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  name_value := nullif(left(trim(coalesce(requested_name, '')), 80), '');
  model_value := nullif(left(trim(coalesce(requested_model, '')), 80), '');
  if name_value is null or model_value is null then raise exception 'PRINTER_FIELDS_REQUIRED'; end if;
  if exists (select 1 from public.printers where lower(name) = lower(name_value) and is_active = true) then
    raise exception 'PRINTER_NAME_EXISTS';
  end if;

  begin
    insert into public.printers (
      name, manufacturer, model, serial_number_masked, credential_ref,
      status, capabilities, is_active
    ) values (
      name_value,
      'Bambu Lab',
      model_value,
      nullif(left(trim(coalesce(requested_serial_masked, '')), 24), ''),
      null,
      'idle',
      jsonb_build_object('control_mode', 'manual_v1', 'status_source', 'operator'),
      true
    ) returning id into printer_uuid;
  exception when unique_violation then
    raise exception 'PRINTER_NAME_EXISTS';
  end;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_printer_registered',
    'printer',
    printer_uuid::text,
    jsonb_build_object('name', name_value, 'model', model_value)
  );

  result_payload := jsonb_build_object(
    'printer_id', printer_uuid,
    'name', name_value,
    'model', model_value,
    'status', 'idle'
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

create or replace function public.set_manual_printer_status(
  requested_printer_id uuid,
  requested_status text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  printer_record public.printers%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.production_actor_can_manage(actor_profile_id) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;
  if requested_status is null or requested_status not in ('idle', 'offline', 'maintenance') then raise exception 'PRINTER_STATUS_INVALID'; end if;

  if not public.claim_production_operation(
    operation_key, 'set_printer_status', actor_profile_id, null, null, requested_printer_id,
    jsonb_build_object('status', requested_status)
  ) then
    select result into previous_result from public.production_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into printer_record from public.printers where id = requested_printer_id for update;
  if printer_record.id is null or printer_record.is_active is not true then raise exception 'PRINTER_NOT_AVAILABLE'; end if;
  if exists (
    select 1 from public.print_jobs
    where printer_id = requested_printer_id and status in ('queued', 'preparing', 'printing', 'paused')
  ) then
    raise exception 'PRINTER_HAS_ACTIVE_JOB';
  end if;

  update public.printers
  set status = requested_status, updated_at = now()
  where id = requested_printer_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_printer_status_changed',
    'printer',
    requested_printer_id::text,
    jsonb_build_object('previous_status', printer_record.status, 'new_status', requested_status)
  );

  result_payload := jsonb_build_object(
    'printer_id', requested_printer_id,
    'status', requested_status
  );
  return public.finish_production_operation(operation_key, result_payload);
end;
$$;

-- Paid custom quotes now enter the same operator confirmation gate as catalog
-- orders. Job expansion happens once in confirm_order_for_manual_production,
-- so quantity is represented correctly instead of creating a single job.
create or replace function public.queue_paid_custom_quote(custom_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_record public.custom_quote_requests%rowtype;
  customer_uuid uuid;
  new_order_id uuid;
  promised_timestamp timestamptz := now();
  added_business_days integer := 0;
begin
  select * into quote_record
  from public.custom_quote_requests
  where id = custom_request_id
  for update;

  if quote_record.id is null then raise exception 'Custom quote request not found'; end if;
  if quote_record.status <> 'paid' or quote_record.paid_at is null then raise exception 'A verified paid status is required'; end if;
  if quote_record.order_id is not null then return quote_record.order_id; end if;
  if quote_record.quoted_price is null or quote_record.delivery_address is null then raise exception 'Quote price and delivery address are required'; end if;
  if quote_record.files_verified is not true then raise exception 'Uploaded files require operator verification'; end if;

  select id into customer_uuid
  from public.customers
  where profile_id = quote_record.profile_id
  limit 1;
  if customer_uuid is null then raise exception 'Customer record not found'; end if;

  while added_business_days < 3 loop
    promised_timestamp := promised_timestamp + interval '1 day';
    if extract(isodow from promised_timestamp) < 6 then
      added_business_days := added_business_days + 1;
    end if;
  end loop;

  insert into public.orders (
    customer_id, status, payment_status, subtotal, delivery_fee, total,
    delivery_address, notes, fulfillment_status, promised_at, test_mode
  ) values (
    customer_uuid,
    'paid',
    'paid',
    quote_record.quoted_price * quote_record.quantity,
    0,
    quote_record.quoted_price * quote_record.quantity,
    quote_record.delivery_address,
    'Custom quote request ' || quote_record.id::text,
    'order_received',
    promised_timestamp,
    false
  ) returning id into new_order_id;

  insert into public.order_items (
    order_id, product_name, sku, size_label, material, color, quantity,
    unit_price, total_price, production_notes
  ) values (
    new_order_id,
    quote_record.title,
    'HOO-CUSTOM-' || upper(substr(replace(quote_record.id::text, '-', ''), 1, 8)),
    quote_record.dimensions,
    quote_record.material_preference,
    quote_record.color_preference,
    quote_record.quantity,
    quote_record.quoted_price,
    quote_record.quoted_price * quote_record.quantity,
    quote_record.description
  );

  insert into public.order_events (
    order_id, event_key, event_type, customer_label_en, customer_label_ka,
    details, is_customer_visible
  ) values (
    new_order_id,
    'order:' || new_order_id::text || ':received',
    'order_received',
    'Order received',
    'შეკვეთა მიღებულია',
    jsonb_build_object('custom_quote_request_id', quote_record.id),
    true
  ) on conflict do nothing;

  update public.custom_quote_requests
  set order_id = new_order_id, updated_at = now()
  where id = quote_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    quote_record.profile_id,
    'custom_quote_order_created_after_verified_payment',
    'custom_quote_request',
    quote_record.id::text,
    jsonb_build_object('order_id', new_order_id, 'operator_confirmation_required', true)
  );

  return new_order_id;
end;
$$;

-- Operator mutations are possible only through trusted server code using the
-- service role. Browser roles retain read-only production RLS.
revoke all on table public.production_operations from public, anon, authenticated;
revoke all on table public.delivery_handoffs from public, anon, authenticated;

revoke all on function public.production_actor_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.claim_production_operation(uuid, text, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_production_operation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_order_for_manual_production(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_manual_print_job(uuid, uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_manual_print_job(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_manual_print_assignment(uuid, integer, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_manual_print_job(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_manual_print_job(uuid, integer, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_manual_order_qc(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.handoff_order_to_courier(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_manual_order_delivered(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_manual_printer(text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_manual_printer_status(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.queue_paid_custom_quote(uuid) from public, anon, authenticated;

grant execute on function public.production_actor_can_manage(uuid) to service_role;
grant execute on function public.claim_production_operation(uuid, text, uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_production_operation(uuid, jsonb) to service_role;
grant execute on function public.confirm_order_for_manual_production(uuid, uuid, uuid) to service_role;
grant execute on function public.assign_manual_print_job(uuid, uuid, integer, uuid, uuid) to service_role;
grant execute on function public.start_manual_print_job(uuid, integer, uuid, uuid) to service_role;
grant execute on function public.release_manual_print_assignment(uuid, integer, text, uuid, uuid) to service_role;
grant execute on function public.complete_manual_print_job(uuid, integer, uuid, uuid) to service_role;
grant execute on function public.fail_manual_print_job(uuid, integer, text, uuid, uuid) to service_role;
grant execute on function public.approve_manual_order_qc(uuid, uuid, uuid) to service_role;
grant execute on function public.handoff_order_to_courier(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.mark_manual_order_delivered(uuid, uuid, uuid) to service_role;
grant execute on function public.register_manual_printer(text, text, text, uuid, uuid) to service_role;
grant execute on function public.set_manual_printer_status(uuid, text, uuid, uuid) to service_role;
grant execute on function public.queue_paid_custom_quote(uuid) to service_role;

commit;
