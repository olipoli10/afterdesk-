# Tasks: ENDVERA Construction Operating Assistant R9 — Mobile Assistant

## Phase 1 — Contract and RED

- [ ] T001 Freeze R9 specification, plan, contracts and checklist.
- [ ] T002 Add strict request/history schemas and boundary tests.

## Phase 2 — Server Authority and Persistence

- [ ] T003 Allow authenticated portal identity only for the exact session actor while retaining verified identities for SMS/email/voice.
- [ ] T004 Add owner/office-manager R9 service with verified session, active membership and user-scoped history.
- [ ] T005 Add authenticated no-store GET/POST route and rate limiting.
- [ ] T006 Prove field-worker, cross-workspace, wrong-sender and history-isolation refusal.

## Phase 3 — Native Assistant

- [ ] T007 Add strict mobile assistant contracts, API methods and result matching.
- [ ] T008 Add stable attempt/retry state without optimistic completion.
- [ ] T009 Add the native Assistant tab, persisted history and explicit status labels.
- [ ] T010 Prove double-submit refusal, exact retry and external-transport false.

## Phase 4 — Gates and Closeout

- [ ] T011 Run Spec Kit analysis and resolve critical gaps.
- [ ] T012 Run targeted and disposable PostgreSQL R2/R8/R9 tests.
- [ ] T013 Run mobile test/typecheck/lint/Doctor/export and proportional root gates.
- [ ] T014 Confirm no migration, dependency, provider, transport, credential, deploy or sensitive offline cache.
- [ ] T015 Create coherent local commits and checkpoint the canonical Brain.

## Dependencies

Contract/RED precedes the authority change. Server authority precedes the native surface. Validation precedes closeout. No phase requires a founder GO or test.
