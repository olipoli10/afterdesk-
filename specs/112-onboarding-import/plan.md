# Implementation Plan: R32 Contractor Onboarding and Bounded Import

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android application and existing Construction cockpit.
- Existing Construction workspace, membership, project, contact, audit,
  permission and mobile-session contracts remain canonical.
- One forward-only migration adds onboarding/import control records; no
  dependency or lockfile change.
- CSV parsing is deterministic application code with explicit byte/row/column
  bounds; no spreadsheet library or external parser is introduced.

## Architecture

1. Define a closed onboarding stage machine and strict owner/field projections.
2. Initialize or resume the existing canonical workspace through one idempotent command ledger.
3. Expose direct first-project and first-contact commands that reuse current Construction creation functions.
4. Parse bounded UTF-8 CSV into normalized contact or project row proposals without canonical writes.
5. Persist an immutable import batch and rows with source/parser fingerprints, closed row states and reason codes.
6. Detect workspace-scoped duplicates/conflicts from canonical records and require explicit versioned `SKIP`, safe `CREATE_NEW`, or exact `USE_EXISTING` decisions.
7. Commit only an unchanged batch, revalidating current conflicts and writing all accepted canonical rows plus audit in one transaction.
8. Derive first-value readiness and next action from PostgreSQL rather than client-completed checkboxes.
9. Expose a private/no-store API plus one-step web and shared Expo onboarding surfaces.
10. Prove exact replay, concurrency, atomic refusal, restart equality, 500-row bounds, tenancy and field minimization.

## Import registry v1

| Kind | Required columns | Optional columns | Canonical target |
|---|---|---|---|
| `CONTACTS_CSV` | `display_name`, `role` | `phone`, `email`, `project_code` | `ConstructionContact` |
| `PROJECTS_CSV` | `code`, `name` | `address` | `ConstructionProject` |

Unknown or repeated columns refuse the batch. Row order remains evidence order;
canonical insert order is deterministic by normalized row fingerprint.

## Persistence

- `ConstructionOnboardingSession`: one owner/workspace stage and state version.
- `ConstructionOnboardingCommand`: exact idempotent command/result ledger.
- `ConstructionImportBatch`: immutable source/parser identity and aggregate state.
- `ConstructionImportRow`: immutable normalized proposal, state, reasons and fingerprint.
- `ConstructionImportDecision`: version-bound owner decision per non-ready row.
- `ConstructionImportCommit`: immutable atomic commit result and canonical identifiers.

Raw CSV bytes are not retained after preview. The batch retains only a source
hash, closed mapping and normalized row proposals required for exact review.

## Constitution Check

- **Owned outcomes**: PASS — every screen names the next onboarding decision.
- **Canonical state**: PASS — workspace/project/contact records stay authoritative.
- **Closed-world capability**: PASS — stages, kinds, columns, row states and decisions are versioned and allowlisted.
- **Authorization/tenancy**: PASS — owner/member and workspace are reloaded for each query/command.
- **Sensitive-data handling**: PASS — coordinates stay only in owner preview/canonical contact fields and never telemetry/field output.
- **Atomicity/replay**: PASS — preview is no-write; commit is exact, atomic and idempotent.
- **Verification/evidence**: PASS — batch, row, decision and commit hashes make outcomes reconstructible.
- **External effects**: PASS — all provider, invitation and sync paths remain disabled.

No constitutional exception is required. The post-design check remains PASS.

## Validation

- R32 parser/contract unit tests and fresh disposable PostgreSQL integration;
- mutations for unknown columns, oversize/row overflow, non-UTF-8, duplicate
  identity, ambiguous project link, stale preview, altered retry and field leak;
- concurrency and atomicity tests for workspace initialization and batch commit;
- 500-row bounded preview/commit gate with exact denominators;
- R1/R13/R16/R17/R18/R29/R30/R31 regression gates;
- root/mobile tests, lint/typecheck, Prisma validation, fresh migration, Expo
  Doctor/export, Next.js Webpack build, Spec Kit analysis and lock/effect audits.

## Delivery and continuation

Commit R32 coherently, mark R32 DONE, then promote R33 Web/Mobile Parity and
continue without an intermediate final or founder prompt. No provider,
customer data, external invitation, deployment, production database or push.
