# Implementation Plan: ENDVERA Construction Operating Assistant R8 — Mobile Foundation

**Branch**: `codex/endvera-construction-operating-assistant-r8-mobile-foundation` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

Add a standalone Expo application under `apps/mobile`, connect it to the existing Better Auth server through the official Expo integration, add authenticated workspace discovery, and render/submit only the versioned R7 cockpit and commands. The server remains canonical and all external transports remain disabled.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19.2.3, React Native 0.86 via Expo SDK 57

**Primary Dependencies**: Expo Router, Better Auth Expo 1.6.25, Expo SecureStore, Expo Network, Zod

**Storage**: Existing PostgreSQL on server; native SecureStore for session material only; in-memory cockpit state

**Testing**: Vitest for pure mobile contracts/config/state; repository Vitest for server bootstrap and auth regression; Expo Doctor and TypeScript checks

**Target Platform**: Android 7+ and iOS 16.4+ as defined by Expo SDK 57

**Project Type**: Mobile application plus existing Next.js API

**Performance Goals**: Show a usable loading state immediately; render a validated cockpit after one bootstrap and one cockpit request; avoid duplicate command dispatch from repeated taps

**Constraints**: local-only, no external providers/transports, no sensitive offline cockpit cache, no new database schema, no deployment/store build

**Scale/Scope**: one mobile package, one bootstrap route, four main screens, three existing R7 command types

## Constitution Check

- **I — Owned Outcomes**: PASS. Mobile exposes maintained projects/open loops/receivables rather than isolated chat output.
- **II — Closed-World Capability**: PASS. Only R7 schema-versioned commands are accepted; unsupported versions fail closed.
- **III — Authorization/Privacy**: PASS. Identity and role remain server-derived, session material uses secure storage, field-worker data is omitted server-side.
- **IV — Durable Hybrid Execution**: PASS. R8 does not add execution; command retries preserve idempotency material.
- **V — Verification/Evidence**: PASS. Server confirmation is distinct from client intent; no optimistic canonical completion.
- **VI — Economics**: PASS. No paid provider or external operation is introduced; value/price remain UNKNOWN.
- **VII — Incremental Evolution**: PASS. R8 extends R7 without rewrite, schema change, or new canonical store.

Post-design recheck: PASS. The official auth integration adds one justified dependency and does not weaken database-backed session revocation.

## Architecture

1. Better Auth continues to establish and revoke sessions in the existing server database.
2. The official Expo client stores Better Auth cookies/session cache in native SecureStore.
3. `GET /api/endvera/v1/mobile/bootstrap` derives active construction memberships for the authenticated client.
4. The app selects a returned workspace and requests the existing R7 cockpit.
5. Pure mobile decoders reject unsupported or malformed responses before React renders them.
6. Command builders create one attempt with stable request/idempotency material and submit it through the R7 endpoint.
7. The app refreshes the cockpit only after a canonical success/replay response.

## Project Structure

```text
apps/mobile/
├── src/app/
│   ├── _layout.tsx
│   ├── sign-in.tsx
│   └── (app)/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── projects.tsx
│       ├── receivables.tsx
│       └── actions.tsx
├── src/
│   ├── components/
│   ├── lib/
│   └── state/
└── test/

src/lib/construction-operating-assistant-r8/
└── mobile-contracts.ts

src/server/construction-operating-assistant-r8/
└── bootstrap.ts

src/app/api/endvera/v1/mobile/bootstrap/route.ts
test/construction-operating-assistant-r8-mobile-foundation.test.ts
```

**Structure Decision**: The native client is isolated from the Next.js package so mobile dependencies and builds do not alter the web runtime. The server adds only the discovery gap required before the existing R7 API can be used safely.

## Implementation Phases

1. Freeze bootstrap/mobile boundary contracts and RED tests.
2. Add official Expo support to Better Auth with bounded trusted origins.
3. Add authenticated active-workspace bootstrap.
4. Scaffold the Expo application and strict response decoders.
5. Build protected navigation, workspace selection, cockpit views, and bounded commands.
6. Add failure states, double-submit prevention, secure sign-out, and validation.
7. Run proportional root/mobile gates, commit, and checkpoint the Brain.

## Rollback

No migration is created. Revert the R8 commits to remove the app, bootstrap route, and Expo auth plugin. Existing R7 web behavior and PostgreSQL records retain their meaning.

## Complexity Tracking

No constitution violation requires an exception. The new mobile package is the requested product surface; the official Expo auth plugin reduces rather than adds custom security protocol complexity.
