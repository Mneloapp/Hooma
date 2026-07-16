-- Verified product reviews, public sales aggregates, and popularity ranking.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 3 and 2000),
  status text not null default 'published' check (status in ('published', 'hidden', 'rejected')),
  verified_purchase boolean not null default true,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  moderation_note text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, product_id)
);

create index if not exists idx_product_reviews_public
  on public.product_reviews(product_id, status, updated_at desc);
create index if not exists idx_product_reviews_moderation
  on public.product_reviews(status, created_at desc);
create index if not exists idx_order_items_product_sales
  on public.order_items(product_id, order_id) where product_id is not null;
create index if not exists idx_orders_public_sales
  on public.orders(payment_status, test_mode, fulfillment_status, status);

drop trigger if exists set_product_reviews_updated_at on public.product_reviews;
create trigger set_product_reviews_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

alter table public.product_reviews enable row level security;

drop policy if exists "public reads published product reviews" on public.product_reviews;
create policy "public reads published product reviews" on public.product_reviews
  for select using (
    status = 'published'
    or profile_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "admins manage product reviews" on public.product_reviews;
create policy "admins manage product reviews" on public.product_reviews
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;

drop view if exists public.product_public_reviews;
create view public.product_public_reviews
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
where review.status = 'published';

revoke all on public.product_public_reviews from public, anon, authenticated;
grant select on public.product_public_reviews to anon, authenticated;

drop view if exists public.product_public_metrics;
create view public.product_public_metrics
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
where product.status = 'active';

revoke all on public.product_public_metrics from public, anon, authenticated;
grant select on public.product_public_metrics to anon, authenticated;

create or replace function public.get_my_product_review_context(
  requested_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  eligible_order_item_id uuid;
  existing_review jsonb;
begin
  if actor_id is null then
    return jsonb_build_object('authenticated', false, 'eligible', false, 'order_item_id', null, 'review', null);
  end if;

  select item.id
  into eligible_order_item_id
  from public.order_items item
  join public.orders customer_order on customer_order.id = item.order_id
  join public.customers customer on customer.id = customer_order.customer_id
  where customer.profile_id = actor_id
    and item.product_id = requested_product_id
    and customer_order.fulfillment_status = 'delivered'
    and (customer_order.payment_status = 'paid' or customer_order.test_mode = true)
  order by customer_order.created_at desc, item.created_at desc
  limit 1;

  select jsonb_build_object(
    'id', review.id,
    'rating', review.rating,
    'comment', review.comment,
    'status', review.status,
    'verified_purchase', review.verified_purchase,
    'updated_at', review.updated_at
  )
  into existing_review
  from public.product_reviews review
  where review.profile_id = actor_id
    and review.product_id = requested_product_id;

  return jsonb_build_object(
    'authenticated', true,
    'eligible', eligible_order_item_id is not null,
    'order_item_id', eligible_order_item_id,
    'review', existing_review
  );
end;
$$;

create or replace function public.submit_my_product_review(
  requested_product_id uuid,
  requested_order_item_id uuid,
  requested_rating integer,
  requested_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  saved_review public.product_reviews%rowtype;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = actor_id and profile.is_active = true
  ) then
    raise exception 'AUTH_REQUIRED';
  end if;
  if requested_rating < 1 or requested_rating > 5 then raise exception 'INVALID_RATING'; end if;
  if char_length(trim(coalesce(requested_comment, ''))) < 3
    or char_length(trim(requested_comment)) > 2000 then raise exception 'INVALID_COMMENT'; end if;
  if not exists (
    select 1
    from public.order_items item
    join public.orders customer_order on customer_order.id = item.order_id
    join public.customers customer on customer.id = customer_order.customer_id
    where item.id = requested_order_item_id
      and item.product_id = requested_product_id
      and customer.profile_id = actor_id
      and customer_order.fulfillment_status = 'delivered'
      and (customer_order.payment_status = 'paid' or customer_order.test_mode = true)
  ) then
    raise exception 'VERIFIED_PURCHASE_REQUIRED';
  end if;

  insert into public.product_reviews (
    product_id, profile_id, order_item_id, rating, comment, status,
    verified_purchase, moderated_by, moderated_at, moderation_note, published_at
  ) values (
    requested_product_id, actor_id, requested_order_item_id, requested_rating,
    trim(requested_comment), 'published', true, null, null, null, now()
  )
  on conflict (profile_id, product_id) do update
  set order_item_id = excluded.order_item_id,
      rating = excluded.rating,
      comment = excluded.comment,
      status = 'published',
      verified_purchase = true,
      moderated_by = null,
      moderated_at = null,
      moderation_note = null,
      published_at = now()
  returning * into saved_review;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'product_review_submitted',
    'product_review',
    saved_review.id::text,
    jsonb_build_object('product_id', requested_product_id, 'rating', requested_rating, 'verified_purchase', true)
  );

  return jsonb_build_object(
    'id', saved_review.id,
    'product_id', saved_review.product_id,
    'rating', saved_review.rating,
    'status', saved_review.status
  );
end;
$$;

create or replace function public.delete_my_product_review(
  requested_product_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  deleted_review_id uuid;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED'; end if;

  delete from public.product_reviews
  where product_id = requested_product_id and profile_id = actor_id
  returning id into deleted_review_id;

  if deleted_review_id is not null then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_id,
      'product_review_deleted',
      'product_review',
      deleted_review_id::text,
      jsonb_build_object('product_id', requested_product_id)
    );
  end if;
  return deleted_review_id is not null;
end;
$$;

create or replace function public.moderate_product_review(
  actor_profile_id uuid,
  requested_review_id uuid,
  requested_status text,
  requested_note text default null
)
returns public.product_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_review public.product_reviews%rowtype;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_profile_id
      and profile.is_active = true
      and profile.role in ('owner', 'admin', 'catalog_manager')
  ) then raise exception 'CATALOG_ACCESS_REQUIRED'; end if;
  if requested_status not in ('published', 'hidden', 'rejected') then raise exception 'INVALID_REVIEW_STATUS'; end if;

  update public.product_reviews
  set status = requested_status,
      moderated_by = actor_profile_id,
      moderated_at = now(),
      moderation_note = nullif(trim(coalesce(requested_note, '')), ''),
      published_at = case when requested_status = 'published' then now() else published_at end
  where id = requested_review_id
  returning * into saved_review;
  if saved_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'product_review_moderated',
    'product_review',
    saved_review.id::text,
    jsonb_build_object('status', requested_status, 'product_id', saved_review.product_id, 'note_present', requested_note is not null)
  );
  return saved_review;
end;
$$;

revoke all on function public.get_my_product_review_context(uuid) from public, anon, authenticated;
grant execute on function public.get_my_product_review_context(uuid) to authenticated;
revoke all on function public.submit_my_product_review(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.submit_my_product_review(uuid, uuid, integer, text) to authenticated;
revoke all on function public.delete_my_product_review(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_product_review(uuid) to authenticated;
revoke all on function public.moderate_product_review(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_product_review(uuid, uuid, text, text) to service_role;
