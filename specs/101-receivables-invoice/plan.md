# R21 Plan — Invoice Readiness, Receivables and Collection Cockpit

## Objective

Connect completed-work readiness to issued receivables and collection
responsibility so the contractor can see what is blocked, what is billable,
what is owed, what was promised and who must act next.

## Product slice

- project R0 invoice-readiness state beside R6 receivables;
- bind one issued receivable to one currently ready open loop;
- recompute readiness and verified amount before recording issuance;
- persist payment promises and immutable lifecycle transitions;
- project overdue and broken-promise attention without changing balances;
- use deterministic R20 commands to create managed collection follow-ups;
- expose strict owner/office mobile controls and an explicitly empty financial
  field view;
- retain stable retry through the R17 protected mobile outbox.

## Reuse

- R0 remains the only invoice-readiness evaluator and evidence authority;
- R6 remains the only receivable balance and payment-event engine;
- R20 remains the only follow-up, next-owner and escalation engine;
- R10/R11 remain the exact prepared-action inspection and decision path;
- R17 remains the protected local retry mechanism.

## Allowed implementation

- `specs/101-receivables-invoice/**`;
- `src/lib/construction-operating-assistant-r21/**`;
- `src/server/construction-operating-assistant-r21/**`;
- `src/server/construction-operating-assistant-r20/follow-up-engine.ts` only to
  add the workspace filter required for bounded R21 due preparation;
- `src/app/api/endvera/v1/mobile/invoices/**`;
- `apps/mobile/src/app/(app)/receivables.tsx`;
- `apps/mobile/src/components/receivable-forms.tsx` only for R21 commands;
- `apps/mobile/src/lib/invoices.ts`, API, session and outbox wiring;
- R21 unit/mobile/disposable-PostgreSQL tests;
- `prisma/schema.prisma` plus one forward-only R21 migration for exact loop
  binding, payment promises and immutable economic command history;
- `test/integration/per-file-setup.ts` only for new immutable test-table guards.

No dependency or lockfile change is permitted.

## Completion gate

- only a freshly recomputed ready loop can create an issued receivable;
- concurrent issue commands create one receivable and one immutable result;
- changed-content retry, stale versions and cross-workspace references fail;
- promises do not alter balance and each outcome applies once;
- overdue or broken-promise work is delegated once to R20 and remains
  transport-free;
- state and history reconstruct after a fresh database connection;
- owner/office sees economic detail while field projection contains none;
- R0/R6/R20 regressions remain green;
- no provider, customer data, external transport, external write, push,
  deployment or store action.
