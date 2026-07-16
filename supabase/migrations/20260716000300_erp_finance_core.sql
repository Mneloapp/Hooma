-- Hooma ERP V1: auditable finance, raw-material lots, production usage and accountant exports.
-- Statutory filing remains an accountant-approved integration; test transactions are excluded.

create or replace function public.erp_actor_can_manage(actor_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = actor_profile_id
      and is_active = true
      and role in ('owner', 'admin')
  );
$$;

create table if not exists public.erp_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text,
  tax_id text,
  entity_type text not null default 'llc'
    check (entity_type in ('llc', 'individual_entrepreneur', 'other')),
  tax_regime text not null default 'standard'
    check (tax_regime in ('standard', 'small_business', 'micro_business', 'fixed', 'other')),
  vat_registered boolean not null default false,
  vat_rate numeric(5,2) not null default 18 check (vat_rate between 0 and 100),
  reporting_currency text not null default 'GEL' check (reporting_currency = 'GEL'),
  inventory_method text not null default 'fifo' check (inventory_method = 'fifo'),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  accounting_standard text not null default 'accountant_review_pending',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.erp_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.erp_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_erp_suppliers_tax_id_unique
  on public.erp_suppliers(tax_id) where tax_id is not null and tax_id <> '';
create index if not exists idx_erp_suppliers_name on public.erp_suppliers(lower(name));

create table if not exists public.erp_accounts (
  code text primary key,
  name_ka text not null,
  name_en text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.erp_accounts (code, name_ka, name_en, account_type, normal_balance)
values
  ('1000', 'ბანკი და ფული', 'Cash and bank', 'asset', 'debit'),
  ('1200', 'მისაღები თანხები', 'Accounts receivable', 'asset', 'debit'),
  ('1300', 'ნედლეულის მარაგი', 'Raw material inventory', 'asset', 'debit'),
  ('1400', 'დაუმთავრებელი წარმოება', 'Work in progress', 'asset', 'debit'),
  ('1500', 'მზა პროდუქცია', 'Finished goods', 'asset', 'debit'),
  ('1600', 'ჩასათვლელი დღგ', 'Input VAT', 'asset', 'debit'),
  ('2000', 'მომწოდებლის დავალიანება', 'Accounts payable', 'liability', 'credit'),
  ('2100', 'გადასახდელი დღგ', 'Output VAT', 'liability', 'credit'),
  ('3000', 'კაპიტალი', 'Equity', 'equity', 'credit'),
  ('4000', 'პროდუქტის გაყიდვის შემოსავალი', 'Product sales revenue', 'revenue', 'credit'),
  ('4010', 'მიწოდების შემოსავალი', 'Delivery revenue', 'revenue', 'credit'),
  ('5000', 'გაყიდული პროდუქტის მასალის ხარჯი', 'Material cost of goods sold', 'expense', 'debit'),
  ('5020', 'საწარმოო დანაკარგი', 'Production waste', 'expense', 'debit'),
  ('6000', 'საოპერაციო ხარჯები', 'Operating expenses', 'expense', 'debit'),
  ('6100', 'მიწოდების ხარჯი', 'Delivery expense', 'expense', 'debit')
on conflict (code) do update set
  name_ka = excluded.name_ka,
  name_en = excluded.name_en,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance;

create table if not exists public.erp_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique(period_start, period_end)
);

create table if not exists public.erp_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  entry_date date not null,
  source_type text not null,
  source_id uuid,
  document_number text,
  description text not null,
  currency text not null default 'GEL' check (currency = 'GEL'),
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  is_test boolean not null default false,
  reversal_of_id uuid references public.erp_journal_entries(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_erp_journal_source_unique
  on public.erp_journal_entries(source_type, source_id)
  where source_id is not null;
create index if not exists idx_erp_journal_date on public.erp_journal_entries(entry_date, entry_number);

create table if not exists public.erp_journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.erp_journal_entries(id) on delete restrict,
  account_code text not null references public.erp_accounts(code) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  memo text,
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists idx_erp_journal_lines_entry on public.erp_journal_lines(entry_id);
create index if not exists idx_erp_journal_lines_account on public.erp_journal_lines(account_code, entry_id);

create table if not exists public.erp_material_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
  material_profile_id uuid not null references public.material_cost_profiles(id) on delete restrict,
  document_type text not null default 'tax_source_document'
    check (document_type in ('tax_invoice', 'tax_document', 'tax_source_document', 'receipt', 'import_document', 'other')),
  document_number text not null,
  document_date date not null,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  unit_cost_excl_vat numeric(14,4) not null check (unit_cost_excl_vat >= 0),
  subtotal_source numeric(14,2) not null check (subtotal_source >= 0),
  vat_source numeric(14,2) not null default 0 check (vat_source >= 0),
  total_source numeric(14,2) not null check (total_source >= 0),
  currency text not null default 'GEL' check (char_length(currency) = 3),
  exchange_rate_to_gel numeric(16,6) not null default 1 check (exchange_rate_to_gel > 0),
  subtotal_gel numeric(14,2) not null check (subtotal_gel >= 0),
  vat_gel numeric(14,2) not null default 0 check (vat_gel >= 0),
  recoverable_vat_gel numeric(14,2) not null default 0 check (recoverable_vat_gel >= 0),
  total_gel numeric(14,2) not null check (total_gel >= 0),
  payment_status text not null default 'paid' check (payment_status in ('unpaid', 'partial', 'paid')),
  paid_amount_gel numeric(14,2) not null default 0 check (paid_amount_gel >= 0),
  payment_method text,
  payment_reference text,
  paid_at date,
  document_reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (total_source = subtotal_source + vat_source),
  check (paid_amount_gel <= total_gel)
);

create index if not exists idx_erp_material_purchases_date on public.erp_material_purchases(document_date desc);
create index if not exists idx_erp_material_purchases_supplier on public.erp_material_purchases(supplier_id, document_date desc);

create table if not exists public.erp_material_lots (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.erp_material_purchases(id) on delete restrict,
  material_profile_id uuid not null references public.material_cost_profiles(id) on delete restrict,
  lot_number text not null unique,
  received_grams numeric(14,3) not null check (received_grams > 0),
  remaining_grams numeric(14,3) not null check (remaining_grams >= 0),
  unit_cost_per_gram_gel numeric(16,6) not null check (unit_cost_per_gram_gel >= 0),
  received_at date not null,
  created_at timestamptz not null default now(),
  check (remaining_grams <= received_grams)
);

