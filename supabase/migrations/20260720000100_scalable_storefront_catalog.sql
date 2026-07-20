-- Scalable storefront read model.
--
-- Customer-facing pages must never hydrate the entire products table. This
-- compact read model contains only fields needed by a product card and is kept
-- current by write-side triggers. Descriptions and variant payloads stay out of
-- category/home responses and are fetched only for an individual product.

create extension if not exists pg_trgm;

create table if not exists public.storefront_product_cards (
  product_id uuid primary key references public.products(id) on delete cascade,
  slug text not null unique,
  hooma_name text not null,
  name_ka text not null,
  category_slug text not null,
  category_name_en text not null,
  category_name_ka text not null,
  subcategory_slug text not null,
  subcategory_name_en text not null,
  subcategory_name_ka text not null,
  hero_image text,
  price numeric(12,2) not null check (price > 0),
  price_placeholder text not null,
  lead_time_days integer not null check (lead_time_days between 1 and 90),
  materials text[] not null default '{}',
  is_featured boolean not null default false,
  rating_average numeric(4,2) not null default 0,
  rating_count integer not null default 0,
  sales_count integer not null default 0,
  popularity_score numeric(14,4) not null default 0,
  search_text text not null default '',
  product_created_at timestamptz not null,
  refreshed_at timestamptz not null default now()
);

create index if not exists idx_storefront_cards_popularity
  on public.storefront_product_cards(popularity_score desc, is_featured desc, product_created_at desc, product_id);
create index if not exists idx_storefront_cards_category_popularity
  on public.storefront_product_cards(category_slug, popularity_score desc, product_id);
create index if not exists idx_storefront_cards_subcategory_popularity
  on public.storefront_product_cards(category_slug, subcategory_slug, popularity_score desc, product_id);
create index if not exists idx_storefront_cards_name
  on public.storefront_product_cards(name_ka, product_id);
create index if not exists idx_storefront_cards_fastest
  on public.storefront_product_cards(lead_time_days, popularity_score desc, product_id);
create index if not exists idx_storefront_cards_rating
  on public.storefront_product_cards(rating_average desc, rating_count desc, product_id);
create index if not exists idx_storefront_cards_sales
  on public.storefront_product_cards(sales_count desc, popularity_score desc, product_id);
create index if not exists idx_storefront_cards_materials
  on public.storefront_product_cards using gin(materials);
create index if not exists idx_storefront_cards_search
  on public.storefront_product_cards using gin(search_text gin_trgm_ops);

alter table public.storefront_product_cards enable row level security;
revoke all on public.storefront_product_cards from public, anon, authenticated;
grant select on public.storefront_product_cards to service_role;

