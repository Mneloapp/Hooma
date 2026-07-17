-- Catalog Clipper exports marginPercent as null. JavaScript previously coerced
-- that null to zero, so imported Drafts skipped Hooma's default profit margin.

do $$
declare
  estimate_record record;
  pricing_result jsonb;
begin
  for estimate_record in
    select
      estimate.id,
      estimate.product_id,
      estimate.variant_id,
      estimate.material_profile_id,
      estimate.pricing_profile_id,
      estimate.material_grams,
      estimate.print_minutes,
      pricing.default_margin_percent
    from public.product_cost_estimates estimate
    join public.product_variants variant on variant.id = estimate.variant_id
    join public.pricing_profiles pricing on pricing.id = estimate.pricing_profile_id
    where estimate.margin_percent = 0
      and variant.attributes ? 'catalog_agent_id'
  loop
    pricing_result := public.calculate_catalog_price(
      estimate_record.material_profile_id,
      estimate_record.pricing_profile_id,
      estimate_record.material_grams,
      estimate_record.print_minutes,
      estimate_record.default_margin_percent
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
          'recalculation_reason', 'catalog_agent_null_margin_repair'
        )
    where id = estimate_record.id;

    update public.product_variants
    set price = nullif((pricing_result->>'final_sale_price')::numeric, 0),
        price_placeholder = 'ფასი დამტკიცებულია'
    where id = estimate_record.variant_id;

    update public.products
    set base_price = nullif((pricing_result->>'final_sale_price')::numeric, 0),
        price_placeholder = 'ფასი დამტკიცებულია'
    where id = estimate_record.product_id;
  end loop;
end;
$$;
