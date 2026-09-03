# Implementation Plan: Project Brain Intake

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/187-project-brain-intake/spec.md`

## Summary

Add a local-only, project-bound intake packet that accepts several securely admitted files and one voice note, captures an explicit owner brief, generates a deterministic review, and seals an immutable owner-confirmed project-memory snapshot. Reuse the existing authentication, workspace authorization, file scanner, object storage, audit, mobile API and assistant foundations. The first vertical deliberately performs no transcription, OCR, vision, document interpretation, model call or external transport.

## Technical Context

**Language/Version**: TypeScript 5.x under the repository toolchain

**Primary Dependencies**: Next.js 16.2.12 App Router, React Native/Expo 57, Expo Router 57, Zod 4.4.3, Prisma Client 6.19.3; no new dependency

**Storage**: Existing object-storage abstraction for accepted bytes; PostgreSQL through Prisma for packet, source, snapshot and decision state

**Testing**: Vitest unit/contract tests, real disposable PostgreSQL integration tests, mobile source/interaction tests, repository lint/typecheck/build gates

**Target Platform**: Existing Next.js server/API plus the shared Expo iOS/Android/Web client

**Project Type**: Mobile client + web API + PostgreSQL service

**Performance Goals**: A packet with 20 metadata records loads as one coherent screen; individual source uploads remain independently retryable; confirmation performs one bounded serialized transaction

**Constraints**: Local only; no provider, credential, customer data, external transport/write, push, Preview, Production or store action; no dependency or lockfile change; maximum 10 MiB per source in this release; current safe voice duration remains unchanged; all consequential claims fail closed

**Scale/Scope**: One additive vertical, four additive data entities, two mobile API routes, one hidden mobile route, one narrow deterministic assistant query path and targeted tests

## Constitution Check

*GATE: PASS before Phase 0 and PASS after Phase 1 design.*

- **I. Owned outcomes**: PASS — packet lifecycle names the owner, review state, confirmation and exception behavior; no unowned external action exists.
- **II. Closed-world capability**: PASS — interpretation is explicitly absent; strict schemas refuse unknown fields and unsupported work.
- **III. Authorization/privacy/economics**: PASS — server rechecks membership, workspace, project and role; provider budget is zero; no credential or provider path exists.
- **IV. Durable hybrid execution**: PASS — commands are idempotent, state is persistent and retry/restart semantics are explicit.
- **V. Verification/evidence/delivery**: PASS — source presence, owner assertions and future interpretation are separate; a stored file is never described as understood.
- **VI. Evidence-led economics**: PASS — demand and unit economics remain UNKNOWN and synthetic validation is labelled accurately.
- **VII. Incremental evolution**: PASS — existing scanner, storage, workspace and audit primitives are extended; no rewrite or new dependency.
- **Stack practice**: PASS — additive forward migration, real disposable PostgreSQL tests, installed Next.js route-handler documentation consulted, and full merge gates retained.

## Project Structure

### Documentation (this feature)

```text
specs/187-project-brain-intake/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/project-brain-intake.md
└── tasks.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma
└── migrations/<forward-only-project-brain-intake>/migration.sql

src/lib/construction-operating-assistant-r36v/
└── project-brain-intake.ts

src/server/construction-operating-assistant-r36v/
├── project-brain-intake.ts
└── project-brain-query.ts

src/app/api/endvera/v1/mobile/project-brain-intake/
├── route.ts
└── sources/route.ts

apps/mobile/src/
├── app/(app)/project-brain-intake.tsx
├── app/(app)/projects.tsx
├── app/(app)/_layout.tsx
├── lib/project-brain-intake.ts
├── lib/api.ts
├── lib/product-experience.ts
└── state/mobile-session.tsx

test/
├── construction-operating-assistant-r36v-project-brain-contracts.test.ts
├── construction-operating-assistant-r36v-project-brain-query.test.ts
└── integration/construction-operating-assistant-r36v-project-brain.itest.ts

apps/mobile/test/
└── project-brain-intake.test.ts
```

**Structure Decision**: Preserve the existing versioned construction-assistant modules and mobile API conventions. Use `r36v` to represent the first new append-only release after the historical R36U closeout and before externally blocked R37.

## Delivery Phases

### Phase 0 — Contract and RED

- Freeze truthful local-only semantics, role matrix, state machine and deterministic snapshot rules.
- Add failing contract tests for strict schemas, limitations, canonical hashing, replay and cross-tenant refusal.

### Phase 1 — Persistence and transactional core

- Add four append-only/additive entities and one forward-only migration.
- Implement serialized, advisory-locked create, brief, admission, submit, confirm, reject and projection services.
- Reuse the scanner/storage boundary and compensate object writes when the transaction fails.

### Phase 2 — API and one-surface mobile experience

- Add authenticated no-store command/projection and multipart source routes.
- Add a client queue that turns multi-select into independently idempotent uploads.
- Add one hidden project-brain route reached from Projects without adding a sixth primary tab.

### Phase 3 — Deterministic memory use and validation

- Add narrow assistant queries against only the latest confirmed snapshot.
- Prove restart equality, concurrency, replay, authorization and zero-provider behavior in disposable PostgreSQL.
- Run targeted/full proportional gates and commit locally.

## Complexity Tracking

No constitution violation. Four new entities are justified because packet lifecycle, immutable sources, immutable snapshots and idempotent decisions have different retention and mutation rules; combining them would make historical meaning mutable or replay ambiguous.