create or replace function public.refresh_storefront_product_card_v1(requested_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record record;
  variant_price numeric(12,2);
  variant_materials text[];
  published_rating_sum numeric := 0;
  published_rating_count integer := 0;
  paid_sales_count integer := 0;
  calculated_rating_average numeric(4,2) := 0;
  calculated_popularity numeric(14,4) := 0;
begin
  select
    product.*,
    coalesce(parent_category.slug, selected_category.slug, 'household') as resolved_category_slug,
    coalesce(parent_category.name_en, selected_category.name_en, 'Household') as resolved_category_name_en,
    coalesce(parent_category.name_ka, selected_category.name_ka, 'სახლი და ყოველდღიური ნივთები') as resolved_category_name_ka,
    case when selected_category.parent_id is not null
      then selected_category.slug
      else coalesce(selected_category.slug, 'household')
    end as resolved_subcategory_slug,
    case when selected_category.parent_id is not null
      then selected_category.name_en
      else coalesce(selected_category.name_en, 'Catalog')
    end as resolved_subcategory_name_en,
    case when selected_category.parent_id is not null
      then selected_category.name_ka
      else coalesce(selected_category.name_ka, 'კატალოგი')
    end as resolved_subcategory_name_ka
  into product_record
  from public.products product
  left join public.categories selected_category on selected_category.id = product.category_id
  left join public.categories parent_category on parent_category.id = selected_category.parent_id
  where product.id = requested_product_id;

  if not found then
    delete from public.storefront_product_cards where product_id = requested_product_id;
    return;
  end if;

  if product_record.status <> 'active'
    or product_record.production_status <> 'approved'
    or product_record.resolved_category_slug = 'custom-parts'
    or not exists (
      select 1
      from public.product_sources source
      where source.product_id = requested_product_id
        and source.license_status in ('verified', 'not_required')
        and source.commercial_use_allowed = true
        and source.media_use_allowed = true
        and (
          source.platform = 'hooma'
          or lower(source.source_url) ~ '^https://([^/]+\.)?(makerworld\.com|printables\.com|thingiverse\.com|thangs\.com|myminifactory\.com|cults3d\.com)(/|$)'
        )
    )
  then
    delete from public.storefront_product_cards where product_id = requested_product_id;
    return;
  end if;

  select
    min(coalesce(variant.price, product_record.sale_price, product_record.base_price)),
    array_agg(distinct coalesce(nullif(trim(variant.material), ''), 'PLA+') order by coalesce(nullif(trim(variant.material), ''), 'PLA+'))
  into variant_price, variant_materials
  from public.product_variants variant
  where variant.product_id = requested_product_id
    and variant.is_active = true
    and coalesce(variant.price, product_record.sale_price, product_record.base_price) > 0;

  if variant_price is null then
    delete from public.storefront_product_cards where product_id = requested_product_id;
    return;
  end if;

  select
    coalesce(sum(review.rating), 0),
    count(*)::integer
  into published_rating_sum, published_rating_count
  from public.product_reviews review
  where review.product_id = requested_product_id
    and review.status = 'published';

  select coalesce(sum(item.quantity), 0)::integer
  into paid_sales_count
  from public.order_items item
  join public.orders customer_order on customer_order.id = item.order_id
  where item.product_id = requested_product_id
    and customer_order.payment_status = 'paid'
    and customer_order.status <> 'cancelled'
    and customer_order.fulfillment_status <> 'cancelled'
    and customer_order.test_mode = false;

  calculated_rating_average := case
    when published_rating_count = 0 then 0
    else round(published_rating_sum / published_rating_count, 2)
  end;
  calculated_popularity := round((
    (((published_rating_sum + 19.0) / (published_rating_count + 5.0)) - 3.0) * 2.5
    + ln(1 + paid_sales_count) * 3.0
    + ln(1 + published_rating_count) * 1.25
    + case when product_record.is_featured then 0.75 else 0 end
    + greatest(0, 1 - extract(epoch from (now() - product_record.created_at)) / 7776000.0) * 0.5
  )::numeric, 4);

  insert into public.storefront_product_cards (
    product_id,
    slug,
    hooma_name,
    name_ka,
    category_slug,
    category_name_en,
    category_name_ka,
    subcategory_slug,
    subcategory_name_en,
    subcategory_name_ka,
    hero_image,
    price,
    price_placeholder,
    lead_time_days,
    materials,
    is_featured,
    rating_average,
    rating_count,
    sales_count,
    popularity_score,
    search_text,
    product_created_at,
    refreshed_at
  ) values (
    product_record.id,
    product_record.slug,
    product_record.hooma_name,
    coalesce(nullif(product_record.name_ka, ''), product_record.hooma_name),
    product_record.resolved_category_slug,
    product_record.resolved_category_name_en,
    product_record.resolved_category_name_ka,
    product_record.resolved_subcategory_slug,
    product_record.resolved_subcategory_name_en,
    product_record.resolved_subcategory_name_ka,
    product_record.hero_image,
    variant_price,
    coalesce(nullif(product_record.price_placeholder, ''), 'ფასი დამტკიცებულია'),
    coalesce(product_record.lead_time_business_days, 3),
    coalesce(variant_materials, array['PLA+']::text[]),
    coalesce(product_record.is_featured, false),
    calculated_rating_average,
    published_rating_count,
    paid_sales_count,
    calculated_popularity,
    lower(concat_ws(' ',
      product_record.hooma_name,
      product_record.name_ka,
      product_record.short_description,
      product_record.short_description_ka,
      array_to_string(product_record.tags, ' '),
      product_record.resolved_category_name_en,
      product_record.resolved_category_name_ka,
      product_record.resolved_subcategory_name_en,
      product_record.resolved_subcategory_name_ka
    )),
    product_record.created_at,
    now()
  )
  on conflict (product_id) do update set
    slug = excluded.slug,
    hooma_name = excluded.hooma_name,
    name_ka = excluded.name_ka,
    category_slug = excluded.category_slug,
    category_name_en = excluded.category_name_en,
    category_name_ka = excluded.category_name_ka,
    subcategory_slug = excluded.subcategory_slug,
    subcategory_name_en = excluded.subcategory_name_en,
    subcategory_name_ka = excluded.subcategory_name_ka,
    hero_image = excluded.hero_image,
    price = excluded.price,
    price_placeholder = excluded.price_placeholder,
    lead_time_days = excluded.lead_time_days,
    materials = excluded.materials,
    is_featured = excluded.is_featured,
    rating_average = excluded.rating_average,
    rating_count = excluded.rating_count,
    sales_count = excluded.sales_count,
    popularity_score = excluded.popularity_score,
    search_text = excluded.search_text,
    product_created_at = excluded.product_created_at,
    refreshed_at = excluded.refreshed_at;
end;
$$;

revoke all on function public.refresh_storefront_product_card_v1(uuid) from public, anon, authenticated;
grant execute on function public.refresh_storefront_product_card_v1(uuid) to service_role;

create or replace function public.sync_storefront_card_from_product_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.storefront_product_cards where product_id = old.id;
  else
    perform public.refresh_storefront_product_card_v1(new.id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_storefront_card_from_child_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_product_id uuid;
  new_product_id uuid;
begin
  if tg_op <> 'INSERT' then old_product_id := old.product_id; end if;
  if tg_op <> 'DELETE' then new_product_id := new.product_id; end if;

  if old_product_id is not null then
    perform public.refresh_storefront_product_card_v1(old_product_id);
  end if;
  if new_product_id is not null and new_product_id is distinct from old_product_id then
    perform public.refresh_storefront_product_card_v1(new_product_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_storefront_cards_from_order_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_product_id uuid;
begin
  for affected_product_id in
    select distinct item.product_id
    from public.order_items item
    where item.order_id in (old.id, new.id)
      and item.product_id is not null
  loop
    perform public.refresh_storefront_product_card_v1(affected_product_id);
  end loop;
  return new;
end;
$$;

create or replace function public.sync_storefront_cards_from_category_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_product_id uuid;
begin
  for affected_product_id in
    select product.id
    from public.products product
    where product.category_id = new.id
      or product.category_id in (
        select child.id from public.categories child where child.parent_id = new.id
      )
  loop
    perform public.refresh_storefront_product_card_v1(affected_product_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists sync_storefront_card_product on public.products;
create trigger sync_storefront_card_product
after insert or update of slug, hooma_name, name_ka, category_id, short_description, short_description_ka,
  hero_image, tags, is_featured, status, price_placeholder, base_price, sale_price,
  lead_time_business_days, production_status, created_at or delete
on public.products
for each row execute function public.sync_storefront_card_from_product_v1();

drop trigger if exists sync_storefront_card_variant on public.product_variants;
create trigger sync_storefront_card_variant
after insert or update of product_id, price, material, is_active or delete
on public.product_variants
for each row execute function public.sync_storefront_card_from_child_v1();

drop trigger if exists sync_storefront_card_source on public.product_sources;
create trigger sync_storefront_card_source
after insert or update of product_id, platform, source_url, license_status, commercial_use_allowed, media_use_allowed or delete
on public.product_sources
for each row execute function public.sync_storefront_card_from_child_v1();

drop trigger if exists sync_storefront_card_review on public.product_reviews;
create trigger sync_storefront_card_review
after insert or update of product_id, rating, status or delete
on public.product_reviews
for each row execute function public.sync_storefront_card_from_child_v1();

drop trigger if exists sync_storefront_card_order_item on public.order_items;
create trigger sync_storefront_card_order_item
after insert or update of product_id, order_id, quantity or delete
on public.order_items
for each row execute function public.sync_storefront_card_from_child_v1();

drop trigger if exists sync_storefront_cards_order on public.orders;
create trigger sync_storefront_cards_order
after update of payment_status, status, fulfillment_status, test_mode
on public.orders
for each row
when (
  old.payment_status is distinct from new.payment_status
  or old.status is distinct from new.status
  or old.fulfillment_status is distinct from new.fulfillment_status
  or old.test_mode is distinct from new.test_mode
)
execute function public.sync_storefront_cards_from_order_v1();

drop trigger if exists sync_storefront_cards_category on public.categories;
create trigger sync_storefront_cards_category
after update of parent_id, slug, name_en, name_ka
on public.categories
for each row execute function public.sync_storefront_cards_from_category_v1();

-- Backfill current published products. Future writes are maintained row by row.
select public.refresh_storefront_product_card_v1(product.id)
from public.products product;

create or replace function public.get_storefront_catalog_page_v1(
  requested_category text default null,
  requested_subcategory text default null,
  requested_query text default null,
  requested_material text default null,
  requested_sort text default 'featured',
  requested_page integer default 1,
  requested_page_size integer default 36
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_query text := nullif(lower(trim(requested_query)), '');
  safe_page integer := greatest(1, least(coalesce(requested_page, 1), 1000000));
  safe_page_size integer := greatest(1, least(coalesce(requested_page_size, 36), 60));
  safe_sort text := case
    when requested_sort in ('name', 'fastest', 'rating', 'sales') then requested_sort
    else 'featured'
  end;
  order_clause text;
  query_sql text;
  result_payload jsonb;
begin
  order_clause := case safe_sort
    when 'name' then 'card.name_ka asc, card.product_id asc'
    when 'fastest' then 'card.lead_time_days asc, card.popularity_score desc, card.product_id asc'
    when 'rating' then 'card.rating_average desc, card.rating_count desc, card.popularity_score desc, card.product_id asc'
    when 'sales' then 'card.sales_count desc, card.popularity_score desc, card.product_id asc'
    else 'card.popularity_score desc, card.is_featured desc, card.product_created_at desc, card.product_id asc'
  end;

  query_sql := $query$
    with filtered as not materialized (
      select card.*
      from public.storefront_product_cards card
      where ($1 is null or card.category_slug = $1)
        and ($2 is null or card.subcategory_slug = $2)
        and ($3 is null or card.search_text like '%' || $3 || '%')
        and ($4 is null or card.materials @> array[$4]::text[])
    ),
    paged as (
      select
        card.*,
        row_number() over (order by %ORDER_BY%) as display_order
      from filtered card
      order by %ORDER_BY%
      limit $5 offset $6
    )
    select jsonb_build_object(
      'total_count', (select count(*) from filtered),
      'items', coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'id', paged.product_id,
            'slug', paged.slug,
            'hooma_name', paged.hooma_name,
            'name_ka', paged.name_ka,
            'category_slug', paged.category_slug,
            'category_name_en', paged.category_name_en,
            'category_name_ka', paged.category_name_ka,
            'subcategory_slug', paged.subcategory_slug,
            'subcategory_name_en', paged.subcategory_name_en,
            'subcategory_name_ka', paged.subcategory_name_ka,
            'hero_image', paged.hero_image,
            'price', paged.price,
            'price_placeholder', paged.price_placeholder,
            'lead_time_days', paged.lead_time_days,
            'rating_average', paged.rating_average,
            'rating_count', paged.rating_count,
            'sales_count', paged.sales_count,
            'popularity_score', paged.popularity_score
          ) order by paged.display_order
        ) from paged),
        '[]'::jsonb
      )
    )
  $query$;

  query_sql := replace(query_sql, '%ORDER_BY%', order_clause);
  execute query_sql
    into result_payload
    using
      nullif(trim(requested_category), ''),
      nullif(trim(requested_subcategory), ''),
      normalized_query,
      nullif(trim(requested_material), ''),
      safe_page_size,
      (safe_page - 1) * safe_page_size;

  return coalesce(result_payload, jsonb_build_object('total_count', 0, 'items', '[]'::jsonb));
end;
$$;

revoke all on function public.get_storefront_catalog_page_v1(text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_storefront_catalog_page_v1(text, text, text, text, text, integer, integer) to service_role;

create or replace function public.get_storefront_home_cards_v1(requested_per_section integer default 12)
returns table (
  section_key text,
  id uuid,
  slug text,
  hooma_name text,
  name_ka text,
  category_slug text,
  category_name_en text,
  category_name_ka text,
  subcategory_slug text,
  subcategory_name_en text,
  subcategory_name_ka text,
  hero_image text,
  price numeric,
  price_placeholder text,
  lead_time_days integer,
  rating_average numeric,
  rating_count integer,
  sales_count integer,
  popularity_score numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with section_categories as (
    select distinct card.category_slug
    from public.storefront_product_cards card
  ),
  selected as (
    select 'popular'::text as section_key, popular.*
    from lateral (
      select card.*
      from public.storefront_product_cards card
      order by card.popularity_score desc, card.is_featured desc, card.product_created_at desc, card.product_id
      limit greatest(1, least(coalesce(requested_per_section, 12), 24))
    ) popular
    union all
    select category.category_slug as section_key, category_card.*
    from section_categories category
    cross join lateral (
      select card.*
      from public.storefront_product_cards card
      where card.category_slug = category.category_slug
      order by card.popularity_score desc, card.product_id
      limit greatest(1, least(coalesce(requested_per_section, 12), 24))
    ) category_card
  )
  select
    selected.section_key,
    selected.product_id as id,
    selected.slug,
    selected.hooma_name,
    selected.name_ka,
    selected.category_slug,
    selected.category_name_en,
    selected.category_name_ka,
    selected.subcategory_slug,
    selected.subcategory_name_en,
    selected.subcategory_name_ka,
    selected.hero_image,
    selected.price,
    selected.price_placeholder,
    selected.lead_time_days,
    selected.rating_average,
    selected.rating_count,
    selected.sales_count,
    selected.popularity_score
  from selected;
$$;

revoke all on function public.get_storefront_home_cards_v1(integer) from public, anon, authenticated;
grant execute on function public.get_storefront_home_cards_v1(integer) to service_role;

