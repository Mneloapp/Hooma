-- Hooma 3D-print commerce foundation.
-- Additive migration: preserves the previous furniture prototype tables while
-- introducing category, source-rights, production, tracking, payment, and audit layers.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  slug text unique not null,
  name_en text not null,
  name_ka text not null,
  description_en text,
  description_ka text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists name_ka text;
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete restrict;
alter table public.products add column if not exists short_description_ka text;
alter table public.products add column if not exists long_description_ka text;
alter table public.products add column if not exists currency text not null default 'GEL';
alter table public.products add column if not exists base_price numeric(12,2);
alter table public.products add column if not exists sale_price numeric(12,2);
alter table public.products add column if not exists lead_time_business_days integer not null default 3 check (lead_time_business_days between 1 and 90);
alter table public.products add column if not exists estimated_print_minutes integer check (estimated_print_minutes is null or estimated_print_minutes > 0);
alter table public.products add column if not exists material_grams numeric(10,2) check (material_grams is null or material_grams > 0);
alter table public.products add column if not exists safety_notes text;
alter table public.products add column if not exists production_status text not null default 'not_tested'
  check (production_status in ('not_tested','test_required','approved','paused'));

alter table public.product_variants add column if not exists material text;
alter table public.product_variants add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.product_variants add column if not exists estimated_print_minutes integer check (estimated_print_minutes is null or estimated_print_minutes > 0);
alter table public.product_variants add column if not exists material_grams numeric(10,2) check (material_grams is null or material_grams > 0);
alter table public.product_variants add column if not exists plate_count integer not null default 1 check (plate_count > 0);
alter table public.product_variants add column if not exists print_profile_path text;

alter table public.order_items add column if not exists material text;
alter table public.order_items add column if not exists production_notes text;

alter table public.orders add column if not exists tracking_code text unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
alter table public.orders add column if not exists fulfillment_status text not null default 'order_received'
  check (fulfillment_status in ('order_received','confirmed','production_queued','in_production','quality_check','ready_for_delivery','out_for_delivery','delivered','cancelled'));
alter table public.orders add column if not exists promised_at timestamptz;
alter table public.orders add column if not exists test_mode boolean not null default true;

create table if not exists public.product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  platform text not null check (platform in ('hooma','makerworld','printables','thingiverse','other')),
  source_url text not null,
  source_model_id text,
  creator_name text,
  creator_url text,
  license_name text,
  license_url text,
  license_status text not null default 'pending' check (license_status in ('pending','verified','rejected','not_required')),
  commercial_use_allowed boolean,
  media_use_allowed boolean,
  permission_evidence_path text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, source_url)
);

