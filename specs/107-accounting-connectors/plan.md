# Implementation Plan: R27 Accounting Connectors

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android client with the existing durable outbox.
- R21 is the canonical receivables/readiness source. R10/R11 bind exact
  inspection and decisions; R16/R17 provide permission and retry boundaries.
- No provider SDK, dependency, credential, network path or public webhook.

## Architecture

1. Define provider-neutral accounting accounts, capabilities, normalized
   invoice/payment observations, match decisions and exact prepared operations.
2. Add forward-only account, observation, match, draft and immutable-decision
   persistence with workspace locks and unique replay identities.
3. Prepare/revoke disabled QuickBooks/Xero accounts without secrets.
4. Admit trusted normalized observations and match only exact compatible R21
   receivables; preserve ambiguity, partial/overpayment and contradictions.
5. Prepare exact invoice and reconciliation operations from canonical state;
   approval remains unposted with zero external effect.
6. Expose a protected API and one shared mobile accounting cockpit with durable
   account/draft/approval/revocation commands.
7. Prove replay, concurrency, restart, staleness, tenant isolation, role
   minimization and zero write on disposable PostgreSQL.

## Constitution Check

- **Authority**: PASS — local code/test/disposable PostgreSQL only.
- **Canonical state**: PASS — R21 remains authoritative; provider data is an observation.
- **Least privilege**: PASS — read and prepare capabilities are separate; write is disabled.
- **Tenancy**: PASS — all account/observation/draft/match lookups are workspace scoped.
- **Financial safety**: PASS — ambiguity never changes balance or settlement state.
- **Approval**: PASS — exact source versions and payload hashes bind decisions.
- **Role safety**: PASS — field projections contain no financial/accounting detail.
- **Rollback**: PASS — local revoke plus application rollback; immutable history retained.

## Validation

- R27 unit and disposable-PostgreSQL integration plus relevant R10/R11/R16/R17/R21 regressions;
- Prisma format/validate/generate and fresh forward-only migration chain;
- full mobile tests, lint, typecheck, Expo Doctor and local iOS/Android/Web export;
- root lint/typecheck, Next.js Webpack build, Spec Kit analysis, diff/audit/lockfile review;
- zero provider endpoint, OAuth path, webhook, network or accounting-write proof.

## Delivery and continuation

Commit specification, implementation and closeout coherently. Mark R27 DONE and
promote R28 Authority Policies in the same transition. Do not push, deploy,
preview, publish or stop while authorized roadmap work remains.
