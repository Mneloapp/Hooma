-- A manager editing an already approved product is making an explicit review
-- decision. Preserve that approval for the catalog editor only; all direct,
-- worker, and other write paths continue to invalidate audited content.

alter function public.update_catalog_product_v2(
  uuid, uuid, text, text, uuid, uuid, uuid, numeric, integer, numeric,
  text, text[], text
) rename to update_catalog_product_v2_core_20260801;

revoke all on function public.update_catalog_product_v2_core_20260801(
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
  previous_apply_product_id text;
  edit_result jsonb;
begin
  previous_apply_product_id :=
    current_setting('hooma.catalog_audit_apply_product_id', true);
  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    requested_product_id::text,
    true
  );

  begin
    edit_result := public.update_catalog_product_v2_core_20260801(
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

-- Repair approvals previously cleared by the manager catalog editor. Restore
-- only when its catalog_product_updated entry is the latest audited-content
-- action after the last applied audit item.
with recoverable as (
  select
    product.id as product_id,
    applied_item.id as audit_item_id,
    applied_item.reviewed_by as reviewer_id,
    coalesce(applied_item.processing_started_at, applied_item.created_at) as attempted_at,
    coalesce(applied_item.processed_at, applied_item.reviewed_at, applied_item.updated_at) as completed_at,
    coalesce(applied_item.reviewed_at, applied_item.updated_at) as applied_at
  from public.products product
  join lateral (
    select item.*
    from public.catalog_product_audit_items item
    where item.product_id = product.id
      and item.status = 'applied'
      and item.reviewed_by is not null
    order by coalesce(item.reviewed_at, item.updated_at) desc, item.id
    limit 1
  ) applied_item on true
  join lateral (
    select log.action
    from public.audit_log log
    where log.entity_type = 'product'
      and log.entity_id = product.id::text
      and log.created_at >= coalesce(applied_item.reviewed_at, applied_item.updated_at)
      and log.action in ('product_media_updated', 'catalog_product_updated')
    order by log.created_at desc, log.id desc
    limit 1
  ) latest_content_action on latest_content_action.action = 'catalog_product_updated'
  where product.catalog_audit_attempted_at is null
    and product.catalog_audit_attempted_item_id is null
    and product.catalog_audit_completed_at is null
    and product.catalog_audit_completed_item_id is null
    and product.catalog_audit_applied_at is null
    and product.catalog_audit_applied_item_id is null
), restored as (
  update public.products product
  set catalog_audit_attempted_at = recoverable.attempted_at,
      catalog_audit_attempted_item_id = recoverable.audit_item_id,
      catalog_audit_completed_at = recoverable.completed_at,
      catalog_audit_completed_item_id = recoverable.audit_item_id,
      catalog_audit_applied_at = recoverable.applied_at,
      catalog_audit_applied_item_id = recoverable.audit_item_id
  from recoverable
  where product.id = recoverable.product_id
  returning product.id
)
insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
select
  recoverable.reviewer_id,
  'catalog_audit_restored_after_manager_catalog_edit',
  'product',
  recoverable.product_id::text,
  jsonb_build_object(
    'audit_item_id', recoverable.audit_item_id,
    'reason', 'Manager catalog edits now preserve the existing approval'
  )
from recoverable
join restored on restored.id = recoverable.product_id;
