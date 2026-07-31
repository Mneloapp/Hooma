-- Media selected in the manager editor is itself a human review decision.
-- Preserve an existing manager approval while changing only product media,
-- but keep the general content/variant invalidation triggers strict for every
-- other write path.

create or replace function public.update_manager_reviewed_product_media_v1(
  actor_profile_id uuid,
  requested_product_id uuid,
  requested_hero_image text,
  requested_gallery_images text[],
  requested_video_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product_record public.products%rowtype;
  previous_apply_product_id text;
  approval_preserved boolean;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then
    raise exception 'Active catalog management access is required';
  end if;

  if requested_product_id is null then
    raise exception 'Product id is required';
  end if;
  if requested_hero_image is null or length(trim(requested_hero_image)) < 1
    or length(requested_hero_image) > 2000 then
    raise exception 'A valid hero image is required';
  end if;
  if requested_gallery_images is null
    or cardinality(requested_gallery_images) not between 1 and 12
    or requested_gallery_images[1] is distinct from requested_hero_image
    or exists (
      select 1
      from unnest(requested_gallery_images) image_url
      where image_url is null
        or length(trim(image_url)) < 1
        or length(image_url) > 2000
    )
    or (
      select count(distinct image_url)
      from unnest(requested_gallery_images) image_url
    ) <> cardinality(requested_gallery_images) then
    raise exception 'Product gallery must contain 1 to 12 unique images with the hero first';
  end if;
  if requested_video_url is not null
    and (length(trim(requested_video_url)) < 1 or length(requested_video_url) > 2000) then
    raise exception 'Video URL is invalid';
  end if;

  select product.* into product_record
  from public.products product
  where product.id = requested_product_id
  for update;
  if product_record.id is null then raise exception 'Product not found'; end if;

  approval_preserved := product_record.catalog_audit_applied_at is not null
    and product_record.catalog_audit_applied_item_id is not null;
  previous_apply_product_id :=
    current_setting('hooma.catalog_audit_apply_product_id', true);
  perform set_config(
    'hooma.catalog_audit_apply_product_id',
    requested_product_id::text,
    true
  );

  begin
    update public.products
    set hero_image = requested_hero_image,
        gallery_images = requested_gallery_images,
        video_url = nullif(trim(requested_video_url), '')
    where id = requested_product_id;

    update public.product_variants
    set image = requested_hero_image
    where product_id = requested_product_id
      and image is distinct from requested_hero_image;
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

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'product_media_updated',
    'product',
    requested_product_id::text,
    jsonb_build_object(
      'previous_image_count', cardinality(coalesce(product_record.gallery_images, '{}'::text[])),
      'image_count', cardinality(requested_gallery_images),
      'previous_video_present', product_record.video_url is not null,
      'video_present', nullif(trim(requested_video_url), '') is not null,
      'audit_approval_preserved', approval_preserved,
      'mutation_source', 'manager_media_editor'
    )
  );

  return jsonb_build_object(
    'product_id', requested_product_id,
    'audit_preserved', approval_preserved,
    'image_count', cardinality(requested_gallery_images)
  );
end;
$$;

revoke all on function public.update_manager_reviewed_product_media_v1(
  uuid, uuid, text, text[], text
) from public, anon, authenticated;
grant execute on function public.update_manager_reviewed_product_media_v1(
  uuid, uuid, text, text[], text
) to service_role;

-- Repair approvals that were already cleared by the manager media editor.
-- Restore only when the latest audited-content action after the applied item
-- is product_media_updated. A later general catalog edit remains invalidated.
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
  ) latest_content_action on latest_content_action.action = 'product_media_updated'
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
  'catalog_audit_restored_after_manager_media_edit',
  'product',
  recoverable.product_id::text,
  jsonb_build_object(
    'audit_item_id', recoverable.audit_item_id,
    'reason', 'Manager media edits now preserve the existing approval'
  )
from recoverable
join restored on restored.id = recoverable.product_id;
