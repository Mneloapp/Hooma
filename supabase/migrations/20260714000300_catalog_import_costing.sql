-- Secure catalog ingestion and admin-only production costing.

alter table public.source_imports add column if not exists source_model_id text;
alter table public.source_imports add column if not exists source_title text;
alter table public.source_imports add column if not exists metadata_extracted_at timestamptz;

create unique index if not exists idx_source_imports_platform_url_unique
  on public.source_imports(platform, source_url);

create table if not exists public.material_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  cost_per_kg numeric(12,2) not null default 0 check (cost_per_kg >= 0),
  waste_percent numeric(5,2) not null default 0 check (waste_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  machine_hour_cost numeric(12,2) not null default 0 check (machine_hour_cost >= 0),
  labor_cost_per_order numeric(12,2) not null default 0 check (labor_cost_per_order >= 0),
  packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0),
  overhead_percent numeric(5,2) not null default 0 check (overhead_percent between 0 and 100),
  failure_reserve_percent numeric(5,2) not null default 0 check (failure_reserve_percent between 0 and 100),
  default_margin_percent numeric(5,2) not null default 0 check (default_margin_percent >= 0 and default_margin_percent < 100),
  vat_percent numeric(5,2) not null default 0 check (vat_percent between 0 and 100),
  rounding_step numeric(8,2) not null default 0.10 check (rounding_step > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_pricing_profiles_one_default
  on public.pricing_profiles(is_default) where is_default = true;

create table if not exists public.product_cost_estimates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  material_profile_id uuid not null references public.material_cost_profiles(id) on delete restrict,
  pricing_profile_id uuid not null references public.pricing_profiles(id) on delete restrict,
  material_grams numeric(10,2) not null check (material_grams > 0),
  print_minutes integer not null check (print_minutes > 0),
  margin_percent numeric(5,2) not null check (margin_percent >= 0 and margin_percent < 100),
  material_cost numeric(12,2) not null,
  machine_cost numeric(12,2) not null,
  labor_cost numeric(12,2) not null,
  packaging_cost numeric(12,2) not null,
  overhead_cost numeric(12,2) not null,
  failure_reserve_cost numeric(12,2) not null,
  production_cost numeric(12,2) not null,
  sale_price_before_vat numeric(12,2) not null,
  final_sale_price numeric(12,2) not null,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  calculated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(variant_id)
);

create index if not exists idx_product_cost_estimates_product on public.product_cost_estimates(product_id);

drop trigger if exists set_material_cost_profiles_updated_at on public.material_cost_profiles;
create trigger set_material_cost_profiles_updated_at before update on public.material_cost_profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_pricing_profiles_updated_at on public.pricing_profiles;
create trigger set_pricing_profiles_updated_at before update on public.pricing_profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_product_cost_estimates_updated_at on public.product_cost_estimates;
create trigger set_product_cost_estimates_updated_at before update on public.product_cost_estimates
for each row execute function public.set_updated_at();

alter table public.material_cost_profiles enable row level security;
alter table public.pricing_profiles enable row level security;
alter table public.product_cost_estimates enable row level security;

create policy "admins manage material costs" on public.material_cost_profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage pricing profiles" on public.pricing_profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage product cost estimates" on public.product_cost_estimates
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.material_cost_profiles (code, name)
values ('PLA+', 'PLA+'), ('PETG', 'PETG'), ('ASA', 'ASA'), ('TPU', 'TPU')
on conflict (code) do nothing;

insert into public.pricing_profiles (name, is_default)
values ('Hooma default', true)
on conflict (name) do nothing;

