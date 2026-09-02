# R27 Accounting Connectors — closeout evidence

Recorded at: 2026-09-02T01:19:10-04:00

## Result

R27 implements provider-neutral, locally disabled accounting connectors for
future QuickBooks Online and Xero adapters. Accounts remain
`PREPARED_DISABLED`; observations are admitted only through the trusted local
boundary; exact invoice and reconciliation operations can be prepared and
approved, but provider state remains `APPROVED_UNPOSTED` with zero external
effect.

An approved reconciliation can apply exactly one authorized internal R21
`payment_received` event. It cannot post, pay, create or mutate anything in an
external accounting system. Invoice approval likewise remains unposted.

No provider, OAuth grant, credential, network request, customer data, remote
accounting read, external posting or external write was used.

## Persistence and policy proof

- Forward-only account, observation, draft, decision and immutable-refusal
  schema applied through the full disposable migration chain (54 migrations).
- Exact replay produces one canonical observation/effect; altered identity,
  ambiguity, cross-workspace access, stale versions and repeated approval are
  refused.
- Every authorized policy refusal is recorded immutably with operation kind,
  actor, input hash and refusal code, without persisting the rejected raw
  payload.
- Exact draft version, payload hash and the fully inspectable payload bind
  approval. Recipient/contact, dates, line items, taxes, evidence and source
  fingerprint are visible before approval.
- Concurrent observation admission cannot create a second canonical effect.
- State is identical after explicit Prisma disconnect/reconnect restart.
- Owner/admin projections expose authorized accounting state. The field
  projection exposes no accounting data or financial values.
- The shared mobile surface permits an explicit QuickBooks or Xero local
  preparation choice while keeping both providers disabled.

## Validation

- Root R27 unit gate: 1 file, 5 tests passed.
- Root targeted R21/R26/R27 unit gates: 3 files, 15 tests passed.
- R27 disposable PostgreSQL integration: 4 tests passed.
- Relevant R21 disposable PostgreSQL integration: 3 tests passed.
- Relevant R26 disposable PostgreSQL integration: 4 tests passed.
- The three PostgreSQL files passed separately on the same fresh 54-migration
  chain. A grouped multi-file run exposed a Prisma Dev pooled-proxy transaction
  session issue in the legacy R21 setup; the independent fresh-chain passes
  distinguish that environment artifact from a product regression.
- Prisma format and generate: passed; fresh disposable chain applied 54
  forward-only migrations.
- Root TypeScript and lint: passed.
- Mobile TypeScript, lint and full tests: 18 files, 74 tests passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 43 static routes including
  `/accounting`.
- Next.js Webpack production build: passed; 109 routes including
  `/api/endvera/v1/mobile/accounting`.
- Spec Kit analyze: all 18 functional requirements are covered by T001–T020;
  the initial exact-payload-inspection gap was corrected before closeout; zero
  critical or high inconsistencies remain.
- `git diff --check`: passed (line-ending notices only).
- Root `package-lock.json`: unchanged; no dependency added.
- Static forbidden-path audit: no provider endpoint, OAuth flow, access token,
  runtime fetch or true external-write path exists in the R27 implementation.

## Honest boundary

This is local code, mobile export and disposable-PostgreSQL proof only. It does
not demonstrate QuickBooks or Xero compatibility, OAuth, real accounting data,
external posting, customer value, Verified-E2E coverage or production
readiness.
