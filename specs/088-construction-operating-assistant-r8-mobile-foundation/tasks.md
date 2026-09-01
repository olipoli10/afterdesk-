# Tasks: ENDVERA Construction Operating Assistant R8 — Mobile Foundation

**Input**: Design documents from `specs/088-construction-operating-assistant-r8-mobile-foundation/`

## Phase 1: Setup

- [x] T001 Create the isolated Expo package and local configuration in `apps/mobile/`
- [x] T002 Add the official Better Auth Expo server dependency and bounded mobile origin configuration in `src/lib/auth.ts`
- [x] T003 [P] Add mobile package lint, typecheck, test, and doctor scripts in `apps/mobile/package.json`

## Phase 2: Foundational

- [x] T004 Add strict bootstrap contracts in `src/lib/construction-operating-assistant-r8/mobile-contracts.ts`
- [x] T005 Add server-derived active-membership bootstrap in `src/server/construction-operating-assistant-r8/bootstrap.ts`
- [x] T006 Add the authenticated no-store bootstrap route in `src/app/api/endvera/v1/mobile/bootstrap/route.ts`
- [x] T007 Add RED and boundary tests in `test/construction-operating-assistant-r8-mobile-foundation.test.ts`

## Phase 3: User Story 1 — Secure mobile access

- [x] T008 [US1] Configure Better Auth Expo and SecureStore in `apps/mobile/src/lib/auth-client.ts`
- [x] T009 [US1] Implement protected navigation and sign-in/sign-out in `apps/mobile/src/app/`
- [x] T010 [US1] Implement strict API URL and session-cookie request handling in `apps/mobile/src/lib/api.ts`
- [x] T011 [US1] Test configuration and unauthenticated failure behavior in `apps/mobile/test/mobile-foundation.test.ts`

## Phase 4: User Story 2 — Role-shaped pocket cockpit

- [x] T012 [US2] Implement strict bootstrap/cockpit decoders in `apps/mobile/src/lib/contracts.ts`
- [x] T013 [US2] Implement session/workspace/cockpit state in `apps/mobile/src/state/mobile-session.tsx`
- [x] T014 [P] [US2] Implement Projects and Today views in `apps/mobile/src/app/(app)/`
- [x] T015 [P] [US2] Implement Receivables and Prepared Actions views in `apps/mobile/src/app/(app)/`
- [x] T016 [US2] Prove field-worker financial omission and explicit unavailable state in `apps/mobile/test/mobile-foundation.test.ts`

## Phase 5: User Story 3 — Bounded operational commands

- [x] T017 [US3] Implement stable command-attempt builders and retry state in `apps/mobile/src/lib/commands.ts`
- [x] T018 [US3] Add authorized receivable/payment/follow-up forms in `apps/mobile/src/components/`
- [x] T019 [US3] Integrate canonical refresh, replay, conflict, unknown-outcome, and double-submit handling in `apps/mobile/src/state/mobile-session.tsx`
- [x] T020 [US3] Test command envelopes, permission refusal, replay, and stable retry in `apps/mobile/test/mobile-foundation.test.ts`

## Phase 6: Polish and Gates

- [x] T021 Run Spec Kit analysis and resolve any critical coverage gap before implementation completion
- [x] T022 Run mobile tests, typecheck, Expo Doctor, and local export/bundle validation
- [x] T023 Run targeted R7/R8 tests plus proportional root lint/typecheck/regression gates
- [x] T024 Confirm no provider, transport, schema migration, production URL, credential, or sensitive offline cache was added
- [x] T025 Commit coherent local changes and checkpoint factual Brain state

## Dependencies and Execution Order

Setup precedes the server foundation. User Story 1 depends on the bootstrap/auth foundation. User Story 2 depends on User Story 1. User Story 3 depends on validated cockpit permissions from User Story 2. No task authorizes deployment, EAS, store distribution, or external transport.

## Independent Tests

- **US1**: establish/restart/revoke a synthetic local mobile session and verify protected routing.
- **US2**: render owner and field-worker fixtures and prove structural financial omission.
- **US3**: submit/retry strict synthetic command attempts and prove no optimistic or duplicate effect.

## Suggested MVP Scope

Phases 1–4 produce a secure read-only pocket cockpit. Phase 5 adds bounded writes using the already accepted R7 command contract.
