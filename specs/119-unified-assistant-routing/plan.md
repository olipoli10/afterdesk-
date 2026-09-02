# Implementation Plan: Unified Assistant Routing

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/119-unified-assistant-routing/spec.md`

## Summary

Wire the real mobile assistant endpoint through one server-only, channel-neutral R36C orchestrator. The orchestrator derives a trusted R36A request, projects only provider-neutral routing status, delegates certified internal work unchanged to the R9/R2 operational assistant, and durably records truthful non-executed responses for provider-required, clarification, refusal and human-support dispositions. No schema, dependency, provider or external effect is introduced.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 22

**Primary Dependencies**: Next.js 16 route handlers, Zod, Prisma 6, existing R36A routing brain, existing R9/R2 operational assistant, Expo/React Native shared mobile client

**Storage**: Existing PostgreSQL `ConstructionMessage` records; no schema change

**Testing**: Vitest unit/contract tests, existing mobile Vitest suite, real disposable PostgreSQL integration tests

**Target Platform**: Server-side Next.js API plus shared iOS/Android Expo client

**Project Type**: Web service and cross-platform mobile application

**Performance Goals**: One synchronous local routing decision per request with no additional network round trip; existing internal paths retain current latency class

**Constraints**: Zero provider dispatch, zero credential read, zero spend, zero external transport, no client-controlled safety fields, no provider/model disclosure, no schema or lockfile change

**Scale/Scope**: One existing assistant POST boundary, one server orchestrator, one client-visible routing projection, focused unit/mobile/PostgreSQL tests

## Constitution Check

*GATE: PASS before and after design.*

- **I — Owned outcomes**: PASS. Internal operational outcomes retain ownership; deferred intelligence receives an explicit non-executed state and next boundary.
- **II — Closed-world truth**: PASS. Only registered R36A dispositions route; absent provider authority cannot execute or claim a result.
- **III — Authorization/privacy/economics**: PASS. Point-of-use workspace membership remains server-side, classification can only become stricter, and executable provider spend is zero.
- **IV — Durable hybrid execution**: PASS. Existing idempotent internal paths remain; deferred exchanges are durable; no human work is silently created.
- **V — Verification/evidence/delivery**: PASS. A routing choice is not presented as completed research; persisted evidence separates request, response and effect.
- **VI — Evidence/economics**: PASS. Claims remain CODE/TEST/SYNTHETIC and no provider or market readiness metric changes.
- **VII — Incremental evolution**: PASS. This reuses R36A, R9/R2 and existing storage rather than adding a second assistant engine.
- **Installed Next.js guidance**: PASS. Installed route-handler and `route.ts` documentation was read on 2026-09-02; the existing `Request`/`NextResponse` pattern remains valid and POST is uncached.

## Project Structure

### Documentation

```text
specs/119-unified-assistant-routing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── assistant-routing-response.md
├── checklists/
│   └── requirements.md
├── evidence/
│   └── r36c-closeout.md
└── tasks.md
```

### Source Code

```text
src/lib/construction-operating-assistant-r36c/
└── contracts.ts

src/server/construction-operating-assistant-r36c/
├── orchestrator.ts
└── deferred-exchange.ts

src/app/api/endvera/v1/mobile/assistant/route.ts
apps/mobile/src/lib/assistant.ts
apps/mobile/src/app/(app)/assistant.tsx

test/construction-operating-assistant-r36c-unified-routing.test.ts
test/integration/construction-operating-assistant-r36c-unified-routing.itest.ts
apps/mobile/test/mobile-assistant-routing.test.ts
```

**Structure Decision**: Keep all policy and persistence on the server, expose a minimal Zod client contract, and make the orchestrator callable with any registered channel so later local SMS/email/voice adapters do not create another routing brain.

## Design

1. Parse the existing mobile request and authorize owner/admin membership.
2. Build a trusted R36A request using server constants: business-confidential, no-training, medium risk, zero executable cost and the canonical policy key.
3. Route once and map the decision to a minimal `routing` projection.
4. For `INTERNAL_TOOL`, call the unchanged R9/R2 service and merge the projection into the response.
5. For all non-internal dispositions, persist one inbound and one outbound `ConstructionMessage` atomically under workspace-scoped idempotency keys, with a deterministic truthful reply and no canonical effect.
6. Reuse the existing request identifier for replay detection; identical replay returns the first rows and mismatched content is refused.
7. Update the mobile result parser and screen notices without exposing provider identities.

## Rollback

Revert the single R36C commit. Because there is no migration or contract mutation of historical records, the R9 endpoint can resume direct delegation and existing R36C messages remain ordinary immutable conversation history.

## Complexity Tracking

No constitution violation or new dependency is introduced.
