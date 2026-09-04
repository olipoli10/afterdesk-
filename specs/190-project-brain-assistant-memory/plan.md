# Implementation Plan: Project Brain Assistant Memory

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/190-project-brain-assistant-memory/spec.md`

## Summary

Extend the unified mobile assistant with a closed provider-free Project Brain recall registry over exactly the R36X project current pointer, selected by total order `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)` and revalidated before use. Persist body-bound recall receipts and complete relational citations. Prepare only existing evidence-request, SMS/MMS, voice-call and email actions as inspectable `PREPARED_UNSENT` artifacts with frozen recipient/channel/content and separate approval; perform no binary/provider/external effect.

## Technical Context

**Language/Version**: TypeScript 5.x under the repository toolchain

**Primary Dependencies**: Existing Next.js 16.2.12, Expo/React Native 57, Zod 4.4.3, Prisma Client 6.19.3 and existing prepared-action family modules; no new dependency

**Storage**: Existing PostgreSQL and prepared-action tables plus additive recall receipt, citation, action-binding and decision entities

**Testing**: Vitest contract/API/server/mobile, real disposable PostgreSQL replay/concurrency/restart/raw-SQL integration, existing-family regression and provider/binary sentinels

**Target Platform**: Existing Next.js API and unified Expo iOS/Android/Web assistant

**Project Type**: Mobile assistant + web API + PostgreSQL service

**Performance Goals**: One bounded deterministic projection from a single confirmed snapshot; one bounded action preparation transaction; stable output across restart

**Constraints**: Latest valid confirmed R36X only; synthetic/local; four existing prepared families; no provider/binary interpretation/approval/delivery/external effect/customer data/push/Preview/Production/dependency change

**Scale/Scope**: Eight recall intents, two strict assistant commands, four additive provenance entities and integration into one existing assistant surface

## Constitution Check

*GATE: PASS before Phase 0 and PASS after Phase 1 design.*

- **I**: PASS — assistant owns recall/preparation; existing approval owner remains explicit.
- **II**: PASS — eight questions and four action families form a closed registry.
- **III**: PASS — point-of-use tenant/role/contact checks and zero external spend/effect.
- **IV**: PASS — body-bound immutable receipts/bindings survive replay/restart.
- **V**: PASS — confirmed memory, citations, prepared actions, approval and delivery remain separate.
- **VI**: PASS — local synthetic evidence only; customer/economic value remains UNKNOWN.
- **VII**: PASS — reuses existing assistant/action contracts and adds provenance without rewriting them.
- **Stack practice**: PASS by design — additive migration and fresh PostgreSQL tests required.

## Project Structure

### Documentation

```text
specs/190-project-brain-assistant-memory/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analyze.md
├── checklists/requirements.md
├── contracts/project-brain-assistant-memory.md
└── tasks.md
```

### Planned source code

```text
prisma/schema.prisma
prisma/migrations/<forward-only-r36y-assistant-memory>/migration.sql
src/lib/construction-operating-assistant-r36y/project-brain-assistant-memory.ts
src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts
src/server/construction-operating-assistant-r36c/orchestrator.ts
src/app/api/endvera/v1/mobile/assistant/route.ts
src/app/api/endvera/v1/mobile/assistant/project-memory/route.ts
apps/mobile/src/lib/assistant.ts
apps/mobile/src/lib/api.ts
apps/mobile/src/lib/product-experience.ts
apps/mobile/src/state/mobile-session.tsx
apps/mobile/src/app/(app)/assistant.tsx
test/construction-operating-assistant-r36y-assistant-memory-contracts.test.ts
test/construction-operating-assistant-r36y-assistant-memory-api.test.ts
test/construction-operating-assistant-r36y-assistant-memory-server.test.ts
test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts
apps/mobile/test/project-brain-assistant-memory.test.ts
```

**Structure Decision**: Integrate with the existing unified assistant/orchestrator and family services; do not create a parallel chat or action executor.

## Delivery Phases

### Phase 0 — Contract and RED

- Freeze confirmed-only question registry, citation chain, four-family allowlist and false-effect results.
- Add RED for draft/candidate leakage, missing citations, stale memory, new family, implicit approval and provider/binary reach.

### Phase 1 — Additive provenance persistence

- Add four immutable entities and forward migration.
- Add reciprocal confirmed-memory/citation/contact/prepared-action guards and raw-SQL bypass tests.

### Phase 2 — Deterministic recall and preparation

- Implement confirmed-memory selection, canonical revalidation and eight deterministic projections.
- Implement four-family delegation with exact user content, citations, `PREPARED_UNSENT` and separate approval.
- Add body-bound replay/concurrency and read-side corruption refusal.

### Phase 3 — Unified mobile integration and validation

- Add project-context assistant rendering without identifier copying.
- Prove visible recipient/channel/body/citations, restart recovery, truthful limitations and cross-tenant refusal.
- Run upstream/family regressions, fresh PostgreSQL and proportional full gates.

## Complexity Tracking

No constitution violation. Separate receipt, citation, action-binding and decision records are needed to preserve exact provenance, existing family ownership and body-bound replay without duplicating action payloads.
