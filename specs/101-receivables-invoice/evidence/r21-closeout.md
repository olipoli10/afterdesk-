# R21 Closeout — Invoice Readiness, Receivables and Collection Cockpit

## Result — CODE

R21 binds one freshly recomputed R0 invoice-readiness loop to one R6
receivable. Invoice issuance is serializable, exact-once and refuses stale,
cross-workspace, already-invoiced or no-longer-ready work. The canonical amount
comes from the retained open-loop fact and the issued event retains the exact
readiness decision hash as provenance.

Payment promises are durable operational facts, not payments. Creating or
resolving a promise never reduces the receivable balance. A promise can be
marked kept only after matching payment events, broken only after its due time
with a remaining balance, or explicitly revoked. Every command and before/after
result is immutable and exact retries return the stored result.

Overdue invoices and due or broken promises deterministically create one R20
follow-up. Communication work remains `PREPARED_UNSENT`, with zero external
transport. The mobile receivables surface now shows readiness, blockers,
issued balances, active promises and the next collection decision in one
cockpit. It reuses the R17 protected outbox. The field projection is an
explicitly empty financial view.

## Observed gates — TEST

- R21 contract and policy tests: 5/5 passed;
- R21 native mobile contracts and protected-outbox tests: 4/4 passed;
- R21 disposable-PostgreSQL tests: 3/3 passed;
- focused R0/R6/R20/R21 unit regressions: 31/31 passed across 6 files;
- R0/R6/R20/R21 disposable-PostgreSQL regressions: 18/18 passed across 4
  serialized files;
- complete native mobile suite: 49/49 passed across 12 files;
- root and mobile lint and typecheck: passed;
- Prisma formatting, validation and generation: passed;
- the forward-only R21 migration applied in a fresh 48-migration chain;
- schema diff reported no drift for the new R21 loop binding, payment-promise
  or economic-command structures; reported naming/default/nullability drift is
  historical and predates R21;
- local Next.js Webpack build: 109/109 routes generated, including
  `/api/endvera/v1/mobile/invoices`, with synthetic local build variables and
  no deployment;
- root and mobile lockfiles: unchanged.

## Refusal and reconstruction proof — TEST

- only a current `READY_TO_INVOICE` loop with retained canonical amount can
  issue a receivable;
- concurrent exact issuance creates one receivable and one issued event;
- changed-content command reuse, stale versions, cross-workspace contact or
  loop references and a second invoice for the same loop are refused;
- payment promises leave the outstanding balance unchanged;
- a kept promise requires matching recorded payment evidence and a broken
  promise requires an elapsed promise date plus a remaining balance;
- overdue and broken-promise collection delegates exactly once to R20 and
  remains `PREPARED_UNSENT`;
- economic cockpit state reconstructs from a fresh PostgreSQL connection;
- interrupted mobile commands restore byte-for-byte as `OUTCOME_UNKNOWN` and
  are never automatically resent;
- field workers receive empty invoice-readiness and receivable arrays, with
  recursive financial-leak refusal;
- external transport remains false throughout.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, customer data, live SMS/call/email/calendar/accounting/payment
  rail, external transport or external write;
- no dependency or lockfile change;
- no push, Preview, Production, EAS, deployment or store action;
- no always-on runtime consumer was activated;
- this is local build proof, not provider readiness, customer value,
  product-market fit or Verified-E2E coverage.
