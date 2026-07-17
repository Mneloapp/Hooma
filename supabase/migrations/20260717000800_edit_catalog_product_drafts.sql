-- Allow catalog staff to correct all Clipper-provided Draft metadata before publication.

create or replace function public.update_catalog_product_draft_v1(
  actor_profile_id uuid,
  requested_product_id uuid,
  product_name text,
  product_description text,
  selected_category_id uuid,
  selected_material_profile_id uuid,
  selected_pricing_profile_id uuid,
  selected_material_grams numeric,
  selected_print_minutes integer,
  selected_margin_percent numeric,
  operator_reference text,
  product_available_colors text[],
  product_color_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
  category_record public.categories%rowtype;
  material_record public.material_cost_profiles%rowtype;
  variant_record public.product_variants%rowtype;
  pricing_result jsonb;
  selected_palette text[];
  customer_colors text[];
  is_ams boolean;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  select * into product_record from public.products
  where id = requested_product_id for update;
  if product_record.id is null then raise exception 'Product not found'; end if;
  if product_record.status <> 'draft' then raise exception 'Only Draft products can be edited'; end if;

  if char_length(trim(product_name)) < 2 or char_length(trim(product_name)) > 160 then
    raise exception 'Invalid product name';
  end if;
  if char_length(trim(product_description)) < 10 or char_length(trim(product_description)) > 3000 then
    raise exception 'Invalid product description';
  end if;
  if char_length(trim(operator_reference)) < 3 or char_length(trim(operator_reference)) > 2000 then
    raise exception 'Invalid operator reference';
  end if;
  if selected_material_grams <= 0 or selected_print_minutes <= 0 then
    raise exception 'Material grams and print minutes must be positive';
  end if;
  if selected_margin_percent < 0 or selected_margin_percent >= 100 then
    raise exception 'Invalid margin';
  end if;
  if product_color_mode not in ('customer_choice', 'fixed_multicolor') then
    raise exception 'Invalid product color mode';
  end if;

  select * into category_record from public.categories
  where id = selected_category_id and is_active = true;
  select * into material_record from public.material_cost_profiles
  where id = selected_material_profile_id and is_active = true;
  if category_record.id is null or material_record.id is null then
    raise exception 'Active category and material are required';
  end if;

  select * into variant_record from public.product_variants
  where product_id = requested_product_id
  order by created_at
  limit 1
  for update;
  if variant_record.id is null then raise exception 'Product variant not found'; end if;

  selected_palette := array(
    select distinct trim(color)
    from unnest(product_available_colors) with ordinality as selected(color, position)
    where char_length(trim(color)) between 1 and 60
    order by trim(color)
  );
  is_ams := product_color_mode = 'fixed_multicolor';
  if coalesce(array_length(selected_palette, 1), 0) < (case when is_ams then 2 else 1 end) then
    raise exception 'Invalid product colors';
  end if;
  customer_colors := case
    when is_ams then array['მრავალფერიანი — როგორც ფოტოზე']::text[]
    else selected_palette
  end;

  pricing_result := public.calculate_catalog_price(
    selected_material_profile_id,
    selected_pricing_profile_id,
    selected_material_grams,
    selected_print_minutes,
    selected_margin_percent
  );

  update public.products
  set hooma_name = trim(product_name),
      name_ka = trim(product_name),
      short_description = trim(product_description),
      short_description_ka = trim(product_description),
      category = category_record.name_en,
      category_id = category_record.id,
      base_price = nullif((pricing_result->>'final_sale_price')::numeric, 0),
      price_placeholder = 'ფასი დამტკიცებულია',
      estimated_print_minutes = selected_print_minutes,
      material_grams = selected_material_grams
  where id = requested_product_id;

  update public.product_variants
  set material = material_record.code,
      price = nullif((pricing_result->>'final_sale_price')::numeric, 0),
      price_placeholder = 'ფასი დამტკიცებულია',
      available_colors = customer_colors,
      estimated_print_minutes = selected_print_minutes,
      material_grams = selected_material_grams,
      attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object(
        'color_mode', product_color_mode,
        'ams_required', is_ams,
        'fixed_color_palette', case when is_ams then to_jsonb(selected_palette) else '[]'::jsonb end
      )
  where id = variant_record.id;

  insert into public.product_cost_estimates (
    product_id, variant_id, material_profile_id, pricing_profile_id,
    material_grams, print_minutes, margin_percent, material_cost, machine_cost,
    labor_cost, packaging_cost, overhead_cost, failure_reserve_cost, production_cost,
    sale_price_before_vat, final_sale_price, calculation_snapshot, calculated_by
  ) values (
    requested_product_id, variant_record.id, selected_material_profile_id, selected_pricing_profile_id,
    selected_material_grams, selected_print_minutes, (pricing_result->>'margin_percent')::numeric,
    (pricing_result->>'material_cost')::numeric, (pricing_result->>'machine_cost')::numeric,
    (pricing_result->>'labor_cost')::numeric, (pricing_result->>'packaging_cost')::numeric,
    (pricing_result->>'overhead_cost')::numeric, (pricing_result->>'failure_reserve_cost')::numeric,
    (pricing_result->>'production_cost')::numeric, (pricing_result->>'sale_price_before_vat')::numeric,
    (pricing_result->>'final_sale_price')::numeric, pricing_result, actor_profile_id
  )
  on conflict (variant_id) do update
  set material_profile_id = excluded.material_profile_id,
      pricing_profile_id = excluded.pricing_profile_id,
      material_grams = excluded.material_grams,
      print_minutes = excluded.print_minutes,
      margin_percent = excluded.margin_percent,
      material_cost = excluded.material_cost,
      machine_cost = excluded.machine_cost,
      labor_cost = excluded.labor_cost,
      packaging_cost = excluded.packaging_cost,
      overhead_cost = excluded.overhead_cost,
      failure_reserve_cost = excluded.failure_reserve_cost,
      production_cost = excluded.production_cost,
      sale_price_before_vat = excluded.sale_price_before_vat,
      final_sale_price = excluded.final_sale_price,
      calculation_snapshot = excluded.calculation_snapshot,
      calculated_by = excluded.calculated_by;

  insert into public.product_operator_references (product_id, reference, created_by)
  values (requested_product_id, trim(operator_reference), actor_profile_id)
  on conflict (product_id) do update set reference = excluded.reference;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_product_draft_updated',
    'product',
    requested_product_id::text,
    jsonb_build_object(
      'category_id', selected_category_id,
      'material_profile_id', selected_material_profile_id,
      'material_grams', selected_material_grams,
      'print_minutes', selected_print_minutes,
      'margin_percent', selected_margin_percent,
      'color_mode', product_color_mode,
      'colors', to_jsonb(selected_palette),
      'final_sale_price', pricing_result->>'final_sale_price'
    )
  );

  return jsonb_build_object(
    'id', requested_product_id,
    'final_sale_price', (pricing_result->>'final_sale_price')::numeric,
    'production_cost', (pricing_result->>'production_cost')::numeric
  );
end;
$$;

revoke all on function public.update_catalog_product_draft_v1(uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric, text, text[], text) from public, anon, authenticated;
grant execute on function public.update_catalog_product_draft_v1(uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric, text, text[], text) to service_role;
