-- Let a catalog reviewer approve copy, media, colors, and AMS mode atomically.

create or replace function public.apply_catalog_product_audit_item_v4(
  actor_profile_id uuid,
  requested_item_id uuid,
  requested_kept_image_urls text[],
  requested_name_ka text,
  requested_name_en text,
  requested_description_ka text,
  requested_description_en text,
  requested_available_colors text[],
  requested_color_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $catalog_audit_v4$
declare
  audit_item public.catalog_product_audit_items%rowtype;
  variant_id uuid;
  requested_product_id uuid;
  selected_color text;
  validated_colors text[] := '{}'::text[];
  application_result jsonb;
  effective_overrides jsonb;
  applied_log_id bigint;
begin
  if requested_color_mode is null
    or (requested_color_mode <> 'customer_choice' and requested_color_mode <> 'fixed_multicolor') then
    raise exception 'Catalog audit color mode is invalid';
  end if;

  if requested_available_colors is null then
    raise exception 'Catalog audit colors are required';
  end if;

  foreach selected_color in array requested_available_colors loop
    if selected_color is null
      or selected_color not in (
        'თეთრი', 'შავი', 'ნაცრისფერი', 'ბეჟი', 'წითელი', 'ლურჯი',
        'მწვანე', 'ყვითელი', 'ნარინჯისფერი', 'იისფერი', 'ვარდისფერი', 'ყავისფერი'
      ) then
      raise exception 'Catalog audit color is invalid';
    end if;
    if array_position(validated_colors, selected_color) is not null then
      raise exception 'Catalog audit colors must be unique';
    end if;
    validated_colors := array_append(validated_colors, selected_color);
  end loop;

  if cardinality(validated_colors) > 12
    or (requested_color_mode = 'customer_choice' and cardinality(validated_colors) < 1)
    or (requested_color_mode = 'fixed_multicolor' and cardinality(validated_colors) < 2) then
    raise exception 'Catalog audit color count is invalid';
  end if;

  select * into audit_item
  from public.catalog_product_audit_items item
  where item.id = requested_item_id;
  if audit_item.id is null then raise exception 'Catalog audit item not found'; end if;

  variant_id := nullif(audit_item.current_snapshot->>'variant_id', '')::uuid;
  requested_product_id := audit_item.product_id;

  application_result := public.apply_catalog_product_audit_item_v3(
    actor_profile_id,
    requested_item_id,
    requested_kept_image_urls,
    requested_name_ka,
    requested_name_en,
    requested_description_ka,
    requested_description_en
  );

  if coalesce((application_result->>'already_applied')::boolean, false) then
    return application_result;
  end if;

  update public.product_variants
  set available_colors = requested_available_colors,
      attributes = case
        when requested_color_mode = 'fixed_multicolor' then
          (coalesce(attributes, '{}'::jsonb) - 'ams_required' - 'color_mode' - 'fixed_color_palette')
          || jsonb_build_object(
            'ams_required', true,
            'color_mode', 'fixed_multicolor',
            'fixed_color_palette', to_jsonb(requested_available_colors)
          )
        else
          (coalesce(attributes, '{}'::jsonb) - 'ams_required' - 'color_mode' - 'fixed_color_palette')
          || jsonb_build_object(
            'ams_required', false,
            'color_mode', 'customer_choice'
          )
      end
  where id = variant_id
    and product_id = requested_product_id;
  if not found then raise exception 'Catalog audit product variant not found'; end if;

  update public.catalog_product_audit_items
  set review_overrides = coalesce(review_overrides, '{}'::jsonb) || jsonb_build_object(
        'manual_color_override', true,
        'color_mode', requested_color_mode,
        'available_colors', to_jsonb(requested_available_colors)
      )
  where id = requested_item_id
  returning review_overrides into effective_overrides;

  select log.id into applied_log_id
  from public.audit_log log
  where log.action = 'catalog_product_audit_applied'
    and log.entity_type = 'product'
    and log.entity_id = requested_product_id::text
    and log.metadata->>'audit_item_id' = requested_item_id::text
  order by log.id desc
  limit 1
  for update;

  if applied_log_id is not null then
    update public.audit_log
    set metadata = metadata || jsonb_build_object('review_overrides', effective_overrides)
    where id = applied_log_id;
  end if;

  return application_result || jsonb_build_object(
    'color_mode', requested_color_mode,
    'available_colors', to_jsonb(requested_available_colors)
  );
end;
$catalog_audit_v4$;

revoke all on function public.apply_catalog_product_audit_item_v4(
  uuid, uuid, text[], text, text, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.apply_catalog_product_audit_item_v4(
  uuid, uuid, text[], text, text, text, text, text[], text
) to service_role;
