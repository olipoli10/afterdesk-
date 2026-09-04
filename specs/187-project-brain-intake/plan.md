# Implementation Plan: Project Brain Intake

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/187-project-brain-intake/spec.md`

## Summary

Add a local-only, project-bound intake packet that accepts several securely admitted files and one voice note, captures an explicit owner brief, generates a deterministic review, and seals an immutable owner-confirmed project-memory snapshot. Reuse the existing authentication, workspace authorization, file scanner, object storage, audit, mobile API and assistant foundations. The first vertical deliberately performs no transcription, OCR, vision, document interpretation, model call or external transport.

## Technical Context

**Language/Version**: TypeScript 5.x under the repository toolchain

**Primary Dependencies**: Next.js 16.2.12 App Router, React Native/Expo 57, Expo Router 57, Zod 4.4.3, Prisma Client 6.19.3; no new dependency

**Storage**: Explicit-root filesystem-only local object store for accepted bytes; PostgreSQL through Prisma for packet, source, snapshot and decision state. Identical bytes reuse one canonical `File`/object while each owner selection retains a separate source/provenance row and body-bound decision. The restrictive source-to-`File` relation, generic-sweep exclusion and 24-hour local crash reconciler protect referenced material. Provider-selected storage and scanning remain structurally unreachable in R36V.

**Testing**: Vitest unit/contract tests, real disposable PostgreSQL integration tests, mobile source/interaction tests, repository lint/typecheck/build gates

The integration config aliases only `@/lib/db` to `test/integration/db.ts`, where bounded `maxWait` and transaction timeout values accommodate the serialized Prisma Dev/PGlite proxy. Production keeps the unchanged Prisma client defaults in `src/lib/db.ts`; the concurrency assertions and application locking behavior are not weakened.

**Target Platform**: Existing Next.js server/API plus the shared Expo iOS/Android/Web client

**Project Type**: Mobile client + web API + PostgreSQL service

**Performance Goals**: A packet is bounded to 20 ordered metadata records and renders without pagination or truncation on one coherent screen; individual source uploads remain independently retryable; confirmation performs one bounded serialized transaction

**Constraints**: Local only; no provider, credential, customer data, external transport/write, push, Preview, Production or store action; no dependency or lockfile change; maximum 10 MiB per source; maximum 20 sources and one voice note per intake; streamed JSON commands capped at 64 KiB; M4A must contain a server-verified audio track no longer than 120 seconds and agree materially with the declared duration; all consequential claims fail closed

**Scale/Scope**: One additive vertical, four additive data entities, three authenticated API surfaces (command/projection, source admission and local source retrieval), one hidden mobile screen, one narrow deterministic assistant query path and targeted tests

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

src/lib/
├── construction-operating-assistant-r36c/contracts.ts
├── file-security.ts
├── file-security-local.ts
└── storage-local.ts

src/server/construction-operating-assistant-r36v/
├── project-brain-intake.ts
└── project-brain-query.ts

src/server/construction-operating-assistant-r36c/
└── orchestrator.ts

src/server/
└── sweeps.ts

src/app/api/endvera/v1/mobile/project-brain-intake/
├── route.ts
└── sources/
    ├── route.ts
    └── [sourceId]/route.ts

apps/mobile/src/
├── app/(app)/project-brain-intake.tsx
├── app/(app)/projects.tsx
├── app/(app)/_layout.tsx
├── lib/project-brain-intake.ts
├── lib/project-brain-intent-queue.ts
├── lib/project-brain-source-files.ts
├── lib/api.ts
├── lib/assistant.ts
├── lib/product-experience.ts
└── state/mobile-session.tsx

test/
├── construction-operating-assistant-r36v-project-brain-contracts.test.ts
├── construction-operating-assistant-r36v-project-brain-query.test.ts
├── construction-operating-assistant-r36v-project-brain-api.test.ts
├── construction-operating-assistant-r36v-project-brain-file-ownership.test.ts
├── construction-operating-assistant-r36v-project-brain-server-hardening.test.ts
├── construction-operating-assistant-r36v-local-storage-scan.test.ts
├── integration/construction-operating-assistant-r36v-project-brain-file-ownership.itest.ts
├── integration/construction-operating-assistant-r36v-project-brain.itest.ts
├── integration/r36v-project-brain-restart-probe.ts
├── integration/global-setup.ts
└── integration/per-file-setup.ts

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
- Implement serialized, advisory-locked create, brief, admission, submit, confirm, reject and projection services, including workspace-wide command locks and stable replay/refusal audits.
- Bind every source to `File` with restrictive retention, exclude those files from the generic orphan sweep, reuse one canonical file/object for identical bytes while retaining separate selections/decisions, and reconcile stale crash material after a 24-hour grace period.
- Reuse the fixed local scanner/storage boundary, validate real M4A audio-track duration server-side and compensate object writes when transaction outcome is known.

### Phase 2 — API and one-surface mobile experience

- Add authenticated no-store command/projection and multipart source routes, stream-cap command JSON at 64 KiB, and add an authorized local source download route that verifies hash/size/MIME and records access.
- Add a bounded, encrypted, chunked client queue that turns multi-select and every mutation into independently idempotent, restart-safe intents. Copy selected files to durable application storage before enqueue and reconcile them against the complete global queue so opening one project never deletes another project's pending source.
- Add one hidden project-brain route reached from Projects without adding a sixth primary tab.

### Phase 3 — Deterministic memory use and validation

- Add narrow assistant queries against only the latest confirmed snapshot.
- Prove restart equality, concurrency, replay, authorization, identical-byte canonical reuse, source retrieval/access logging, retention/sweep safety, crash recovery, real M4A validation, cross-project mobile recovery and zero-provider behavior in disposable PostgreSQL and mobile tests.
- Run targeted/full proportional gates and commit locally.

## Complexity Tracking

No constitution violation. Four new entities are justified because packet lifecycle, immutable sources, immutable snapshots and idempotent decisions have different retention and mutation rules; combining them would make historical meaning mutable or replay ambiguous.
