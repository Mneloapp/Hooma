-- Keep posted ERP values immutable while allowing the audited physical-receipt metadata workflow.
-- Production operators receive inventory only through the dedicated V2 wrapper; finance rights stay Owner/Admin-only.

begin;

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
      and (
        role in ('owner', 'admin')
        or (
          role = 'production_operator'
          and current_setting('hooma.inventory_receipt_actor', true) = actor_profile_id::text
        )
      )
  );
$$;

create or replace function public.erp_guard_material_purchase_receipt_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then raise exception 'ERP_POSTED_RECORDS_ARE_IMMUTABLE'; end if;
  if (to_jsonb(new) - array[
      'received_by', 'received_at', 'warehouse_location', 'finance_review_status',
      'finance_reviewed_by', 'finance_reviewed_at', 'receipt_operation_key'
    ]::text[])
    is distinct from
    (to_jsonb(old) - array[
      'received_by', 'received_at', 'warehouse_location', 'finance_review_status',
      'finance_reviewed_by', 'finance_reviewed_at', 'receipt_operation_key'
    ]::text[]) then
    raise exception 'ERP_POSTED_RECORDS_ARE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists erp_material_purchases_no_update_delete on public.erp_material_purchases;
create trigger erp_material_purchases_no_update_delete
  before update or delete on public.erp_material_purchases
  for each row execute function public.erp_guard_material_purchase_receipt_metadata();

create or replace function public.erp_guard_receipt_movement_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then raise exception 'ERP_POSTED_RECORDS_ARE_IMMUTABLE'; end if;
  if old.movement_type <> 'receipt'
    or old.purchase_id is null
    or (to_jsonb(new) - array['occurred_at', 'notes']::text[])
       is distinct from (to_jsonb(old) - array['occurred_at', 'notes']::text[]) then
    raise exception 'ERP_POSTED_RECORDS_ARE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists erp_material_movements_no_update_delete on public.erp_material_movements;
create trigger erp_material_movements_no_update_delete
  before update or delete on public.erp_material_movements
  for each row execute function public.erp_guard_receipt_movement_metadata();

create or replace function public.erp_receive_material_stock_v2(
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
  result_payload jsonb;
begin
  select role into actor_role
  from public.profiles
  where id = actor_profile_id
    and is_active = true
    and role in ('owner', 'admin', 'production_operator');
  if actor_role is null then raise exception 'ERP_FORBIDDEN'; end if;

  if actor_role = 'production_operator' then
    perform set_config('hooma.inventory_receipt_actor', actor_profile_id::text, true);
  end if;

  result_payload := public.erp_receive_material_stock(
    requested_supplier_name,
    requested_supplier_tax_id,
    requested_material_profile_id,
    requested_document_type,
    requested_document_number,
    requested_document_date,
    requested_received_at,
    requested_warehouse_location,
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
    actor_profile_id,
    operation_key
  );

  if actor_role = 'production_operator' then
    perform set_config('hooma.inventory_receipt_actor', '', true);
  end if;
  return result_payload;
end;
$$;

revoke all on function public.erp_guard_material_purchase_receipt_metadata() from public, anon, authenticated;
revoke all on function public.erp_guard_receipt_movement_metadata() from public, anon, authenticated;
revoke all on function public.erp_receive_material_stock_v2(text, text, uuid, text, text, date, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.erp_receive_material_stock_v2(text, text, uuid, text, text, date, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, text, text, text, text, uuid, uuid) to service_role;

commit;