create table if not exists public.source_imports (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  platform text not null default 'makerworld',
  status text not null default 'submitted' check (status in ('submitted','metadata_ready','needs_review','approved','rejected','failed')),
  extracted_metadata jsonb not null default '{}'::jsonb,
  suggested_category_id uuid references public.categories(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  error_message text,
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manufacturer text not null default 'Bambu Lab',
  model text not null,
  serial_number_masked text,
  credential_ref text,
  status text not null default 'offline' check (status in ('offline','idle','busy','paused','maintenance','error')),
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references public.order_items(id) on delete restrict,
  printer_id uuid references public.printers(id) on delete set null,
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval','queued','preparing','printing','paused','completed','quality_check','approved','failed','cancelled')),
  plate_number integer not null default 1 check (plate_number > 0),
  external_job_id text,
  print_profile_path text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  material text,
  color text,
  telemetry jsonb not null default '{}'::jsonb,
  operator_notes text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id, plate_number)
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  customer_label_en text not null,
  customer_label_ka text not null,
  details jsonb not null default '{}'::jsonb,
  is_customer_visible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null check (provider in ('test','tbc','bog')),
  provider_payment_id text,
  idempotency_key text not null unique,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'GEL',
  status text not null default 'created' check (status in ('created','pending','authorized','paid','failed','cancelled','refunded')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_parent_sort on public.categories(parent_id, sort_order);
create index if not exists idx_products_category_status on public.products(category_id, status);
create index if not exists idx_source_imports_status_created on public.source_imports(status, created_at desc);
create index if not exists idx_product_sources_product on public.product_sources(product_id);
create index if not exists idx_print_jobs_status_created on public.print_jobs(status, created_at);
create index if not exists idx_print_jobs_printer_status on public.print_jobs(printer_id, status);
create index if not exists idx_order_events_order_created on public.order_events(order_id, created_at);
create index if not exists idx_payment_attempts_order on public.payment_attempts(order_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id, created_at desc);

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists set_product_sources_updated_at on public.product_sources;
create trigger set_product_sources_updated_at before update on public.product_sources for each row execute function public.set_updated_at();
drop trigger if exists set_source_imports_updated_at on public.source_imports;
create trigger set_source_imports_updated_at before update on public.source_imports for each row execute function public.set_updated_at();
drop trigger if exists set_printers_updated_at on public.printers;
create trigger set_printers_updated_at before update on public.printers for each row execute function public.set_updated_at();
drop trigger if exists set_print_jobs_updated_at on public.print_jobs;
create trigger set_print_jobs_updated_at before update on public.print_jobs for each row execute function public.set_updated_at();
drop trigger if exists set_payment_attempts_updated_at on public.payment_attempts;
create trigger set_payment_attempts_updated_at before update on public.payment_attempts for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.product_sources enable row level security;
alter table public.source_imports enable row level security;
alter table public.printers enable row level security;
alter table public.print_jobs enable row level security;
alter table public.order_events enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.audit_log enable row level security;

create policy "public reads active categories" on public.categories for select using (is_active or public.is_admin());
create policy "admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage product sources" on public.product_sources for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage source imports" on public.source_imports for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage printers" on public.printers for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage print jobs" on public.print_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage order events" on public.order_events for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own order events" on public.order_events for select using (
  exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = order_id and c.profile_id = auth.uid()
  )
);
create policy "admins manage payment attempts" on public.payment_attempts for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own payment attempts" on public.payment_attempts for select using (
  exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = order_id and c.profile_id = auth.uid()
  )
);
create policy "admins read audit log" on public.audit_log for select using (public.is_admin());
create policy "admins create audit log" on public.audit_log for insert with check (public.is_admin());

-- Existing inventory SECURITY DEFINER functions must not be callable by browser roles.
revoke all on function public.reserve_order_inventory(uuid) from public, anon, authenticated;
revoke all on function public.finalize_order_inventory(uuid) from public, anon, authenticated;
revoke all on function public.release_order_inventory(uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid) to service_role;
grant execute on function public.finalize_order_inventory(uuid) to service_role;
grant execute on function public.release_order_inventory(uuid) to service_role;

-- Guest orders are created only by trusted server code using service_role.
drop policy if exists "customers create own orders" on public.orders;
create policy "customers create own orders" on public.orders for insert with check (
  customer_id is not null
  and exists (select 1 from public.customers c where c.id = customer_id and c.profile_id = auth.uid())
);
drop policy if exists "customers create order items for own orders" on public.order_items;
create policy "customers create order items for own orders" on public.order_items for insert with check (
  exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = order_id and c.profile_id = auth.uid()
  )
);

insert into public.categories (slug, name_en, name_ka, sort_order)
values
  ('home-organization', 'Home & Organization', 'სახლი და ორგანიზება', 10),
  ('desk-tech', 'Desk & Tech', 'სამუშაო სივრცე და ტექნიკა', 20),
  ('kitchen', 'Kitchen', 'სამზარეულო', 30),
  ('kids-learning', 'Kids & Learning', 'ბავშვები და სწავლა', 40),
  ('pets', 'Pets', 'შინაური ცხოველები', 50),
  ('car-accessories', 'Car Accessories', 'ავტომობილის აქსესუარები', 60),
  ('gifts-personalization', 'Gifts & Personalization', 'საჩუქრები და პერსონალიზაცია', 70),
  ('custom-parts', 'Custom Parts', 'ინდივიდუალური დეტალები', 80)
