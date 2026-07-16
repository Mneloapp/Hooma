-- Manual Hooma catalog entry with public product media.
-- Upload tokens are issued by trusted server code; no general INSERT policy is granted.

alter table public.products
  add column if not exists video_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff delete own product media" on storage.objects;
create policy "staff delete own product media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_admin()
  );

create or replace function public.create_manual_product_draft(
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
  product_video_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  category_record public.categories%rowtype;
  material_record public.material_cost_profiles%rowtype;
  pricing_result jsonb;
  new_product_id uuid;
  new_variant_id uuid;
  generated_sku text := 'HOO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin');
  if actor_role is null then raise exception 'Only an active Admin or Owner may create Hooma products'; end if;

  select * into category_record from public.categories where id = selected_category_id and is_active = true;
  select * into material_record from public.material_cost_profiles where id = selected_material_profile_id and is_active = true;
  if category_record.id is null or material_record.id is null then raise exception 'Active category and material are required'; end if;
  if char_length(trim(product_name)) < 2 or char_length(trim(product_name)) > 160 then raise exception 'Product name is required'; end if;
  if char_length(trim(product_description)) < 10 or char_length(trim(product_description)) > 3000 then raise exception 'Product description is required'; end if;
  if product_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid product slug'; end if;
  if selected_material_grams <= 0 or selected_print_minutes <= 0 then raise exception 'Material grams and print minutes must be positive'; end if;
  if selected_margin_percent < 0 or selected_margin_percent >= 100 then raise exception 'Invalid margin'; end if;
  if coalesce(array_length(product_image_urls, 1), 0) < 1 or array_length(product_image_urls, 1) > 12 then
    raise exception 'Between 1 and 12 product images are required';
  end if;
  if exists (
    select 1 from unnest(product_image_urls) image_url
    where image_url !~ '^https://[^/]+/storage/v1/object/public/product-media/'
  ) then raise exception 'Invalid product image URL'; end if;
  if product_video_url is not null
    and product_video_url !~ '^https://[^/]+/storage/v1/object/public/product-media/' then
    raise exception 'Invalid product video URL';
  end if;
  if jsonb_typeof(selected_dimensions) <> 'object'
    or coalesce((selected_dimensions->>'x')::numeric, 0) <= 0
    or coalesce((selected_dimensions->>'y')::numeric, 0) <= 0
    or coalesce((selected_dimensions->>'z')::numeric, 0) <= 0 then
    raise exception 'Valid product dimensions are required';
  end if;

  pricing_result := public.calculate_catalog_price(
    selected_material_profile_id,
    selected_pricing_profile_id,
    selected_material_grams,
    selected_print_minutes,
    selected_margin_percent
  );

  insert into public.products (
    slug, original_model_code, original_name, hooma_name, name_ka, category,
    category_id, short_description, short_description_ka, long_description,
    hero_image, gallery_images, video_url, status, price_placeholder,
    delivery_estimate, currency, base_price, lead_time_business_days,
    estimated_print_minutes, material_grams, production_status
  ) values (
    product_slug, generated_sku, trim(product_name), trim(product_name), trim(product_name), category_record.name_en,
    category_record.id, trim(product_description), trim(product_description), trim(product_description),
    product_image_urls[1], product_image_urls, product_video_url, 'draft', 'ფასი დამტკიცებულია',
    '3 სამუშაო დღე შეკვეთიდან მიწოდებამდე', 'GEL',
    nullif((pricing_result->>'final_sale_price')::numeric, 0), 3,
    selected_print_minutes, selected_material_grams, 'test_required'
  ) returning id into new_product_id;

  insert into public.product_variants (
    product_id, sku, size_label, layout_label, product_dimensions_cm, image, price,
    price_placeholder, available_colors, is_active, material, attributes,
    estimated_print_minutes, material_grams, plate_count
  ) values (
    new_product_id, generated_sku, 'Standard', 'Hooma manual draft', selected_dimensions,
    product_image_urls[1], nullif((pricing_result->>'final_sale_price')::numeric, 0),
    'ფასი დამტკიცებულია', array['Warm white','Graphite','Sage','Sand','Terracotta'],
    true, material_record.code, jsonb_build_object('catalog_source', 'hooma', 'entry_mode', 'manual'),
    selected_print_minutes, selected_material_grams, 1
  ) returning id into new_variant_id;

  insert into public.product_sources (
    product_id, platform, source_url, source_model_id, creator_name,
    license_status, commercial_use_allowed, media_use_allowed, verified_by, verified_at
  ) values (
    new_product_id, 'hooma', 'https://hooma.ge/product/' || product_slug,
    generated_sku, 'Hooma', 'not_required', true, true, actor_profile_id, now()
  );

  insert into public.product_cost_estimates (
    product_id, variant_id, material_profile_id, pricing_profile_id,
    material_grams, print_minutes, margin_percent, material_cost, machine_cost,
    labor_cost, packaging_cost, overhead_cost, failure_reserve_cost, production_cost,
    sale_price_before_vat, final_sale_price, calculation_snapshot, calculated_by
  ) values (
    new_product_id, new_variant_id, selected_material_profile_id, selected_pricing_profile_id,
    selected_material_grams, selected_print_minutes, (pricing_result->>'margin_percent')::numeric,
    (pricing_result->>'material_cost')::numeric, (pricing_result->>'machine_cost')::numeric,
    (pricing_result->>'labor_cost')::numeric, (pricing_result->>'packaging_cost')::numeric,
    (pricing_result->>'overhead_cost')::numeric, (pricing_result->>'failure_reserve_cost')::numeric,
    (pricing_result->>'production_cost')::numeric, (pricing_result->>'sale_price_before_vat')::numeric,
    (pricing_result->>'final_sale_price')::numeric, pricing_result, actor_profile_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_product_draft_created',
    'product',
    new_product_id::text,
    jsonb_build_object(
      'actor_role', actor_role,
      'source', 'hooma',
      'entry_mode', 'manual',
      'sku', generated_sku,
      'image_count', array_length(product_image_urls, 1),
      'has_video', product_video_url is not null,
      'price', pricing_result->>'final_sale_price'
    )
  );

  return jsonb_build_object('id', new_product_id, 'sku', generated_sku, 'slug', product_slug);
end;
$$;

revoke all on function public.create_manual_product_draft(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text) from public, anon, authenticated;
grant execute on function public.create_manual_product_draft(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text) to service_role;