create index if not exists idx_erp_material_lots_fifo
  on public.erp_material_lots(material_profile_id, received_at, created_at)
  where remaining_grams > 0;

create table if not exists public.erp_production_usages (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null unique references public.print_jobs(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  material_profile_id uuid not null references public.material_cost_profiles(id) on delete restrict,
  usable_grams numeric(14,3) not null default 0 check (usable_grams >= 0),
  waste_grams numeric(14,3) not null default 0 check (waste_grams >= 0),
  total_grams numeric(14,3) generated always as (usable_grams + waste_grams) stored,
  usable_material_cost_gel numeric(14,2) not null default 0 check (usable_material_cost_gel >= 0),
  waste_material_cost_gel numeric(14,2) not null default 0 check (waste_material_cost_gel >= 0),
  total_material_cost_gel numeric(14,2) generated always as (usable_material_cost_gel + waste_material_cost_gel) stored,
  usage_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (usable_grams + waste_grams > 0)
);

create index if not exists idx_erp_production_usages_date on public.erp_production_usages(usage_date desc);

create table if not exists public.erp_material_movements (
  id uuid primary key default gen_random_uuid(),
  material_profile_id uuid not null references public.material_cost_profiles(id) on delete restrict,
  lot_id uuid not null references public.erp_material_lots(id) on delete restrict,
  movement_type text not null check (movement_type in ('receipt', 'production', 'waste', 'return', 'adjustment')),
  quantity_grams numeric(14,3) not null check (quantity_grams <> 0),
  value_gel numeric(14,2) not null check (value_gel >= 0),
  purchase_id uuid references public.erp_material_purchases(id) on delete restrict,
  production_usage_id uuid references public.erp_production_usages(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_material_movements_material_date
  on public.erp_material_movements(material_profile_id, occurred_at desc);
create index if not exists idx_erp_material_movements_lot on public.erp_material_movements(lot_id, occurred_at);

create table if not exists public.erp_expenses (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.erp_suppliers(id) on delete restrict,
  expense_date date not null,
  category text not null check (category in ('utilities', 'rent', 'salary', 'delivery', 'packaging', 'maintenance', 'software', 'marketing', 'bank_fee', 'tax', 'other')),
  description text not null,
  document_type text not null default 'tax_source_document'
    check (document_type in ('tax_invoice', 'tax_document', 'tax_source_document', 'receipt', 'bank_statement', 'other')),
  document_number text,
  amount_excl_vat_source numeric(14,2) not null check (amount_excl_vat_source >= 0),
  vat_source numeric(14,2) not null default 0 check (vat_source >= 0),
  total_source numeric(14,2) not null check (total_source >= 0),
  currency text not null default 'GEL' check (char_length(currency) = 3),
  exchange_rate_to_gel numeric(16,6) not null default 1 check (exchange_rate_to_gel > 0),
  amount_excl_vat_gel numeric(14,2) not null check (amount_excl_vat_gel >= 0),
  vat_gel numeric(14,2) not null default 0 check (vat_gel >= 0),
  recoverable_vat_gel numeric(14,2) not null default 0 check (recoverable_vat_gel >= 0),
  total_gel numeric(14,2) not null check (total_gel >= 0),
  recognized_expense_gel numeric(14,2) not null check (recognized_expense_gel >= 0),
  payment_status text not null default 'paid' check (payment_status in ('unpaid', 'partial', 'paid')),
  paid_amount_gel numeric(14,2) not null default 0 check (paid_amount_gel >= 0),
  payment_method text,
  payment_reference text,
  document_reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (total_source = amount_excl_vat_source + vat_source),
  check (paid_amount_gel <= total_gel)
);

create index if not exists idx_erp_expenses_date on public.erp_expenses(expense_date desc);
create index if not exists idx_erp_expenses_category on public.erp_expenses(category, expense_date desc);

create table if not exists public.erp_sales_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type in ('payment', 'refund')),
  event_date date not null,
  provider text not null,
  provider_payment_id text,
  currency text not null,
  gross_amount_gel numeric(14,2) not null,
  product_revenue_gel numeric(14,2) not null,
  delivery_revenue_gel numeric(14,2) not null,
  output_vat_gel numeric(14,2) not null,
  vat_rate numeric(5,2) not null,
  reconciliation_status text not null check (reconciliation_status in ('matched', 'amount_mismatch')),
  order_total_snapshot numeric(14,2) not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  unique(payment_attempt_id, event_type)
);

create index if not exists idx_erp_sales_events_date on public.erp_sales_events(event_date desc);
create index if not exists idx_erp_sales_events_order on public.erp_sales_events(order_id, event_date desc);

create table if not exists public.erp_sync_issues (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  error_code text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(source_type, source_id, error_code)
);

create index if not exists idx_erp_sync_issues_open on public.erp_sync_issues(last_seen_at desc) where status = 'open';

create or replace function public.erp_assert_period_open(requested_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.erp_accounting_periods
    where status = 'closed' and requested_date between period_start and period_end
  ) then
    raise exception 'ERP_PERIOD_CLOSED';
  end if;
end;
$$;

create or replace function public.erp_assert_journal_balanced(requested_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  debit_total numeric(14,2);
  credit_total numeric(14,2);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into debit_total, credit_total
  from public.erp_journal_lines
  where entry_id = requested_entry_id;

  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'ERP_JOURNAL_UNBALANCED';
  end if;
end;
$$;

create or replace function public.erp_prevent_finance_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'ERP_POSTED_RECORDS_ARE_IMMUTABLE';
end;
$$;

create trigger erp_journal_entries_no_update_delete
  before update or delete on public.erp_journal_entries
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_journal_lines_no_update_delete
  before update or delete on public.erp_journal_lines
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_material_movements_no_update_delete
  before update or delete on public.erp_material_movements
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_sales_events_no_update_delete
  before update or delete on public.erp_sales_events
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_material_purchases_no_update_delete
  before update or delete on public.erp_material_purchases
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_expenses_no_update_delete
  before update or delete on public.erp_expenses
  for each row execute function public.erp_prevent_finance_delete();
create trigger erp_production_usages_no_delete
  before delete on public.erp_production_usages
  for each row execute function public.erp_prevent_finance_delete();

create trigger set_erp_settings_updated_at before update on public.erp_settings
  for each row execute function public.set_updated_at();
create trigger set_erp_suppliers_updated_at before update on public.erp_suppliers
  for each row execute function public.set_updated_at();

create or replace function public.save_erp_settings(
  requested_legal_name text,
  requested_tax_id text,
  requested_entity_type text,
  requested_tax_regime text,
  requested_vat_registered boolean,
  requested_vat_rate numeric,
  actor_profile_id uuid
)
returns public.erp_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.erp_settings%rowtype;
begin
  if not public.erp_actor_can_manage(actor_profile_id) then raise exception 'ERP_FORBIDDEN'; end if;
  if char_length(trim(coalesce(requested_legal_name, ''))) < 2 then raise exception 'ERP_LEGAL_NAME_REQUIRED'; end if;
  if char_length(trim(coalesce(requested_tax_id, ''))) < 5 then raise exception 'ERP_TAX_ID_REQUIRED'; end if;
  if requested_entity_type not in ('llc', 'individual_entrepreneur', 'other') then raise exception 'ERP_INVALID_ENTITY_TYPE'; end if;
  if requested_tax_regime not in ('standard', 'small_business', 'micro_business', 'fixed', 'other') then raise exception 'ERP_INVALID_TAX_REGIME'; end if;
  if requested_vat_rate < 0 or requested_vat_rate > 100 then raise exception 'ERP_INVALID_VAT_RATE'; end if;

  update public.erp_settings
  set legal_name = trim(requested_legal_name),
      tax_id = trim(requested_tax_id),
      entity_type = requested_entity_type,
      tax_regime = requested_tax_regime,
      vat_registered = requested_vat_registered,
      vat_rate = requested_vat_rate,
      updated_by = actor_profile_id,
      accounting_standard = 'accountant_review_pending',
      updated_at = now()
  where id = 1
  returning * into saved;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'erp_settings_updated', 'erp_settings', '1',
    jsonb_build_object('entity_type', requested_entity_type, 'tax_regime', requested_tax_regime, 'vat_registered', requested_vat_registered));
  return saved;
end;
$$;

create or replace function public.erp_record_material_purchase(
  requested_supplier_name text,
  requested_supplier_tax_id text,
  requested_material_profile_id uuid,
  requested_document_type text,
  requested_document_number text,
  requested_document_date date,
  requested_quantity_kg numeric,
  requested_unit_cost_excl_vat numeric,
  requested_vat_source numeric,
  requested_currency text,
  requested_exchange_rate_to_gel numeric,
  requested_paid_amount_source numeric,
  requested_payment_method text,
  requested_payment_reference text,
  requested_document_reference text,
  requested_notes text,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supplier_uuid uuid;
  purchase_uuid uuid;
  lot_uuid uuid;
  journal_uuid uuid;
  settings_record public.erp_settings%rowtype;
  subtotal_source_value numeric(14,2);
  total_source_value numeric(14,2);
  subtotal_gel_value numeric(14,2);
  vat_gel_value numeric(14,2);
  total_gel_value numeric(14,2);
  paid_gel_value numeric(14,2);
  inventory_gel_value numeric(14,2);
  payable_gel_value numeric(14,2);
  lot_number_value text;
  weighted_cost_per_kg numeric(14,2);
  current_waste_percent numeric(5,2);
begin
  if not public.erp_actor_can_manage(actor_profile_id) then raise exception 'ERP_FORBIDDEN'; end if;
  perform public.erp_assert_period_open(requested_document_date);
  if char_length(trim(coalesce(requested_supplier_name, ''))) < 2 then raise exception 'ERP_SUPPLIER_REQUIRED'; end if;
  if char_length(trim(coalesce(requested_document_number, ''))) < 1 then raise exception 'ERP_DOCUMENT_NUMBER_REQUIRED'; end if;
  if requested_quantity_kg <= 0 or requested_unit_cost_excl_vat <= 0 or requested_vat_source < 0 then raise exception 'ERP_INVALID_PURCHASE_AMOUNT'; end if;
  if requested_exchange_rate_to_gel <= 0 then raise exception 'ERP_INVALID_EXCHANGE_RATE'; end if;
  if upper(trim(requested_currency)) !~ '^[A-Z]{3}$' then raise exception 'ERP_INVALID_CURRENCY'; end if;
  if not exists (select 1 from public.material_cost_profiles where id = requested_material_profile_id and is_active = true) then raise exception 'ERP_MATERIAL_NOT_FOUND'; end if;

  select * into settings_record from public.erp_settings where id = 1;
  subtotal_source_value := round(requested_quantity_kg * requested_unit_cost_excl_vat, 2);
  total_source_value := subtotal_source_value + round(requested_vat_source, 2);
  if subtotal_source_value <= 0 then raise exception 'ERP_INVALID_PURCHASE_AMOUNT'; end if;
  if requested_paid_amount_source < 0 or requested_paid_amount_source > total_source_value then raise exception 'ERP_INVALID_PAID_AMOUNT'; end if;
  subtotal_gel_value := round(subtotal_source_value * requested_exchange_rate_to_gel, 2);
  vat_gel_value := round(requested_vat_source * requested_exchange_rate_to_gel, 2);
  total_gel_value := subtotal_gel_value + vat_gel_value;
  paid_gel_value := round(requested_paid_amount_source * requested_exchange_rate_to_gel, 2);
  payable_gel_value := total_gel_value - paid_gel_value;
  inventory_gel_value := case when settings_record.vat_registered then subtotal_gel_value else total_gel_value end;

  select id into supplier_uuid
  from public.erp_suppliers
  where (nullif(trim(coalesce(requested_supplier_tax_id, '')), '') is not null and tax_id = trim(requested_supplier_tax_id))
     or (nullif(trim(coalesce(requested_supplier_tax_id, '')), '') is null and lower(name) = lower(trim(requested_supplier_name)))
  order by created_at
  limit 1;

  if supplier_uuid is null then
    insert into public.erp_suppliers (name, tax_id, created_by)
    values (trim(requested_supplier_name), nullif(trim(coalesce(requested_supplier_tax_id, '')), ''), actor_profile_id)
    returning id into supplier_uuid;
  end if;

  insert into public.erp_material_purchases (
    supplier_id, material_profile_id, document_type, document_number, document_date,
    quantity_kg, unit_cost_excl_vat, subtotal_source, vat_source, total_source,
    currency, exchange_rate_to_gel, subtotal_gel, vat_gel, recoverable_vat_gel, total_gel,
    payment_status, paid_amount_gel, payment_method, payment_reference, paid_at,
    document_reference, notes, created_by
  ) values (
    supplier_uuid, requested_material_profile_id, requested_document_type, trim(requested_document_number), requested_document_date,
    requested_quantity_kg, requested_unit_cost_excl_vat, subtotal_source_value, round(requested_vat_source, 2), total_source_value,
    upper(trim(requested_currency)), requested_exchange_rate_to_gel, subtotal_gel_value, vat_gel_value,
    case when settings_record.vat_registered then vat_gel_value else 0 end, total_gel_value,
    case when paid_gel_value = 0 then 'unpaid' when paid_gel_value < total_gel_value then 'partial' else 'paid' end,
    paid_gel_value, nullif(trim(coalesce(requested_payment_method, '')), ''), nullif(trim(coalesce(requested_payment_reference, '')), ''),
    case when paid_gel_value > 0 then requested_document_date else null end,
    nullif(trim(coalesce(requested_document_reference, '')), ''), nullif(trim(coalesce(requested_notes, '')), ''), actor_profile_id
  ) returning id into purchase_uuid;

  lot_number_value := 'LOT-' || to_char(requested_document_date, 'YYYYMMDD') || '-' || upper(substr(replace(purchase_uuid::text, '-', ''), 1, 8));
  insert into public.erp_material_lots (
    purchase_id, material_profile_id, lot_number, received_grams, remaining_grams,
    unit_cost_per_gram_gel, received_at
  ) values (
    purchase_uuid, requested_material_profile_id, lot_number_value, requested_quantity_kg * 1000, requested_quantity_kg * 1000,
    case when requested_quantity_kg > 0 then inventory_gel_value / (requested_quantity_kg * 1000) else 0 end,
    requested_document_date
  ) returning id into lot_uuid;

  insert into public.erp_material_movements (
    material_profile_id, lot_id, movement_type, quantity_grams, value_gel, purchase_id, occurred_at, notes, created_by
  ) values (
    requested_material_profile_id, lot_uuid, 'receipt', requested_quantity_kg * 1000, inventory_gel_value, purchase_uuid,
    requested_document_date::timestamptz, 'Material purchase ' || trim(requested_document_number), actor_profile_id
  );

  select
    round(sum(remaining_grams * unit_cost_per_gram_gel) / nullif(sum(remaining_grams), 0) * 1000, 2)
  into weighted_cost_per_kg
  from public.erp_material_lots
  where material_profile_id = requested_material_profile_id and remaining_grams > 0;
  select waste_percent into current_waste_percent
  from public.material_cost_profiles where id = requested_material_profile_id;
  if weighted_cost_per_kg is not null then
    perform public.save_material_cost_profile_v2(
      requested_material_profile_id, weighted_cost_per_kg, current_waste_percent, actor_profile_id
    );
  end if;

  insert into public.erp_journal_entries (entry_date, source_type, source_id, document_number, description, created_by)
  values (requested_document_date, 'material_purchase', purchase_uuid, trim(requested_document_number), 'მასალის შესყიდვა', actor_profile_id)
  returning id into journal_uuid;

  insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
  values (journal_uuid, '1300', inventory_gel_value, lot_number_value);
  if settings_record.vat_registered and vat_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
    values (journal_uuid, '1600', vat_gel_value, 'Input VAT');
  end if;
  if paid_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, credit, memo)
    values (journal_uuid, '1000', paid_gel_value, coalesce(nullif(trim(requested_payment_reference), ''), 'Paid'));
  end if;
  if payable_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, credit, memo)
    values (journal_uuid, '2000', payable_gel_value, 'Supplier payable');
  end if;
  perform public.erp_assert_journal_balanced(journal_uuid);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'erp_material_purchase_recorded', 'erp_material_purchase', purchase_uuid::text,
    jsonb_build_object('lot_id', lot_uuid, 'material_profile_id', requested_material_profile_id, 'quantity_kg', requested_quantity_kg, 'total_gel', total_gel_value));

  return jsonb_build_object('purchase_id', purchase_uuid, 'lot_id', lot_uuid, 'journal_entry_id', journal_uuid, 'lot_number', lot_number_value);
