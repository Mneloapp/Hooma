-- Private operator references and explicit customer color choices for manual products.

create table if not exists public.product_operator_references (
  product_id uuid primary key references public.products(id) on delete cascade,
  reference text not null check (char_length(trim(reference)) between 3 and 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_product_operator_references_updated_at on public.product_operator_references;
create trigger set_product_operator_references_updated_at
  before update on public.product_operator_references
  for each row execute function public.set_updated_at();

alter table public.product_operator_references enable row level security;

drop policy if exists "production staff read operator references" on public.product_operator_references;
create policy "production staff read operator references" on public.product_operator_references
  for select using (public.has_staff_role(array['owner', 'admin', 'production_operator']));

drop policy if exists "admins manage operator references" on public.product_operator_references;
create policy "admins manage operator references" on public.product_operator_references
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_operator_references from anon, authenticated;
grant select on public.product_operator_references to authenticated;

create or replace function public.create_manual_product_draft_v2(
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
  product_available_colors text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  new_product_id uuid;
  normalized_colors text[];
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin')
  ) then raise exception 'Only an active Admin or Owner may create Hooma products'; end if;

  if char_length(trim(operator_reference)) < 3 or char_length(trim(operator_reference)) > 2000 then
    raise exception 'Operator reference is required';
  end if;

  select array_agg(trim(color) order by position)
  into normalized_colors
  from unnest(product_available_colors) with ordinality as selected(color, position)
  where char_length(trim(color)) between 1 and 60;

  if coalesce(array_length(normalized_colors, 1), 0) < 1
    or array_length(normalized_colors, 1) > 20
    or array_length(normalized_colors, 1) <> (
      select count(distinct trim(value)) from unnest(normalized_colors) as distinct_color(value)
    ) then raise exception 'Between 1 and 20 unique colors are required'; end if;

  result := public.create_manual_product_draft(
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
    product_video_url
  );
  new_product_id := (result->>'id')::uuid;

  insert into public.product_operator_references (product_id, reference, created_by)
  values (new_product_id, trim(operator_reference), actor_profile_id);

  update public.product_variants
  set available_colors = normalized_colors
  where product_id = new_product_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'manual_product_operator_details_set',
    'product',
    new_product_id::text,
    jsonb_build_object(
      'operator_reference_present', true,
      'customer_color_count', array_length(normalized_colors, 1),
      'customer_colors', to_jsonb(normalized_colors)
    )
  );

  return result || jsonb_build_object('customer_colors', normalized_colors);
end;
$$;

revoke all on function public.create_manual_product_draft_v2(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_manual_product_draft_v2(uuid, text, text, text, uuid, uuid, uuid, numeric, integer, numeric, jsonb, text[], text, text, text[]) to service_role;
