-- Distinguish customer-selectable single colors from one fixed AMS color composition.

create or replace function public.create_manual_product_draft_v3(
  actor_profile_id uuid,
  product_name text,
  product_slug text,
  product_description text,
  selected_category_id uuid,
  selected_material_profile_id uuid,
  selected_pricing_profile_id uuid,
  selected_material_grams numeric,
  selected_print_minutes integer,
  selected_margin_percent numeric,
  selected_dimensions jsonb,
  product_image_urls text[],
  product_video_url text,
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
  result jsonb;
  new_product_id uuid;
  selected_palette text[];
  customer_colors text[];
  is_ams boolean;
begin
  if product_color_mode not in ('customer_choice', 'fixed_multicolor') then
    raise exception 'Invalid product color mode';
  end if;

  selected_palette := array(
    select trim(color)
    from unnest(product_available_colors) with ordinality as selected(color, position)
    where char_length(trim(color)) between 1 and 60
    order by position
  );
  is_ams := product_color_mode = 'fixed_multicolor';

  if coalesce(array_length(selected_palette, 1), 0) < (case when is_ams then 2 else 1 end) then
    raise exception 'AMS products require at least two colors';
  end if;

  result := public.create_manual_product_draft_v2(
    actor_profile_id,
    product_name,
    product_slug,
    product_description,
    selected_category_id,
    selected_material_profile_id,
    selected_pricing_profile_id,
    selected_material_grams,
    selected_print_minutes,
    selected_margin_percent,
    selected_dimensions,
    product_image_urls,
    product_video_url,
    operator_reference,
    selected_palette
  );
  new_product_id := (result->>'id')::uuid;
  customer_colors := case
    when is_ams then array['მრავალფერიანი — როგორც ფოტოზე']::text[]
    else selected_palette
  end;

  update public.product_variants
  set available_colors = customer_colors,
      attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object(
        'color_mode', product_color_mode,
        'ams_required', is_ams,
        'fixed_color_palette', case when is_ams then to_jsonb(selected_palette) else '[]'::jsonb end
      )
  where product_id = new_product_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_product_color_mode_set',
    'product',
    new_product_id::text,
    jsonb_build_object(
      'color_mode', product_color_mode,
      'ams_required', is_ams,
      'palette', to_jsonb(selected_palette),
      'customer_colors', to_jsonb(customer_colors)
    )
  );

  return result || jsonb_build_object(
    'color_mode', product_color_mode,
    'ams_required', is_ams,
    'fixed_color_palette', selected_palette,
    'customer_colors', customer_colors
  );
end;
$$;

revoke all on function public.create_manual_product_draft_v3(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text, text, text[], text) from public, anon, authenticated;
grant execute on function public.create_manual_product_draft_v3(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text, text, text[], text) to service_role;
