-- Authenticated custom-part quote workflow.
-- Files remain private. A verified payment may create an order and an
-- operator-gated print job, but never starts a printer directly.

create table if not exists public.custom_quote_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 3000),
  quantity integer not null default 1 check (quantity between 1 and 100),
  dimensions text,
  material_preference text,
  color_preference text,
  status text not null default 'submitted'
    check (status in (
      'submitted','under_review','needs_information','quoted','accepted',
      'payment_pending','paid','production_queued','in_production',
      'quality_check','ready_for_delivery','delivered','rejected','cancelled'
    )),
  quoted_price numeric(12,2) check (quoted_price is null or quoted_price >= 0),
  quote_currency text not null default 'GEL',
  quoted_lead_days integer check (quoted_lead_days is null or quoted_lead_days between 1 and 90),
  quote_notes text,
  quote_expires_at timestamptz,
  files_verified boolean not null default false,
  delivery_address jsonb,
  order_id uuid references public.orders(id) on delete set null,
  quoted_by uuid references public.profiles(id) on delete set null,
  quoted_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_quote_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_quote_requests(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_quote_requests_profile_created
  on public.custom_quote_requests(profile_id, created_at desc);
create index if not exists idx_custom_quote_requests_status_created
  on public.custom_quote_requests(status, created_at asc);
create index if not exists idx_custom_quote_files_request
  on public.custom_quote_files(request_id);

drop trigger if exists set_custom_quote_requests_updated_at on public.custom_quote_requests;
create trigger set_custom_quote_requests_updated_at
  before update on public.custom_quote_requests
  for each row execute function public.set_updated_at();

alter table public.custom_quote_requests enable row level security;
alter table public.custom_quote_files enable row level security;

drop policy if exists "customers read own custom quote requests" on public.custom_quote_requests;
create policy "customers read own custom quote requests" on public.custom_quote_requests
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "customers submit own custom quote requests" on public.custom_quote_requests;
create policy "customers submit own custom quote requests" on public.custom_quote_requests
  for insert with check (
    profile_id = auth.uid()
    and status = 'submitted'
    and quoted_price is null
    and order_id is null
    and files_verified = false
  );

drop policy if exists "customers delete own submitted custom quote requests" on public.custom_quote_requests;
create policy "customers delete own submitted custom quote requests" on public.custom_quote_requests
  for delete using (profile_id = auth.uid() and status = 'submitted');

drop policy if exists "admins manage custom quote requests" on public.custom_quote_requests;
create policy "admins manage custom quote requests" on public.custom_quote_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers read own custom quote files" on public.custom_quote_files;
create policy "customers read own custom quote files" on public.custom_quote_files
  for select using (
    exists (
      select 1 from public.custom_quote_requests request
      where request.id = request_id and request.profile_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "customers attach files to own custom quote requests" on public.custom_quote_files;
create policy "customers attach files to own custom quote requests" on public.custom_quote_files
  for insert with check (
    exists (
      select 1 from public.custom_quote_requests request
      where request.id = request_id
        and request.profile_id = auth.uid()
        and request.status = 'submitted'
    )
  );

drop policy if exists "admins manage custom quote files" on public.custom_quote_files;
create policy "admins manage custom quote files" on public.custom_quote_files
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('custom-quote-files', 'custom-quote-files', false, 104857600)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "customers upload own custom quote objects" on storage.objects;
-- Uploads use short-lived signed upload tokens issued by trusted server code.
-- No general authenticated INSERT policy is created for this bucket.

drop policy if exists "customers read own custom quote objects" on storage.objects;
create policy "customers read own custom quote objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'custom-quote-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "customers delete own unsubmitted custom quote objects" on storage.objects;
create policy "customers delete own unsubmitted custom quote objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'custom-quote-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.custom_quote_requests request
      where request.profile_id = auth.uid()
        and request.id::text = (storage.foldername(name))[2]
    )
  );

create or replace function public.accept_custom_quote(custom_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.custom_quote_requests
  set status = 'payment_pending', accepted_at = now(), updated_at = now()
  where id = custom_request_id
    and profile_id = auth.uid()
    and status = 'quoted'
    and quoted_price is not null
    and (quote_expires_at is null or quote_expires_at > now());

  if not found then
    raise exception 'Quote is unavailable, expired, or does not belong to this account';
  end if;
end;
$$;

revoke all on function public.accept_custom_quote(uuid) from public, anon;
grant execute on function public.accept_custom_quote(uuid) to authenticated;

-- Called only by the signature-verified payment webhook after it records a
-- successful payment and delivery address. The created print job still waits
-- for operator approval before any Bambu Lab command can be sent.
create or replace function public.queue_paid_custom_quote(custom_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_record public.custom_quote_requests%rowtype;
  customer_uuid uuid;
  new_order_id uuid;
  new_order_item_id uuid;
  promised_timestamp timestamptz := now();
  added_business_days integer := 0;
begin
  select * into quote_record
  from public.custom_quote_requests
  where id = custom_request_id
  for update;

  if quote_record.id is null then
    raise exception 'Custom quote request not found';
  end if;
  if quote_record.status <> 'paid' or quote_record.paid_at is null then
    raise exception 'A verified paid status is required';
  end if;
  if quote_record.order_id is not null then
    return quote_record.order_id;
  end if;
  if quote_record.quoted_price is null or quote_record.delivery_address is null then
    raise exception 'Quote price and delivery address are required';
  end if;
  if quote_record.files_verified is not true then
    raise exception 'Uploaded files require operator verification';
  end if;

  select id into customer_uuid
  from public.customers
  where profile_id = quote_record.profile_id
  limit 1;

  if customer_uuid is null then
    raise exception 'Customer record not found';
  end if;

  while added_business_days < 3 loop
    promised_timestamp := promised_timestamp + interval '1 day';
    if extract(isodow from promised_timestamp) < 6 then
      added_business_days := added_business_days + 1;
    end if;
  end loop;

  insert into public.orders (
    customer_id, status, payment_status, subtotal, delivery_fee, total,
    delivery_address, notes, fulfillment_status, promised_at, test_mode
  ) values (
    customer_uuid, 'paid', 'paid', quote_record.quoted_price * quote_record.quantity,
    0, quote_record.quoted_price * quote_record.quantity, quote_record.delivery_address,
    'Custom quote request ' || quote_record.id::text, 'production_queued',
    promised_timestamp, false
  ) returning id into new_order_id;

  insert into public.order_items (
    order_id, product_name, sku, size_label, material, color, quantity,
    unit_price, total_price, production_notes
  ) values (
    new_order_id, quote_record.title,
    'HOO-CUSTOM-' || upper(substr(replace(quote_record.id::text, '-', ''), 1, 8)),
    quote_record.dimensions, quote_record.material_preference,
    quote_record.color_preference, quote_record.quantity,
    quote_record.quoted_price, quote_record.quoted_price * quote_record.quantity,
    quote_record.description
  ) returning id into new_order_item_id;

  insert into public.order_events (
    order_id, event_type, customer_label_en, customer_label_ka, details, is_customer_visible
  ) values (
    new_order_id, 'production_queued', 'Queued for production',
    'წარმოების რიგშია', jsonb_build_object('custom_quote_request_id', quote_record.id), true
  );

  insert into public.print_jobs (
    order_item_id, status, plate_number, material, color, operator_notes
  ) values (
    new_order_item_id, 'awaiting_approval', 1,
    quote_record.material_preference, quote_record.color_preference,
    'Created from verified paid custom quote. Operator approval is required.'
  );

  update public.custom_quote_requests
  set order_id = new_order_id, status = 'production_queued', updated_at = now()
  where id = quote_record.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    quote_record.profile_id, 'custom_quote_queued_after_verified_payment',
    'custom_quote_request', quote_record.id::text,
    jsonb_build_object('order_id', new_order_id)
  );

  return new_order_id;
end;
$$;

revoke all on function public.queue_paid_custom_quote(uuid) from public, anon, authenticated;
grant execute on function public.queue_paid_custom_quote(uuid) to service_role;
