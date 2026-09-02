# Implementation Plan: R36 Full Synthetic Internal E2E

## Technical context

- TypeScript strict, Prisma/PostgreSQL, existing R18-R35 services and strict Zod client contracts.
- One fresh disposable PostgreSQL database with all 59 migrations.
- Vitest integration harness and direct service-level orchestration; no browser/provider/network dependency.
- No dependency, lockfile or schema change expected.

## Architecture

1. Define one closed scenario registry, checkpoint catalog, allowed synthetic
   identities and expected final invariants.
2. Implement an internal orchestrator that calls accepted service boundaries
   in chronological order and records only sanitized canonical checkpoints.
3. Reuse R32 onboarding/import, R18 intent, R19/R20 operations, R21 economics,
   R22 human escalation, R23-R27 disabled connectors, R28 authority, R29
   provenance, R30 privacy, R31 recovery, R33 parity, R34 account and R35
   package contracts.
4. Insert explicit ambiguity, missing-evidence, contradiction, duplicate,
   replay, transient-failure, role-refusal and restart checkpoints.
5. Compare direct PostgreSQL counts and projection fingerprints at each
   consequential transition.
6. Emit one strict machine-readable report whose PASS state requires every
   checkpoint and exact zero-external-effect boundary.
7. Run the scenario once on a fresh disposable database, then run proportional
   focused/full regressions and local builds.

## State boundaries

| Concern | Authority |
|---|---|
| Onboarding/import | R32 |
| Intent and entity resolution | R18 |
| Scheduling/follow-up | R19/R20 |
| Invoice readiness/receivables | R21 |
| Human exception and resume | R22 |
| Connector preparation | R23-R27 |
| Authorization/provenance/privacy/recovery | R28-R31 |
| Web/mobile canonical projection | R33 |
| Commercial account | R34 |
| Local package | R35 |
| Composed synthetic proof | R36 report only |

## Constitution Check

- **Real canonical services**: PASS — no fixture may replace a service transition where one exists.
- **Synthetic boundary**: PASS — identities and content come from one closed registry.
- **No invented facts**: PASS — checkpoint facts must link to canonical rows/evidence.
- **Replay/recovery**: PASS — stable identifiers and restart hashes are mandatory.
- **Role safety**: PASS — owner/office/field schemas remain independent.
- **Platform parity**: PASS — one strict payload crosses Web/shared-mobile contracts.
- **External effects**: PASS — all adapters remain disabled and delivery count zero.

No constitutional exception is required.

## Validation

- scenario registry/report contract and mutation unit gates;
- one fresh disposable PostgreSQL composed integration run;
- direct counts, replay, restart, tenancy and role-leak assertions;
- R18-R35 targeted regressions;
- root/mobile lint, typecheck and tests;
- Expo Doctor/export, Webpack build and R35 manifest validation;
- Spec Kit Analyze, diff/lockfile/provider/secret audits.

## Delivery and continuation

Commit R36 coherently and mark local S5 product-release preparation complete.
Then evaluate R37 exact external authority. Do not fabricate provider sandbox,
founder observation, customer pilot or Production evidence. Keep the goal
active unless the canonical terminal guard proves R40 `PROJECT_COMPLETE`.
