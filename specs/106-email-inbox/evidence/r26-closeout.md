# R26 Project Email Inbox — closeout evidence

Recorded at: 2026-09-02T04:34:30Z

## Result

R26 implements a provider-neutral, project-bound email inbox for future Google
Gmail and Microsoft Graph adapters. Accounts can only be prepared locally in a
disabled state. Inbound messages require a trusted normalized adapter assertion,
active workspace authority and exact opaque account identity. Exact outbound
email content can be prepared and approved, but remains `APPROVED_UNSENT` with
`externalTransport=false` and `deliveryCount=0`.

No provider, OAuth grant, credential, network request, mailbox read, remote
attachment fetch, customer data, email send or external write was used.

## Persistence and policy proof

- Forward-only R26 account, event, evidence-link, draft and immutable-decision
  schema applied through the full disposable migration chain (53 migrations).
- The first PostgreSQL proof exposed that `SYNC_REQUIRED` was missing from the
  migration status guard. The migration was corrected before closeout and the
  fresh chain plus R26 integration proof were rerun successfully.
- Exact replay produces one canonical event/effect; altered identity reuse,
  ambiguity, unauthorized input and cross-workspace evidence are refused.
- Cursor drift persists an auditable `SYNC_REQUIRED` state without guessing or
  applying project effects; local re-preparation and revocation are explicit.
- Exact draft version and payload hash bind approval. Concurrent or repeated
  approval cannot create a second approval effect or delivery.
- Owner/admin projections expose authorized project email details; the field
  projection recursively omits bodies, recipients, financial facts and evidence
  details.
- State is identical after an explicit Prisma disconnect/reconnect restart.

## Validation

- Root targeted R18/R24/R26 unit gates: 3 files, 15 tests passed.
- R26 disposable PostgreSQL integration: 4 tests passed.
- Relevant R18 disposable PostgreSQL integration: 4 tests passed.
- Relevant R24 disposable PostgreSQL integration: 4 tests passed.
- Combined R14 selected-evidence plus R26 integration: 5 tests passed.
- Prisma validate, format and generate: passed; fresh disposable chain applied
  53 forward-only migrations.
- Root TypeScript and lint: passed.
- Mobile TypeScript, lint and full tests: 17 files, 70 tests passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 41 static routes including
  `/email`.
- Next.js Webpack production build: passed; 109 routes including
  `/api/endvera/v1/mobile/email-inbox`.
- Spec Kit prerequisite and manual analyze: all 18 functional requirements are
  covered by T001–T019 with no critical inconsistency; continuation T020 remains
  pending until the local implementation commit and R27 transition.
- `git diff --check`: passed (line-ending notices only).
- Root `package-lock.json`: unchanged; no dependency added.
- Static forbidden-path audit: no provider endpoint, OAuth flow, provider send
  method or runtime fetch in the R26 implementation.

## Honest boundary

This is local code, mobile export and disposable-PostgreSQL proof only. It does
not demonstrate provider compatibility, real mailbox access, external delivery,
customer value, Verified-E2E coverage or production readiness.
