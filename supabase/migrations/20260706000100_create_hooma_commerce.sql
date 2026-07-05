create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text check (role in ('admin','customer')) default 'customer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  original_model_code text,
  original_name text,
  hooma_name text not null,
  category text,
  short_description text,
  long_description text,
  hero_image text,
  gallery_images text[],
  tags text[],
  is_featured boolean default false,
  status text check (status in ('active','draft','archived','coming_soon')) default 'draft',
  price_placeholder text default 'Request price',
  delivery_estimate text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  sku text unique not null,
  size_label text,
  layout_label text,
  orientation text,
  product_dimensions_cm jsonb,
  packing_dimensions_cm jsonb,
  gross_weight_kg numeric,
  image text,
  price numeric,
  price_placeholder text default 'Request price',
  available_colors text[],
  available_fabrics text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  sku text not null,
  color text,
  fabric text,
  orientation text,
  quantity_available integer default 0,
  quantity_reserved integer default 0,
  quantity_sold integer default 0,
  low_stock_threshold integer default 3,
  stock_status text check (stock_status in ('in_stock','low_stock','preorder','out_of_stock','coming_soon')) default 'coming_soon',
  updated_at timestamptz default now(),
  unique (variant_id, color, fabric, orientation)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  full_name text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  is_default boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  guest_email text,
  guest_phone text,
  status text check (status in ('pending','confirmed','paid','processing','shipped','delivered','cancelled')) default 'pending',
  payment_status text check (payment_status in ('unpaid','paid','failed','refunded')) default 'unpaid',
  subtotal numeric default 0,
  delivery_fee numeric default 0,
  total numeric default 0,
  delivery_address jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  inventory_id uuid references public.inventory(id),
  product_name text,
  sku text,
  size_label text,
  fabric text,
  color text,
  orientation text,
  quantity integer not null,
  unit_price numeric,
  total_price numeric,
  created_at timestamptz default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_products_status_category on public.products(status, category);
create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_inventory_variant_status on public.inventory(variant_id, stock_status);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status, payment_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists set_product_variants_updated_at on public.product_variants;
create trigger set_product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_customer_id uuid;
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;

  insert into public.customers (profile_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  returning id into new_customer_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.reserve_order_inventory(order_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory i
  set quantity_reserved = quantity_reserved + oi.quantity,
      updated_at = now()
  from public.order_items oi
  where oi.order_id = order_uuid
    and oi.inventory_id = i.id;
end;
$$;

create or replace function public.finalize_order_inventory(order_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory i
  set quantity_reserved = greatest(quantity_reserved - oi.quantity, 0),
      quantity_available = greatest(quantity_available - oi.quantity, 0),
      quantity_sold = quantity_sold + oi.quantity,
      updated_at = now()
  from public.order_items oi
  where oi.order_id = order_uuid
    and oi.inventory_id = i.id;
end;
$$;

create or replace function public.release_order_inventory(order_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory i
  set quantity_reserved = greatest(quantity_reserved - oi.quantity, 0),
      updated_at = now()
  from public.order_items oi
  where oi.order_id = order_uuid
    and oi.inventory_id = i.id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.customers enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products" on public.products
  for select using (status = 'active' or public.is_admin());
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can read active variants" on public.product_variants;
create policy "public can read active variants" on public.product_variants
  for select using (
    is_active = true
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    or public.is_admin()
  );
drop policy if exists "admins manage variants" on public.product_variants;
create policy "admins manage variants" on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can read inventory availability" on public.inventory;
create policy "public can read inventory availability" on public.inventory
  for select using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    or public.is_admin()
  );
drop policy if exists "admins manage inventory" on public.inventory;
create policy "admins manage inventory" on public.inventory
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers read own customer record" on public.customers;
create policy "customers read own customer record" on public.customers
  for select using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "customers update own customer record" on public.customers;
create policy "customers update own customer record" on public.customers
  for update using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());
drop policy if exists "admins manage customers" on public.customers;
create policy "admins manage customers" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers manage own addresses" on public.addresses;
create policy "customers manage own addresses" on public.addresses
  for all using (
    exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = auth.uid())
    or public.is_admin()
  ) with check (
    exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders
  for select using (
    exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "customers create own orders" on public.orders;
create policy "customers create own orders" on public.orders
  for insert with check (
    customer_id is null
    or exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "admins manage orders" on public.orders;
create policy "admins manage orders" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers read own order items" on public.order_items;
create policy "customers read own order items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = order_id and c.profile_id = auth.uid()
    )
    or public.is_admin()
  );
drop policy if exists "customers create order items for own orders" on public.order_items;
create policy "customers create order items for own orders" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
      and (
        o.customer_id is null
        or exists (select 1 from public.customers c where c.id = o.customer_id and c.profile_id = auth.uid())
      )
    )
    or public.is_admin()
  );
drop policy if exists "admins manage order items" on public.order_items;
create policy "admins manage order items" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());
