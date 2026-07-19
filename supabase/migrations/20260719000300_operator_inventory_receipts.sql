-- Operator-facing material receiving linked to the existing FIFO ERP ledger.
-- A physical receipt posts stock immediately and remains visibly pending until finance reviews it.

alter table public.erp_material_purchases
  add column if not exists received_by uuid references public.profiles(id) on delete set null,
  add column if not exists received_at timestamptz,
  add column if not exists warehouse_location text,
  add column if not exists finance_review_status text not null default 'approved',
  add column if not exists finance_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists finance_reviewed_at timestamptz,
  add column if not exists receipt_operation_key uuid;

alter table public.erp_material_purchases
  drop constraint if exists erp_material_purchases_finance_review_status_check;
alter table public.erp_material_purchases
  add constraint erp_material_purchases_finance_review_status_check
  check (finance_review_status in ('pending', 'approved'));

create unique index if not exists idx_erp_material_purchase_receipt_operation
  on public.erp_material_purchases(receipt_operation_key)
  where receipt_operation_key is not null;
create index if not exists idx_erp_material_purchase_finance_review
  on public.erp_material_purchases(finance_review_status, received_at desc)
  where received_at is not null;

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
      and role in ('owner', 'admin', 'production_operator')
  );
$$;

-- Operator receipts may stage the weighted material cost, but must not reprice the
-- public catalog until finance approves the receipt.
create or replace function public.save_material_cost_profile_v2(
  requested_profile_id uuid,
  requested_cost_per_kg numeric,
  requested_waste_percent numeric,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  saved_profile public.material_cost_profiles%rowtype;
  recalculation_result jsonb;
begin
  select role into actor_role from public.profiles
  where id = actor_profile_id and is_active = true;

  if actor_role in ('owner', 'admin') then
    saved_profile := public.save_material_cost_profile(
      requested_profile_id,
      requested_cost_per_kg,
      requested_waste_percent,
      actor_profile_id
    );
    recalculation_result := public.recalculate_catalog_product_prices(
      actor_profile_id,
      saved_profile.id,
      null,
      'material_cost_updated'
    );
    return jsonb_build_object('profile', to_jsonb(saved_profile), 'recalculation', recalculation_result);
  end if;

  if actor_role <> 'production_operator' then raise exception 'Active inventory operator access is required'; end if;
  if requested_cost_per_kg is null or requested_cost_per_kg < 0 or requested_cost_per_kg > 100000 then
    raise exception 'Material cost is outside the allowed range';
  end if;
  if requested_waste_percent is null or requested_waste_percent < 0 or requested_waste_percent > 100 then
    raise exception 'Material waste is outside the allowed range';
  end if;

  select * into saved_profile
  from public.material_cost_profiles
  where id = requested_profile_id and is_active = true;
  if saved_profile.id is null then raise exception 'Active material profile was not found'; end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'material_cost_staged_from_operator_receipt',
    'material_cost_profile',
    saved_profile.id::text,
    jsonb_build_object(
      'code', saved_profile.code,
      'current_cost_per_kg', saved_profile.cost_per_kg,
      'proposed_cost_per_kg', requested_cost_per_kg,
      'waste_percent', saved_profile.waste_percent,
      'catalog_recalculation', 'pending_finance_review'
    )
  );

  return jsonb_build_object(
    'profile', to_jsonb(saved_profile),
    'recalculation', jsonb_build_object('status', 'pending_finance_review', 'recalculated_count', 0)
  );
end;
$$;

