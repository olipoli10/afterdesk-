# Implementation Plan: R30 Tenant Privacy Control Plane

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android application and existing R16 permission center.
- Existing canonical Construction tables already scope operational data by workspace.
- One forward-only migration is expected for versioned policy, operations,
  deletion requests and tombstones; no dependency change.

## Architecture

1. Define closed privacy classes, targets, lifecycles and independent role schemas.
2. Add versioned retention policy sets/rules with one-active-version enforcement.
3. Reconstruct a canonical inventory through a closed server-side query registry.
4. Reduce export to a deterministic manifest; never serialize raw sensitive rows.
5. Evaluate deletion eligibility from exact target scope, active holds, protected
   record types, evidence state and policy version.
6. Require a second version-bound approval before a synthetic evidence tombstone.
7. Preserve immutable operation/refusal history and exact idempotency.
8. Show secret/evidence lifecycle truth without exposing references or claiming
   unobserved provider/storage deletion.
9. Expose one private/no-store API and shared web/iOS/Android privacy center.
10. Prove tenant isolation, concurrency, restart, role minimization and zero external effect.

## Constitution Check

- **Canonical state**: PASS — inventory is reconstructed, not duplicated.
- **Tenant isolation**: PASS — workspace predicates and membership reload at every boundary.
- **Least privilege**: PASS — owner/office and field contracts are independent.
- **Retention**: PASS — complete versioned policies and explicit holds.
- **Deletion safety**: PASS — closed targets, eligibility, exact approval and immutable tombstones.
- **Secret hygiene**: PASS — lifecycle state only; opaque references never leave server internals.
- **Evidence lifecycle**: PASS — tombstone and external-pending are distinct.
- **External effects**: PASS — no provider or storage deletion path in R30.

## Validation

- R30 contract/unit and fresh disposable-PostgreSQL integration tests;
- mutation/RED for tenancy, hidden fields, stale versions, holds and repeated approval;
- R16/R28/R29 and evidence/connector regression gates;
- mobile privacy/full tests, lint, typecheck, Doctor and local exports;
- root lint/typecheck, Prisma validation, fresh migration, Webpack build, Spec Kit
  analysis, diff/lockfile and forbidden-path audits.

## Delivery and continuation

Commit the R30 transition, implementation and closeout coherently. Mark R30
DONE and promote R31 Observability/Recovery without an intermediate final or
founder prompt. No push, provider, deployment or external deletion.
