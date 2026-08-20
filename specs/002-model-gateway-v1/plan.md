# Implementation Plan: Model Gateway v1

**Branch**: `codex/model-gateway-v1` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-model-gateway-v1/spec.md`

## Summary

Introduce one server-side, policy-owned boundary for the classification canary. The boundary accepts an immutable operation request, resolves a published routing policy against certified route profiles, persists a pre-dispatch decision, reserves conservative spend, invokes one route adapter with hidden retries disabled, validates the result contract, and durably closes the attempt as settled, failed, refused or uncertain. Fallbacks are explicit new attempts. The existing durable `AiOperation`, lease/fence vocabulary and account-spend controls are extended rather than replaced. A direct-provider route and a gateway-mediated candidate must pass the same conformance contract, but no candidate is adopted by this feature.

## Technical Context

**Language/Version**: TypeScript 5 on the repository's supported Node.js server runtime

**Primary Dependencies**: Next.js 16.2.12 server application, React 19.2.4, Prisma 6.19.3, Zod 4.4.3, existing Anthropic SDK for the current direct classification path

**Storage**: PostgreSQL through the existing Prisma schema and additive migrations; protected content remains in the existing authorized storage path

**Testing**: Vitest 4.1.10 pure tests plus the existing disposable-PostgreSQL integration configuration

**Target Platform**: Linux server runtime on the existing application deployment platform; local Windows development and disposable PostgreSQL for integration evidence

**Project Type**: Existing full-stack web application with a server-only model execution boundary and admin-only operational controls

**Performance Goals**: Policy admission and evidence preparation add no more than 50 ms p95 locally excluding provider latency; no extra provider dispatch is introduced by replay, fallback evaluation or observability

**Constraints**: Classification only; off by default; no provider SDK retry; no silent substitution; all billable attempts reserve before dispatch; ambiguous dispatch remains economically uncertain; raw prompts/outputs stay out of ordinary logs; no new package unless a later candidate bake-off separately justifies it

**Scale/Scope**: One operation type, one logical-operation boundary, one direct-route adapter migrated from the current classification path, one gateway-candidate adapter used for conformance evidence, admin-only certification/breaker controls, and the focused data/audit structures required for those paths

## Constitution Check

*GATE: Passed before research and re-checked after design.*

| Constitution gate | Design response | Status |
| --- | --- | --- |
| Closed-world typed allowlists | Operation types, published policies, route profiles, adapters and fallback classes are closed and versioned | PASS |
| Truthful evidence labels | Quality, cost, coverage, reliability and commercial improvement remain `UNKNOWN`; candidate conformance is not adoption | PASS |
| Immutable accepted obligations | Gateway request derives from accepted facts and may not alter scope, criteria, classification or economics | PASS |
| External authorization | Only published policy and authorized operator controls can certify routes or breakers; model/request content cannot grant permission | PASS |
| Privacy and tenancy | Exact route profile, tenant binding, minimum projection and expiring privacy evidence are admission inputs | PASS |
| Financial integrity | Attempt reservation precedes dispatch; total logical-operation ceiling bounds primary plus fallback attempts; ambiguity retains exposure | PASS |
| Durable replay and fencing | Existing `AiOperation` lease/fence is retained; gateway binding and attempts add immutable decision lineage | PASS |
| Verification separated from provider success | Output-contract validation occurs after response and before result acceptance | PASS |
| Incremental architecture | Extend current operations/accounting and migrate classification only; no speculative rewrite of plan/critique or tool primitives | PASS |
| Real persistence proof | Additive migration and disposable-PostgreSQL integration tests cover decisions, holds, breakers, concurrency and immutability | PASS |
| Rollout and rollback | Classification policy off by default; hard disable before dispatch; in-flight attempts retain frozen identity | PASS |
| Vendor independence | Adapter contract and direct-path parity prevent a gateway candidate from becoming the sole trust boundary | PASS |

No constitution violation requires a complexity exception.

## Phase 0 Research Decisions

Research is recorded in [research.md](./research.md). The decisions are:

1. extend `AiOperation` instead of creating a competing logical-operation engine;
2. place policy and attempt orchestration outside adapters;
3. use immutable published policy/profile versions plus mutable, audited breaker state;
4. represent every fallback as a new attempt with a new decision and reservation;
5. preserve the existing explicit uncertain-spend doctrine;
6. use the current direct classification call as the first migration seam, with production rollout disabled until conformance passes;
7. require contract tests shared by synthetic, direct and gateway-mediated adapters;
8. keep Engineering Factory and model-quality selection outside this feature.

## Phase 1 Design

### Request flow

```text
classification caller
  -> reserve/claim existing AiOperation
  -> build immutable GatewayOperationRequest from authorized task facts
  -> resolve published policy + route profiles
  -> transaction: gateway binding + decision + account spend hold
  -> recheck breaker/certification immediately before dispatch
  -> invoke exactly one adapter attempt, with hidden retries disabled
  -> validate certified output contract
  -> transaction: attempt evidence + spend settlement/uncertainty + fenced AiOperation result/failure
  -> explicit next attempt only when frozen fallback policy permits it