create or replace function public.erp_receive_material_stock(
  requested_supplier_name text,
  requested_supplier_tax_id text,
  requested_material_profile_id uuid,
  requested_document_type text,
  requested_document_number text,
  requested_document_date date,
  requested_received_at timestamptz,
  requested_warehouse_location text,
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
  actor_profile_id uuid,
  operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  existing_purchase public.erp_material_purchases%rowtype;
  result_payload jsonb;
  purchase_uuid uuid;
  lot_uuid uuid;
  review_status text;
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin', 'production_operator');
  if actor_role is null then raise exception 'ERP_FORBIDDEN'; end if;
  if operation_key is null then raise exception 'ERP_OPERATION_KEY_REQUIRED'; end if;
  if char_length(trim(coalesce(requested_warehouse_location, ''))) < 1 then raise exception 'ERP_WAREHOUSE_LOCATION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(operation_key::text, 0));
  select * into existing_purchase
  from public.erp_material_purchases
  where receipt_operation_key = operation_key;
  if existing_purchase.id is not null then
    select id into lot_uuid from public.erp_material_lots where purchase_id = existing_purchase.id limit 1;
    return jsonb_build_object(
      'purchase_id', existing_purchase.id,
      'lot_id', lot_uuid,
      'finance_review_status', existing_purchase.finance_review_status,
      'idempotent_replay', true
    );
  end if;

  result_payload := public.erp_record_material_purchase(
    requested_supplier_name,
    requested_supplier_tax_id,
    requested_material_profile_id,
    requested_document_type,
    requested_document_number,
    requested_document_date,
    requested_quantity_kg,
    requested_unit_cost_excl_vat,
    requested_vat_source,
    requested_currency,
    requested_exchange_rate_to_gel,
    requested_paid_amount_source,
    requested_payment_method,
    requested_payment_reference,
    requested_document_reference,
    requested_notes,
    actor_profile_id
  );

  purchase_uuid := (result_payload ->> 'purchase_id')::uuid;
  lot_uuid := (result_payload ->> 'lot_id')::uuid;
  review_status := case when actor_role in ('owner', 'admin') then 'approved' else 'pending' end;

  update public.erp_material_purchases
  set received_by = actor_profile_id,
      received_at = requested_received_at,
      warehouse_location = left(trim(requested_warehouse_location), 160),
      finance_review_status = review_status,
      finance_reviewed_by = case when review_status = 'approved' then actor_profile_id else null end,
      finance_reviewed_at = case when review_status = 'approved' then now() else null end,
      receipt_operation_key = operation_key
  where id = purchase_uuid;

  update public.erp_material_lots
  set received_at = requested_received_at::date
  where id = lot_uuid;

  update public.erp_material_movements
  set occurred_at = requested_received_at,
      notes = concat_ws(' · ', notes, 'Warehouse: ' || left(trim(requested_warehouse_location), 160))
  where purchase_id = purchase_uuid and movement_type = 'receipt';

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'operator_material_received',
    'erp_material_purchase',
    purchase_uuid::text,
    jsonb_build_object(
      'lot_id', lot_uuid,
      'warehouse_location', left(trim(requested_warehouse_location), 160),
      'quantity_kg', requested_quantity_kg,
      'finance_review_status', review_status,
      'operation_key', operation_key
    )
  );

  return result_payload || jsonb_build_object(
    'finance_review_status', review_status,
    'warehouse_location', left(trim(requested_warehouse_location), 160),
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.erp_approve_material_receipt(
  requested_purchase_id uuid,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  saved public.erp_material_purchases%rowtype;
  recalculation_result jsonb;
  approved_weighted_cost_per_kg numeric(14,2);
  current_waste_percent numeric(5,2);
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id and is_active = true and role in ('owner', 'admin');
  if actor_role is null then raise exception 'ERP_FORBIDDEN'; end if;

  update public.erp_material_purchases
  set finance_review_status = 'approved',
      finance_reviewed_by = actor_profile_id,
      finance_reviewed_at = now()
  where id = requested_purchase_id
    and received_at is not null
    and finance_review_status = 'pending'
  returning * into saved;
  if saved.id is null then raise exception 'ERP_RECEIPT_NOT_FOUND'; end if;

  select round(sum(lot.remaining_grams * lot.unit_cost_per_gram_gel) / nullif(sum(lot.remaining_grams), 0) * 1000, 2)
  into approved_weighted_cost_per_kg
  from public.erp_material_lots lot
  join public.erp_material_purchases purchase on purchase.id = lot.purchase_id
  where lot.material_profile_id = saved.material_profile_id
    and lot.remaining_grams > 0
    and purchase.finance_review_status = 'approved';
  select waste_percent into current_waste_percent
  from public.material_cost_profiles where id = saved.material_profile_id;
  if approved_weighted_cost_per_kg is not null then
    recalculation_result := public.save_material_cost_profile_v2(
      saved.material_profile_id,
      approved_weighted_cost_per_kg,
      current_waste_percent,
      actor_profile_id
    );
  else
    recalculation_result := jsonb_build_object('status', 'no_approved_stock');
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_profile_id,
    'erp_material_receipt_approved',
    'erp_material_purchase',
    saved.id::text,
    jsonb_build_object(
      'received_by', saved.received_by,
      'received_at', saved.received_at,
      'catalog_recalculation', recalculation_result
    )
  );

  return jsonb_build_object('purchase_id', saved.id, 'finance_review_status', saved.finance_review_status);
end;
$$;

revoke all on function public.erp_receive_material_stock(text, text, uuid, text, text, date, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.erp_approve_material_receipt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_material_cost_profile_v2(uuid, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.erp_receive_material_stock(text, text, uuid, text, text, date, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid, uuid) to service_role;
grant execute on function public.erp_approve_material_receipt(uuid, uuid) to service_role;
grant execute on function public.save_material_cost_profile_v2(uuid, numeric, numeric, uuid) to service_role;