on conflict (slug) do update set name_en = excluded.name_en, name_ka = excluded.name_ka, sort_order = excluded.sort_order;

with child_values(parent_slug, slug, name_en, name_ka, sort_order) as (
  values
    ('home-organization','storage-organizers','Storage & organizers','შენახვა და ორგანიზება',11),
    ('home-organization','hooks-mounts','Hooks & mounts','კავები და სამაგრები',12),
    ('home-organization','bathroom','Bathroom','აბაზანა',13),
    ('home-organization','plant-accessories','Plant accessories','მცენარის აქსესუარები',14),
    ('desk-tech','phone-stands','Phone stands','ტელეფონის სადგამები',21),
    ('desk-tech','laptop-tablet-stands','Laptop & tablet stands','ლეპტოპისა და ტაბლეტის სადგამები',22),
    ('desk-tech','cable-management','Cable management','კაბელების ორგანიზება',23),
    ('desk-tech','gaming-accessories','Gaming accessories','გეიმინგ აქსესუარები',24),
    ('kitchen','kitchen-organizers','Organizers','ორგანაიზერები',31),
    ('kitchen','tools-helpers','Tools & helpers','ხელსაწყოები და დამხმარეები',32),
    ('kitchen','coffee-bar','Coffee & bar','ყავა და ბარი',33),
    ('kitchen','kitchen-storage','Storage','შენახვა',34),
    ('kids-learning','montessori','Montessori','მონტესორი',41),
    ('kids-learning','puzzles','Puzzles','ფაზლები',42),
    ('kids-learning','creative-toys','Creative toys','შემოქმედებითი სათამაშოები',43),
    ('kids-learning','kids-desk','Desk accessories','საბავშვო სამუშაო სივრცე',44),
    ('pets','pet-feeding','Feeding','კვება',51),
    ('pets','pet-organization','Organization','ორგანიზება',52),
    ('pets','pet-toys','Toys','სათამაშოები',53),
    ('pets','pet-personalized','Personalized accessories','პერსონალიზებული აქსესუარები',54),
    ('car-accessories','console-organizers','Console organizers','კონსოლის ორგანაიზერები',61),
    ('car-accessories','car-mounts','Mounts','სამაგრები',62),
    ('car-accessories','car-storage','Storage','შენახვა',63),
    ('car-accessories','car-utility','Utility parts','დამხმარე დეტალები',64),
    ('gifts-personalization','name-products','Name products','სახელიანი ნივთები',71),
    ('gifts-personalization','desk-gifts','Desk gifts','სამუშაო მაგიდის საჩუქრები',72),
    ('gifts-personalization','home-gifts','Home gifts','სახლის საჩუქრები',73),
    ('gifts-personalization','seasonal','Seasonal','სეზონური',74),
    ('custom-parts','replacement-parts','Replacement parts','შემცვლელი დეტალები',81),
    ('custom-parts','adapters','Adapters','ადაპტერები',82),
    ('custom-parts','mounts-brackets','Mounts & brackets','სამაგრები და კრონშტეინები',83),
    ('custom-parts','request-part','Request a part','დეტალის შეკვეთა',84)
)
insert into public.categories (parent_id, slug, name_en, name_ka, sort_order)
select parent.id, child.slug, child.name_en, child.name_ka, child.sort_order
from child_values child
join public.categories parent on parent.slug = child.parent_slug
on conflict (slug) do update set parent_id = excluded.parent_id, name_en = excluded.name_en, name_ka = excluded.name_ka, sort_order = excluded.sort_order;
