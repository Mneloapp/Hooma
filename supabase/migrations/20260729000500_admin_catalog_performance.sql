-- Keep the large admin catalog responsive as products and audit results grow.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_products_admin_created
  on public.products(created_at desc, id);

create index if not exists idx_products_admin_status_created
  on public.products(status, created_at desc, id);

create index if not exists idx_products_admin_category_created
  on public.products(category_id, created_at desc, id);

create index if not exists idx_products_admin_audit_applied_created
  on public.products(catalog_audit_applied_at, created_at desc, id)
  where catalog_audit_applied_at is not null;

create index if not exists idx_products_admin_audit_ready_created
  on public.products(catalog_audit_completed_at, created_at desc, id)
  where catalog_audit_completed_at is not null
    and catalog_audit_applied_at is null;

create index if not exists idx_products_admin_hooma_name_search
  on public.products using gin (hooma_name extensions.gin_trgm_ops);

create index if not exists idx_products_admin_name_ka_search
  on public.products using gin (name_ka extensions.gin_trgm_ops);

create index if not exists idx_products_admin_slug_search
  on public.products using gin (slug extensions.gin_trgm_ops);

create or replace function public.get_admin_catalog_counts_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'draft', count(*) filter (where status = 'draft'),
    'active', count(*) filter (where status = 'active'),
    'archived', count(*) filter (where status = 'archived')
  )
  from public.products;
$$;

revoke all on function public.get_admin_catalog_counts_v1() from public;
grant execute on function public.get_admin_catalog_counts_v1() to authenticated;
