# Implementation Plan: ENDVERA Construction Operating Assistant R9 — Mobile Assistant

**Branch**: `codex/endvera-construction-operating-assistant-r9-mobile-assistant` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

Add a strict authenticated mobile assistant endpoint that derives the portal actor, delegates to the existing deterministic Construction Operating Assistant core, and exposes user-scoped persisted history. Add one native Assistant tab with stable retries and explicit unsent/clarification states. PostgreSQL remains canonical and all external transports remain disabled.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16 repository runtime, React Native 0.86 through Expo SDK 57

**Dependencies**: Existing Better Auth, Prisma/PostgreSQL, Zod, Expo Router; no new dependency

**Storage**: Existing PostgreSQL on server; SecureStore for session only; in-memory mobile history

**Testing**: Vitest, disposable PostgreSQL integration, TypeScript, ESLint, Expo Doctor and local Expo export

**Constraints**: local-only, no schema change, no provider/transport, no field-worker assistant, no second chat engine, no deployment

## Constitution Check

- **I — Owned Outcomes**: PASS. The assistant updates/query maintained operational state rather than returning stateless prose.
- **II — Closed-World Capability**: PASS. Only the accepted deterministic intent set is available.
- **III — Authorization/Privacy**: PASS. Actor and role are server-derived; history is user-scoped.
- **IV — Durable Hybrid Execution**: PASS. Prepared messages remain unsent; retries preserve idempotency.
- **V — Verification/Evidence**: PASS. PostgreSQL is canonical and response states distinguish facts, clarifications and actions.
- **VI — Economics**: PASS. No paid or external operation is introduced.
- **VII — Incremental Evolution**: PASS. R9 wraps and reuses R2/R8 instead of replacing them.

## Architecture

1. Mobile sends a strict R9 command with workspace, UUID, text and timestamp.
2. The new API validates the current Better Auth session, verified client state and active owner/office-manager membership.
3. The server constructs the existing portal command envelope with `senderAddress=user:<session-user-id>`.
4. The existing R2 core interprets and atomically persists the request, decision, effect and assistant reply.
5. A user-scoped GET returns only persisted portal messages owned by that authenticated user.
6. Mobile validates the command ID and `externalTransportPerformed=false`, reloads canonical history, and provides exact retry after an unknown outcome.

## Project Structure

```text
src/lib/construction-operating-assistant-r9/mobile-assistant-contracts.ts
src/server/construction-operating-assistant-r9/mobile-assistant.ts
src/app/api/endvera/v1/mobile/assistant/route.ts
apps/mobile/src/lib/assistant.ts
apps/mobile/src/app/(app)/assistant.tsx
test/construction-operating-assistant-r9-mobile-assistant.test.ts
```

## Implementation Phases

1. Freeze strict R9 request/history contracts and RED boundary tests.
2. Add authenticated portal authority and regression coverage without weakening external-channel identities.
3. Add the owner/office-manager mobile command and user-scoped history service/route.
4. Add mobile decoders, stable attempt/retry state and native Assistant screen.
5. Run targeted, PostgreSQL, mobile and proportional repository gates.
6. Commit local changes and checkpoint factual Brain state.

## Rollback

No migration is created. Revert the R9 commits to remove the endpoint and mobile tab; R2/R8 state and contracts retain their prior meaning.

## Complexity Tracking

No constitution exception. The endpoint is intentionally thin and delegates to the existing persistent core.