end;
$$;

create or replace function public.erp_record_expense(
  requested_supplier_name text,
  requested_supplier_tax_id text,
  requested_expense_date date,
  requested_category text,
  requested_description text,
  requested_document_type text,
  requested_document_number text,
  requested_amount_excl_vat_source numeric,
  requested_vat_source numeric,
  requested_currency text,
  requested_exchange_rate_to_gel numeric,
  requested_paid_amount_source numeric,
  requested_payment_method text,
  requested_payment_reference text,
  requested_document_reference text,
  requested_notes text,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supplier_uuid uuid;
  expense_uuid uuid;
  journal_uuid uuid;
  settings_record public.erp_settings%rowtype;
  total_source_value numeric(14,2);
  base_gel_value numeric(14,2);
  vat_gel_value numeric(14,2);
  total_gel_value numeric(14,2);
  recognized_gel_value numeric(14,2);
  paid_gel_value numeric(14,2);
  payable_gel_value numeric(14,2);
  expense_account text;
begin
  if not public.erp_actor_can_manage(actor_profile_id) then raise exception 'ERP_FORBIDDEN'; end if;
  perform public.erp_assert_period_open(requested_expense_date);
  if char_length(trim(coalesce(requested_description, ''))) < 2 then raise exception 'ERP_DESCRIPTION_REQUIRED'; end if;
  if requested_amount_excl_vat_source < 0 or requested_vat_source < 0 or requested_exchange_rate_to_gel <= 0 then raise exception 'ERP_INVALID_EXPENSE_AMOUNT'; end if;
  total_source_value := round(requested_amount_excl_vat_source, 2) + round(requested_vat_source, 2);
  if total_source_value <= 0 or requested_paid_amount_source < 0 or requested_paid_amount_source > total_source_value then raise exception 'ERP_INVALID_PAID_AMOUNT'; end if;
  if upper(trim(requested_currency)) !~ '^[A-Z]{3}$' then raise exception 'ERP_INVALID_CURRENCY'; end if;

  select * into settings_record from public.erp_settings where id = 1;
  base_gel_value := round(requested_amount_excl_vat_source * requested_exchange_rate_to_gel, 2);
  vat_gel_value := round(requested_vat_source * requested_exchange_rate_to_gel, 2);
  total_gel_value := base_gel_value + vat_gel_value;
  recognized_gel_value := case when settings_record.vat_registered then base_gel_value else total_gel_value end;
  paid_gel_value := round(requested_paid_amount_source * requested_exchange_rate_to_gel, 2);
  payable_gel_value := total_gel_value - paid_gel_value;
  expense_account := case when requested_category = 'delivery' then '6100' else '6000' end;

  if nullif(trim(coalesce(requested_supplier_name, '')), '') is not null then
    select id into supplier_uuid
    from public.erp_suppliers
    where (nullif(trim(coalesce(requested_supplier_tax_id, '')), '') is not null and tax_id = trim(requested_supplier_tax_id))
       or (nullif(trim(coalesce(requested_supplier_tax_id, '')), '') is null and lower(name) = lower(trim(requested_supplier_name)))
    order by created_at limit 1;
    if supplier_uuid is null then
      insert into public.erp_suppliers (name, tax_id, created_by)
      values (trim(requested_supplier_name), nullif(trim(coalesce(requested_supplier_tax_id, '')), ''), actor_profile_id)
      returning id into supplier_uuid;
    end if;
  end if;

  insert into public.erp_expenses (
    supplier_id, expense_date, category, description, document_type, document_number,
    amount_excl_vat_source, vat_source, total_source, currency, exchange_rate_to_gel,
    amount_excl_vat_gel, vat_gel, recoverable_vat_gel, total_gel, recognized_expense_gel,
    payment_status, paid_amount_gel, payment_method, payment_reference,
    document_reference, notes, created_by
  ) values (
    supplier_uuid, requested_expense_date, requested_category, trim(requested_description), requested_document_type,
    nullif(trim(coalesce(requested_document_number, '')), ''), round(requested_amount_excl_vat_source, 2), round(requested_vat_source, 2), total_source_value,
    upper(trim(requested_currency)), requested_exchange_rate_to_gel, base_gel_value, vat_gel_value,
    case when settings_record.vat_registered then vat_gel_value else 0 end, total_gel_value, recognized_gel_value,
    case when paid_gel_value = 0 then 'unpaid' when paid_gel_value < total_gel_value then 'partial' else 'paid' end,
    paid_gel_value, nullif(trim(coalesce(requested_payment_method, '')), ''), nullif(trim(coalesce(requested_payment_reference, '')), ''),
    nullif(trim(coalesce(requested_document_reference, '')), ''), nullif(trim(coalesce(requested_notes, '')), ''), actor_profile_id
  ) returning id into expense_uuid;

  insert into public.erp_journal_entries (entry_date, source_type, source_id, document_number, description, created_by)
  values (requested_expense_date, 'expense', expense_uuid, nullif(trim(coalesce(requested_document_number, '')), ''), trim(requested_description), actor_profile_id)
  returning id into journal_uuid;
  insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
  values (journal_uuid, expense_account, recognized_gel_value, requested_category);
  if settings_record.vat_registered and vat_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
    values (journal_uuid, '1600', vat_gel_value, 'Input VAT');
  end if;
  if paid_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, credit, memo)
    values (journal_uuid, '1000', paid_gel_value, coalesce(nullif(trim(requested_payment_reference), ''), 'Paid'));
  end if;
  if payable_gel_value > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, credit, memo)
    values (journal_uuid, '2000', payable_gel_value, 'Supplier payable');
  end if;
  perform public.erp_assert_journal_balanced(journal_uuid);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'erp_expense_recorded', 'erp_expense', expense_uuid::text,
    jsonb_build_object('category', requested_category, 'total_gel', total_gel_value));
  return jsonb_build_object('expense_id', expense_uuid, 'journal_entry_id', journal_uuid);
