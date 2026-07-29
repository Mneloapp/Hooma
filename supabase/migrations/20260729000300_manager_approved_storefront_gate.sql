-- Manager-approved storefront launch gate.
--
-- catalog_audit_completed_at only means that AI returned a valid suggestion.
-- catalog_audit_applied_at means a manager reviewed and atomically applied the
-- corrected copy/media/dimensions. Customer-facing access therefore uses the
-- applied marker, while admin preview and historical order snapshots remain
-- available through their existing privileged paths.

create or replace function public.enforce_storefront_card_manager_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and product.catalog_audit_applied_at is not null
  ) then
    -- During this migration, legacy sync triggers may still call the unguarded
    -- card builder while inconsistent audit markers are being normalized.
    -- Skip those writes now; the guarded refresh wrapper installed below
    -- deletes stale rows and this function is hardened again afterward.
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_storefront_card_manager_audit_v1()
  from public, anon, authenticated;

drop trigger if exists enforce_storefront_card_manager_audit
  on public.storefront_product_cards;
create trigger enforce_storefront_card_manager_audit
before insert or update on public.storefront_product_cards
for each row execute function public.enforce_storefront_card_manager_audit_v1();

-- Refresh on the marker itself as well as on copy/media/status changes.
drop trigger if exists sync_storefront_card_product on public.products;
create trigger sync_storefront_card_product
after insert or update of slug, hooma_name, name_ka, category_id, short_description, short_description_ka,
  hero_image, tags, is_featured, status, price_placeholder, base_price, sale_price,
  lead_time_business_days, production_status, created_at,
  catalog_audit_applied_at, catalog_audit_applied_item_id
  or delete
on public.products
for each row execute function public.sync_storefront_card_from_product_v1();

-- Remove every stale public card first. Rebuild approved products through the
-- existing license/status/production/price eligibility function.
delete from public.storefront_product_cards card
where not exists (
  select 1
  from public.products product
  where product.id = card.product_id
    and product.catalog_audit_applied_at is not null
);

select public.refresh_storefront_product_card_v1(product.id)
from public.products product
where product.catalog_audit_applied_at is not null;

create or replace function public.is_storefront_product_visible_v1(
  requested_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.storefront_product_cards card
    where card.product_id = requested_product_id
  );
$$;

revoke all on function public.is_storefront_product_visible_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.is_storefront_product_visible_v1(uuid)
  to anon, authenticated, service_role;

-- A manager-approved audit is required for every new publication transition.
-- Existing active rows are not status-mutated; the read model above hides them
-- until their audit is approved.
create or replace function public.require_manager_audit_before_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active'
    and new.catalog_audit_applied_at is null then
    if tg_op = 'INSERT' then
      raise exception 'A manager-approved catalog audit is required before publication';
    end if;
    if tg_op = 'UPDATE'
      and old.status is distinct from 'active' then
      raise exception 'A manager-approved catalog audit is required before publication';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.require_manager_audit_before_publication_v1()
  from public, anon, authenticated;

drop trigger if exists require_manager_audit_before_publication
  on public.products;
create trigger require_manager_audit_before_publication
before insert or update of status on public.products
for each row execute function public.require_manager_audit_before_publication_v1();

-- Direct Supabase reads must match the canonical storefront read model.
drop policy if exists "public can read active products" on public.products;
create policy "public can read active products" on public.products
  for select using (
    public.is_storefront_product_visible_v1(id)
    or public.is_admin()
  );

drop policy if exists "public can read active variants" on public.product_variants;
create policy "public can read active variants" on public.product_variants
  for select using (
    (
      is_active = true
      and public.is_storefront_product_visible_v1(product_id)
    )
    or public.is_admin()
  );

drop policy if exists "public can read inventory availability" on public.inventory;
create policy "public can read inventory availability" on public.inventory
  for select using (
    public.is_storefront_product_visible_v1(product_id)
    or public.is_admin()
  );

