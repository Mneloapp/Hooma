-- Hooma authentication hardening and staff role-based access control.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'catalog_manager', 'production_operator', 'support', 'customer'));

alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists last_login_at timestamptz;

create index if not exists idx_profiles_staff_active on public.profiles(role, is_active)
  where role <> 'customer';

create or replace function public.has_staff_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = any(allowed_roles)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_staff_role(array['owner', 'admin']);
$$;

revoke all on function public.has_staff_role(text[]) from public;
grant execute on function public.has_staff_role(text[]) to anon, authenticated, service_role;

-- A signed-in user may edit their contact details, but never their own role or active state.
create or replace function public.protect_profile_access_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (old.role is distinct from new.role
      or old.is_active is distinct from new.is_active
      or old.invited_by is distinct from new.invited_by)
    and coalesce(auth.role(), '') <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Profile access fields may only be changed by the trusted admin service';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_access_fields on public.profiles;
create trigger protect_profile_access_fields
  before update on public.profiles
  for each row execute function public.protect_profile_access_fields();

-- Role and access changes are transactional with their audit event.
create or replace function public.assign_staff_role(target_profile_id uuid, requested_role text, actor_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_record public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = actor_profile_id and role = 'owner' and is_active = true) then
    raise exception 'Only an active Owner may manage staff roles';
  end if;
  if requested_role not in ('admin', 'catalog_manager', 'production_operator', 'support') then
    raise exception 'Invalid assignable staff role';
  end if;
  select * into target_record from public.profiles where id = target_profile_id for update;
  if target_record.id is null or target_record.id = actor_profile_id or target_record.role = 'owner' then
    raise exception 'Protected profile cannot be changed';
  end if;

  update public.profiles
  set role = requested_role, is_active = true, invited_by = coalesce(invited_by, actor_profile_id)
  where id = target_profile_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'staff_role_assigned', 'profile', target_profile_id::text,
    jsonb_build_object('email', target_record.email, 'previous_role', target_record.role, 'new_role', requested_role));
end;
$$;

create or replace function public.set_staff_access(target_profile_id uuid, requested_active boolean, actor_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_record public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = actor_profile_id and role = 'owner' and is_active = true) then
    raise exception 'Only an active Owner may manage staff access';
  end if;
  select * into target_record from public.profiles where id = target_profile_id for update;
  if target_record.id is null or target_record.id = actor_profile_id or target_record.role = 'owner' or target_record.role = 'customer' then
    raise exception 'Protected profile cannot be changed';
  end if;

  update public.profiles set is_active = requested_active where id = target_profile_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, case when requested_active then 'staff_access_enabled' else 'staff_access_disabled' end,
    'profile', target_profile_id::text, jsonb_build_object('email', target_record.email, 'role', target_record.role));
end;
$$;

revoke all on function public.assign_staff_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.assign_staff_role(uuid, text, uuid) to service_role;
revoke all on function public.set_staff_access(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_staff_access(uuid, boolean, uuid) to service_role;

-- Catalog manager: catalog and source data only. Cost and pricing tables stay owner/admin-only.
create policy "catalog staff read categories" on public.categories
  for select using (public.has_staff_role(array['catalog_manager']));
create policy "catalog staff read products" on public.products
  for select using (public.has_staff_role(array['catalog_manager']));
create policy "catalog staff read variants" on public.product_variants
  for select using (public.has_staff_role(array['catalog_manager']));
create policy "catalog staff read sources" on public.product_sources
  for select using (public.has_staff_role(array['catalog_manager']));
create policy "catalog staff read imports" on public.source_imports
  for select using (public.has_staff_role(array['catalog_manager']));

-- Production operator: fulfillment data, printer queue and inventory; no pricing settings or team access.
create policy "production staff read products" on public.products
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read variants" on public.product_variants
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read inventory" on public.inventory
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read orders" on public.orders
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read order items" on public.order_items
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read printers" on public.printers
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read print jobs" on public.print_jobs
  for select using (public.has_staff_role(array['production_operator']));
create policy "production staff read order events" on public.order_events
  for select using (public.has_staff_role(array['production_operator']));

-- Support: customers, orders, tracking and custom quote conversations; no printer or cost access.
create policy "support staff read profiles" on public.profiles
  for select using (public.has_staff_role(array['support']));
create policy "support staff read customers" on public.customers
  for select using (public.has_staff_role(array['support']));
create policy "support staff read orders" on public.orders
  for select using (public.has_staff_role(array['support']));
create policy "support staff read order items" on public.order_items
  for select using (public.has_staff_role(array['support']));
create policy "support staff read order events" on public.order_events
  for select using (public.has_staff_role(array['support']));
create policy "support staff read custom quotes" on public.custom_quote_requests
  for select using (public.has_staff_role(array['support']));
create policy "support staff read custom quote files" on public.custom_quote_files
  for select using (public.has_staff_role(array['support']));

-- Sensitive pricing functions are callable only through trusted server code.
revoke all on function public.calculate_catalog_price(uuid, uuid, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.calculate_catalog_price(uuid, uuid, numeric, integer, numeric) to service_role;
revoke all on function public.create_product_draft_from_import(uuid, uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, integer, jsonb, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.create_product_draft_from_import(uuid, uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, integer, jsonb, text, text, boolean, boolean) to service_role;

-- Bootstrap the first Owner once, from the Supabase SQL editor, after that user signs up:
-- update public.profiles set role = 'owner' where email = 'CEO_EMAIL_HERE';
