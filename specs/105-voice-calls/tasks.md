# Tasks: R25 Voice Calls and Voice Notes

## Phase 1 — Contract and RED

- [x] T001 Freeze R4/R18 reuse, disclosure, consent and proof-level contracts.
- [x] T002 Add strict call, voice-note, outbound-work and projection schemas.
- [x] T003 Add RED for replay drift, ambiguity, invented transcript and unsafe consent.

## Phase 2 — PostgreSQL call memory

- [x] T004 Add one forward-only call-session/transition/voice-note/work migration.
- [x] T005 Add trusted transcript admission and exact R18 routing.
- [x] T006 Add selected local voice-note admission without transcription inference.
- [x] T007 Add concurrency, restart, replay and tenant-isolation tests.

## Phase 3 — Prepared outbound work

- [x] T008 Add contact/purpose/disclosure policy evaluation.
- [x] T009 Prepare exact outbound call work or bounded R22 escalation without dialing.
- [x] T010 Add monotonic lifecycle and role-safe cockpit projections.

## Phase 4 — Shared iOS/Android voice surface

- [x] T011 Add `expo-audio` through the Expo-compatible installer and explicit permission config.
- [x] T012 Add bounded foreground recording and selected-file handoff.
- [x] T013 Add protected API, native parsing, restart-safe outbox and one Calls & voice surface.
- [x] T014 Add native permission, duration, restart, role and zero-transport tests.

## Phase 5 — Validation and continuation

- [x] T015 Run R25 and relevant R4/R18/R22 gates.
- [x] T016 Run fresh migration, full mobile/export, lint, typecheck, build, diff and lockfile review.
- [x] T017 Record R25 closeout, commit locally and advance automatically to R26.