end;
$$;

create or replace function public.erp_record_production_usage(
  requested_print_job_id uuid,
  requested_material_profile_id uuid,
  requested_usable_grams numeric,
  requested_waste_grams numeric,
  requested_usage_date date,
  requested_notes text,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_record public.print_jobs%rowtype;
  usage_uuid uuid;
  journal_uuid uuid;
  lot_record public.erp_material_lots%rowtype;
  remaining_good numeric(14,3);
  remaining_waste numeric(14,3);
  allocated numeric(14,3);
  allocation_value numeric(14,2);
  good_cost numeric(14,2) := 0;
  waste_cost numeric(14,2) := 0;
begin
  if not public.erp_actor_can_manage(actor_profile_id) then raise exception 'ERP_FORBIDDEN'; end if;
  perform public.erp_assert_period_open(requested_usage_date);
  if requested_usable_grams < 0 or requested_waste_grams < 0 or requested_usable_grams + requested_waste_grams <= 0 then raise exception 'ERP_INVALID_USAGE'; end if;
  if exists (select 1 from public.erp_production_usages where print_job_id = requested_print_job_id) then raise exception 'ERP_USAGE_ALREADY_RECORDED'; end if;
  select * into job_record from public.print_jobs where id = requested_print_job_id for update;
  if job_record.id is null then raise exception 'ERP_PRINT_JOB_NOT_FOUND'; end if;
  if job_record.status not in ('completed', 'quality_check', 'approved', 'failed') then raise exception 'ERP_PRINT_JOB_NOT_FINISHED'; end if;

  insert into public.erp_production_usages (
    print_job_id, order_item_id, material_profile_id, usable_grams, waste_grams, usage_date, notes, created_by
  ) values (
    requested_print_job_id, job_record.order_item_id, requested_material_profile_id,
    requested_usable_grams, requested_waste_grams, requested_usage_date,
    nullif(trim(coalesce(requested_notes, '')), ''), actor_profile_id
  ) returning id into usage_uuid;

  remaining_good := requested_usable_grams;
  remaining_waste := requested_waste_grams;
  for lot_record in
    select * from public.erp_material_lots
    where material_profile_id = requested_material_profile_id and remaining_grams > 0
    order by received_at, created_at
    for update
  loop
    if remaining_good > 0 and lot_record.remaining_grams > 0 then
      allocated := least(remaining_good, lot_record.remaining_grams);
      allocation_value := round(allocated * lot_record.unit_cost_per_gram_gel, 2);
      update public.erp_material_lots set remaining_grams = remaining_grams - allocated where id = lot_record.id;
      insert into public.erp_material_movements (
        material_profile_id, lot_id, movement_type, quantity_grams, value_gel, production_usage_id, notes, created_by
      ) values (
        requested_material_profile_id, lot_record.id, 'production', -allocated, allocation_value, usage_uuid,
        'Print job ' || requested_print_job_id::text, actor_profile_id
      );
      remaining_good := remaining_good - allocated;
      good_cost := good_cost + allocation_value;
      lot_record.remaining_grams := lot_record.remaining_grams - allocated;
    end if;

    if remaining_waste > 0 and lot_record.remaining_grams > 0 then
      allocated := least(remaining_waste, lot_record.remaining_grams);
      allocation_value := round(allocated * lot_record.unit_cost_per_gram_gel, 2);
      update public.erp_material_lots set remaining_grams = remaining_grams - allocated where id = lot_record.id;
      insert into public.erp_material_movements (
        material_profile_id, lot_id, movement_type, quantity_grams, value_gel, production_usage_id, notes, created_by
      ) values (
        requested_material_profile_id, lot_record.id, 'waste', -allocated, allocation_value, usage_uuid,
        'Print waste ' || requested_print_job_id::text, actor_profile_id
      );
      remaining_waste := remaining_waste - allocated;
      waste_cost := waste_cost + allocation_value;
      lot_record.remaining_grams := lot_record.remaining_grams - allocated;
    end if;
    exit when remaining_good <= 0 and remaining_waste <= 0;
  end loop;

  if remaining_good > 0 or remaining_waste > 0 then raise exception 'ERP_INSUFFICIENT_MATERIAL_STOCK'; end if;
  if good_cost + waste_cost <= 0 then raise exception 'ERP_USAGE_VALUE_TOO_SMALL'; end if;

  update public.erp_production_usages
  set usable_material_cost_gel = good_cost, waste_material_cost_gel = waste_cost
  where id = usage_uuid;

  insert into public.erp_journal_entries (entry_date, source_type, source_id, document_number, description, created_by)
  values (requested_usage_date, 'production_usage', usage_uuid, job_record.id::text, 'წარმოებაში მასალის ჩამოწერა', actor_profile_id)
  returning id into journal_uuid;
  if good_cost > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
    values (journal_uuid, '5000', good_cost, 'Usable material');
  end if;
  if waste_cost > 0 then
    insert into public.erp_journal_lines (entry_id, account_code, debit, memo)
    values (journal_uuid, '5020', waste_cost, 'Production waste');
  end if;
  insert into public.erp_journal_lines (entry_id, account_code, credit, memo)
  values (journal_uuid, '1300', good_cost + waste_cost, 'FIFO material issue');
  perform public.erp_assert_journal_balanced(journal_uuid);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor_profile_id, 'erp_production_usage_recorded', 'erp_production_usage', usage_uuid::text,
    jsonb_build_object('print_job_id', requested_print_job_id, 'usable_grams', requested_usable_grams, 'waste_grams', requested_waste_grams, 'cost_gel', good_cost + waste_cost));
  return jsonb_build_object('usage_id', usage_uuid, 'journal_entry_id', journal_uuid, 'material_cost_gel', good_cost + waste_cost);
