# Implementation Plan: R38A TextAssist foundation

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

## Summary

Promote ENDVERA's assistant-first mobile experience above the prior founder-test workflow. Add one honest setup surface and one typed server-side routing manifest that describe the dedicated SMS entry, progressive permissions, model lanes, connector readiness and approval boundary. Reuse the existing assistant, calendar, SMS/MMS, voice, prepared-action and human-support modules. Keep every external adapter disabled.

## Technical Context

**Language/Version**: TypeScript 5.x and 6.x mobile compiler

**Primary Dependencies**: Next.js 16.2.12 Route Handlers, React 19, Expo 57, React Native 0.86, Zod 4

**Storage**: Existing PostgreSQL/Prisma canonical state; no schema change in this slice

**Testing**: Vitest root and mobile suites, TypeScript, ESLint, provider-boundary validator

**Target Platform**: Next.js server plus the shared Expo iOS/Android/Web application

**Project Type**: Mobile application plus server API

**Performance Goals**: Setup manifest resolves without provider access or database mutation; local classification is deterministic

**Constraints**: No credential, provider call, external transport, OAuth, customer data, deployment or store action

**Scale/Scope**: One first vertical slice; five AI lanes, two entry channels and progressive protected-resource manifest

## Constitution Check

- PASS — closed-world typed lanes and fail-closed readiness.
- PASS — external READ and WRITE remain separate; external writes require preview and approval.
- PASS — secrets and model gateways stay server-only.
- PASS — no new persistence or migration silently changes historical meaning.
- PASS — synthetic/local evidence is labelled separately from observed evidence.
- PASS — existing modules are extended; no rewrite.

## Architecture

```text
Contractor
  ├─ ENDVERA mobile app chat
  └─ dedicated ENDVERA number (later provider webhook)
            ↓
verified inbound envelope + idempotency
            ↓
ENDVERA policy/router
  ├─ canonical operations → PostgreSQL + authorized calendar/contact ports
  ├─ web research → provider-neutral research lane
  ├─ document analysis → bounded document lane
  ├─ general reasoning → allowed model lane
  └─ exception → structured human support
            ↓
answer | clarification | prepared action | refusal | human handoff
            ↓
preview/approval → adapter execution → verification → audit
```

OpenRouter is an optional server-side model catalogue and provider router. It never owns identity, canonical state, permissions, tool authorization, cost ceilings or action approval.

## Project Structure

```text
src/lib/construction-operating-assistant-r38a/
└── text-assist-foundation.ts
src/app/api/endvera/v1/mobile/text-assist-foundation/
└── route.ts
test/
└── construction-operating-assistant-r38a.test.ts
apps/mobile/src/app/(app)/
└── text-assist.tsx
apps/mobile/src/lib/
└── text-assist-foundation.ts
apps/mobile/test/
└── text-assist-foundation.test.ts
specs/197-text-assist-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── GOAL.md
├── contracts/text-assist-foundation.json
├── checklists/requirements.md
└── tasks.md
```

**Structure Decision**: Add a narrow R39 contract and presentation slice to the existing server and shared Expo app. No new application, database or provider adapter is introduced.

## Delivery phases

1. Seal the product decision and platform constraints.
2. Add strict server and mobile contracts for the TextAssist foundation.
3. Add the one-screen mobile setup entry and navigation.
4. Validate contract refusal, bundle boundaries and mobile build quality.
5. Update the canonical Brain and roadmap without inflating provider or E2E readiness.

## Stop criteria

- Stop immediately if implementation would expose a secret, call a provider or request a real protected resource.
- Do not activate SMS, OpenRouter, OAuth or external writes in this release.
- The next live connector increment requires its own exact authority, credentials, cost ceiling and observed verification plan.
