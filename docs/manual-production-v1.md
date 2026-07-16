# Hooma manual production V1

## Operating decision

The dedicated Windows PC does not need a separate Hooma desktop application in V1. Operators open the Hooma Admin production console in Edge or Chrome and keep Bambu Studio/Farm Manager open beside it.

- Hooma is the source of truth for orders, operator approvals, print-job ownership, customer tracking, QC, and courier handoff.
- Bambu Studio is the source of truth for the physical printer command in V1.
- Hooma stores no Bambu credential and sends no browser-side printer command.
- Each operator uses an individual Hooma account. The recommended initial team is one Owner and one Production Operator.

## Successful order flow

1. `order_received`: the authenticated customer submits a test order.
2. `production_queued`: an operator validates the configuration and confirms production. Hooma creates one job per quantity × plate. The customer sees **წარმოება დაწყებულია**.
3. `in_production`: the operator first atomically reserves a free printer in Hooma. Only the winning operator then opens the reviewed MakerWorld page, starts the correct profile/material/color on that reserved printer in Bambu Studio, and records the physical start as a separate action.
4. `quality_check`: every required physical print is complete.
5. `ready_for_delivery`: an operator passes QC. The customer sees that production is complete and the order is being prepared for courier handoff.
6. `out_for_delivery`: the courier physically accepts the package. Only then does the customer see **გადაეცა საკურიერო მომსახურებას**.
7. `delivered`: the operator records the courier's real delivery confirmation.

If a print fails, the operator records a reason. The failed attempt remains in the audit history, the printer becomes available, and Hooma creates a new unassigned retry attempt for the same unit and plate. Failed history never blocks QC after the replacement attempt succeeds.

Printer state is explicitly operator-reported in V1. A future Windows gateway can reuse the same `printers`, `print_jobs`, `lock_version`, source/profile snapshots, and audit history without changing the customer order model.

## Safety and concurrency rules

- Unpaid production is possible only for `test_mode=true` orders.
- A future live order requires both `orders.payment_status='paid'` and a matching signed, paid `payment_attempt`.
- Operator actions are service-role-only transactional RPCs. Browser roles cannot mutate orders, jobs, printers, events, payments, or audit history directly.
- Every action has an idempotency UUID, row locks, an expected job `lock_version`, a customer event where relevant, and an audit entry in the same transaction.
- One printer can have at most one active job. One logical unit/plate can have at most one active attempt.
- Physical Bambu start always happens after Hooma reservation; this prevents two operators from launching the same job before a database lock can arbitrate it.
- `credential_ref` is not selectable by authenticated browser clients.
- MakerWorld links are restricted to reviewed HTTPS `makerworld.com` hosts and are never sent to customers.

## Windows workstation checklist

- Install current Bambu Studio and complete one manual test print on each printer.
- Keep the PC and printers on the same private LAN; do not expose printer ports to the internet.
- Disable automatic sleep while production is active and use Ethernet/UPS where practical.
- Give printers unique Hooma names such as `A1-01`, `A1-02`, `P1S-01`.
- Add only the serial's last four characters to Hooma; never enter an access code or cloud password.