end;
$$;

create or replace function public.erp_capture_verified_payment(requested_payment_id uuid, requested_event_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_record public.payment_attempts%rowtype;
  order_record public.orders%rowtype;
  settings_record public.erp_settings%rowtype;
  sales_event_uuid uuid;
  journal_uuid uuid;
  sign_value numeric;
  gross_value numeric(14,2);
  delivery_gross numeric(14,2);
  product_gross numeric(14,2);
  product_net numeric(14,2);
  delivery_net numeric(14,2);
  output_vat numeric(14,2);
  vat_factor numeric;
begin
  if requested_event_type not in ('payment', 'refund') then raise exception 'ERP_INVALID_SALES_EVENT'; end if;
  if exists (select 1 from public.erp_sales_events where payment_attempt_id = requested_payment_id and event_type = requested_event_type) then
    select id into sales_event_uuid from public.erp_sales_events where payment_attempt_id = requested_payment_id and event_type = requested_event_type;
    return sales_event_uuid;
  end if;

  select * into payment_record from public.payment_attempts where id = requested_payment_id;
  if payment_record.id is null or payment_record.provider = 'test' or payment_record.signature_verified is not true then return null; end if;
  if upper(payment_record.currency) <> 'GEL' then raise exception 'ERP_UNSUPPORTED_PAYMENT_CURRENCY'; end if;
  if requested_event_type = 'payment' and payment_record.status not in ('paid', 'refunded') then return null; end if;
  if requested_event_type = 'refund' and payment_record.status <> 'refunded' then return null; end if;
  select * into order_record from public.orders where id = payment_record.order_id;
  if order_record.id is null or order_record.test_mode is true then return null; end if;
  select * into settings_record from public.erp_settings where id = 1;
  if settings_record.legal_name is null or settings_record.tax_id is null then raise exception 'ERP_ACCOUNTING_PROFILE_REQUIRED'; end if;

  sign_value := case when requested_event_type = 'refund' then -1 else 1 end;
  gross_value := round(payment_record.amount * sign_value, 2);
  delivery_gross := least(abs(gross_value), greatest(coalesce(order_record.delivery_fee, 0), 0)) * sign_value;
  product_gross := gross_value - delivery_gross;
  if settings_record.vat_registered and settings_record.vat_rate > 0 then
    vat_factor := 1 + settings_record.vat_rate / 100;
    product_net := round(product_gross / vat_factor, 2);
    delivery_net := round(delivery_gross / vat_factor, 2);
    output_vat := gross_value - product_net - delivery_net;
  else
    product_net := product_gross;
    delivery_net := delivery_gross;
    output_vat := 0;
  end if;

  perform public.erp_assert_period_open(payment_record.updated_at::date);
  insert into public.erp_sales_events (
    payment_attempt_id, order_id, event_type, event_date, provider, provider_payment_id, currency,
    gross_amount_gel, product_revenue_gel, delivery_revenue_gel, output_vat_gel, vat_rate,
    reconciliation_status, order_total_snapshot, is_test
  ) values (
    payment_record.id, order_record.id, requested_event_type, payment_record.updated_at::date,
    payment_record.provider, payment_record.provider_payment_id, payment_record.currency,
    gross_value, product_net, delivery_net, output_vat, settings_record.vat_rate,
    case when abs(payment_record.amount - order_record.total) <= 0.01 then 'matched' else 'amount_mismatch' end,
    order_record.total, false
  ) returning id into sales_event_uuid;

  insert into public.erp_journal_entries (
    entry_date, source_type, source_id, document_number, description, is_test
  ) values (
    payment_record.updated_at::date, 'sale_' || requested_event_type, sales_event_uuid,
    coalesce(payment_record.provider_payment_id, payment_record.id::text),
    case when requested_event_type = 'payment' then 'დადასტურებული ონლაინ გადახდა' else 'თანხის დაბრუნება' end,
    false
  ) returning id into journal_uuid;

  if requested_event_type = 'payment' then
    insert into public.erp_journal_lines (entry_id, account_code, debit, memo) values (journal_uuid, '1000', abs(gross_value), payment_record.provider);
    if product_net <> 0 then insert into public.erp_journal_lines (entry_id, account_code, credit, memo) values (journal_uuid, '4000', abs(product_net), order_record.id::text); end if;
    if delivery_net <> 0 then insert into public.erp_journal_lines (entry_id, account_code, credit, memo) values (journal_uuid, '4010', abs(delivery_net), order_record.id::text); end if;
    if output_vat <> 0 then insert into public.erp_journal_lines (entry_id, account_code, credit, memo) values (journal_uuid, '2100', abs(output_vat), 'Output VAT'); end if;
  else
    if product_net <> 0 then insert into public.erp_journal_lines (entry_id, account_code, debit, memo) values (journal_uuid, '4000', abs(product_net), 'Refund'); end if;
    if delivery_net <> 0 then insert into public.erp_journal_lines (entry_id, account_code, debit, memo) values (journal_uuid, '4010', abs(delivery_net), 'Refund'); end if;
    if output_vat <> 0 then insert into public.erp_journal_lines (entry_id, account_code, debit, memo) values (journal_uuid, '2100', abs(output_vat), 'VAT reversal'); end if;
    insert into public.erp_journal_lines (entry_id, account_code, credit, memo) values (journal_uuid, '1000', abs(gross_value), payment_record.provider);
  end if;
  perform public.erp_assert_journal_balanced(journal_uuid);
  update public.erp_sync_issues
  set status = 'resolved', resolved_at = now(), last_seen_at = now()
  where source_type = 'payment_attempt' and source_id = payment_record.id and status = 'open';
  return sales_event_uuid;
end;
$$;

create or replace function public.erp_payment_capture_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if new.provider <> 'test' and new.signature_verified is true then
      if new.status in ('paid', 'refunded') then perform public.erp_capture_verified_payment(new.id, 'payment'); end if;
      if new.status = 'refunded' then perform public.erp_capture_verified_payment(new.id, 'refund'); end if;
    end if;
  exception when others then
    insert into public.erp_sync_issues (source_type, source_id, error_code, details, status, last_seen_at)
    values ('payment_attempt', new.id, sqlstate || ':' || sqlerrm,
      jsonb_build_object('provider', new.provider, 'status', new.status, 'currency', new.currency), 'open', now())
    on conflict (source_type, source_id, error_code) do update
      set details = excluded.details, status = 'open', last_seen_at = now(), resolved_at = null;
  end;
  return new;
end;
$$;

drop trigger if exists erp_capture_verified_payment on public.payment_attempts;
create trigger erp_capture_verified_payment
  after insert or update of status, signature_verified on public.payment_attempts
  for each row execute function public.erp_payment_capture_trigger();

create or replace function public.erp_sync_verified_payments(actor_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_record record;
  synced_count integer := 0;
  captured uuid;
begin
  if not public.erp_actor_can_manage(actor_profile_id) then raise exception 'ERP_FORBIDDEN'; end if;
  for payment_record in
    select id, status, provider, currency from public.payment_attempts
    where provider <> 'test' and signature_verified is true and status in ('paid', 'refunded')
    order by created_at
  loop
    begin
      captured := public.erp_capture_verified_payment(payment_record.id, 'payment');
      if captured is not null then synced_count := synced_count + 1; end if;
      if payment_record.status = 'refunded' then perform public.erp_capture_verified_payment(payment_record.id, 'refund'); end if;
    exception when others then
      insert into public.erp_sync_issues (source_type, source_id, error_code, details, status, last_seen_at)
      values ('payment_attempt', payment_record.id, sqlstate || ':' || sqlerrm,
        jsonb_build_object('provider', payment_record.provider, 'status', payment_record.status, 'currency', payment_record.currency), 'open', now())
      on conflict (source_type, source_id, error_code) do update
        set details = excluded.details, status = 'open', last_seen_at = now(), resolved_at = null;
    end;
  end loop;
  insert into public.audit_log (actor_id, action, entity_type, metadata)
  values (actor_profile_id, 'erp_verified_payments_synced', 'erp_sales_events', jsonb_build_object('processed', synced_count));
  return synced_count;
end;
$$;

create or replace view public.erp_material_stock_summary
with (security_invoker = true)
as
select
  p.id as material_profile_id,
  p.code,
  p.name,
  coalesce(sum(l.remaining_grams), 0)::numeric(14,3) as remaining_grams,
  coalesce(sum(l.remaining_grams * l.unit_cost_per_gram_gel), 0)::numeric(14,2) as stock_value_gel
from public.material_cost_profiles p
left join public.erp_material_lots l on l.material_profile_id = p.id
group by p.id, p.code, p.name;

create or replace view public.erp_profit_loss_monthly
with (security_invoker = true)
as
with months as (
  select date_trunc('month', event_date)::date as month from public.erp_sales_events where is_test = false
  union
  select date_trunc('month', expense_date)::date from public.erp_expenses
  union
  select date_trunc('month', usage_date)::date from public.erp_production_usages
), sales as (
  select date_trunc('month', event_date)::date as month,
    sum(product_revenue_gel + delivery_revenue_gel) as revenue_gel,
    sum(output_vat_gel) as output_vat_gel
  from public.erp_sales_events where is_test = false group by 1
), expenses as (
  select date_trunc('month', expense_date)::date as month,
    sum(recognized_expense_gel) as operating_expense_gel,
    sum(recoverable_vat_gel) as input_vat_from_expenses_gel
  from public.erp_expenses group by 1
), production as (
  select date_trunc('month', usage_date)::date as month,
    sum(usable_material_cost_gel) as material_cogs_gel,
    sum(waste_material_cost_gel) as production_waste_gel
  from public.erp_production_usages group by 1
), purchases as (
  select date_trunc('month', document_date)::date as month,
    sum(recoverable_vat_gel) as input_vat_from_purchases_gel
  from public.erp_material_purchases group by 1
)
select
  m.month,
  coalesce(s.revenue_gel, 0)::numeric(14,2) as revenue_gel,
  coalesce(p.material_cogs_gel, 0)::numeric(14,2) as material_cogs_gel,
  coalesce(p.production_waste_gel, 0)::numeric(14,2) as production_waste_gel,
  coalesce(e.operating_expense_gel, 0)::numeric(14,2) as operating_expense_gel,
  (coalesce(s.revenue_gel, 0) - coalesce(p.material_cogs_gel, 0) - coalesce(p.production_waste_gel, 0) - coalesce(e.operating_expense_gel, 0))::numeric(14,2) as management_profit_gel,
  coalesce(s.output_vat_gel, 0)::numeric(14,2) as output_vat_gel,
  (coalesce(e.input_vat_from_expenses_gel, 0) + coalesce(b.input_vat_from_purchases_gel, 0))::numeric(14,2) as input_vat_gel,
  (coalesce(s.output_vat_gel, 0) - coalesce(e.input_vat_from_expenses_gel, 0) - coalesce(b.input_vat_from_purchases_gel, 0))::numeric(14,2) as estimated_vat_payable_gel
from months m
left join sales s using (month)
left join expenses e using (month)
left join production p using (month)
left join purchases b using (month)
order by m.month desc;

alter table public.erp_settings enable row level security;
alter table public.erp_suppliers enable row level security;
alter table public.erp_accounts enable row level security;
alter table public.erp_accounting_periods enable row level security;
alter table public.erp_journal_entries enable row level security;
alter table public.erp_journal_lines enable row level security;
alter table public.erp_material_purchases enable row level security;
alter table public.erp_material_lots enable row level security;
alter table public.erp_production_usages enable row level security;
alter table public.erp_material_movements enable row level security;
alter table public.erp_expenses enable row level security;
alter table public.erp_sales_events enable row level security;
alter table public.erp_sync_issues enable row level security;

create policy "finance staff read erp settings" on public.erp_settings for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read suppliers" on public.erp_suppliers for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read accounts" on public.erp_accounts for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read periods" on public.erp_accounting_periods for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read journal entries" on public.erp_journal_entries for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read journal lines" on public.erp_journal_lines for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read material purchases" on public.erp_material_purchases for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read material lots" on public.erp_material_lots for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read production usages" on public.erp_production_usages for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read material movements" on public.erp_material_movements for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read expenses" on public.erp_expenses for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read sales events" on public.erp_sales_events for select using (public.has_staff_role(array['owner', 'admin']));
create policy "finance staff read sync issues" on public.erp_sync_issues for select using (public.has_staff_role(array['owner', 'admin']));

revoke all on public.erp_settings, public.erp_suppliers, public.erp_accounts, public.erp_accounting_periods,
  public.erp_journal_entries, public.erp_journal_lines, public.erp_material_purchases, public.erp_material_lots,
  public.erp_production_usages, public.erp_material_movements, public.erp_expenses, public.erp_sales_events, public.erp_sync_issues
  from anon, authenticated;
grant select on public.erp_settings, public.erp_suppliers, public.erp_accounts, public.erp_accounting_periods,
  public.erp_journal_entries, public.erp_journal_lines, public.erp_material_purchases, public.erp_material_lots,
  public.erp_production_usages, public.erp_material_movements, public.erp_expenses, public.erp_sales_events, public.erp_sync_issues
  to authenticated;
grant select on public.erp_material_stock_summary, public.erp_profit_loss_monthly to authenticated;

revoke all on function public.erp_actor_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.erp_assert_period_open(date) from public, anon, authenticated;
revoke all on function public.erp_assert_journal_balanced(uuid) from public, anon, authenticated;
revoke all on function public.save_erp_settings(text, text, text, text, boolean, numeric, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_material_purchase(text, text, uuid, text, text, date, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_expense(text, text, date, text, text, text, text, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_production_usage(uuid, uuid, numeric, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_capture_verified_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.erp_sync_verified_payments(uuid) from public, anon, authenticated;

grant execute on function public.erp_actor_can_manage(uuid) to service_role;
grant execute on function public.erp_assert_period_open(date) to service_role;
grant execute on function public.erp_assert_journal_balanced(uuid) to service_role;
grant execute on function public.save_erp_settings(text, text, text, text, boolean, numeric, uuid) to service_role;
grant execute on function public.erp_record_material_purchase(text, text, uuid, text, text, date, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid) to service_role;
grant execute on function public.erp_record_expense(text, text, date, text, text, text, text, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid) to service_role;
grant execute on function public.erp_record_production_usage(uuid, uuid, numeric, numeric, date, text, uuid) to service_role;
grant execute on function public.erp_capture_verified_payment(uuid, text) to service_role;
grant execute on function public.erp_sync_verified_payments(uuid) to service_role;
