# Hooma ERP V1

ERP V1 is an accountant-ready operational ledger. It does not submit declarations, invoices, waybills, or payments to the Georgian Revenue Service.

## What is recorded

- Legal entity, tax regime, and VAT status snapshot.
- Material purchases in kilograms, supplier and source-document details.
- FIFO material lots, remaining grams, and GEL stock value.
- Actual usable material and waste for completed/failed print jobs.
- Operating expenses and supporting-document references.
- Real bank payments only when `payment_attempts.signature_verified = true`, the provider is not `test`, the order is not in test mode, and the currency is GEL.
- Refunds as separate reversal events.
- Balanced double-entry journal lines for every posted finance event.
- An exception queue when finance capture cannot complete; a bank webhook is never rolled back by an ERP reporting error.
- UTF-8 CSV accountant export with spreadsheet formula-injection protection.

## Deployment

From the Hooma repository root:

```bash
npx supabase login
npx supabase link --project-ref qlagrwxuvfzbmxttdvtq
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
```

The last local and remote row must both show `20260716000300`.

Then deploy the branch to Vercel. The ERP page is `/admin/erp` and is visible only to active `owner` and `admin` profiles.

## First setup

1. Open **Admin → ERP და ფინანსები**.
2. Save the legal name, tax identification number, entity type, tax regime, VAT status, and VAT rate.
3. Confirm those settings with the accountant before a real payment is accepted.
4. Record every filament purchase. Each material line creates a FIFO lot and updates the catalog calculator's weighted material cost.
5. After a print is completed or failed, record usable grams and waste grams.
6. Add non-material operating expenses with their source-document number/reference.
7. Use **ძველი გადახდების სინქრონიზაცია** after live bank integration or backfill.
8. Download the accountant CSV for the required period.

## Accountant approval checklist

- Legal form and applicable tax regime.
- VAT registration date/rate and treatment of prices as VAT-inclusive.
- Chart-of-accounts codes and accounting standard/category.
- Revenue-recognition date for online sales and delivery.
- Material/FIFO valuation and production-waste treatment.
- Input VAT deductibility for each purchase/expense document.
- Cash-register/fiscal receipt process for every payment method.
- Revenue Service tax document, invoice, and waybill workflow.
- Period close, corrections, and statutory filing process.

Posted journal lines, material movements, sales events, purchases, and expenses are immutable. Corrections should be implemented as explicit reversals in the next ERP phase, never by editing historical rows.

## Security boundary

- Browser-submitted totals never create finance transactions.
- Only signature-verified non-test bank events can create sales revenue automatically.
- All admin writes run through server actions and actor-checked service-role RPC functions.
- RLS limits ERP reads to active Owner/Admin users.
- ERP writes and setting changes also create `audit_log` events.
- Test orders/payments are excluded from finance reports and exports.
- Exports are private, non-cacheable, and permission checked on every request.

