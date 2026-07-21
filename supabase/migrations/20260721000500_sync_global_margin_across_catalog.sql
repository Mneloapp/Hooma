-- Make the default pricing margin authoritative for every catalog product.
-- The recalculation intentionally has no product-status filter: Draft, Active,
-- Archived, and any other catalog status are synchronized together.

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
  synchronize_default_margin boolean;
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

  if requested_reason not in (
    'manual',
    'material_cost_updated',
    'pricing_profile_updated',
    'global_margin_policy_migration'
  ) then
    raise exception 'Invalid recalculation reason';
  end if;

  synchronize_default_margin := requested_reason in (
    'pricing_profile_updated',
    'global_margin_policy_migration'
  );

  for estimate_record in
    select
      estimate.id,
      estimate.product_id,
      estimate.variant_id,
      estimate.material_profile_id,
      estimate.pricing_profile_id,
      estimate.material_grams,
      estimate.print_minutes,
      case
        when synchronize_default_margin then pricing.default_margin_percent
        else estimate.margin_percent
      end as applied_margin_percent,
      estimate.final_sale_price as previous_final_sale_price
    from public.product_cost_estimates estimate
    join public.material_cost_profiles material
      on material.id = estimate.material_profile_id
     and material.is_active = true
    join public.pricing_profiles pricing
      on pricing.id = estimate.pricing_profile_id
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
      estimate_record.applied_margin_percent
    );

    update public.product_cost_estimates
    set margin_percent = (pricing_result->>'margin_percent')::numeric,
        material_cost = (pricing_result->>'material_cost')::numeric,
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
          'previous_final_sale_price', estimate_record.previous_final_sale_price,
          'margin_policy', case
            when synchronize_default_margin then 'global_default_margin'
            else 'preserve_existing_margin'
          end
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
    join public.product_variants variant
      on variant.id = estimate.variant_id
     and variant.is_active = true
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
      'margin_policy', case
        when synchronize_default_margin then 'global_default_margin'
        else 'preserve_existing_margin'
      end
    )
  );

  return jsonb_build_object(
    'recalculated_variant_count', recalculated_count,
    'affected_product_count', affected_product_count
  );
end;
$$;

revoke all on function public.recalculate_catalog_product_prices(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.recalculate_catalog_product_prices(uuid, uuid, uuid, text)
  to service_role;

comment on function public.recalculate_catalog_product_prices(uuid, uuid, uuid, text) is
  'Recalculates catalog prices for every matching cost estimate regardless of product status. Pricing-profile saves synchronize every estimate to the profile default margin.';

-- Reconcile the existing catalog immediately to the currently saved default
-- margin. Future saves use the same function through save_default_pricing_profile_v2.
do $$
declare
  migration_actor_id uuid;
  default_pricing_profile_id uuid;
begin
  select profile.id
  into migration_actor_id
  from public.profiles profile
  where profile.is_active = true
    and profile.role in ('owner', 'admin')
  order by case when profile.role = 'owner' then 0 else 1 end, profile.id
  limit 1;

  select pricing.id
  into default_pricing_profile_id
  from public.pricing_profiles pricing
  where pricing.is_default = true
  limit 1;

  if migration_actor_id is not null and default_pricing_profile_id is not null then
    perform public.recalculate_catalog_product_prices(
      migration_actor_id,
      null,
      default_pricing_profile_id,
      'global_margin_policy_migration'
    );
  end if;
end;
$$;
