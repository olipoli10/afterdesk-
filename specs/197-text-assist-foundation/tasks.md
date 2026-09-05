# Tasks: R38A TextAssist foundation

## Phase 1 — Product decision and constraints

- [x] T001 Record R38 as abandoned without a fabricated human verdict in `specs/196-r38-founder-full-loop-preparation/evidence/campaign-abandoned.json`.
- [x] T002 [P] Document official platform and gateway constraints in `specs/197-text-assist-foundation/research.md`.
- [x] T003 Define the accepted spec, architecture, contract and goal in `specs/197-text-assist-foundation/`.

## Phase 2 — Typed foundation

- [x] T004 [US2] Implement the strict server manifest and deterministic request-lane classifier in `src/lib/construction-operating-assistant-r38a/text-assist-foundation.ts`.
- [x] T005 [US2] Expose the authenticated read-only manifest in `src/app/api/endvera/v1/mobile/text-assist-foundation/route.ts`.
- [x] T006 [P] [US2] Prove lane selection, provider refusal and write approval invariants in `test/construction-operating-assistant-r38a.test.ts`.

## Phase 3 — Assistant-first mobile entry

- [x] T007 [US1] Add the mobile presentation contract in `apps/mobile/src/lib/text-assist-foundation.ts`.
- [x] T008 [US1] Add the one-screen TextAssist setup in `apps/mobile/src/app/(app)/text-assist.tsx`.
- [x] T009 [US1] Add TextAssist setup to mobile navigation and onboarding in `apps/mobile/src/app/(app)/_layout.tsx`, `more.tsx` and `onboarding.tsx`.
- [x] T010 [P] [US3] Prove progressive permissions and absence of broad SMS/call-log access in `apps/mobile/test/text-assist-foundation.test.ts`.

## Phase 4 — Validation and governance

- [x] T011 Run focused root and mobile tests, typechecks, lint and provider-boundary validation.
- [x] T012 Update roadmap status without changing provider, customer or Verified-E2E metrics.
- [x] T013 Create the useful local product commit and prepare the exact HEAD/TREE evidence for the canonical Brain checkpoint.

## Dependencies

- T004-T006 depend on T001-T003.
- T007-T010 depend on the accepted manifest in T004.
- T011 depends on T004-T010.
- T012-T013 depend on successful proportional validation.
