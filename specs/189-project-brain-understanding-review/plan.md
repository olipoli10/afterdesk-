# Implementation Plan: Project Brain Understanding Review

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/189-project-brain-understanding-review/spec.md`

## Summary

Add one tenant-safe mobile review surface and server boundary over exact R36V sources and R36W candidates. Owners explicitly disposition candidates, declare and resolve immutable contradictions under one SELECT/REJECT_ALL/OWNER_RESOLUTION preparation matrix (including multi-group agreement), preview a complete canonical snapshot, and confirm only its exact current fingerprint with a unique project-monotone sequence/current pointer. Persist append-only decisions and snapshots with PostgreSQL backstops; perform zero provider work, binary interpretation, external effect or automatic resolution.

## Technical Context

**Language/Version**: TypeScript 5.x under the repository toolchain

**Primary Dependencies**: Next.js 16.2.12 App Router, React Native/Expo 57, Expo Router 57, Zod 4.4.3, Prisma Client 6.19.3; no new dependency

**Storage**: Existing PostgreSQL plus additive review, disposition, contradiction, membership, resolution, snapshot and decision entities

**Testing**: Vitest contract/API/server/mobile tests, real disposable PostgreSQL migration/raw-SQL/concurrency/restart tests, provider/binary/external-effect sentinels, lint/typecheck/build gates

**Target Platform**: Existing Next.js API and shared Expo iOS/Android/Web client

**Project Type**: Mobile client + web API + PostgreSQL service

**Performance Goals**: One coherent bounded review of at most the R36W candidate/source limits; deterministic preparation and confirmation in one serialized transaction each

**Constraints**: Synthetic/local only; no provider, binary read/interpretation, automatic resolution/confirmation, credential, external transport/write, customer data, push, Preview, Production, store action or dependency/lockfile change

**Scale/Scope**: One hidden mobile review screen, one strict API route, one server/domain module, seven additive entities and targeted tests

## Constitution Check

*GATE: PASS before Phase 0 and PASS after Phase 1 design.*

- **I. Owned outcomes**: PASS — R36X owns explicit review through exact sealing; R36Y separately owns assistant recall.
- **II. Closed-world capability**: PASS — explicit disposition/resolution modes, strict state machine and no implicit semantic behavior.
- **III. Authorization/privacy/economics**: PASS — tenant/role checks at use, redacted audit and zero external/provider cost.
- **IV. Durable execution**: PASS — versioned append-only decisions, atomic transitions and replay convergence.
- **V. Verification/evidence/delivery**: PASS — sources, candidates, contradictions, decisions and confirmed snapshot stay distinct.
- **VI. Evidence-led economics**: PASS — synthetic local evidence only; market and economics remain UNKNOWN.
- **VII. Incremental evolution**: PASS — additive review layer leaves R36V/R36W semantics unchanged.
- **Stack practice**: PASS by design — forward migration, real PostgreSQL and installed framework conventions required.

## Project Structure

### Documentation (this feature)

```text
specs/189-project-brain-understanding-review/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analyze.md
├── checklists/requirements.md
├── contracts/project-brain-understanding-review.md
└── tasks.md
```

### Planned source code

```text
prisma/
├── schema.prisma
└── migrations/<forward-only-r36x-understanding-review>/migration.sql

src/lib/construction-operating-assistant-r36x/
└── project-brain-understanding-review.ts

src/server/construction-operating-assistant-r36x/
└── project-brain-understanding-review.ts

src/app/api/endvera/v1/mobile/project-brain-understanding-review/
└── route.ts

apps/mobile/src/
├── app/(app)/project-brain-understanding-review.tsx
├── app/(app)/projects.tsx
├── app/(app)/_layout.tsx
├── lib/project-brain-understanding-review.ts
├── lib/api.ts
├── lib/product-experience.ts
└── state/mobile-session.tsx

test/
├── construction-operating-assistant-r36x-understanding-contracts.test.ts
├── construction-operating-assistant-r36x-understanding-api.test.ts
├── construction-operating-assistant-r36x-understanding-server.test.ts
└── integration/construction-operating-assistant-r36x-understanding.itest.ts

apps/mobile/test/
└── project-brain-understanding-review.test.ts
```

**Structure Decision**: Extend the versioned project-brain modules and hidden project-route convention. Keep all authority/completeness/hash logic server-side; mobile renders and submits explicit choices only.

## Delivery Phases

### Phase 0 — Contract and RED

- Freeze lifecycle, role matrix, disposition/resolution modes, canonical snapshot and false-effect flags.
- Add RED for missing review module/surface, contradiction erasure, implicit resolution, partial confirmation and cross-tenant disclosure.

### Phase 1 — Additive persistence and DB integrity

- Add seven append-only entities through one forward-only migration.
- Back reciprocal upstream bindings, complete disposition/resolution coverage, immutable contradiction membership, exclusive resolution payloads, transition/snapshot reciprocity and canonical hashes with constraints/deferred guards.
- Prove raw-SQL bypass and truncate/update/delete refusal in fresh PostgreSQL.

### Phase 2 — Transactional review service and API

- Implement strict canonical builders and point-of-use authorization.
- Serialize create/disposition/contradiction/resolution/prepare/confirm operations with body-bound replay and redacted audit.
- Revalidate provenance/completeness/hash on read; fail closed on corruption.

### Phase 3 — One mobile surface and proportional validation

- Add one project-linked mobile surface displaying all sources/candidates/provenance/contradictions and only explicit owner controls.
- Prove no technical ID copying, restart equality, concurrency/replay, cross-tenant refusal and zero provider/binary/external effect.
- Run fresh migrations, targeted/full proportional gates and local closeout only.

## Complexity Tracking

No constitution violation. Separate entities are necessary because candidate decisions, immutable contradiction membership, append-only resolutions and exact snapshots have different integrity/retention rules; collapsing them would permit history overwrite or incomplete sealing.
