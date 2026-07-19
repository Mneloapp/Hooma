-- Staff HR, attendance, leave and auditable self-service operations.
-- Operational KPI values remain derived from the existing production and ERP ledgers.

begin;

create table if not exists public.hr_employment_profiles (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  employee_number text not null unique,
  job_title text,
  department text,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  hire_date date not null default current_date,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'terminated')),
  work_week smallint[] not null default array[1,2,3,4,5]::smallint[],
  workday_start_local time not null default '09:00',
  standard_workday_minutes integer not null default 480
    check (standard_workday_minutes between 1 and 1440),
  late_grace_minutes integer not null default 15
    check (late_grace_minutes between 0 and 240),
  annual_paid_leave_days numeric(5,2) not null default 24
    check (annual_paid_leave_days between 0 and 366),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(work_week) between 1 and 7),
  check (work_week <@ array[1,2,3,4,5,6,7]::smallint[]),
  check (manager_profile_id is null or manager_profile_id <> profile_id)
);

create table if not exists public.hr_employment_terms_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  effective_from date not null,
  employment_status text not null check (employment_status in ('active', 'on_leave', 'terminated')),
  work_week smallint[] not null check (cardinality(work_week) between 1 and 7),
  workday_start_local time not null,
  standard_workday_minutes integer not null check (standard_workday_minutes between 1 and 1440),
  late_grace_minutes integer not null check (late_grace_minutes between 0 and 240),
  captured_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, effective_from),
  check (work_week <@ array[1,2,3,4,5,6,7]::smallint[])
);

create table if not exists public.hr_calendar_days (
  calendar_date date primary key,
  is_working_day boolean not null,
  name_ka text,
  name_en text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_attendance_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes between 0 and 720),
  status text not null default 'present'
    check (status in ('present', 'remote', 'paid_leave', 'unpaid_leave', 'sick_leave', 'day_off', 'absent', 'excused')),
  source text not null default 'self' check (source in ('self', 'manager', 'leave', 'system')),
  notes text,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, work_date),
  check (clock_out_at is null or clock_in_at is not null),
  check (clock_out_at is null or clock_out_at > clock_in_at),
  check (
    status in ('present', 'remote')
    or (clock_in_at is null and clock_out_at is null)
  )
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  leave_type text not null
    check (leave_type in ('paid_leave', 'unpaid_leave', 'sick_leave', 'day_off')),
  start_date date not null,
  end_date date not null,
  working_days numeric(6,2) not null check (working_days > 0),
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366)
);

