# Implementation Plan: R38B virtual secretary action kernel

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

**Input**: Founder definition of ENDVERA as an operational virtual secretary.

## Summary

Extend the R38A assistant-first foundation with a closed-world seven-capability secretary catalog and a pure planner. Reads become ready only when their canonical source is available; project, calendar and communication writes become exact prepared actions. The mobile TextAssist surface explains these capabilities in plain language. All providers and external effects remain disabled.

## Technical Context

**Language/Version**: TypeScript 6, React 19, Next.js installed version, Expo 57

**Primary Dependencies**: Zod 4, existing authentication/rate-limit helpers, existing mobile UI system

**Storage**: No new persistence or migration; this release produces immutable local action plans

**Testing**: Vitest root and mobile suites, TypeScript, ESLint, provider-boundary gate

**Target Platform**: Node.js Next API plus Expo iOS/Android/Web presentation

**Project Type**: Mobile application with authenticated Web API

**Performance Goals**: Pure action planning completes within one event-loop turn; no provider latency

**Constraints**: Zero provider/transport/OAuth/customer data; broadcasts limited to ten unique resolved contacts; every write prepared only

**Scale/Scope**: Seven capabilities, six outcomes, four connector classes and one mobile capability surface

## Constitution Check

- PASS — capability catalog is typed, versioned and closed-world.
- PASS — actor/workspace are checked before planning.
- PASS — reads and writes are separate; every write is prepared, approval-bound and idempotent.
- PASS — provider absence fails closed and cannot be presented as connected.
- PASS — no storage or migration semantics change.
- PASS — tests cover boundary, ambiguity, recipient limits, replay inputs and zero external effects.

Post-design recheck: PASS. The contract derives capability requirements and preview fields from the same schemas used by the planner. No constitutional exception is required.

## Project Structure

### Documentation

```text
specs/198-virtual-secretary-actions/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── GOAL.md
├── tasks.md
├── checklists/requirements.md
└── contracts/virtual-secretary-actions.json
```

### Source Code

```text
src/lib/construction-operating-assistant-r38b/
└── virtual-secretary-actions.ts

src/app/api/endvera/v1/mobile/virtual-secretary-actions/
└── route.ts

apps/mobile/src/lib/
└── virtual-secretary-actions.ts

apps/mobile/src/app/(app)/
└── text-assist.tsx

test/
└── construction-operating-assistant-r38b.test.ts

apps/mobile/test/
└── virtual-secretary-actions.test.ts
```

**Structure Decision**: Add one pure shared server contract and planner, one authenticated read/plan endpoint and one mobile presentation contract. Reuse existing assistant, calendar, messaging, voice, project and permission routes rather than creating parallel execution systems.

## Complexity Tracking

No constitutional violation or new provider dependency.