```

### Persistence strategy

- `AiOperation` remains the logical replay/claim/fence authority.
- `ModelGatewayOperation` binds one `AiOperation` to immutable gateway admission facts and a published policy version.
- `ModelGatewayDecision` records one pre-dispatch route or refusal per attempt ordinal.
- `ModelGatewayAttempt` records dispatch knowledge, route evidence, result-contract disposition and cost evidence for every decided route.
- Existing `AccountProviderSpendHold` remains the account breaker ledger. It gains an optional gateway-attempt association and continues to use the real billing provider identity.
- Published policy/profile rows are immutable. Revocation and breaker changes are separate state plus append-only events; historical attempts retain their referenced versions.
- Raw request/output content is not stored in gateway audit tables. Only fingerprints and authorized protected-content references are retained.

### Policy and adapter boundaries

- A policy resolver receives facts, not clients. It cannot dispatch.
- A spend coordinator reserves, settles or retains uncertainty. It cannot choose a route.
- A route adapter receives one already-authorized attempt envelope and returns provider facts. It cannot fallback, retry, alter budget or choose another model.
- An output verifier validates the classification result contract. Provider HTTP success alone never produces an accepted result.
- A breaker service owns current route eligibility and append-only operator events.

### Production migration

1. Create schemas, typed registries and synthetic adapters with rollout disabled.
2. Wrap the existing direct classification call behind the adapter contract without changing its prompt, model, output validation or user-visible result.
3. Run shadow policy evaluation that performs no new external call and compare its proposed decision with the current direct path.
4. Run separate explicit conformance canaries for one direct route and one gateway-mediated candidate in a non-production evidence environment.
5. Enable the classification gateway only after all spec delivery conditions pass and an authorized release decision publishes the first policy.
6. Keep the hard-disable path able to stop new dispatch while in-flight attempts reconcile normally.

## Project Structure

### Documentation (this feature)

```text
specs/002-model-gateway-v1/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── README.md
│   ├── runtime-internal.md
│   ├── db-invariants.md
│   ├── audit-events.md
│   └── adapter-conformance.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma
└── migrations/

src/
├── lib/
│   └── ai-work-engine/
│       ├── classify.ts
│       ├── index.ts
│       └── provider-error.ts
└── server/
    ├── ai-operations.ts
    ├── account-spend.ts
    ├── model-gateway/
    │   ├── types.ts
    │   ├── registry.ts
    │   ├── policy.ts
    │   ├── operations.ts
    │   ├── dispatch.ts
    │   ├── privacy.ts
    │   ├── breakers.ts
    │   ├── evidence.ts
    │   └── adapters/
    │       ├── contract.ts
    │       ├── anthropic-direct.ts
    │       └── synthetic.ts
    └── actions/
        └── admin-model-gateway.ts

test/
├── model-gateway-*.test.ts
├── support/
│   └── model-gateway-conformance.ts
└── integration/
    ├── model-gateway-admission.itest.ts
    ├── model-gateway-spend.itest.ts
    ├── model-gateway-replay.itest.ts
    ├── model-gateway-breaker.itest.ts
    └── model-gateway-immutability.itest.ts
```

**Structure Decision**: Keep the feature inside the existing application and existing operation/accounting authorities. Add one cohesive `src/server/model-gateway` module tree rather than a new service, package or repository. The gateway boundary is server-only; only bounded admin actions cross into the existing UI layer.

## Post-Design Constitution Re-check

The data model, contracts and validation guide preserve every pre-research gate. In particular:

- the design adds no second logical-operation or spend-accounting system;
- published policy/profile immutability prevents retroactive meaning changes;
- adapter isolation prevents hidden retry and fallback;
- direct-path conformance is a release condition, not an optional future promise;
- ambiguous provider outcomes remain visible and economically reserved;
- raw content is excluded from ordinary audit rows;
- production remains off until explicit conformance and release evidence exist.

**Result**: PASS. No unresolved clarification and no complexity waiver.

## Complexity Tracking

No constitution violation to justify.
