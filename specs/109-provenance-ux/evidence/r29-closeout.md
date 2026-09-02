# R29 Plain-Language Provenance UX — closeout evidence

Recorded at: 2026-09-02T02:28:08-04:00

## Result

R29 adds one deterministic, project-scoped provenance chain built from the
existing canonical Construction records. The owner and office projection
distinguishes exactly `FACT`, `INFERENCE`, `DECISION`, `ACTION`,
`HUMAN_RESULT` and `VERIFIED_STATE`; no model summary is used as truth.

The project page and shared Expo application expose the same plain-language
chain. The mobile surface is available to the local iOS, Android and Web
exports under `Confiance`. The API is authenticated, membership-scoped,
rate-limited, private and no-store.

## PostgreSQL and role proof

- Fresh disposable PostgreSQL chain applied all 55 forward-only migrations.
- R29 PostgreSQL proof reconstructed all six provenance kinds from canonical
  rows and exact entity references.
- An explicit Prisma disconnect/reconnect returned byte-equivalent structured
  output at the same reference time.
- Cross-workspace access returned not-found and created no side effect.
- Field-worker projection recursively omitted amounts, approval state, source
  entity IDs, hashes, policy details, inference details and human-work
  economics.
- Causal references are retained only when their parent remains visible in the
  same role projection.
- Historical snapshots do not borrow the current status or current next step;
  they remain labeled immutable historical state.
- External effect count remained exactly zero.

## Validation

- R29 root contract gate: 1 file, 4 tests passed.
- Relevant R0/R15/R18/R22/R28/R29 unit gates: 8 files, 38 tests passed.
- R29 disposable PostgreSQL gate: 1 test passed.
- Relevant R0/R15/R18/R22/R28/R29 PostgreSQL gates: 6 files, 25 tests passed.
- Root lint and TypeScript: passed.
- Mobile lint and TypeScript: passed.
- Full mobile suite: 20 files, 81 tests passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 45 static routes including
  `/provenance` and `/(app)/provenance`.
- Next.js Webpack build: passed; 109 static pages generated and the protected
  `/api/endvera/v1/mobile/provenance` route included.
- The first build/export attempts correctly failed closed when synthetic local
  R2 and mobile API configuration were absent; reruns used non-secret invalid
  local values and performed no network or provider action.
- Spec Kit analyze: all 18 functional requirements are covered by T001–T021;
  zero critical or high inconsistencies remain.
- Constitution Check: canonical state reuse, deterministic statements,
  immutable history, role minimization, fail-closed tenancy and zero external
  effects pass.
- `git diff --check`: passed with line-ending notices only.
- `package-lock.json`: unchanged; no dependency was added.
- Static forbidden-path audit found no provider SDK, transport, OAuth,
  credential, runtime fetch or external-write path in R29.

## Honest boundary

This is local code, local mobile export and disposable-PostgreSQL proof. It is
not live provider proof, customer proof, production authorization,
Verified-E2E coverage or product-market-fit evidence.
