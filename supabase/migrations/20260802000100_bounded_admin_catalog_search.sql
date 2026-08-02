-- Keep the large admin catalog responsive by avoiding exact filtered counts,
-- repeated RLS checks, and unbounded product searches on every page load.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
declare
  trigram_schema text;
begin
  select namespace.nspname
  into trigram_schema
  from pg_catalog.pg_opclass operator_class
  join pg_catalog.pg_namespace namespace
    on namespace.oid = operator_class.opcnamespace
  join pg_catalog.pg_am access_method
    on access_method.oid = operator_class.opcmethod
  where operator_class.opcname = 'gin_trgm_ops'
    and access_method.amname = 'gin'
  order by
    case namespace.nspname
      when 'extensions' then 0
      when 'public' then 1
      else 2
    end
  limit 1;

  if trigram_schema is null then
    raise exception 'pg_trgm gin_trgm_ops is unavailable';
  end if;

  execute format(
    'create index if not exists idx_products_admin_search_text_v2 '
    || 'on public.products using gin '
    || '((coalesce(name_ka, '''') || '' '' || coalesce(hooma_name, '''') || '' '' '
    || '|| coalesce(original_name, '''') || '' '' || coalesce(original_model_code, '''') || '' '' '
    || '|| coalesce(slug, '''')) %I.gin_trgm_ops)',
    trigram_schema
  );
end;
$$;

create index if not exists idx_products_admin_search_terms_v2
  on public.products using gin (
    to_tsvector(
      'simple',
      coalesce(name_ka, '') || ' '
      || coalesce(hooma_name, '') || ' '
      || coalesce(original_name, '') || ' '
      || coalesce(original_model_code, '') || ' '
      || coalesce(slug, '')
    )
  );

create index if not exists idx_products_admin_created_v2
  on public.products(created_at desc, id);

create index if not exists idx_products_admin_status_created_v2
  on public.products(status, created_at desc, id);

create index if not exists idx_products_admin_category_created_v2
  on public.products(category_id, created_at desc, id);

create index if not exists idx_products_admin_audit_approved_order_v2
  on public.products(created_at desc, id)
  where catalog_audit_applied_at is not null;

create index if not exists idx_products_admin_audit_ready_order_v2
  on public.products(created_at desc, id)
  where catalog_audit_completed_at is not null
    and catalog_audit_applied_at is null;

create index if not exists idx_products_admin_audit_pending_order_v2
  on public.products(created_at desc, id)
  where catalog_audit_completed_at is null;

create or replace function public.search_admin_catalog_products_v1(
  requested_search text default null,
  requested_category_slug text default null,
  requested_subcategory_slug text default null,
  requested_status text default null,
  requested_audit_state text default null,
  requested_offset integer default 0,
  requested_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_search text := nullif(btrim(requested_search), '');
  normalized_category_slug text := nullif(btrim(requested_category_slug), '');
  normalized_subcategory_slug text := nullif(btrim(requested_subcategory_slug), '');
  search_pattern text;
  resolved_category_ids uuid[];
  resolved_offset integer := coalesce(requested_offset, 0);
  resolved_limit integer := coalesce(requested_limit, 50);
  result jsonb;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  if normalized_search is not null and length(normalized_search) > 100 then
    raise exception 'Search text is too long';
  end if;
  if requested_status is not null
    and requested_status not in ('draft', 'active', 'archived') then
    raise exception 'Invalid product status';
  end if;
  if requested_audit_state is not null
    and requested_audit_state not in ('approved', 'ready', 'pending') then
    raise exception 'Invalid audit state';
  end if;
  if resolved_offset < 0 or resolved_offset > 1000000 then
    raise exception 'Invalid catalog offset';
  end if;
  if resolved_limit < 1 or resolved_limit > 100 then
    raise exception 'Invalid catalog page size';
  end if;

  if normalized_subcategory_slug is not null then
    select coalesce(array_agg(child.id), '{}'::uuid[])
    into resolved_category_ids
    from public.categories child
    left join public.categories parent on parent.id = child.parent_id
    where child.slug = normalized_subcategory_slug
      and child.parent_id is not null
      and (
        normalized_category_slug is null
        or parent.slug = normalized_category_slug
      );
  elsif normalized_category_slug is not null then
    select coalesce(array_agg(category.id), '{}'::uuid[])
    into resolved_category_ids
    from public.categories category
    where (
      category.slug = normalized_category_slug
      and category.parent_id is null
    ) or category.parent_id in (
         select parent.id
         from public.categories parent
         where parent.slug = normalized_category_slug
           and parent.parent_id is null
       );
  end if;

  if normalized_search is not null then
    search_pattern := '%'
      || replace(
        replace(
          replace(normalized_search, $escape$\$escape$, $escape$\\$escape$),
          '%',
          $escape$\%$escape$
        ),
        '_',
        $escape$\_$escape$
      )
      || '%';
  end if;

  with matched as materialized (
    select
      product.id,
      product.slug,
      product.hooma_name,
      product.name_ka,
      product.status,
      product.production_status,
      product.estimated_print_minutes,
      product.material_grams,
      product.base_price,
      product.catalog_audit_completed_at,
      product.catalog_audit_applied_at,
      product.created_at,
      category.slug as category_slug,
      category.name_en as category_name_en,
      category.name_ka as category_name_ka
    from public.products product
    left join public.categories category on category.id = product.category_id
    where (
        normalized_search is null
        or (
          coalesce(product.name_ka, '') || ' '
          || coalesce(product.hooma_name, '') || ' '
          || coalesce(product.original_name, '') || ' '
          || coalesce(product.original_model_code, '') || ' '
          || coalesce(product.slug, '')
        ) ilike search_pattern escape $escape$\$escape$
        or to_tsvector(
          'simple',
          coalesce(product.name_ka, '') || ' '
          || coalesce(product.hooma_name, '') || ' '
          || coalesce(product.original_name, '') || ' '
          || coalesce(product.original_model_code, '') || ' '
          || coalesce(product.slug, '')
        ) @@ plainto_tsquery('simple', normalized_search)
      )
      and (requested_status is null or product.status = requested_status)
      and (resolved_category_ids is null or product.category_id = any(resolved_category_ids))
      and (
        requested_audit_state is null
        or (requested_audit_state = 'approved' and product.catalog_audit_applied_at is not null)
        or (requested_audit_state = 'ready'
          and product.catalog_audit_completed_at is not null
          and product.catalog_audit_applied_at is null)
        or (requested_audit_state = 'pending' and product.catalog_audit_completed_at is null)
      )
    order by product.created_at desc, product.id
    offset resolved_offset
    limit resolved_limit + 1
  ), page_rows as (
    select *
    from matched
    order by created_at desc, id
    limit resolved_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'slug', page.slug,
          'hooma_name', page.hooma_name,
          'name_ka', page.name_ka,
          'status', page.status,
          'production_status', page.production_status,
          'estimated_print_minutes', page.estimated_print_minutes,
          'material_grams', page.material_grams,
          'base_price', page.base_price,
          'catalog_audit_completed_at', page.catalog_audit_completed_at,
          'catalog_audit_applied_at', page.catalog_audit_applied_at,
          'categories', case
            when page.category_slug is null then null
            else jsonb_build_object(
              'slug', page.category_slug,
              'name_en', page.category_name_en,
              'name_ka', page.category_name_ka
            )
          end
        ) order by page.created_at desc, page.id
      )
      from page_rows page
    ), '[]'::jsonb),
    'has_more', (select count(*) > resolved_limit from matched)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.search_admin_catalog_products_v1(
  text, text, text, text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.search_admin_catalog_products_v1(
  text, text, text, text, text, integer, integer
) to authenticated;

-- One privileged aggregate replaces four exact-count fallback scans through
-- product RLS policies. A counts failure must not block or mislabel the list.
create or replace function public.get_admin_catalog_counts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'draft', count(*) filter (where status = 'draft'),
    'active', count(*) filter (where status = 'active'),
    'archived', count(*) filter (where status = 'archived')
  )
  into result
  from public.products;

  return result;
end;
$$;

revoke all on function public.get_admin_catalog_counts_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_catalog_counts_v1()
  to authenticated;
