-- Rank customer-facing catalog cards by the moment a manager actually
-- approved them for the storefront, not by their much older import date.
-- Rating, sales, and other card refreshes must preserve this timestamp.

alter table public.storefront_product_cards
  add column if not exists storefront_published_at timestamptz not null default now();

update public.storefront_product_cards card
set storefront_published_at = coalesce(
  product.catalog_audit_applied_at,
  card.product_created_at
)
from public.products product
where product.id = card.product_id;

create index if not exists idx_storefront_cards_newest
  on public.storefront_product_cards(storefront_published_at desc, product_id);

create index if not exists idx_storefront_cards_category_newest
  on public.storefront_product_cards(category_slug, storefront_published_at desc, product_id);

create index if not exists idx_storefront_cards_subcategory_newest
  on public.storefront_product_cards(
    category_slug,
    subcategory_slug,
    storefront_published_at desc,
    product_id
  );

create or replace function public.refresh_storefront_product_card_v1(
  requested_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_published_at timestamptz;
begin
  select product.catalog_audit_applied_at
  into selected_published_at
  from public.products product
  where product.id = requested_product_id
    and product.catalog_audit_applied_at is not null
    and product.catalog_audit_applied_item_id is not null;

  if not found then
    delete from public.storefront_product_cards
    where product_id = requested_product_id;
    return;
  end if;

  perform public.refresh_storefront_product_card_core_20260729(
    requested_product_id
  );

  update public.storefront_product_cards card
  set storefront_published_at = selected_published_at
  where card.product_id = requested_product_id;
end;
$$;

revoke all on function public.refresh_storefront_product_card_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_storefront_product_card_v1(uuid)
  to service_role;

create or replace function public.get_storefront_catalog_page_v1(
  requested_category text default null,
  requested_subcategory text default null,
  requested_query text default null,
  requested_material text default null,
  requested_sort text default 'newest',
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
    when requested_sort in ('newest', 'featured', 'name', 'fastest', 'rating', 'sales') then requested_sort
    else 'newest'
  end;
  order_clause text;
  query_sql text;
  result_payload jsonb;
begin
  order_clause := case safe_sort
    when 'featured' then 'card.popularity_score desc, card.is_featured desc, card.storefront_published_at desc, card.product_id asc'
    when 'name' then 'card.name_ka asc, card.product_id asc'
    when 'fastest' then 'card.lead_time_days asc, card.popularity_score desc, card.product_id asc'
    when 'rating' then 'card.rating_average desc, card.rating_count desc, card.popularity_score desc, card.product_id asc'
    when 'sales' then 'card.sales_count desc, card.popularity_score desc, card.product_id asc'
    else 'card.storefront_published_at desc, card.product_id asc'
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

  return coalesce(
    result_payload,
    jsonb_build_object('total_count', 0, 'items', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_storefront_catalog_page_v1(
  text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_storefront_catalog_page_v1(
  text, text, text, text, text, integer, integer
) to service_role;

create or replace function public.get_storefront_home_cards_v1(
  requested_per_section integer default 12
)
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
      order by card.popularity_score desc,
        card.is_featured desc,
        card.storefront_published_at desc,
        card.product_id
      limit greatest(1, least(coalesce(requested_per_section, 12), 24))
    ) popular
    union all
    select category.category_slug as section_key, category_card.*
    from section_categories category
    cross join lateral (
      select card.*
      from public.storefront_product_cards card
      where card.category_slug = category.category_slug
      order by card.storefront_published_at desc, card.product_id
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
  from selected
  order by
    selected.section_key,
    case when selected.section_key = 'popular'
      then selected.popularity_score
    end desc nulls last,
    case when selected.section_key <> 'popular'
      then selected.storefront_published_at
    end desc nulls last,
    selected.product_id;
$$;

revoke all on function public.get_storefront_home_cards_v1(integer)
  from public, anon, authenticated;
grant execute on function public.get_storefront_home_cards_v1(integer)
  to service_role;
