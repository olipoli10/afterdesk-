# Feature Specification: Invoice Readiness, Receivables and Collection Cockpit

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Feature**: `101-receivables-invoice`
**Status**: Implementation authorized by the rolling R13-R40 program

## Product outcome

ENDVERA gives the contractor one canonical economic view from completed work to
money collected. A ready-to-invoice open loop can become one locally recorded
issued invoice, every issued amount remains traceable to the exact readiness
state, payment promises are durable and overdue collection work is prepared by
the R20 follow-up engine without external transport.

## User scenarios and acceptance

### 1. See why work can or cannot be invoiced

An owner or office manager sees invoice-readiness loops and issued receivables
in one role-safe projection.

- Missing facts, missing evidence and open contradictions remain visible.
- `READY_TO_INVOICE` comes only from the canonical R0 decision.
- Field workers receive neither amounts, invoice references nor payment state.

### 2. Record one issued invoice from proven readiness

An authorized office user records that an invoice was issued for a
`READY_TO_INVOICE` loop.

- The service recomputes readiness from PostgreSQL before the write.
- Project, verified CAD amount and exact readiness version are bound.
- One open loop can create at most one receivable.
- Exact retry returns the stored result; changed-content retry is refused.
- This local record does not send an invoice or call an accounting provider.

### 3. Retain a payment promise

An authorized office user records a customer's bounded promise to pay.

- Amount, promise date, source, actor and receivable version are retained.
- One active promise is projected without rewriting older promises.
- Kept, broken and revoked outcomes are versioned and immutable in history.
- A promise never changes the outstanding balance; only a proven payment does.

### 4. Prepare overdue collection work

When an unpaid invoice or payment promise becomes due, ENDVERA delegates the
next action to the existing R20 follow-up engine.

- A deterministic local command creates at most one managed follow-up.
- The responsible office user, contact, next decision and retry policy are
  explicit.
- The result remains `PREPARED_UNSENT` or scheduled locally.
- No SMS, email, phone, accounting or payment transport occurs.

### 5. Recover the economic state

After restart, the same invoice linkage, outstanding amount, payment promise,
next collection decision and immutable command result reconstruct from
PostgreSQL.

## Requirements

- **FR-001**: Reuse R0 readiness, R6 receivables and R20 follow-ups; do not add
  parallel readiness, balance or reminder engines.
- **FR-002**: Bind an issued receivable to at most one canonical open loop.
- **FR-003**: Refuse issuance unless the loop is currently
  `READY_TO_INVOICE`, has no open contradiction and retains accepted written
  approval plus work evidence.
- **FR-004**: Bind the issued amount to the verified canonical CAD amount.
- **FR-005**: Preserve stable workspace-scoped command IDs, command hashes,
  optimistic versions and immutable results.
- **FR-006**: Preserve payment promises separately from payment receipts.
- **FR-007**: A payment promise must not reduce the receivable balance.
- **FR-008**: Promise outcomes must be exact-once and reconstructible.
- **FR-009**: Prepare overdue collection through R20 with zero external
  transport and no automatic runtime consumer.
- **FR-010**: Project owner/office economic state and a financially empty field
  state through strict API/mobile contracts.
- **FR-011**: Refuse cross-workspace/project/contact/loop/receivable links.
- **FR-012**: Preserve provenance for readiness, invoice issuance, promises,
  payments and prepared collection actions.

## Non-goals

- Creating or delivering a PDF invoice.
- Live QuickBooks, Xero, payment, SMS, email or voice integration.
- Charging a card, accepting payment or reconciling a bank account.
- Customer data, provider credentials, OAuth, background production workers,
  push notifications, deployment or store publishing.
- Replacing the accounting-provider work reserved for R27.

## Completion evidence

- Unit proof for readiness binding, promise policy and role-safe projection.
- Disposable PostgreSQL proof for exact issuance, concurrency, promise
  lifecycle, prepared collection and restart parity.
- Mobile contract and protected-outbox proof.
- R0, R6 and R20 regressions remain green.