create or replace function public.calculate_catalog_price(
  requested_material_profile_id uuid,
  requested_pricing_profile_id uuid,
  requested_material_grams numeric,
  requested_print_minutes integer,
  requested_margin_percent numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  material_record public.material_cost_profiles%rowtype;
  pricing_record public.pricing_profiles%rowtype;
  applied_margin numeric(5,2);
  calculated_material numeric(12,2);
  calculated_machine numeric(12,2);
  calculated_direct numeric(12,2);
  calculated_overhead numeric(12,2);
  calculated_failure numeric(12,2);
  calculated_production numeric(12,2);
  calculated_before_vat numeric(12,2);
  calculated_final numeric(12,2);
begin
  if requested_material_grams <= 0 or requested_print_minutes <= 0 then
    raise exception 'Material grams and print minutes must be positive';
  end if;

  select * into material_record from public.material_cost_profiles
  where id = requested_material_profile_id and is_active = true;
  select * into pricing_record from public.pricing_profiles
  where id = requested_pricing_profile_id;
  if material_record.id is null or pricing_record.id is null then
    raise exception 'Active material and pricing profiles are required';
  end if;

  applied_margin := coalesce(requested_margin_percent, pricing_record.default_margin_percent);
  if applied_margin < 0 or applied_margin >= 100 then raise exception 'Margin must be between 0 and 99.99'; end if;

  calculated_material := round((requested_material_grams / 1000) * material_record.cost_per_kg * (1 + material_record.waste_percent / 100), 2);
  calculated_machine := round((requested_print_minutes / 60.0) * pricing_record.machine_hour_cost, 2);
  calculated_direct := calculated_material + calculated_machine + pricing_record.labor_cost_per_order + pricing_record.packaging_cost;
  calculated_overhead := round(calculated_direct * pricing_record.overhead_percent / 100, 2);
  calculated_failure := round((calculated_direct + calculated_overhead) * pricing_record.failure_reserve_percent / 100, 2);
  calculated_production := calculated_direct + calculated_overhead + calculated_failure;
  calculated_before_vat := case when applied_margin = 0 then calculated_production else round(calculated_production / (1 - applied_margin / 100), 2) end;
  calculated_final := ceil((calculated_before_vat * (1 + pricing_record.vat_percent / 100)) / pricing_record.rounding_step) * pricing_record.rounding_step;

  return jsonb_build_object(
    'material_cost', calculated_material,
    'machine_cost', calculated_machine,
    'labor_cost', pricing_record.labor_cost_per_order,
    'packaging_cost', pricing_record.packaging_cost,
    'overhead_cost', calculated_overhead,
    'failure_reserve_cost', calculated_failure,
    'production_cost', calculated_production,
    'margin_percent', applied_margin,
    'sale_price_before_vat', calculated_before_vat,
    'vat_percent', pricing_record.vat_percent,
    'final_sale_price', round(calculated_final, 2),
    'currency', 'GEL'
  );
end;
$$;

create or replace function public.enforce_product_publish_gate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' then
    if new.production_status <> 'approved' then raise exception 'Production approval is required'; end if;
    if not exists (
      select 1 from public.product_sources source
      where source.product_id = new.id
        and source.license_status in ('verified','not_required')
        and source.commercial_use_allowed is true
        and source.media_use_allowed is true
    ) then raise exception 'Verified commercial and media rights are required'; end if;
    if not exists (
      select 1 from public.product_variants variant
      where variant.product_id = new.id and variant.is_active = true and variant.price > 0
    ) then raise exception 'An active priced variant is required'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_products_publish_gate on public.products;
create trigger enforce_products_publish_gate before insert or update on public.products
for each row execute function public.enforce_product_publish_gate();

create or replace function public.create_product_draft_from_import(
  import_uuid uuid,
  actor_uuid uuid,
  product_name_en text,
  product_name_ka text,
  product_slug text,
  selected_category_id uuid,
  selected_material_profile_id uuid,
  selected_pricing_profile_id uuid,
  selected_material_grams numeric,
  selected_print_minutes integer,
  selected_margin_percent numeric,
  selected_plate_count integer,
  selected_dimensions jsonb,
  selected_license_name text,
  selected_license_url text,
  confirmed_commercial_use boolean,
  confirmed_media_use boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  import_record public.source_imports%rowtype;
  category_record public.categories%rowtype;
  material_record public.material_cost_profiles%rowtype;
  new_product_id uuid;
  new_variant_id uuid;
  pricing_result jsonb;
  image_list text[];
  hero_image_url text;
  resolved_license_status text;
begin
  select * into import_record from public.source_imports where id = import_uuid for update;
  if import_record.id is null then raise exception 'Import not found'; end if;
  if import_record.product_id is not null then return import_record.product_id; end if;
  select * into category_record from public.categories where id = selected_category_id and is_active = true;
  select * into material_record from public.material_cost_profiles where id = selected_material_profile_id and is_active = true;
  if category_record.id is null or material_record.id is null then raise exception 'Active category and material are required'; end if;
  if char_length(trim(product_name_en)) < 2 or char_length(trim(product_name_ka)) < 2 then raise exception 'Product names are required'; end if;
  if product_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid product slug'; end if;
  if selected_plate_count < 1 or selected_plate_count > 100 then raise exception 'Invalid plate count'; end if;
  if confirmed_commercial_use and confirmed_media_use
    and (nullif(trim(selected_license_name), '') is null or nullif(trim(selected_license_url), '') is null)
  then raise exception 'Verified rights require a license name and evidence URL'; end if;

  pricing_result := public.calculate_catalog_price(
    selected_material_profile_id, selected_pricing_profile_id,
    selected_material_grams, selected_print_minutes, selected_margin_percent
  );
  select coalesce(array_agg(image_url), '{}'::text[]) into image_list
  from jsonb_array_elements_text(coalesce(import_record.extracted_metadata->'images', '[]'::jsonb)) as extracted_images(image_url);
  hero_image_url := image_list[1];
  resolved_license_status := case when confirmed_commercial_use and confirmed_media_use then 'verified' else 'pending' end;

  insert into public.products (
    slug, original_model_code, original_name, hooma_name, name_ka, category,
    category_id, short_description, short_description_ka, hero_image, gallery_images,
    status, price_placeholder, delivery_estimate, currency, base_price,
    lead_time_business_days, estimated_print_minutes, material_grams, production_status
  ) values (
    product_slug, import_record.source_model_id, import_record.source_title,
    trim(product_name_en), trim(product_name_ka), category_record.name_en,
    category_record.id, coalesce(import_record.extracted_metadata->>'description', ''),
    coalesce(import_record.extracted_metadata->>'description', ''), hero_image_url, image_list,
    'draft', 'ფასი დამტკიცების შემდეგ', '3 სამუშაო დღე შეკვეთიდან მიწოდებამდე', 'GEL',
    nullif((pricing_result->>'final_sale_price')::numeric, 0), 3,
    selected_print_minutes, selected_material_grams, 'test_required'
  ) returning id into new_product_id;

  insert into public.product_variants (
    product_id, sku, size_label, layout_label, product_dimensions_cm, image, price,
    price_placeholder, available_colors, is_active, material, attributes,
    estimated_print_minutes, material_grams, plate_count
  ) values (
    new_product_id,
    'HOO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    'Standard', 'Imported draft', selected_dimensions, hero_image_url,
    nullif((pricing_result->>'final_sale_price')::numeric, 0), 'ფასი დამტკიცების შემდეგ',
    array['Warm white','Graphite','Sage','Sand','Terracotta'], true,
    material_record.code, jsonb_build_object('source_import_id', import_record.id),
    selected_print_minutes, selected_material_grams, selected_plate_count
  ) returning id into new_variant_id;

  insert into public.product_sources (
    product_id, platform, source_url, source_model_id, license_name, license_url,
    license_status, commercial_use_allowed, media_use_allowed, verified_by, verified_at
  ) values (
    new_product_id, import_record.platform, import_record.source_url, import_record.source_model_id,
    nullif(trim(selected_license_name), ''), nullif(trim(selected_license_url), ''),
    resolved_license_status, confirmed_commercial_use, confirmed_media_use,
    case when resolved_license_status = 'verified' then actor_uuid else null end,
    case when resolved_license_status = 'verified' then now() else null end
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
    (pricing_result->>'final_sale_price')::numeric, pricing_result, actor_uuid
  );

  update public.source_imports
  set status = 'approved', product_id = new_product_id, reviewed_by = actor_uuid, reviewed_at = now()
  where id = import_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_uuid, 'product_draft_created_from_import', 'product', new_product_id::text,
    jsonb_build_object('source_import_id', import_record.id, 'price', pricing_result->>'final_sale_price'));
  return new_product_id;
end;
$$;

revoke all on function public.calculate_catalog_price(uuid, uuid, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function public.calculate_catalog_price(uuid, uuid, numeric, integer, numeric) to service_role;
revoke all on function public.create_product_draft_from_import(uuid, uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, integer, jsonb, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.create_product_draft_from_import(uuid, uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, integer, jsonb, text, text, boolean, boolean) to service_role;
