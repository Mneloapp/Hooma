-- Keep existing catalog prices synchronized with saved material and production pricing settings.

create or replace function public.recalculate_catalog_product_prices(
  actor_profile_id uuid,
  requested_material_profile_id uuid default null,
  requested_pricing_profile_id uuid default null,
  requested_reason text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  estimate_record record;
  pricing_result jsonb;
  recalculated_count integer := 0;
  affected_product_count integer := 0;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin')
  ) then
    raise exception 'Active Owner or Admin access is required';
  end if;

  if requested_reason not in ('manual', 'material_cost_updated', 'pricing_profile_updated') then
    raise exception 'Invalid recalculation reason';
  end if;

  for estimate_record in
    select
      estimate.id,
      estimate.product_id,
      estimate.variant_id,
      estimate.material_profile_id,
      estimate.pricing_profile_id,
      estimate.material_grams,
      estimate.print_minutes,
      estimate.margin_percent,
      estimate.final_sale_price as previous_final_sale_price
    from public.product_cost_estimates estimate
    join public.material_cost_profiles material on material.id = estimate.material_profile_id and material.is_active = true
    join public.pricing_profiles pricing on pricing.id = estimate.pricing_profile_id
    where (requested_material_profile_id is null or estimate.material_profile_id = requested_material_profile_id)
      and (requested_pricing_profile_id is null or estimate.pricing_profile_id = requested_pricing_profile_id)
    order by estimate.id
    for update of estimate
  loop
    pricing_result := public.calculate_catalog_price(
      estimate_record.material_profile_id,
      estimate_record.pricing_profile_id,
      estimate_record.material_grams,
      estimate_record.print_minutes,
      estimate_record.margin_percent
    );

    update public.product_cost_estimates
    set material_cost = (pricing_result->>'material_cost')::numeric,
        machine_cost = (pricing_result->>'machine_cost')::numeric,
        labor_cost = (pricing_result->>'labor_cost')::numeric,
        packaging_cost = (pricing_result->>'packaging_cost')::numeric,
        overhead_cost = (pricing_result->>'overhead_cost')::numeric,
        failure_reserve_cost = (pricing_result->>'failure_reserve_cost')::numeric,
        production_cost = (pricing_result->>'production_cost')::numeric,
        sale_price_before_vat = (pricing_result->>'sale_price_before_vat')::numeric,
        final_sale_price = (pricing_result->>'final_sale_price')::numeric,
        calculation_snapshot = pricing_result || jsonb_build_object(
          'recalculated_at', now(),
          'recalculation_reason', requested_reason,
          'previous_final_sale_price', estimate_record.previous_final_sale_price
        ),
        calculated_by = actor_profile_id
    where id = estimate_record.id;

    update public.product_variants
    set price = nullif((pricing_result->>'final_sale_price')::numeric, 0),
        price_placeholder = 'ფასი დამტკიცებულია'
    where id = estimate_record.variant_id;

    recalculated_count := recalculated_count + 1;
  end loop;

  update public.products product
  set base_price = priced.minimum_price,
      price_placeholder = 'ფასი დამტკიცებულია'
  from (
    select estimate.product_id, min(estimate.final_sale_price) as minimum_price
    from public.product_cost_estimates estimate
    join public.product_variants variant on variant.id = estimate.variant_id and variant.is_active = true
    where estimate.product_id in (
      select touched.product_id
      from public.product_cost_estimates touched
      where (requested_material_profile_id is null or touched.material_profile_id = requested_material_profile_id)
        and (requested_pricing_profile_id is null or touched.pricing_profile_id = requested_pricing_profile_id)
    )
    group by estimate.product_id
  ) priced
  where product.id = priced.product_id;
  get diagnostics affected_product_count = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_prices_recalculated',
    'catalog',
    coalesce(requested_material_profile_id, requested_pricing_profile_id)::text,
    jsonb_build_object(
      'reason', requested_reason,
      'material_profile_id', requested_material_profile_id,
      'pricing_profile_id', requested_pricing_profile_id,
      'recalculated_variant_count', recalculated_count,
      'affected_product_count', affected_product_count,
      'margin_policy', 'preserve_product_margin'
    )
  );

  return jsonb_build_object(
    'recalculated_variant_count', recalculated_count,
    'affected_product_count', affected_product_count
  );
end;
$$;

create or replace function public.save_material_cost_profile_v2(
  requested_profile_id uuid,
  requested_cost_per_kg numeric,
  requested_waste_percent numeric,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_profile public.material_cost_profiles%rowtype;
  recalculation_result jsonb;
begin
  saved_profile := public.save_material_cost_profile(
    requested_profile_id,
    requested_cost_per_kg,
    requested_waste_percent,
    actor_profile_id
  );
  recalculation_result := public.recalculate_catalog_product_prices(
    actor_profile_id,
    saved_profile.id,
    null,
    'material_cost_updated'
  );
  return jsonb_build_object(
    'profile', to_jsonb(saved_profile),
    'recalculation', recalculation_result
  );
end;
$$;

create or replace function public.save_default_pricing_profile_v2(
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
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_profile public.pricing_profiles%rowtype;
  recalculation_result jsonb;
begin
  saved_profile := public.save_default_pricing_profile(
    requested_profile_id,
    requested_machine_hour_cost,
    requested_labor_cost_per_order,
    requested_packaging_cost,
    requested_overhead_percent,
    requested_failure_reserve_percent,
    requested_default_margin_percent,
    requested_vat_percent,
    requested_rounding_step,
    actor_profile_id
  );
  recalculation_result := public.recalculate_catalog_product_prices(
    actor_profile_id,
    null,
    saved_profile.id,
    'pricing_profile_updated'
  );
  return jsonb_build_object(
    'profile', to_jsonb(saved_profile),
    'recalculation', recalculation_result
  );
end;
$$;

revoke all on function public.recalculate_catalog_product_prices(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.recalculate_catalog_product_prices(uuid, uuid, uuid, text) to service_role;
revoke all on function public.save_material_cost_profile_v2(uuid, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_material_cost_profile_v2(uuid, numeric, numeric, uuid) to service_role;
revoke all on function public.save_default_pricing_profile_v2(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.save_default_pricing_profile_v2(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to service_role;
