# R30 Tenant Privacy Control Plane — closeout evidence

Recorded at: 2026-09-02T03:41:32-04:00

## Result

R30 adds one versioned, workspace-scoped privacy control plane over canonical
Construction state. Owners can activate retention policies, inspect a closed
inventory, prepare minimized deterministic export manifests, evaluate exact
deletion targets and create one local tombstone after a second exact approval.
Office users receive read-only context. Field workers receive an independent
minimal access projection with no inventory, operation, secret or financial
detail.

The web portal and shared Expo iOS/Android application expose the same strict
contracts. The API is authenticated, rate-limited, private and no-store.
External deletion, credential revocation, provider transport and customer data
remain disabled.

## PostgreSQL, isolation and recovery proof

- A fresh disposable PostgreSQL database rebuilt all 56 forward-only
  migrations, including the R30 policy, operation, refusal, deletion-request
  and tombstone schema.
- R30 integration: 1 file, 5 tests passed.
- R23 plus R30 boundary regression: 2 files, 9 tests passed after replacing an
  explicit serializable-pool dependency with the existing transaction-scoped
  advisory-lock serialization.
- Two workspaces remained isolated across inventory, export and deletion.
- Exact replay returned one immutable result; altered reuse refused.
- Concurrent policy activation retained exactly one active version.
- Disconnect/reconnect returned the same canonical projection at the same
  reference time.
- Held evidence refused deletion, eligible synthetic evidence created exactly
  one local tombstone, and external-effect count remained zero.
- Secret references were counted only as opaque lifecycle state and never
  returned.

## Validation

- R30 contract/unit gate: 1 file, 5 tests passed.
- Relevant R14/R16/R23/R28/R29/R30 root gates: 5 files, 23 tests passed.
- Root lint and TypeScript: passed.
- Full mobile suite: 21 files, 85 tests passed.
- Mobile lint and TypeScript: passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 47 static routes including
  `/privacy` and `/(app)/privacy`.
- Next.js Webpack build: passed; 109 static pages generated and the protected
  `/api/endvera/v1/mobile/privacy` route included.
- Build used only disposable PostgreSQL plus non-secret invalid local build
  values; it performed no migration, provider call or external write.
- Spec Kit analyze: all 20 functional requirements and nine success criteria
  are covered by T001–T022; zero critical, high, ambiguity or duplication
  findings remain.
- Constitution Check: canonical state reuse, point-of-use tenancy, independent
  role schemas, immutable policy history, two-step deletion, secret hygiene,
  evidence lifecycle truth and zero external effects pass.
- `git diff --check`: passed with line-ending notices only.
- `package-lock.json`: byte-identical Git blob; no dependency was added.

## Broader-suite truth

A serialized 64-file PostgreSQL run completed with 62 files and 456 tests
passing. It exposed one pre-existing R23 pooled-transaction concurrency defect,
which was reproduced, fixed through the already-present advisory-lock contract
and then passed its targeted PostgreSQL regression. Three remaining failures
belong to the historical AI budget-demotion fixture because its synthetic
provider responder for stage `other` is absent; R30 does not touch that engine
or claim the full historical suite green.

## Honest boundary

Evidence labels are `CODE + TEST + SYNTHETIC`. This is not customer evidence,
provider proof, physical deletion proof, production authorization,
Verified-E2E coverage or product-market-fit evidence.
