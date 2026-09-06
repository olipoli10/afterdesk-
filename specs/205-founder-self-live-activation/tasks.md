# Tasks: Founder self live activation

## Phase 1 — Setup

- [x] T001 Create the accepted feature contract in specs/205-founder-self-live-activation/spec.md
- [x] T002 Create research, data model, contracts, quickstart and goal artifacts in specs/205-founder-self-live-activation/

## Phase 2 — Foundation

- [x] T003 Add physical-device internal distribution profiles in apps/mobile/eas.json
- [x] T004 Add contacts and calendar native dependencies and purpose strings in apps/mobile/package.json and apps/mobile/app.json
- [x] T005 Extend fail-closed external capability gates in src/lib/release/external-capabilities.ts and release/endvera-construction-v1/environment-contract-v3.json
- [x] T006 Add a value-free activation readiness manifest in release/endvera-construction-v1/founder-self-activation-readiness.json

## Phase 3 — User Story 1: Install and grant useful device access

- [x] T007 [US1] Implement disclosure-safe native permission helpers in apps/mobile/src/lib/device-access.ts
- [x] T008 [US1] Implement one activation centre in apps/mobile/src/app/(app)/device-access.tsx and link it from TextAssist
- [x] T009 [US1] Add native permission and build contract tests in apps/mobile/test/device-access.test.ts and apps/mobile/test/founder-activation.test.ts

## Phase 4 — User Story 2: Dedicated ENDVERA number

- [x] T010 [US2] Add SMS and voice gate tests in test/backend-activation-gate.test.ts
- [x] T011 [US2] Expose exact value-free number activation state in apps/mobile/src/lib/text-assist-foundation.ts

## Phase 5 — User Story 3: Authorized calendar and contacts

- [x] T012 [US3] Preserve native permission versus direct Google OAuth scope boundaries in the activation manifest and UI

## Phase 6 — Validation

- [x] T013 Run focused tests, mobile typecheck/lint and provider-boundary validation
- [x] T014 Record local evidence and create a useful local Git commit
- [x] T015 Correct the founder Android profile so the physical APK uses managed signing credentials
- [x] T016 Add a masked-token EAS launcher that links the project, checkpoints the public project id and starts one internal Android build

## Dependencies

T003-T006 establish the install and authority contract. T007-T009 complete the native app slice. T010-T012 complete the provider activation surface. T013-T014 close only the local route; signed build and live provider observation remain external dependencies.
