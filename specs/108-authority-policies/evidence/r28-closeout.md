# R28 Organization Authority Policies — closeout evidence

Recorded at: 2026-09-02T01:52:00-04:00

## Result

R28 implements one canonical, versioned organization authority engine. Every
registered action resolves at point of use to exactly one of
`AUTOMATIC_INTERNAL`, `APPROVAL_REQUIRED` or `PROHIBITED`. Unknown, incomplete,
cross-workspace and unsafe requests fail closed.

The owner can create a complete fail-closed baseline, edit only a draft,
activate an exact version, supersede it with immutable history and revoke it.
Owner and office roles can inspect eligible evaluations and bind one local
approval or rejection to the exact evaluation version, policy version and
payload hash. Prohibited actions never enter the decision path.

No provider, OAuth grant, credential, network request, customer data, external
transport, external write, payment, legal commitment, deletion, push, Preview
or Production action was used.

## Persistence and policy proof

- Forward-only policy-set, rule, operation, evaluation, decision and refusal
  schema applied through the full disposable chain of 55 migrations.
- A partial unique PostgreSQL index permits at most one active policy version
  per workspace.
- The closed registry versions risk, reversibility, external-effect capability,
  monetary context, minimum role and data-classification reach for 12 actions.
- A new workspace draft contains 12 safe baseline rules. Low-risk internal
  automation must be made explicit; consequential or external actions remain
  at least approval-required; payment, contract, credential and destructive
  actions remain prohibited.
- Exact command replay produces one canonical result. Altered reuse, unsafe
  automatic rules, active-policy mutation, stale versions, expired decisions,
  cross-workspace resources and repeated decisions are refused immutably.
- Concurrent evaluation and concurrent exact decision tests each produce one
  canonical effect and one replay.
- Expired and superseded evaluations become durably `EXPIRED` and `STALE`
  without creating a decision.
- Explicit Prisma disconnect/reconnect preserves an identical cockpit state.
- Field workers receive only their own minimized allow/review/prohibit status;
  policy rules, ceilings, action keys, actors, payload hashes and policy
  versions are absent.
- The shared Permissions surface exposes policy lifecycle and exact authority
  decisions on iOS and Android through a restart-safe local outbox.

## Validation

- Root R28 unit gate: 1 file, 6 tests passed.
- Root targeted R10/R11/R16/R28 unit gates: 4 files, 16 tests passed.
- R28 disposable PostgreSQL integration: 6 tests passed.
- Relevant R10/R11/R16 plus R28 disposable PostgreSQL integration: 4 files,
  14 tests passed.
- Prisma format, generate and validate: passed; fresh disposable chain applied
  55 forward-only migrations.
- Root TypeScript and lint: passed.
- Mobile TypeScript, lint and full tests: 19 files, 78 tests passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 43 static routes with the
  authority cockpit integrated into `/permissions`.
- Next.js Webpack build: passed; 109 routes including
  `/api/endvera/v1/mobile/authority-policies`.
- Spec Kit analyze: all 18 functional requirements are covered by T001–T020;
  exact evaluation-version exposure was added before closeout so decisions are
  fully inspectable and version-bound; zero critical or high inconsistencies
  remain.
- Constitution Check: closed registry, point-of-use authority, fail-closed
  defaults, integer minor units, immutable policy history, exact decisions,
  recursive role minimization and zero external effects all pass.
- `git diff --check`: passed with line-ending notices only.
- Root `package-lock.json`: unchanged; no dependency added.
- Static forbidden-path audit: no runtime fetch, provider SDK, OAuth token,
  credential, external dispatcher or true external-effect path exists in R28.

## Honest boundary

This is local code, shared mobile export and disposable-PostgreSQL proof only.
It does not demonstrate live provider enforcement, customer value, real
organizational policies, external execution, Verified-E2E coverage or
production readiness.