drop policy if exists "public reads current daily deal items" on public.daily_deal_items;
create policy "public reads current daily deal items" on public.daily_deal_items
  for select using (
    (
      deal_date = (now() at time zone 'Asia/Tbilisi')::date
      and public.is_storefront_product_visible_v1(product_id)
    )
    or public.is_admin()
  );

drop policy if exists "public reads published product reviews" on public.product_reviews;
create policy "public reads published product reviews" on public.product_reviews
  for select using (
    (
      status = 'published'
      and public.is_storefront_product_visible_v1(product_id)
    )
    or profile_id = auth.uid()
    or public.is_admin()
  );

create or replace view public.product_public_reviews
with (security_barrier = true)
as
select
  review.id,
  review.product_id,
  review.rating,
  review.comment,
  coalesce(nullif(split_part(trim(profile.full_name), ' ', 1), ''), 'Hooma მომხმარებელი') as reviewer_name,
  review.verified_purchase,
  review.created_at,
  review.updated_at
from public.product_reviews review
join public.profiles profile on profile.id = review.profile_id
where review.status = 'published'
  and public.is_storefront_product_visible_v1(review.product_id);

revoke all on public.product_public_reviews from public, anon, authenticated;
grant select on public.product_public_reviews to anon, authenticated;

create or replace view public.product_public_metrics
with (security_barrier = true)
as
with review_stats as (
  select
    review.product_id,
    count(*)::integer as rating_count,
    sum(review.rating)::numeric as rating_sum,
    avg(review.rating)::numeric as average_rating
  from public.product_reviews review
  where review.status = 'published'
  group by review.product_id
),
sales_stats as (
  select
    item.product_id,
    coalesce(sum(item.quantity), 0)::integer as sold_quantity
  from public.order_items item
  join public.orders customer_order on customer_order.id = item.order_id
  where item.product_id is not null
    and customer_order.payment_status = 'paid'
    and customer_order.status <> 'cancelled'
    and customer_order.fulfillment_status <> 'cancelled'
    and customer_order.test_mode = false
  group by item.product_id
)
select
  product.id as product_id,
  round(coalesce(review.average_rating, 0), 2) as average_rating,
  coalesce(review.rating_count, 0)::integer as rating_count,
  coalesce(review.rating_count, 0)::integer as review_count,
  coalesce(sales.sold_quantity, 0)::integer as sold_quantity,
  round((
    (((coalesce(review.rating_sum, 0) + 19.0) / (coalesce(review.rating_count, 0) + 5.0)) - 3.0) * 2.5
    + ln(1 + coalesce(sales.sold_quantity, 0)) * 3.0
    + ln(1 + coalesce(review.rating_count, 0)) * 1.25
    + case when product.is_featured then 0.75 else 0 end
    + greatest(0, 1 - extract(epoch from (now() - product.created_at)) / 7776000.0) * 0.5
  )::numeric, 4) as popularity_score
from public.products product
left join review_stats review on review.product_id = product.id
left join sales_stats sales on sales.product_id = product.id
where public.is_storefront_product_visible_v1(product.id);

revoke all on public.product_public_metrics from public, anon, authenticated;
grant select on public.product_public_metrics to anon, authenticated;

