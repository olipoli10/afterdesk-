# Implementation Plan: R29 Plain-Language Provenance UX

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android client and existing authenticated mobile session.
- Canonical source records already exist across Construction messages,
  interpretations, open-loop facts/evidence/contradictions/transitions/snapshots,
  actions, human escalations and R28 authority evaluations.
- No schema migration or dependency is expected; R29 is a deterministic projection.

## Architecture

1. Define closed owner/office and field-worker provenance contracts.
2. Query canonical records by exact workspace/project after active-membership recheck.
3. Convert records through closed French templates into six provenance kinds.
4. Link causal predecessors only from stored IDs; never infer a relationship.
5. Preserve all contradiction and transition history while emphasizing the latest verified state.
6. Recursively minimize field-worker output before schema validation.
7. Expose one private/no-store API and reuse it in web and shared Expo surfaces.
8. Prove deterministic ordering, restart stability, tenancy, role minimization and zero external effect.

## Constitution Check

- **Canonical state**: PASS — PostgreSQL records are the only inputs.
- **Truth labels**: PASS — fact, inference and verified state stay distinct.
- **Provenance**: PASS — every entry binds to canonical entity identity and time.
- **Authority**: PASS — membership and project ownership reload at point of read.
- **Role safety**: PASS — independent field schema and recursive leak guard.
- **No invention**: PASS — closed templates only; absent links remain null.
- **External effects**: PASS — read-only projection; no provider or transport path.

## Validation

- R29 contract/unit and disposable-PostgreSQL integration tests;
- R0/R15/R18/R22/R28 targeted regression tests;
- mobile provenance and full mobile tests, lint, typecheck and local exports;
- root lint/typecheck, Next.js Webpack build, Spec Kit analysis and diff/lockfile audit;
- deterministic restart, cross-workspace refusal and field-leak proof.

## Delivery and continuation

Commit the specification transition, implementation and closeout coherently.
Mark R29 DONE and promote R30 Tenant Privacy in the same queue transition. Do
not push, deploy, preview, publish or stop while authorized roadmap work remains.
