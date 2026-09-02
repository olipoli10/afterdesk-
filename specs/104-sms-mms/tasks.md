# Tasks: R24 SMS/MMS

## Phase 1 — Contract and RED

- [x] T001 Freeze the R4 reuse, consent, opt-out, MMS and delivery contract.
- [x] T002 Add strict R24 schemas and deterministic policy helpers.
- [x] T003 Add failing unit tests for invalid, untrusted and unsafe transitions.

## Phase 2 — PostgreSQL routing and policy

- [x] T004 Add a forward-only messaging policy/media/delivery migration.
- [x] T005 Add single-project inbound routing with ambiguity refusal.
- [x] T006 Add atomic STOP, START and HELP handling with exact replay.
- [x] T007 Add same-workspace/project selected-evidence admission for MMS.
- [x] T008 Add PostgreSQL concurrency, replay, restart and tenant tests.

## Phase 3 — Exact outbound and lifecycle

- [x] T009 Gate exact R4 SMS preparation on purpose consent and suppression.
- [x] T010 Add immutable monotonic synthetic delivery observations.
- [x] T011 Add owner/office and minimized field-worker cockpit projections.

## Phase 4 — Shared iOS/Android cockpit

- [x] T012 Add protected mobile messaging API routes.
- [x] T013 Add strict native parsing and offline-safe policy/preparation commands.
- [x] T014 Add one native Messages surface with explicit proof labels.
- [x] T015 Add mobile role, restart, replay and zero-transport tests.

## Phase 5 — Validation and continuation

- [x] T016 Run R24 and relevant R4/R10/R11/R12/R14/R17 gates.
- [x] T017 Run Prisma/fresh migration, full mobile, lint, typecheck, build, diff
  and lockfile gates.
- [ ] T018 Record R24 closeout, commit locally and advance the rolling queue and
  backlog to R25 without founder confirmation.
