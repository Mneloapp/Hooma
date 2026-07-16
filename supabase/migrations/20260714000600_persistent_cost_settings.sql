-- Persist global production pricing and per-material costs with transactional audit history.

create or replace function public.save_material_cost_profile(
  requested_profile_id uuid,
  requested_cost_per_kg numeric,
  requested_waste_percent numeric,
  actor_profile_id uuid
)
returns public.material_cost_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_profile public.material_cost_profiles%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role in ('owner', 'admin')
  ) then
    raise exception 'Active Owner or Admin access is required';
  end if;
  if requested_cost_per_kg is null or requested_cost_per_kg < 0 or requested_cost_per_kg > 100000 then
    raise exception 'Material cost is outside the allowed range';
  end if;
  if requested_waste_percent is null or requested_waste_percent < 0 or requested_waste_percent > 100 then
    raise exception 'Material waste is outside the allowed range';
  end if;

  update public.material_cost_profiles
  set cost_per_kg = requested_cost_per_kg,
      waste_percent = requested_waste_percent
  where id = requested_profile_id and is_active = true
  returning * into saved_profile;

  if saved_profile.id is null then raise exception 'Active material profile was not found'; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'material_cost_updated',
    'material_cost_profile',
    saved_profile.id::text,
    jsonb_build_object(
      'code', saved_profile.code,
      'cost_per_kg', saved_profile.cost_per_kg,
      'waste_percent', saved_profile.waste_percent
    )
  );

  return saved_profile;
end;
$$;

create or replace function public.save_default_pricing_profile(
  requested_profile_id uuid,
  requested_machine_hour_cost numeric,
  requested_labor_cost_per_order numeric,
  requested_packaging_cost numeric,
  requested_overhead_percent numeric,
  requested_failure_reserve_percent numeric,
  requested_default_margin_percent numeric,
  requested_vat_percent numeric,
  requested_rounding_step numeric,
  actor_profile_id uuid
)
returns public.pricing_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_profile public.pricing_profiles%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and is_active = true and role in ('owner', 'admin')
  ) then
    raise exception 'Active Owner or Admin access is required';
  end if;
  if requested_machine_hour_cost is null or requested_machine_hour_cost < 0 or requested_machine_hour_cost > 100000
      or requested_labor_cost_per_order is null or requested_labor_cost_per_order < 0 or requested_labor_cost_per_order > 100000
      or requested_packaging_cost is null or requested_packaging_cost < 0 or requested_packaging_cost > 100000 then
    raise exception 'Fixed production cost is outside the allowed range';
  end if;
  if requested_overhead_percent is null or requested_overhead_percent < 0 or requested_overhead_percent > 100
      or requested_failure_reserve_percent is null or requested_failure_reserve_percent < 0 or requested_failure_reserve_percent > 100
      or requested_vat_percent is null or requested_vat_percent < 0 or requested_vat_percent > 100 then
    raise exception 'Pricing percentage is outside the allowed range';
  end if;
  if requested_default_margin_percent is null or requested_default_margin_percent < 0 or requested_default_margin_percent >= 100 then
    raise exception 'Margin is outside the allowed range';
  end if;
  if requested_rounding_step is null or requested_rounding_step < 0.01 or requested_rounding_step > 1000 then
    raise exception 'Rounding step is outside the allowed range';
  end if;

  update public.pricing_profiles
  set machine_hour_cost = requested_machine_hour_cost,
      labor_cost_per_order = requested_labor_cost_per_order,
      packaging_cost = requested_packaging_cost,
      overhead_percent = requested_overhead_percent,
      failure_reserve_percent = requested_failure_reserve_percent,
      default_margin_percent = requested_default_margin_percent,
      vat_percent = requested_vat_percent,
      rounding_step = requested_rounding_step
  where id = requested_profile_id and is_default = true
  returning * into saved_profile;

  if saved_profile.id is null then raise exception 'Default pricing profile was not found'; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'pricing_profile_updated',
    'pricing_profile',
    saved_profile.id::text,
    jsonb_build_object(
      'machine_hour_cost', saved_profile.machine_hour_cost,
      'labor_cost_per_order', saved_profile.labor_cost_per_order,
      'packaging_cost', saved_profile.packaging_cost,
      'overhead_percent', saved_profile.overhead_percent,
      'failure_reserve_percent', saved_profile.failure_reserve_percent,
      'default_margin_percent', saved_profile.default_margin_percent,
      'vat_percent', saved_profile.vat_percent,
      'rounding_step', saved_profile.rounding_step
    )
  );

  return saved_profile;
end;
$$;

revoke all on function public.save_material_cost_profile(uuid, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_material_cost_profile(uuid, numeric, numeric, uuid) to service_role;
revoke all on function public.save_default_pricing_profile(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_default_pricing_profile(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to service_role;
