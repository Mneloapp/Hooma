-- Publish a reviewed group of catalog Drafts in one database round trip.
-- Each product runs in an exception-isolated subtransaction so one incomplete
-- Draft does not prevent all otherwise valid Drafts from being published.

create or replace function public.bulk_confirm_and_publish_catalog_products(
  requested_product_ids uuid[],
  actor_profile_id uuid,
  confirmed_publication_authority boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  normalized_ids uuid[];
  current_product_id uuid;
  current_status text;
  published_ids jsonb := '[]'::jsonb;
  skipped_ids jsonb := '[]'::jsonb;
  failures jsonb := '[]'::jsonb;
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin');
  if actor_role is null then
    raise exception 'Only an active Admin or Owner may bulk publish catalog products';
  end if;
  if confirmed_publication_authority is not true then
    raise exception 'An explicit confirmation is required';
  end if;

  select coalesce(array_agg(item_id order by first_position), '{}'::uuid[])
  into normalized_ids
  from (
    select item_id, min(position) as first_position
    from unnest(requested_product_ids) with ordinality as requested(item_id, position)
    where item_id is not null
    group by item_id
  ) unique_items;

  if cardinality(normalized_ids) < 1 or cardinality(normalized_ids) > 1000 then
    raise exception 'Between 1 and 1000 products are required';
  end if;

  foreach current_product_id in array normalized_ids loop
    select status into current_status
    from public.products
    where id = current_product_id;

    if not found then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'product_id', current_product_id,
        'error', 'Product was not found'
      ));
    elsif current_status = 'active' then
      skipped_ids := skipped_ids || jsonb_build_array(current_product_id);
    elsif current_status <> 'draft' then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'product_id', current_product_id,
        'error', 'Only Draft products may be bulk published'
      ));
    else
      begin
        perform public.confirm_and_publish_catalog_product(
          current_product_id,
          actor_profile_id,
          true
        );
        published_ids := published_ids || jsonb_build_array(current_product_id);
      exception when others then
        failures := failures || jsonb_build_array(jsonb_build_object(
          'product_id', current_product_id,
          'error', sqlerrm
        ));
      end;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'catalog_products_bulk_published',
    'catalog',
    null,
    jsonb_build_object(
      'actor_role', actor_role,
      'requested_count', cardinality(normalized_ids),
      'published_ids', published_ids,
      'skipped_ids', skipped_ids,
      'failures', failures
    )
  );

  return jsonb_build_object(
    'requested_count', cardinality(normalized_ids),
    'published_count', jsonb_array_length(published_ids),
    'skipped_count', jsonb_array_length(skipped_ids),
    'failed_count', jsonb_array_length(failures),
    'published_ids', published_ids,
    'skipped_ids', skipped_ids,
    'failures', failures
  );
end;
$$;

revoke all on function public.bulk_confirm_and_publish_catalog_products(uuid[], uuid, boolean) from public, anon, authenticated;
grant execute on function public.bulk_confirm_and_publish_catalog_products(uuid[], uuid, boolean) to service_role;
