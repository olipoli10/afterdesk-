# Tasks: Permissioned Calendar Connector Foundation

## Phase 1 — Reuse and contracts

- [x] T001 Record the R3/R16/R17 reuse inventory and frozen lockfile hashes.
- [x] T002 Create strict provider-neutral R23 schemas and scope registry.
- [x] T003 Add RED provider, scope, unknown-field and zero-transport tests.

## Phase 2 — Provider adapters

- [x] T004 Preserve the existing Google adapter behind the R23 contract.
- [x] T005 Add a deterministic Microsoft Calendar request builder.
- [x] T006 Add common conflict, stale-cursor, reauthorization and retry
  classification tests.

## Phase 3 — Persistent authority and revocation

- [x] T007 Add owner/admin two-provider cockpit projection.
- [x] T008 Add concurrent prepare/replay/stale/tenancy/policy PostgreSQL tests.
- [x] T009 Add deterministic sync/write preparation with canonical
  fingerprint and remote precondition binding.
- [x] T010 Add exact local revocation, provider independence and restart proof.
- [x] T011 Add the forward-only provider-constraint migration required for the
  Microsoft account, without a schema rewrite.

## Phase 4 — Shared iOS/Android cockpit

- [x] T012 Add the protected mobile calendar-connector API.
- [x] T013 Add strict native parsing and protected outbox commands.
- [x] T014 Add one owner/office Connections calendrier surface.
- [x] T015 Add mobile restart, role, provider-independence and zero-transport
  tests.

## Phase 5 — Validation and continuation

- [x] T016 Run R23 and relevant R3/R13/R16/R17 unit/PostgreSQL gates.
- [x] T017 Run full mobile, root/mobile lint and typecheck, Prisma validation,
  fresh migration replay, Webpack build, diff and lockfile checks.
- [ ] T018 Record R23 closeout, commit locally and advance the rolling queue and
  backlog to R24 without founder confirmation.
