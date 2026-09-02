# Implementation Plan: Human Escalation and Exact Resume

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/102-human-escalation-resume/spec.md`

## Summary

Expose the existing Construction R5-to-HumanWorkUnit safe-resume bridge as a complete owner/office mobile operating surface. Reuse the mature Human Work Unit admission, worker claim, submission, independent review, acceptance, payout boundary, and resume engine. Add strict R22 projection and command contracts, a workspace-scoped mobile route, an owner cockpit, recovery visibility, and proportional regression evidence. Do not create another task engine, provider, payment path, worker portal, or database model unless implementation proves an actual missing invariant.

## Technical Context

**Language/Version**: TypeScript 5.8.3 on Node.js; React 19.1; installed Next.js 15.5.7 conventions; Expo SDK 54 / React Native 0.81

**Primary Dependencies**: Existing Prisma client, Zod, Next.js route handlers, Expo Router, existing Human Work Unit engine, Construction R5 escalation bridge, Construction R0 open-loop engine

**Storage**: Existing PostgreSQL models for ConstructionHumanEscalation and HumanWorkUnit lifecycle; no schema change planned

**Testing**: Vitest unit tests, real disposable PostgreSQL integration tests, existing Human Work Unit lifecycle/concurrency/replay/resume suites, mobile contract and component-state tests

**Target Platform**: Local server plus shared Expo application for iOS and Android; provider-disabled

**Project Type**: Existing Next.js web/API application plus shared React Native mobile application

**Performance Goals**: One owner command returns or refuses deterministically; 100% duplicate/concurrent requests converge; owner projection identifies state and next action in one fetch

**Constraints**: Zero providers, external transport, external writes, customer data, real payments, push, Preview, Production, deployment, or store action; no dependency or lockfile change; fail closed; reuse the existing engine

**Scale/Scope**: One bounded local release supporting current Construction missing-evidence escalations and the complete synthetic admission-to-resume lifecycle

## Constitution Check

*GATE: Passed before research and passed again after design.*

| Principle or mandatory rule | Design response | Status |
|---|---|---|
| I. Owned Outcomes | The human exception remains bound to the originating construction loop and a machine resume point. | PASS |
| II. Closed-World Capability | R22 accepts only the existing versioned missing-evidence purpose and strict command schemas. | PASS |
| III. Authorization, Privacy, Financial Integrity | Every read/mutation is workspace- and role-scoped; worker projection is minimal; activation retains the existing durable economic precondition. | PASS |
| IV. Durable Hybrid Execution | R22 reuses the first-class Human Work Unit state machine and exact resume record. | PASS |
| V. Verification and Delivery | Independent acceptance and clean evidence precede construction application; acceptance alone is not delivery. | PASS |
| VI. Evidence and Economics | Claims remain CODE/TEST/SYNTHETIC; client price and worker payout remain separate and frozen. | PASS |
| VII. Incremental Evolution | Existing R5 and Human Work Unit infrastructure are extended; no parallel engine or rewrite is introduced. | PASS |
| Real PostgreSQL for boundary behavior | Integration scenarios run against the campaign's disposable PostgreSQL instance. | PASS |
| Forward-only schema history | No schema change is planned. If a missing invariant forces one, it must be additive and separately justified before implementation. | PASS |
| No unresolved clarification | Research resolves all design decisions from current code and canonical constraints. | PASS |

## Phase 0: Research Decisions

See [research.md](research.md). The decisive result is that R5 already binds ConstructionOpenLoop to the mature Human Work Unit engine and already implements immutable contract creation, economic activation, worker-safe projection, independent review dependency, accepted-result application, replay safety, and crash recovery. R22 therefore builds the missing product/API/mobile control surface and targeted integration proof.

## Phase 1: Design

- [data-model.md](data-model.md) documents the existing entities and the R22 projection without redefining historical records.
- [contracts/human-escalation-api.md](contracts/human-escalation-api.md) freezes the mobile read and command boundary.
- [quickstart.md](quickstart.md) defines the local end-to-end proof and regression gates.

Post-design constitution check: PASS. The design adds no service, dependency, provider, payment mechanism, schema, or parallel human-task lifecycle.

## Project Structure

### Documentation

```text
specs/102-human-escalation-resume/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── human-escalation-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
src/
├── lib/construction-operating-assistant-r22/
│   └── contracts.ts
├── server/construction-operating-assistant-r22/
│   └── human-escalation-cockpit.ts
└── app/api/endvera/v1/mobile/human-escalations/
    └── route.ts

apps/mobile/
├── src/app/(app)/human-support.tsx
├── src/app/(app)/_layout.tsx
├── src/lib/human-escalations.ts
├── src/lib/api.ts
├── src/lib/outbox.ts
├── src/state/mobile-session.tsx
└── test/human-escalations.test.ts

test/
├── construction-operating-assistant-r22-human-escalation.test.ts
└── integration/construction-operating-assistant-r22-human-escalation.itest.ts
```

**Structure Decision**: Keep the existing server/mobile split. The R22 server module composes R5 and Human Work Unit queries; it does not own a second lifecycle. The mobile screen is an owner/office cockpit, while existing worker and admin surfaces retain claims, submissions, and independent review.

## Implementation Sequence

1. Freeze R22 strict read and command contracts, role-safe projection, state-to-next-action mapping, and error codes.
2. Write RED unit and real-PostgreSQL integration tests for owner projection, preparation, replay, concurrency, cross-workspace refusal, worker redaction, review, exact resume, restart recovery, and withdrawal.
3. Implement the R22 server composition over R5 and existing Human Work Unit state.
4. Add the protected mobile route with GET, prepare, withdraw, and explicit activation-refusal behavior under local no-payment authority.
5. Add persistent mobile API/outbox wiring and one Human Support cockpit that shows current state, next owner, next action, deadline, and transport/economic boundaries.
6. Run R22, R5, Human Work Unit, Construction R0, mobile, lint, typecheck, migration-history, and proportional build gates.
7. Record evidence, close R22, promote R23, and continue the rolling roadmap without an intermediate founder prompt.

## Complexity Tracking

No constitution violation or additional abstraction is accepted. R22 is an adapter and projection layer over existing canonical engines.