create table if not exists public.hr_operations (
  idempotency_key uuid primary key,
  operation_type text not null
    check (operation_type in ('clock_in', 'clock_out', 'correct_attendance', 'request_leave', 'cancel_leave', 'review_leave', 'update_employment', 'set_calendar_day')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_profile_id uuid references public.profiles(id) on delete restrict,
  leave_request_id uuid references public.hr_leave_requests(id) on delete restrict,
  request_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_hr_employment_manager
  on public.hr_employment_profiles(manager_profile_id, employment_status);
create index if not exists idx_hr_employment_terms_profile_date
  on public.hr_employment_terms_history(profile_id, effective_from desc);
create index if not exists idx_hr_attendance_profile_date
  on public.hr_attendance_entries(profile_id, work_date desc);
create index if not exists idx_hr_attendance_date_status
  on public.hr_attendance_entries(work_date, status);
create index if not exists idx_hr_leave_profile_dates
  on public.hr_leave_requests(profile_id, start_date desc, end_date desc);
create index if not exists idx_hr_leave_pending
  on public.hr_leave_requests(status, start_date)
  where status = 'pending';
create index if not exists idx_production_operations_actor_completed
  on public.production_operations(actor_id, completed_at desc, operation_type)
  where completed_at is not null;
create index if not exists idx_print_jobs_operator_completed
  on public.print_jobs(assigned_operator_id, completed_at desc, status)
  where assigned_operator_id is not null;
create index if not exists idx_erp_usage_print_job_date
  on public.erp_production_usages(print_job_id, usage_date desc);

drop trigger if exists set_hr_employment_updated_at on public.hr_employment_profiles;
create trigger set_hr_employment_updated_at
  before update on public.hr_employment_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists set_hr_calendar_updated_at on public.hr_calendar_days;
create trigger set_hr_calendar_updated_at
  before update on public.hr_calendar_days
  for each row execute function public.set_updated_at();
drop trigger if exists set_hr_attendance_updated_at on public.hr_attendance_entries;
create trigger set_hr_attendance_updated_at
  before update on public.hr_attendance_entries
  for each row execute function public.set_updated_at();
drop trigger if exists set_hr_leave_updated_at on public.hr_leave_requests;
create trigger set_hr_leave_updated_at
  before update on public.hr_leave_requests
  for each row execute function public.set_updated_at();

insert into public.hr_employment_profiles (
  profile_id, employee_number, job_title, department, hire_date, employment_status, created_by, updated_by
)
select
  staff.id,
  'HOO-' || lpad(row_number() over (order by staff.created_at, staff.id)::text, 4, '0'),
  case staff.role
    when 'owner' then 'Owner / CEO'
    when 'admin' then 'ადმინისტრატორი'
    when 'catalog_manager' then 'კატალოგის მენეჯერი'
    when 'production_operator' then 'წარმოების ოპერატორი'
    when 'support' then 'მომხმარებელთა მხარდაჭერა'
  end,
  case when staff.role = 'production_operator' then 'წარმოება' else 'ადმინისტრაცია' end,
  staff.created_at::date,
  case when staff.is_active then 'active' else 'terminated' end,
  (select id from public.profiles where role = 'owner' and is_active = true order by created_at limit 1),
  (select id from public.profiles where role = 'owner' and is_active = true order by created_at limit 1)
from public.profiles staff
where staff.role <> 'customer'
on conflict (profile_id) do nothing;

insert into public.hr_employment_terms_history (
  profile_id, effective_from, employment_status, work_week, workday_start_local,
  standard_workday_minutes, late_grace_minutes, captured_by
)
select
  employment.profile_id, employment.hire_date, employment.employment_status, employment.work_week,
  employment.workday_start_local, employment.standard_workday_minutes,
  employment.late_grace_minutes, employment.updated_by
from public.hr_employment_profiles employment
on conflict (profile_id, effective_from) do nothing;

create or replace function public.hr_actor_is_staff(actor_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin', 'catalog_manager', 'production_operator', 'support')
  );
$$;

create or replace function public.hr_actor_can_manage(actor_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.hr_ensure_employment_profile(target_profile_id uuid, actor_profile_id uuid)
returns public.hr_employment_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.hr_employment_profiles%rowtype;
  target_role text;
begin
  select * into saved from public.hr_employment_profiles where profile_id = target_profile_id;
  if saved.profile_id is not null then
    insert into public.hr_employment_terms_history (
      profile_id, effective_from, employment_status, work_week, workday_start_local,
      standard_workday_minutes, late_grace_minutes, captured_by
    ) values (
      saved.profile_id, saved.hire_date, saved.employment_status, saved.work_week,
      saved.workday_start_local, saved.standard_workday_minutes, saved.late_grace_minutes,
      coalesce(saved.updated_by, actor_profile_id)
    ) on conflict (profile_id, effective_from) do nothing;
    return saved;
  end if;

  select role into target_role
  from public.profiles
  where id = target_profile_id and is_active = true;
  if target_role is null or target_role = 'customer' then raise exception 'HR_STAFF_NOT_FOUND'; end if;

  insert into public.hr_employment_profiles (
    profile_id, employee_number, job_title, department, created_by, updated_by
  ) values (
    target_profile_id,
    'HOO-' || upper(substr(replace(target_profile_id::text, '-', ''), 1, 8)),
    case target_role
      when 'owner' then 'Owner / CEO'
      when 'admin' then 'ადმინისტრატორი'
      when 'catalog_manager' then 'კატალოგის მენეჯერი'
      when 'production_operator' then 'წარმოების ოპერატორი'
      when 'support' then 'მომხმარებელთა მხარდაჭერა'
    end,
    case when target_role = 'production_operator' then 'წარმოება' else 'ადმინისტრაცია' end,
    actor_profile_id,
    actor_profile_id
  ) on conflict (profile_id) do nothing;

  select * into saved from public.hr_employment_profiles where profile_id = target_profile_id;
  insert into public.hr_employment_terms_history (
    profile_id, effective_from, employment_status, work_week, workday_start_local,
    standard_workday_minutes, late_grace_minutes, captured_by
  ) values (
    saved.profile_id, saved.hire_date, saved.employment_status, saved.work_week,
    saved.workday_start_local, saved.standard_workday_minutes, saved.late_grace_minutes,
    coalesce(saved.updated_by, actor_profile_id)
  ) on conflict (profile_id, effective_from) do nothing;
  return saved;
end;
$$;

create or replace function public.hr_claim_operation(
  operation_key uuid,
  requested_type text,
  actor_profile_id uuid,
  target_profile_id uuid,
  requested_leave_id uuid,
  requested_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_rows integer;
  existing public.hr_operations%rowtype;
begin
  if operation_key is null then raise exception 'HR_OPERATION_KEY_REQUIRED'; end if;
  insert into public.hr_operations (
    idempotency_key, operation_type, actor_id, target_profile_id, leave_request_id, request_payload
  ) values (
    operation_key, requested_type, actor_profile_id, target_profile_id, requested_leave_id,
    coalesce(requested_payload, '{}'::jsonb)
  ) on conflict (idempotency_key) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 1 then return true; end if;

  select * into existing from public.hr_operations where idempotency_key = operation_key;
  if existing.operation_type is distinct from requested_type
    or existing.actor_id is distinct from actor_profile_id
    or existing.target_profile_id is distinct from target_profile_id
    or existing.leave_request_id is distinct from requested_leave_id
    or existing.request_payload is distinct from coalesce(requested_payload, '{}'::jsonb) then
    raise exception 'HR_OPERATION_KEY_CONFLICT';
  end if;
  if existing.completed_at is null then raise exception 'HR_OPERATION_IN_PROGRESS'; end if;
  return false;
end;
$$;

create or replace function public.hr_finish_operation(operation_key uuid, operation_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.hr_operations
  set result = coalesce(operation_result, '{}'::jsonb), completed_at = now()
  where idempotency_key = operation_key;
  return coalesce(operation_result, '{}'::jsonb);
end;
$$;

create or replace function public.hr_clock_in(
  requested_mode text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_work_date date := (clock_timestamp() at time zone 'Asia/Tbilisi')::date;
  employment public.hr_employment_profiles%rowtype;
  attendance public.hr_attendance_entries%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.hr_actor_is_staff(actor_profile_id) then raise exception 'HR_FORBIDDEN'; end if;
  if requested_mode not in ('present', 'remote') then raise exception 'HR_INVALID_WORK_MODE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-attendance:' || actor_profile_id::text, 0));
  if not public.hr_claim_operation(
    operation_key, 'clock_in', actor_profile_id, actor_profile_id, null,
    jsonb_build_object('mode', requested_mode, 'work_date', local_work_date)
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  employment := public.hr_ensure_employment_profile(actor_profile_id, actor_profile_id);
  if employment.employment_status <> 'active' then raise exception 'HR_EMPLOYMENT_NOT_ACTIVE'; end if;

  select * into attendance
  from public.hr_attendance_entries
  where profile_id = actor_profile_id and work_date = local_work_date
  for update;
  if attendance.id is not null then
    if attendance.status not in ('present', 'remote') then raise exception 'HR_DAY_ALREADY_CLASSIFIED'; end if;
    if attendance.clock_in_at is not null then raise exception 'HR_ALREADY_CLOCKED_IN'; end if;
    update public.hr_attendance_entries
    set clock_in_at = clock_timestamp(), status = requested_mode, source = 'self', updated_at = now()
    where id = attendance.id returning * into attendance;
  else
    insert into public.hr_attendance_entries (
      profile_id, work_date, clock_in_at, status, source, created_by
    ) values (
      actor_profile_id, local_work_date, clock_timestamp(), requested_mode, 'self', actor_profile_id
    ) returning * into attendance;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_clocked_in', 'hr_attendance', attendance.id::text,
    jsonb_build_object('work_date', local_work_date, 'mode', requested_mode));
  result_payload := jsonb_build_object(
    'attendance_id', attendance.id, 'work_date', attendance.work_date,
    'clock_in_at', attendance.clock_in_at, 'status', attendance.status
  );
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_clock_out(
  requested_break_minutes integer,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_work_date date := (clock_timestamp() at time zone 'Asia/Tbilisi')::date;
  attendance public.hr_attendance_entries%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.hr_actor_is_staff(actor_profile_id) then raise exception 'HR_FORBIDDEN'; end if;
  if requested_break_minutes is null or requested_break_minutes < 0 or requested_break_minutes > 720 then
    raise exception 'HR_INVALID_BREAK';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-attendance:' || actor_profile_id::text, 0));
  if not public.hr_claim_operation(
    operation_key, 'clock_out', actor_profile_id, actor_profile_id, null,
    jsonb_build_object('break_minutes', requested_break_minutes, 'work_date', local_work_date)
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into attendance
  from public.hr_attendance_entries
  where profile_id = actor_profile_id and work_date = local_work_date
  for update;
  if attendance.id is null or attendance.clock_in_at is null then raise exception 'HR_NOT_CLOCKED_IN'; end if;
  if attendance.clock_out_at is not null then raise exception 'HR_ALREADY_CLOCKED_OUT'; end if;
  if clock_timestamp() <= attendance.clock_in_at then raise exception 'HR_INVALID_CLOCK_RANGE'; end if;
  if requested_break_minutes > floor(extract(epoch from (clock_timestamp() - attendance.clock_in_at)) / 60)::integer then
    raise exception 'HR_BREAK_EXCEEDS_SHIFT';
  end if;

  update public.hr_attendance_entries
  set clock_out_at = clock_timestamp(), break_minutes = requested_break_minutes, updated_at = now()
  where id = attendance.id returning * into attendance;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_clocked_out', 'hr_attendance', attendance.id::text,
    jsonb_build_object('work_date', local_work_date, 'break_minutes', requested_break_minutes));
  result_payload := jsonb_build_object(
    'attendance_id', attendance.id, 'work_date', attendance.work_date,
    'clock_in_at', attendance.clock_in_at, 'clock_out_at', attendance.clock_out_at,
    'break_minutes', attendance.break_minutes
  );
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_request_leave(
  requested_type text,
  requested_start date,
  requested_end date,
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
  employment public.hr_employment_profiles%rowtype;
  calculated_days numeric(6,2);
  saved public.hr_leave_requests%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.hr_actor_is_staff(actor_profile_id) then raise exception 'HR_FORBIDDEN'; end if;
  if requested_type not in ('paid_leave', 'unpaid_leave', 'sick_leave', 'day_off') then
    raise exception 'HR_INVALID_LEAVE_TYPE';
  end if;
  if requested_start is null or requested_end is null or requested_end < requested_start
    or requested_end - requested_start > 366 then raise exception 'HR_INVALID_LEAVE_DATES'; end if;
  if requested_type = 'day_off' and requested_start <> requested_end then raise exception 'HR_DAY_OFF_SINGLE_DATE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-leave:' || actor_profile_id::text, 0));

  if not public.hr_claim_operation(
    operation_key, 'request_leave', actor_profile_id, actor_profile_id, null,
    jsonb_build_object('type', requested_type, 'start', requested_start, 'end', requested_end, 'reason', left(trim(coalesce(requested_reason, '')), 1000))
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  employment := public.hr_ensure_employment_profile(actor_profile_id, actor_profile_id);
  if employment.employment_status = 'terminated' then raise exception 'HR_EMPLOYMENT_NOT_ACTIVE'; end if;

  select count(*)::numeric into calculated_days
  from generate_series(requested_start, requested_end, interval '1 day') as dates(work_day)
  where coalesce(
    (select calendar.is_working_day from public.hr_calendar_days calendar where calendar.calendar_date = dates.work_day::date),
    extract(isodow from dates.work_day)::smallint = any(employment.work_week)
  );
  if calculated_days < 1 then raise exception 'HR_NO_WORKING_DAYS'; end if;
  if exists (
    select 1 from public.hr_leave_requests existing
    where existing.profile_id = actor_profile_id
      and existing.status in ('pending', 'approved')
      and daterange(existing.start_date, existing.end_date, '[]') && daterange(requested_start, requested_end, '[]')
  ) then raise exception 'HR_LEAVE_OVERLAP'; end if;

  insert into public.hr_leave_requests (
    profile_id, leave_type, start_date, end_date, working_days, reason, requested_by
  ) values (
    actor_profile_id, requested_type, requested_start, requested_end, calculated_days,
    nullif(left(trim(coalesce(requested_reason, '')), 1000), ''), actor_profile_id
  ) returning * into saved;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_leave_requested', 'hr_leave_request', saved.id::text,
    jsonb_build_object('type', saved.leave_type, 'start', saved.start_date, 'end', saved.end_date, 'working_days', saved.working_days));
  result_payload := jsonb_build_object(
    'leave_request_id', saved.id, 'status', saved.status, 'working_days', saved.working_days
  );
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_correct_attendance(
  requested_profile_id uuid,
  requested_work_date date,
  requested_status text,
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  requested_break_minutes integer,
  requested_notes text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.hr_attendance_entries%rowtype;
  saved public.hr_attendance_entries%rowtype;
  previous_result jsonb;
  result_payload jsonb;
  normalized_clock_in timestamptz;
  normalized_clock_out timestamptz;
  normalized_break integer;
  actor_role text;
  target_role text;
begin
  if not public.hr_actor_can_manage(actor_profile_id) then raise exception 'HR_MANAGE_FORBIDDEN'; end if;
  select role into actor_role from public.profiles where id = actor_profile_id and is_active = true;
  select role into target_role from public.profiles where id = requested_profile_id;
  if requested_profile_id = actor_profile_id and actor_role <> 'owner' then raise exception 'HR_SELF_MANAGEMENT_FORBIDDEN'; end if;
  if target_role = 'owner' and actor_role <> 'owner' then raise exception 'HR_OWNER_PROTECTED'; end if;
  if requested_work_date is null or requested_work_date > (now() at time zone 'Asia/Tbilisi')::date
    or requested_work_date < (now() at time zone 'Asia/Tbilisi')::date - 366 then raise exception 'HR_INVALID_ATTENDANCE_DATE'; end if;
  if requested_status not in ('present', 'remote', 'paid_leave', 'unpaid_leave', 'sick_leave', 'day_off', 'absent', 'excused') then
    raise exception 'HR_INVALID_ATTENDANCE_STATUS';
  end if;
  if requested_break_minutes is null or requested_break_minutes not between 0 and 720 then raise exception 'HR_INVALID_BREAK'; end if;
  perform public.hr_ensure_employment_profile(requested_profile_id, actor_profile_id);
  perform pg_advisory_xact_lock(hashtextextended('hr-attendance:' || requested_profile_id::text, 0));

  if requested_status in ('present', 'remote') then
    if requested_clock_in is null then raise exception 'HR_CLOCK_IN_REQUIRED'; end if;
    if (requested_clock_in at time zone 'Asia/Tbilisi')::date <> requested_work_date then raise exception 'HR_CLOCK_DATE_MISMATCH'; end if;
    if requested_clock_out is not null and requested_clock_out <= requested_clock_in then raise exception 'HR_INVALID_CLOCK_RANGE'; end if;
    normalized_clock_in := requested_clock_in;
    normalized_clock_out := requested_clock_out;
    normalized_break := requested_break_minutes;
    if normalized_clock_out is not null
      and normalized_break > floor(extract(epoch from (normalized_clock_out - normalized_clock_in)) / 60)::integer then
      raise exception 'HR_BREAK_EXCEEDS_SHIFT';
    end if;
  else
    normalized_clock_in := null;
    normalized_clock_out := null;
    normalized_break := 0;
  end if;

  if not public.hr_claim_operation(
    operation_key, 'correct_attendance', actor_profile_id, requested_profile_id, null,
    jsonb_build_object('work_date', requested_work_date, 'status', requested_status,
      'clock_in', normalized_clock_in, 'clock_out', normalized_clock_out,
      'break_minutes', normalized_break, 'notes', left(trim(coalesce(requested_notes, '')), 1000))
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into existing
  from public.hr_attendance_entries
  where profile_id = requested_profile_id and work_date = requested_work_date
  for update;
  insert into public.hr_attendance_entries (
    profile_id, work_date, clock_in_at, clock_out_at, break_minutes, status, source,
    notes, approved_by, created_by
  ) values (
    requested_profile_id, requested_work_date, normalized_clock_in, normalized_clock_out,
    normalized_break, requested_status, 'manager',
    nullif(left(trim(coalesce(requested_notes, '')), 1000), ''), actor_profile_id, actor_profile_id
  ) on conflict (profile_id, work_date) do update
    set clock_in_at = excluded.clock_in_at,
        clock_out_at = excluded.clock_out_at,
        break_minutes = excluded.break_minutes,
        status = excluded.status,
        source = 'manager',
        notes = excluded.notes,
        approved_by = excluded.approved_by,
        updated_at = now()
  returning * into saved;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_attendance_corrected', 'hr_attendance', saved.id::text,
    jsonb_build_object('profile_id', requested_profile_id, 'work_date', requested_work_date,
      'before', case when existing.id is null then null else to_jsonb(existing) end,
      'after', to_jsonb(saved), 'reason', requested_notes));
  result_payload := jsonb_build_object('attendance_id', saved.id, 'work_date', saved.work_date, 'status', saved.status);
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_cancel_leave(
  requested_leave_id uuid,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.hr_leave_requests%rowtype;
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.hr_actor_is_staff(actor_profile_id) then raise exception 'HR_FORBIDDEN'; end if;
  if not public.hr_claim_operation(
    operation_key, 'cancel_leave', actor_profile_id, actor_profile_id, requested_leave_id, '{}'::jsonb
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;
  update public.hr_leave_requests
  set status = 'cancelled', updated_at = now()
  where id = requested_leave_id and profile_id = actor_profile_id and status = 'pending'
  returning * into saved;
  if saved.id is null then raise exception 'HR_LEAVE_NOT_CANCELLABLE'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_leave_cancelled', 'hr_leave_request', saved.id::text, '{}'::jsonb);
  result_payload := jsonb_build_object('leave_request_id', saved.id, 'status', saved.status);
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_review_leave(
  requested_leave_id uuid,
  requested_decision text,
  requested_notes text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.hr_leave_requests%rowtype;
  employment public.hr_employment_profiles%rowtype;
  previous_result jsonb;
  result_payload jsonb;
  attendance_status text;
  actor_role text;
begin
  if not public.hr_actor_can_manage(actor_profile_id) then raise exception 'HR_MANAGE_FORBIDDEN'; end if;
  if requested_decision not in ('approved', 'rejected', 'cancelled') then raise exception 'HR_INVALID_DECISION'; end if;
  if not public.hr_claim_operation(
    operation_key, 'review_leave', actor_profile_id, null, requested_leave_id,
    jsonb_build_object('decision', requested_decision, 'notes', left(trim(coalesce(requested_notes, '')), 1000))
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;

  select * into saved from public.hr_leave_requests where id = requested_leave_id for update;
  if saved.id is null
    or (requested_decision in ('approved', 'rejected') and saved.status <> 'pending')
    or (requested_decision = 'cancelled' and saved.status <> 'approved') then
    raise exception 'HR_LEAVE_NOT_REVIEWABLE';
  end if;
  select role into actor_role from public.profiles where id = actor_profile_id;
  if saved.profile_id = actor_profile_id and actor_role <> 'owner' then raise exception 'HR_SELF_REVIEW_FORBIDDEN'; end if;
  employment := public.hr_ensure_employment_profile(saved.profile_id, actor_profile_id);
  if requested_decision = 'approved' and exists (
    select 1 from public.hr_attendance_entries attendance
    where attendance.profile_id = saved.profile_id
      and attendance.work_date between saved.start_date and saved.end_date
      and attendance.clock_in_at is not null
  ) then raise exception 'HR_ATTENDANCE_CONFLICT'; end if;

  update public.hr_leave_requests
  set status = requested_decision,
      reviewed_by = actor_profile_id,
      reviewed_at = now(),
      review_notes = nullif(left(trim(coalesce(requested_notes, '')), 1000), ''),
      updated_at = now()
  where id = saved.id returning * into saved;

  if requested_decision = 'approved' then
    attendance_status := case saved.leave_type
      when 'paid_leave' then 'paid_leave'
      when 'unpaid_leave' then 'unpaid_leave'
      when 'sick_leave' then 'sick_leave'
      else 'day_off'
    end;
    insert into public.hr_attendance_entries (
      profile_id, work_date, status, source, notes, approved_by, created_by
    )
    select
      saved.profile_id, dates.work_day::date, attendance_status, 'leave',
      concat('Leave request ', saved.id::text), actor_profile_id, actor_profile_id
    from generate_series(saved.start_date, saved.end_date, interval '1 day') as dates(work_day)
    where coalesce(
      (select calendar.is_working_day from public.hr_calendar_days calendar where calendar.calendar_date = dates.work_day::date),
      extract(isodow from dates.work_day)::smallint = any(employment.work_week)
    )
    on conflict (profile_id, work_date) do update
      set status = excluded.status,
          source = 'leave',
          notes = excluded.notes,
          approved_by = excluded.approved_by,
          updated_at = now()
      where public.hr_attendance_entries.clock_in_at is null;
  elsif requested_decision = 'cancelled' then
    delete from public.hr_attendance_entries
    where profile_id = saved.profile_id
      and work_date between saved.start_date and saved.end_date
      and source = 'leave'
      and clock_in_at is null
      and notes = concat('Leave request ', saved.id::text);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_leave_' || requested_decision, 'hr_leave_request', saved.id::text,
    jsonb_build_object('profile_id', saved.profile_id, 'type', saved.leave_type, 'working_days', saved.working_days));
  result_payload := jsonb_build_object('leave_request_id', saved.id, 'status', saved.status);
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_update_employment(
  requested_profile_id uuid,
  requested_employee_number text,
  requested_job_title text,
  requested_department text,
  requested_manager_id uuid,
  requested_hire_date date,
  requested_status text,
  requested_work_week smallint[],
  requested_workday_start time,
  requested_standard_minutes integer,
  requested_grace_minutes integer,
  requested_leave_days numeric,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.hr_employment_profiles%rowtype;
  previous_result jsonb;
  result_payload jsonb;
  actor_role text;
  target_role text;
  before_profile jsonb;
begin
  if not public.hr_actor_can_manage(actor_profile_id) then raise exception 'HR_MANAGE_FORBIDDEN'; end if;
  select role into actor_role from public.profiles where id = actor_profile_id and is_active = true;
  select role into target_role from public.profiles where id = requested_profile_id;
  if requested_profile_id = actor_profile_id and actor_role <> 'owner' then raise exception 'HR_SELF_MANAGEMENT_FORBIDDEN'; end if;
  if target_role = 'owner' and actor_role <> 'owner' then raise exception 'HR_OWNER_PROTECTED'; end if;
  if target_role = 'owner' and requested_status <> 'active' then raise exception 'HR_OWNER_MUST_REMAIN_ACTIVE'; end if;
  if char_length(trim(coalesce(requested_employee_number, ''))) not between 2 and 40 then raise exception 'HR_INVALID_EMPLOYEE_NUMBER'; end if;
  if requested_status not in ('active', 'on_leave', 'terminated') then raise exception 'HR_INVALID_EMPLOYMENT_STATUS'; end if;
  if requested_work_week is null or cardinality(requested_work_week) not between 1 and 7
    or not (requested_work_week <@ array[1,2,3,4,5,6,7]::smallint[]) then raise exception 'HR_INVALID_WORK_WEEK'; end if;
  if requested_standard_minutes not between 1 and 1440 or requested_grace_minutes not between 0 and 240
    or requested_leave_days not between 0 and 366 then raise exception 'HR_INVALID_WORK_TERMS'; end if;
  if requested_manager_id = requested_profile_id then raise exception 'HR_INVALID_MANAGER'; end if;
  if requested_manager_id is not null and not public.hr_actor_is_staff(requested_manager_id) then raise exception 'HR_MANAGER_NOT_FOUND'; end if;

  if not public.hr_claim_operation(
    operation_key, 'update_employment', actor_profile_id, requested_profile_id, null,
    jsonb_build_object('employee_number', trim(requested_employee_number), 'job_title', left(trim(coalesce(requested_job_title, '')), 160),
      'department', left(trim(coalesce(requested_department, '')), 160), 'manager_id', requested_manager_id,
      'hire_date', requested_hire_date, 'status', requested_status, 'work_week', requested_work_week,
      'workday_start', requested_workday_start, 'standard_minutes', requested_standard_minutes,
      'grace_minutes', requested_grace_minutes, 'leave_days', requested_leave_days)
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;
  perform public.hr_ensure_employment_profile(requested_profile_id, actor_profile_id);
  select to_jsonb(profile) into before_profile
  from public.hr_employment_profiles profile
  where profile.profile_id = requested_profile_id;

  update public.hr_employment_profiles
  set employee_number = upper(trim(requested_employee_number)),
      job_title = nullif(left(trim(coalesce(requested_job_title, '')), 160), ''),
      department = nullif(left(trim(coalesce(requested_department, '')), 160), ''),
      manager_profile_id = requested_manager_id,
      hire_date = requested_hire_date,
      employment_status = requested_status,
      work_week = (select array_agg(day order by day) from (select distinct unnest(requested_work_week) as day) normalized),
      workday_start_local = requested_workday_start,
      standard_workday_minutes = requested_standard_minutes,
      late_grace_minutes = requested_grace_minutes,
      annual_paid_leave_days = requested_leave_days,
      updated_by = actor_profile_id,
      updated_at = now()
  where profile_id = requested_profile_id
  returning * into saved;

  update public.profiles
  set is_active = requested_status <> 'terminated',
      updated_at = now()
  where id = requested_profile_id;

  insert into public.hr_employment_terms_history (
    profile_id, effective_from, employment_status, work_week, workday_start_local,
    standard_workday_minutes, late_grace_minutes, captured_by
  ) values (
    saved.profile_id, (clock_timestamp() at time zone 'Asia/Tbilisi')::date,
    saved.employment_status, saved.work_week, saved.workday_start_local,
    saved.standard_workday_minutes, saved.late_grace_minutes, actor_profile_id
  ) on conflict (profile_id, effective_from) do update
    set employment_status = excluded.employment_status,
        work_week = excluded.work_week,
        workday_start_local = excluded.workday_start_local,
        standard_workday_minutes = excluded.standard_workday_minutes,
        late_grace_minutes = excluded.late_grace_minutes,
        captured_by = excluded.captured_by,
        created_at = now();

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_employment_updated', 'hr_employment_profile', requested_profile_id::text,
    jsonb_build_object('before', before_profile, 'after', to_jsonb(saved),
      'access_active', requested_status <> 'terminated'));
  result_payload := jsonb_build_object('profile_id', saved.profile_id, 'employee_number', saved.employee_number);
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

create or replace function public.hr_set_calendar_day(
  requested_date date,
  requested_is_working boolean,
  requested_name_ka text,
  requested_name_en text,
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_result jsonb;
  result_payload jsonb;
begin
  if not public.hr_actor_can_manage(actor_profile_id) then raise exception 'HR_MANAGE_FORBIDDEN'; end if;
  if requested_date is null or requested_is_working is null then raise exception 'HR_INVALID_CALENDAR_DAY'; end if;
  if not public.hr_claim_operation(
    operation_key, 'set_calendar_day', actor_profile_id, null, null,
    jsonb_build_object('date', requested_date, 'is_working_day', requested_is_working,
      'name_ka', left(trim(coalesce(requested_name_ka, '')), 160), 'name_en', left(trim(coalesce(requested_name_en, '')), 160))
  ) then
    select result into previous_result from public.hr_operations where idempotency_key = operation_key;
    return previous_result;
  end if;
  insert into public.hr_calendar_days (calendar_date, is_working_day, name_ka, name_en, created_by)
  values (requested_date, requested_is_working, nullif(left(trim(coalesce(requested_name_ka, '')), 160), ''),
    nullif(left(trim(coalesce(requested_name_en, '')), 160), ''), actor_profile_id)
  on conflict (calendar_date) do update
    set is_working_day = excluded.is_working_day,
        name_ka = excluded.name_ka,
        name_en = excluded.name_en,
        updated_at = now();
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'hr_calendar_day_set', 'hr_calendar_day', requested_date::text,
    jsonb_build_object('is_working_day', requested_is_working, 'name_ka', requested_name_ka));
  result_payload := jsonb_build_object('date', requested_date, 'is_working_day', requested_is_working);
  return public.hr_finish_operation(operation_key, result_payload);
end;
$$;

alter table public.hr_employment_profiles enable row level security;
alter table public.hr_employment_terms_history enable row level security;
alter table public.hr_calendar_days enable row level security;
alter table public.hr_attendance_entries enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_operations enable row level security;

create policy "staff read own employment" on public.hr_employment_profiles
  for select using (
    profile_id = auth.uid()
    and public.has_staff_role(array['owner', 'admin', 'catalog_manager', 'production_operator', 'support'])
  );
create policy "hr managers read employment" on public.hr_employment_profiles
  for select using (public.has_staff_role(array['owner', 'admin']));
create policy "staff read own employment history" on public.hr_employment_terms_history
  for select using (
    profile_id = auth.uid()
    and public.has_staff_role(array['owner', 'admin', 'catalog_manager', 'production_operator', 'support'])
  );
create policy "hr managers read employment history" on public.hr_employment_terms_history
  for select using (public.has_staff_role(array['owner', 'admin']));
create policy "staff read hr calendar" on public.hr_calendar_days
  for select using (public.has_staff_role(array['owner', 'admin', 'catalog_manager', 'production_operator', 'support']));
create policy "staff read own attendance" on public.hr_attendance_entries
  for select using (
    profile_id = auth.uid()
    and public.has_staff_role(array['owner', 'admin', 'catalog_manager', 'production_operator', 'support'])
  );
create policy "hr managers read attendance" on public.hr_attendance_entries
  for select using (public.has_staff_role(array['owner', 'admin']));
create policy "staff read own leave" on public.hr_leave_requests
  for select using (
    profile_id = auth.uid()
    and public.has_staff_role(array['owner', 'admin', 'catalog_manager', 'production_operator', 'support'])
  );
create policy "hr managers read leave" on public.hr_leave_requests
  for select using (public.has_staff_role(array['owner', 'admin']));

revoke all on public.hr_employment_profiles from public, anon, authenticated;
revoke all on public.hr_employment_terms_history from public, anon, authenticated;
revoke all on public.hr_calendar_days from public, anon, authenticated;
revoke all on public.hr_attendance_entries from public, anon, authenticated;
revoke all on public.hr_leave_requests from public, anon, authenticated;
revoke all on public.hr_operations from public, anon, authenticated;
grant select on public.hr_employment_profiles, public.hr_employment_terms_history, public.hr_calendar_days, public.hr_attendance_entries, public.hr_leave_requests to authenticated;
grant all on public.hr_employment_profiles, public.hr_employment_terms_history, public.hr_calendar_days, public.hr_attendance_entries, public.hr_leave_requests, public.hr_operations to service_role;

revoke all on function public.hr_actor_is_staff(uuid) from public, anon, authenticated;
revoke all on function public.hr_actor_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.hr_ensure_employment_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_claim_operation(uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.hr_finish_operation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.hr_clock_in(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_clock_out(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_correct_attendance(uuid, date, text, timestamptz, timestamptz, integer, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_request_leave(text, date, date, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_cancel_leave(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_review_leave(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_update_employment(uuid, text, text, text, uuid, date, text, smallint[], time, integer, integer, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hr_set_calendar_day(date, boolean, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.hr_clock_in(text, uuid, uuid) to service_role;
grant execute on function public.hr_clock_out(integer, uuid, uuid) to service_role;
grant execute on function public.hr_correct_attendance(uuid, date, text, timestamptz, timestamptz, integer, text, uuid, uuid) to service_role;
grant execute on function public.hr_request_leave(text, date, date, text, uuid, uuid) to service_role;
grant execute on function public.hr_cancel_leave(uuid, uuid, uuid) to service_role;
grant execute on function public.hr_review_leave(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.hr_update_employment(uuid, text, text, text, uuid, date, text, smallint[], time, integer, integer, numeric, uuid, uuid) to service_role;
grant execute on function public.hr_set_calendar_day(date, boolean, text, text, uuid, uuid) to service_role;

commit;
