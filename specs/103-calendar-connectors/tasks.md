# Tasks: Permissioned Calendar Connector Foundation

## Phase 1 — Reuse and contracts

- [ ] T001 Record the R3/R16/R17 reuse inventory and frozen lockfile hashes.
- [ ] T002 Create strict provider-neutral R23 schemas and scope registry.
- [ ] T003 Add RED provider, scope, unknown-field and zero-transport tests.

## Phase 2 — Provider adapters

- [ ] T004 Preserve the existing Google adapter behind the R23 contract.
- [ ] T005 Add a deterministic Microsoft Calendar request builder.
- [ ] T006 Add common conflict, stale-cursor, reauthorization and retry
  classification tests.

## Phase 3 — Persistent authority and revocation

- [ ] T007 Add owner/admin two-provider cockpit projection.
- [ ] T008 Add concurrent prepare/replay/stale/tenancy/policy PostgreSQL tests.
- [ ] T009 Add deterministic sync/write preparation with canonical
  fingerprint and remote precondition binding.
- [ ] T010 Add exact local revocation, provider independence and restart proof.
- [ ] T011 Add an additive fingerprint binding migration only if the executable
  mapping contract proves it is required.

## Phase 4 — Shared iOS/Android cockpit

- [ ] T012 Add the protected mobile calendar-connector API.
- [ ] T013 Add strict native parsing and protected outbox commands.
- [ ] T014 Add one owner/office Connections calendrier surface.
- [ ] T015 Add mobile restart, role, provider-independence and zero-transport
  tests.

## Phase 5 — Validation and continuation

- [ ] T016 Run R23 and relevant R3/R13/R16/R17 unit/PostgreSQL gates.
- [ ] T017 Run full mobile, root/mobile lint and typecheck, Prisma validation,
  fresh migration replay, Webpack build, diff and lockfile checks.
- [ ] T018 Record R23 closeout, commit locally and advance the rolling queue and
  backlog to R24 without founder confirmation.
