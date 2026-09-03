# Tasks: Provider Activation Controls R37B

## Phase 1 — RED and schema

- [ ] T001 [US1] Add strict grant and refusal RED tests in `test/construction-operating-assistant-r37b-provider-activation.test.ts`.
- [ ] T002 [US1] Add versioned Prisma models and forward migration in `prisma/schema.prisma` and `prisma/migrations/*_construction_assistant_r37b_provider_activation/`.
- [ ] T003 [US1] Add strict contracts in `src/lib/construction-operating-assistant-r37b/contracts.ts`.

## Phase 2 — Atomic economics

- [ ] T004 [US2] Add disposable PostgreSQL replay/concurrency RED tests in `test/integration/construction-operating-assistant-r37b-provider-activation.itest.ts`.
- [ ] T005 [US2] Implement atomic reserve/settle/release in `src/server/construction-operating-assistant-r37b/activation.ts`.

## Phase 3 — Revocation and closure

- [ ] T006 [US3] Add grant revocation and global kill-switch tests in `test/integration/construction-operating-assistant-r37b-provider-activation.itest.ts`.
- [ ] T007 [US3] Implement idempotent revocation and kill switch in `src/server/construction-operating-assistant-r37b/activation.ts`.
- [ ] T008 Add source guards proving zero credential/network/provider path in `test/construction-operating-assistant-r37b-provider-activation.test.ts`.
- [ ] T009 Run Spec Kit analysis, targeted/full proportional gates and `git diff --check`.
- [ ] T010 Commit locally and close R37B queue evidence without changing observed-readiness metrics.
