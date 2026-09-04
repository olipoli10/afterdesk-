# Implementation Plan: Project Brain Fact Candidates

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/188-project-brain-fact-candidates/spec.md`

## Summary

Add a local-only deterministic adapter registry that takes one exact confirmed R36V snapshot, copies six allowlisted owner-brief fields and seven allowlisted admitted-source metadata fields into immutable provenance-bound candidates, and exposes them only as unconfirmed inputs for future R36X review. Persist body-bound batches/candidates/decisions with additive PostgreSQL guards, validate provenance again on read, and prove zero binary read, provider, transport, external write or automatic confirmation.

## Technical Context

**Language/Version**: TypeScript 5.x under the repository toolchain

**Primary Dependencies**: Next.js 16.2.12 App Router, Zod 4.4.3, Prisma Client 6.19.3; no new dependency

**Storage**: Existing PostgreSQL plus additive immutable batch, candidate and decision entities; R36V source bytes and confirmed records remain unchanged

**Testing**: Vitest unit/contract/API tests, real disposable PostgreSQL integration/migration/raw-SQL/concurrency tests, provider and binary-read sentinels, lint/typecheck/build gates

**Target Platform**: Existing Next.js server/API; no new mobile review UI in this release

**Project Type**: Server/API + PostgreSQL service

**Performance Goals**: One bounded transaction over at most six owner fields and 20 sources × seven metadata fields; deterministic output independent of locale, clock and process restart

**Constraints**: Local deterministic exact-copy only; synthetic data only; no binary read, OCR, transcription, vision, document parsing, model/provider, credential, external transport/write, confirmation, customer data, push, Preview, Production or dependency/lockfile change

**Scale/Scope**: One strict command/projection route, one pure adapter module, one server service, three additive entities, one forward migration and targeted tests

## Constitution Check

*GATE: PASS before Phase 0 and PASS after Phase 1 design.*

- **I. Owned outcomes**: PASS — R36W owns deterministic candidate creation and names R36X as the later review/confirmation owner.
- **II. Closed-world capability**: PASS — two fixed adapter names, strict fields and fail-closed unknown behavior.
- **III. Authorization/privacy/economics**: PASS — point-of-use role/tenant checks, redacted audit and zero provider/external budget.
- **IV. Durable execution**: PASS — immutable body-bound batches, atomic effects and replay/concurrency convergence.
- **V. Verification/evidence/delivery**: PASS — exact copies are candidates, never confirmed facts or delivered actions.
- **VI. Evidence-led economics**: PASS — only synthetic/local evidence is claimed; demand and economics remain UNKNOWN.
- **VII. Incremental evolution**: PASS — additive entities extend R36V without changing its rows or meanings.
- **Stack practice**: PASS by design — schema work requires a forward migration and fresh real PostgreSQL tests; no `db push`.

## Project Structure

### Documentation (this feature)

```text
specs/188-project-brain-fact-candidates/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analyze.md
├── checklists/requirements.md
├── contracts/project-brain-fact-candidates.md
└── tasks.md
```

### Planned source code (repository root)

```text
prisma/
├── schema.prisma
└── migrations/<forward-only-r36w-fact-candidates>/migration.sql

src/lib/construction-operating-assistant-r36w/
└── project-brain-fact-candidates.ts

src/server/construction-operating-assistant-r36w/
└── project-brain-fact-candidates.ts

src/app/api/endvera/v1/mobile/project-brain-fact-candidates/
└── route.ts

test/
├── construction-operating-assistant-r36w-fact-candidates-contracts.test.ts
├── construction-operating-assistant-r36w-fact-candidates-api.test.ts
├── construction-operating-assistant-r36w-fact-candidates-server.test.ts
└── integration/construction-operating-assistant-r36w-fact-candidates.itest.ts
```

**Structure Decision**: Preserve the versioned construction-assistant module convention. Keep R36W server-only because R36X owns review UX and no mobile-specific behavior is required to prove deterministic candidate creation.

## Delivery Phases

### Phase 0 — Contract and RED

- Freeze strict adapter, candidate, provenance, confidence and result unions.
- Add non-vacuous RED tests for absent module/API, unknown adapters, semantic inference, binary-read/provider sentinels and automatic-confirmation refusal.

### Phase 1 — Additive persistence and DB backstops

- Add batch, candidate and decision entities through one forward-only migration.
- Add constraints and deferred guards for reciprocal tenant/input binding, confirmed-snapshot status, exact source metadata, valid text range/value, kind/confidence/provenance pairing, candidate-set completeness and append-only history.
- Add raw-SQL bypass tests before service implementation.

### Phase 2 — Pure adapters and transactional service

- Implement a fixed in-code adapter registry with stable field/source ordering and canonical fingerprints.
- Implement point-of-use authorization, exact confirmed-snapshot validation, serialized atomic generation, body-bound replay and read-side provenance revalidation.
- Do not import storage/scanner/provider modules; use sentinels to prove they remain unreachable.

### Phase 3 — Authenticated route and proportional validation

- Add one strict authenticated no-store command/read route using existing bounded JSON and rate-limit conventions.
- Run unit/API tests, fresh disposable PostgreSQL migration/integration/concurrency/restart tests, R36V targeted regressions, provider boundary, lint, typecheck, full proportional suite and Webpack build before closure because this release adds schema and authenticated API behavior.

## Complexity Tracking

No constitution violation. Separate batch/candidate/decision entities are justified by distinct idempotency, per-provenance integrity and audit-retention invariants; a mutable JSON field would make raw-SQL validation and historical reconstruction materially weaker.