-- Server-side checkout pricing rejects stale carts for hidden products.
create or replace function public.resolve_catalog_price(
  requested_product_id uuid,
  requested_variant_id uuid,
  price_date date default (now() at time zone 'Asia/Tbilisi')::date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_price numeric(12,2);
begin
  if not public.is_storefront_product_visible_v1(requested_product_id) then
    raise exception 'Product is not currently purchasable';
  end if;

  select deal_price into resolved_price
  from public.daily_deal_items
  where deal_date = price_date
    and product_id = requested_product_id
    and variant_id = requested_variant_id;

  if resolved_price is not null then
    return resolved_price;
  end if;

  select coalesce(variant.price, product.sale_price, product.base_price)::numeric(12,2)
  into resolved_price
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where product.id = requested_product_id
    and variant.id = requested_variant_id
    and product.status = 'active'
    and product.production_status = 'approved'
    and product.catalog_audit_applied_at is not null
    and variant.is_active = true;

  if resolved_price is null or resolved_price <= 0 then
    raise exception 'Product is not currently purchasable';
  end if;
  return resolved_price;
end;
$$;

revoke all on function public.resolve_catalog_price(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.resolve_catalog_price(uuid, uuid, date)
  to service_role;

-- Audit approval is a snapshot of customer-facing copy, media, colors, and
-- dimensions. Later edits to those fields must invalidate that snapshot and
-- make the product eligible for another audit. Approval RPCs use an exact,
-- transaction-local product id while applying their own reviewed changes.
update public.products
set catalog_audit_applied_at = null,
    catalog_audit_applied_item_id = null
where (catalog_audit_applied_at is null)
  is distinct from (catalog_audit_applied_item_id is null);

alter table public.products
  drop constraint if exists products_catalog_audit_applied_marker_check;
alter table public.products
  add constraint products_catalog_audit_applied_marker_check
  check (
    (catalog_audit_applied_at is null)
      = (catalog_audit_applied_item_id is null)
  );

create or replace function public.protect_catalog_audit_product_markers_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('hooma.catalog_audit_invalidate_product_id', true) = old.id::text
    and new.catalog_audit_attempted_at is null
    and new.catalog_audit_attempted_item_id is null
    and new.catalog_audit_completed_at is null
    and new.catalog_audit_completed_item_id is null
    and new.catalog_audit_applied_at is null
    and new.catalog_audit_applied_item_id is null then
    return new;
  end if;

  if (old.catalog_audit_attempted_at is not null
      and new.catalog_audit_attempted_at is distinct from old.catalog_audit_attempted_at)
    or (old.catalog_audit_attempted_item_id is not null
      and new.catalog_audit_attempted_item_id is distinct from old.catalog_audit_attempted_item_id) then
    raise exception 'Catalog audit attempt marker is immutable once set';
  end if;

  if (old.catalog_audit_completed_at is not null
      and new.catalog_audit_completed_at is distinct from old.catalog_audit_completed_at)
    or (old.catalog_audit_completed_item_id is not null
      and new.catalog_audit_completed_item_id is distinct from old.catalog_audit_completed_item_id) then
    raise exception 'Catalog audit completion marker is immutable once set';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_catalog_audit_product_markers_v1()
  from public, anon, authenticated;

create or replace function public.invalidate_catalog_product_audit_v1(
  requested_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_invalidation_product_id text;
begin
  if requested_product_id is null
    or current_setting('hooma.catalog_audit_apply_product_id', true) = requested_product_id::text then
    return;
  end if;

  previous_invalidation_product_id :=
    current_setting('hooma.catalog_audit_invalidate_product_id', true);
  perform set_config(
    'hooma.catalog_audit_invalidate_product_id',
    requested_product_id::text,
    true
  );

  begin
    update public.products
    set catalog_audit_attempted_at = null,
        catalog_audit_attempted_item_id = null,
        catalog_audit_completed_at = null,
        catalog_audit_completed_item_id = null,
        catalog_audit_applied_at = null,
        catalog_audit_applied_item_id = null
    where id = requested_product_id
      and catalog_audit_applied_at is not null
      and catalog_audit_applied_item_id is not null;
  exception when others then
    perform set_config(
      'hooma.catalog_audit_invalidate_product_id',
      coalesce(previous_invalidation_product_id, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'hooma.catalog_audit_invalidate_product_id',
    coalesce(previous_invalidation_product_id, ''),
    true
  );
end;
$$;

revoke all on function public.invalidate_catalog_product_audit_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.invalidate_catalog_audit_on_product_content_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('hooma.catalog_audit_apply_product_id', true) is distinct from old.id::text
    and old.catalog_audit_applied_at is not null
    and old.catalog_audit_applied_item_id is not null
    and (
      old.slug is distinct from new.slug
      or old.hooma_name is distinct from new.hooma_name
      or old.name_ka is distinct from new.name_ka
      or old.category is distinct from new.category
      or old.category_id is distinct from new.category_id
      or old.short_description is distinct from new.short_description
      or old.short_description_ka is distinct from new.short_description_ka
      or old.long_description is distinct from new.long_description
      or old.long_description_ka is distinct from new.long_description_ka
      or old.hero_image is distinct from new.hero_image
      or old.gallery_images is distinct from new.gallery_images
      or old.video_url is distinct from new.video_url
      or old.tags is distinct from new.tags
      or old.delivery_estimate is distinct from new.delivery_estimate
      or old.lead_time_business_days is distinct from new.lead_time_business_days
      or old.estimated_print_minutes is distinct from new.estimated_print_minutes
      or old.safety_notes is distinct from new.safety_notes
    ) then
    perform set_config(
      'hooma.catalog_audit_invalidate_product_id',
      old.id::text,
      true
    );
    new.catalog_audit_attempted_at := null;
    new.catalog_audit_attempted_item_id := null;
    new.catalog_audit_completed_at := null;
    new.catalog_audit_completed_item_id := null;
    new.catalog_audit_applied_at := null;
    new.catalog_audit_applied_item_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_catalog_audit_on_product_content_v1()
  from public, anon, authenticated;

drop trigger if exists invalidate_catalog_audit_on_product_content
  on public.products;
create trigger invalidate_catalog_audit_on_product_content
before update of slug, hooma_name, name_ka, category, category_id,
  short_description, short_description_ka, long_description, long_description_ka,
  hero_image, gallery_images, video_url, tags, delivery_estimate,
  lead_time_business_days, estimated_print_minutes, safety_notes
on public.products
for each row execute function public.invalidate_catalog_audit_on_product_content_v1();

create or replace function public.invalidate_catalog_audit_on_variant_content_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_product_id uuid;
  new_product_id uuid;
begin
  old_product_id := case when tg_op in ('UPDATE', 'DELETE') then old.product_id else null end;
  new_product_id := case when tg_op in ('INSERT', 'UPDATE') then new.product_id else null end;

  if tg_op = 'INSERT' then
    if coalesce(new.is_active, false) then
      perform public.invalidate_catalog_product_audit_v1(new_product_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.is_active, false) then
      perform public.invalidate_catalog_product_audit_v1(old_product_id);
    end if;
    return old;
  end if;

  if (coalesce(old.is_active, false) or coalesce(new.is_active, false))
    and (
      old.product_id is distinct from new.product_id
      or old.sku is distinct from new.sku
      or old.size_label is distinct from new.size_label
      or old.layout_label is distinct from new.layout_label
      or old.orientation is distinct from new.orientation
      or old.product_dimensions_cm is distinct from new.product_dimensions_cm
      or old.packing_dimensions_cm is distinct from new.packing_dimensions_cm
      or old.gross_weight_kg is distinct from new.gross_weight_kg
      or old.image is distinct from new.image
      or old.available_colors is distinct from new.available_colors
      or old.available_fabrics is distinct from new.available_fabrics
      or old.material is distinct from new.material
      or old.attributes is distinct from new.attributes
      or old.is_active is distinct from new.is_active
    ) then
    if coalesce(old.is_active, false) then
      perform public.invalidate_catalog_product_audit_v1(old_product_id);
    end if;
    if coalesce(new.is_active, false)
      and (
        not coalesce(old.is_active, false)
        or new_product_id is distinct from old_product_id
      ) then
      perform public.invalidate_catalog_product_audit_v1(new_product_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_catalog_audit_on_variant_content_v1()
  from public, anon, authenticated;

drop trigger if exists invalidate_catalog_audit_on_variant_content
  on public.product_variants;
create trigger invalidate_catalog_audit_on_variant_content
before insert or update of product_id, sku, size_label, layout_label, orientation,
  product_dimensions_cm, packing_dimensions_cm, gross_weight_kg, image,
  available_colors, available_fabrics, material, attributes, is_active
  or delete
on public.product_variants
for each row execute function public.invalidate_catalog_audit_on_variant_content_v1();

-- Keep the large, previously audited card builder intact behind a guarded
-- source-side wrapper. Every caller now deletes rather than refreshes a card
-- when the product no longer owns a current manager approval.
alter function public.refresh_storefront_product_card_v1(uuid)
  rename to refresh_storefront_product_card_core_20260729;

revoke all on function public.refresh_storefront_product_card_core_20260729(uuid)
  from public, anon, authenticated, service_role;

create function public.refresh_storefront_product_card_v1(
  requested_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.products product
    where product.id = requested_product_id
      and product.catalog_audit_applied_at is not null
      and product.catalog_audit_applied_item_id is not null
  ) then
    delete from public.storefront_product_cards
    where product_id = requested_product_id;
    return;
  end if;

  perform public.refresh_storefront_product_card_core_20260729(
    requested_product_id
  );
end;
$$;

revoke all on function public.refresh_storefront_product_card_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_storefront_product_card_v1(uuid)
  to service_role;

-- The guarded refresh source is now installed, so direct or future writes to
-- the public read model must fail closed when no complete applied marker exists.
create or replace function public.enforce_storefront_card_manager_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and product.catalog_audit_applied_at is not null
      and product.catalog_audit_applied_item_id is not null
  ) then
    raise exception 'A manager-approved catalog audit is required for a storefront card';
  end if;
  return new;
end;
$$;

-- Approval functions must be the only route that can preserve audit markers
-- while changing audited content. v2/v3 remain callable by the private
-- SECURITY DEFINER chain, but are no longer direct service-role entry points.
create or replace function public.apply_catalog_product_audit_item_v1(
  actor_profile_id uuid,
  requested_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_product_id uuid;
  previous_apply_product_id text;
  application_result jsonb;
begin
  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id;
  if requested_product_id is null then
    raise exception 'Catalog audit item not found';
  end if;

  previous_apply_product_id :=
    current_setting('hooma.catalog_audit_apply_product_id', true);
  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    requested_product_id::text,
    true
  );

  begin
    application_result := public.apply_catalog_product_audit_item_v2(
      actor_profile_id,
      requested_item_id,
      null::text[]
    );
  exception when others then
    perform set_config(
      'hooma.catalog_audit_apply_product_id',
      coalesce(previous_apply_product_id, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    coalesce(previous_apply_product_id, ''),
    true
  );
  return application_result;
end;
$$;

revoke all on function public.apply_catalog_product_audit_item_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_catalog_product_audit_item_v1(uuid, uuid)
  to service_role;

alter function public.apply_catalog_product_audit_item_v4(
  uuid, uuid, text[], text, text, text, text, text[], text
) rename to apply_catalog_product_audit_item_v4_core_20260729;

revoke all on function public.apply_catalog_product_audit_item_v4_core_20260729(
  uuid, uuid, text[], text, text, text, text, text[], text
) from public, anon, authenticated, service_role;

create function public.apply_catalog_product_audit_item_v4(
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
as $$
declare
  requested_product_id uuid;
  previous_apply_product_id text;
  application_result jsonb;
begin
  select item.product_id into requested_product_id
  from public.catalog_product_audit_items item
  where item.id = requested_item_id;
  if requested_product_id is null then
    raise exception 'Catalog audit item not found';
  end if;

  previous_apply_product_id :=
    current_setting('hooma.catalog_audit_apply_product_id', true);
  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    requested_product_id::text,
    true
  );

  begin
    application_result :=
      public.apply_catalog_product_audit_item_v4_core_20260729(
        actor_profile_id,
        requested_item_id,
        requested_kept_image_urls,
        requested_name_ka,
        requested_name_en,
        requested_description_ka,
        requested_description_en,
        requested_available_colors,
        requested_color_mode
      );
  exception when others then
    perform set_config(
      'hooma.catalog_audit_apply_product_id',
      coalesce(previous_apply_product_id, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    coalesce(previous_apply_product_id, ''),
    true
  );
  return application_result;
end;
$$;

revoke all on function public.apply_catalog_product_audit_item_v4(
  uuid, uuid, text[], text, text, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.apply_catalog_product_audit_item_v4(
  uuid, uuid, text[], text, text, text, text, text[], text
) to service_role;

revoke all on function public.apply_catalog_product_audit_item_v2(
  uuid, uuid, text[]
) from public, anon, authenticated, service_role;
revoke all on function public.apply_catalog_product_audit_item_v3(
  uuid, uuid, text[], text, text, text, text
) from public, anon, authenticated, service_role;

-- The published-product editor temporarily switches to Draft. Preserve its
-- prior status while still allowing audited-content triggers to clear approval;
-- the guarded storefront card then becomes the source of public visibility.
alter function public.update_catalog_product_v2(
  uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric,
  text, text[], text
) rename to update_catalog_product_v2_core_20260729;

revoke all on function public.update_catalog_product_v2_core_20260729(
  uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric,
  text, text[], text
) from public, anon, authenticated, service_role;

create function public.update_catalog_product_v2(
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
  previous_edit_product_id text;
  edit_result jsonb;
begin
  previous_edit_product_id :=
    current_setting('hooma.catalog_product_edit_product_id', true);
  perform set_config(
    'hooma.catalog_product_edit_product_id',
    requested_product_id::text,
    true
  );

  begin
    edit_result := public.update_catalog_product_v2_core_20260729(
      actor_profile_id,
      requested_product_id,
      product_name,
      product_description,
      selected_category_id,
      selected_material_profile_id,
      selected_pricing_profile_id,
      selected_material_grams,
      selected_print_minutes,
      selected_margin_percent,
      operator_reference,
      product_available_colors,
      product_color_mode
    );
  exception when others then
    perform set_config(
      'hooma.catalog_product_edit_product_id',
      coalesce(previous_edit_product_id, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'hooma.catalog_product_edit_product_id',
    coalesce(previous_edit_product_id, ''),
    true
  );
  return edit_result;
end;
$$;

revoke all on function public.update_catalog_product_v2(
  uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric,
  text, text[], text
) from public, anon, authenticated;
grant execute on function public.update_catalog_product_v2(
  uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric,
  text, text[], text
) to service_role;

create or replace function public.require_manager_audit_before_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active'
    and new.catalog_audit_applied_at is null then
    if tg_op = 'INSERT' then
      raise exception 'A manager-approved catalog audit is required before publication';
    end if;
    if tg_op = 'UPDATE'
      and old.status is distinct from 'active'
      and not (
        old.status = 'draft'
        and current_setting('hooma.catalog_product_edit_product_id', true)
          is not distinct from new.id::text
      ) then
      raise exception 'A manager-approved catalog audit is required before publication';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.require_manager_audit_before_publication_v1()
  from public, anon, authenticated;

-- Include every audited product field so a BEFORE invalidation of its marker
-- is followed by a guarded card delete in the same statement.
drop trigger if exists sync_storefront_card_product on public.products;
create trigger sync_storefront_card_product
after insert or update of slug, hooma_name, name_ka, category, category_id,
  short_description, short_description_ka, long_description, long_description_ka,
  hero_image, gallery_images, video_url, tags, is_featured, status,
  price_placeholder, base_price, sale_price, delivery_estimate,
  lead_time_business_days, estimated_print_minutes, safety_notes,
  production_status, created_at, catalog_audit_applied_at,
  catalog_audit_applied_item_id
  or delete
on public.products
for each row execute function public.sync_storefront_card_from_product_v1();

-- Daily Deals must select only canonical storefront products. Existing hidden
-- rows for today are removed before counting, then the batch is compacted and
-- refilled from manager-approved products.
create or replace function public.activate_daily_deals(
  target_date date default (now() at time zone 'Asia/Tbilisi')::date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $daily_deal_manager_audit$
declare
  existing_count integer;
  configured_discount numeric(5,2);
begin
  if target_date is null then
    raise exception 'Target date is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-maintenance'));

  select daily_deal_discount_percent
  into configured_discount
  from public.pricing_profiles
  where is_default = true
  limit 1;
  configured_discount := coalesce(configured_discount, 50);

  perform pg_advisory_xact_lock(hashtext('hooma-daily-deals-' || target_date::text));
  insert into public.daily_deal_batches (deal_date)
  values (target_date)
  on conflict do nothing;

  delete from public.daily_deal_items deal
  where deal.deal_date = target_date
    and (
      deal.position > 50
      or not public.is_storefront_product_visible_v1(deal.product_id)
      or not exists (
        select 1
        from public.product_variants variant
        join public.products product on product.id = variant.product_id
        where variant.id = deal.variant_id
          and variant.product_id = deal.product_id
          and variant.is_active = true
          and coalesce(variant.price, product.sale_price, product.base_price) > 0
          and deal.original_price = coalesce(
            variant.price,
            product.sale_price,
            product.base_price
          )::numeric(12,2)
      )
    );

  update public.daily_deal_items
  set discount_percent = configured_discount
  where deal_date = target_date
    and discount_percent is distinct from configured_discount;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;

  if existing_count >= 50 then
    update public.daily_deal_batches
    set selection_count = existing_count
    where deal_date = target_date
      and selection_count is distinct from existing_count;
    return existing_count;
  end if;

  with displaced as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = 50 + displaced.compact_position
  from displaced
  where item.id = displaced.id;

  with compacted as (
    select
      id,
      row_number() over (order by position, id)::integer as compact_position
    from public.daily_deal_items
    where deal_date = target_date
  )
  update public.daily_deal_items item
  set position = compacted.compact_position
  from compacted
  where item.id = compacted.id;

  with eligible as (
    select
      product.id as product_id,
      chosen_variant.id as variant_id,
      chosen_variant.active_price,
      exists (
        select 1
        from public.daily_deal_items previous_day
        where previous_day.product_id = product.id
          and previous_day.deal_date = target_date - 1
      ) as appeared_previous_day
    from public.products product
    cross join lateral (
      select
        variant.id,
        coalesce(variant.price, product.sale_price, product.base_price)::numeric(12,2) as active_price
      from public.product_variants variant
      where variant.product_id = product.id
        and variant.is_active = true
        and coalesce(variant.price, product.sale_price, product.base_price) > 0
      order by coalesce(variant.price, product.sale_price, product.base_price), variant.id
      limit 1
    ) chosen_variant
    where public.is_storefront_product_visible_v1(product.id)
      and not exists (
        select 1
        from public.daily_deal_items today
        where today.deal_date = target_date
          and today.product_id = product.id
      )
  ),
  ranked as (
    select
      eligible.*,
      row_number() over (
        order by appeared_previous_day asc, md5(target_date::text || ':' || product_id::text)
      ) as selection_order
    from eligible
  ),
  selected as (
    select *
    from ranked
    where selection_order <= greatest(0, 50 - existing_count)
  )
  insert into public.daily_deal_items (
    deal_date,
    product_id,
    variant_id,
    position,
    original_price,
    deal_price,
    discount_percent
  )
  select
    target_date,
    product_id,
    variant_id,
    existing_count + selection_order::integer,
    active_price,
    active_price,
    configured_discount
  from selected
  on conflict (deal_date, product_id) do nothing;

  select count(*) into existing_count
  from public.daily_deal_items
  where deal_date = target_date;

  update public.daily_deal_batches
  set selection_count = existing_count
  where deal_date = target_date;

  return existing_count;
end;
$daily_deal_manager_audit$;

revoke all on function public.activate_daily_deals(date)
  from public, anon, authenticated;
grant execute on function public.activate_daily_deals(date)
  to service_role;

-- Reconcile every currently approved product through the guarded source after
-- installing all invalidation and card-refresh definitions.
delete from public.storefront_product_cards card
where not exists (
  select 1
  from public.products product
  where product.id = card.product_id
    and product.catalog_audit_applied_at is not null
    and product.catalog_audit_applied_item_id is not null
);

select public.refresh_storefront_product_card_v1(product.id)
from public.products product
where product.catalog_audit_applied_at is not null
  and product.catalog_audit_applied_item_id is not null;

select public.activate_daily_deals(
  (now() at time zone 'Asia/Tbilisi')::date
);
