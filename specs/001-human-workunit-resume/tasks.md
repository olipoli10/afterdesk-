# Tasks: HumanWorkUnit and Safe Resume v1

**Input**: Design documents from `/specs/001-human-workunit-resume/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required — user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md), `.specify/memory/constitution.md` v1.0.0

**Branch**: `feat/human-workunit-resume` | **Date**: 2026-08-14

**Tests**: **MANDATORY**, not optional. This change touches a security boundary, a money path and a run contract; the constitution forbids merging it on unit tests alone (plan.md § Test matrix). Within **every** phase, each test task appears **before** the implementation task it constrains, and the test must be observed failing first.

**Organization**: Phase 1 setup → Phase 2 foundational (pure decisions, settings, schema, migrations) → Phases 3–7 one per user story in priority order → Phase 8 surfaces (UI, last by design) → Phase 9 polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: `[US1]`–`[US5]`, present on user-story phases only. Setup, Foundational, Surfaces and Polish tasks carry no story label and name their requirement in the description instead
- Every task names exact repository paths and the requirement / scenario it proves

## Path Conventions

Single Next.js project, unchanged (plan.md § Project Structure). Pure decision modules in `src/lib/**`, server-only side effects in `src/server/**`, surfaces in `src/app/**` and `src/components/**`, schema in `prisma/**`, pure specs in `test/*.test.ts`, real-PostgreSQL specs in `test/integration/*.itest.ts`.

---

## Non-negotiable constraints carried from the plan

These bind every task below. A task that appears to require breaking one is wrong and must be re-read.

| # | Constraint | Source |
|---|---|---|
| C1 | **`BLOCK-NEXT-DOCS`** — no file under `src/app/**` and no new server action may be written before T001 and T002 are complete and the guide paths are recorded in [§ Implementation Notes](#implementation-notes--installed-nextjs-16-guides). Do not guess a Next.js API | research R-01, quickstart §0 |
| C2 | **No `prisma db push`, ever.** Two migrations, enums first, then schema/triggers | db-invariants §4.1–4.2, research R-11 |
| C3 | **`OBLIG-TRUNCATE`** — every table given a `BEFORE TRUNCATE` guard is registered in `TRUNCATE_GUARDED_TABLES` (`test/integration/per-file-setup.ts:55-59`) **in the same task that adds the trigger** | db-invariants §4.5, research R-12 |
| C4 | **Fencing rule, corrected**: the initial `NULL → worker` claim increments `claimGeneration` **exactly once**, in `bindClaimToHumanUnit`. `afterdesk_human_unit_fence_on_claim_change` fires only when `OLD."claimedById" IS NOT NULL AND OLD."claimedById" IS DISTINCT FROM NEW."claimedById"`. No double bump | plan A4, data-model `INV-S3`, db-invariants `INV-14` |
| C5 | **`resumed`, `exhausted`, `withdrawn` are terminal** and never reopen (`INV-S5`/`INV-16`). `paused` is admin-owned and non-terminal | plan § State transition table |
| C6 | **`revision_requested → submitted`** is a legal resubmission by the same claimant at the current generation | plan § State transition table |
| C7 | **`transitionSeq` is allocated monotonically** by incrementing `HumanWorkUnitRunState.transitionSeq` inside the same CAS/trigger that writes the transition row. `MAX(seq)+1` is forbidden | data-model `INV-T1` |
| C8 | **One admitted residual package, at most**, inserted only by `publishAdmittedResidualScope` after a downstream failure; its payout-reference fields use the **frozen accepted** `Task.vaPayoutCents`; it never writes `Task.vaPayoutCents` or `Task.estimatedMinutes` and never opens a second claim | research R-07, FR-045, FR-057 |
| C9 | **`Task.claimedById` remains the sole worker assignment; `Task.vaPayoutCents` remains authoritative.** No orchestrator, no child task, no second payee, no per-unit payout | FR-011, FR-033, spec § Out of Scope |
| C10 | **The rollout flag is read in exactly one place** — `compileWorkflowForTask`, at admission. Never in publish, claim, submit, decide, accept or resume | research R-10 / D9, FR-064, FR-065 |

---

## Phase 1: Setup & Environment Gate

**Purpose**: clear the two recorded blockers before any code is written. T001 and T002 block everything.

- [X] T001 Install the exact locked dependency tree with `npm ci` at the repository root (uses the committed `package-lock.json`; `postinstall` runs `prisma generate` + `patch-package` per `package.json`). Do not run `npm install`, do not add, upgrade or remove a dependency, do not edit `package.json` or `package-lock.json`. **Blocks every later task.** Clears the prerequisite of `BLOCK-NEXT-DOCS` (quickstart §0, research R-01)
- [X] T002 Read the installed Next.js 16 guides under `node_modules/next/dist/docs/` — server actions, route handlers, caching & revalidation (`revalidatePath`), and `after()` — including every deprecation notice, then record the **exact guide file paths and the verified API shapes** in the [§ Implementation Notes](#implementation-notes--installed-nextjs-16-guides) section of this file. If a guide contradicts a shape in `specs/001-human-workunit-resume/contracts/server-actions.md` or `contracts/runtime-internal.md`, the guide wins: record the contradiction here and amend the contract in T074. **Blocks every `src/app/**` and every server-action task (T044, T045, T063, T067–T070).** Depends on T001 (research R-01, `BLOCK-NEXT-DOCS`)
- [X] T003 [P] Capture the pre-change green baseline by running `npm run lint`, `npm run typecheck` and `npm run test:run` at the repository root, and record any pre-existing failure in [§ Implementation Notes](#implementation-notes--installed-nextjs-16-guides) so a later red is attributable to this feature and not inherited. No source file is modified by this task
- [X] T004 [P] Bring up a **disposable** PostgreSQL for the integration suite (`npx prisma dev --name integration`, its own port — never the app's), confirm the six-condition guard in `test/integration/guard.ts` accepts it and that `test/integration/global-setup.ts`'s physical-isolation probe passes, then record the `AFTERDESK_TEST_DATABASE_URL` shape (with `ALLOW_INTEGRATION_DB_RESET=1`) in [§ Implementation Notes](#implementation-notes--installed-nextjs-16-guides). Never point it at a production or shared database (quickstart §1)

**Checkpoint**: dependencies installed, Next.js 16 guide paths recorded, baseline known, disposable integration database proven disposable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pure decision core, the settings keys, and the database schema with every invariant. Ordered exactly as the plan requires — pure admission/state/schema decisions first, then database schema and invariants.

**⚠️ CRITICAL**: no user story work may begin until this phase is complete. Tests precede their implementation task throughout.

### Pure decision cores — tests first

- [X] T005 [P] Write the failing pure spec `test/human-unit-admission.test.ts`: exactly one human step admits; zero and two-or-more human steps → `unsupported_topology`; a step that is neither ancestor nor descendant of the cut (parallel branch) → `unsupported_topology`; a dependency cycle → `malformed_topology`; a dependency on a nonexistent `order` → `malformed_topology`; ancestor/descendant closure over transitive `dependsOnOrder`; the verdict is identical across repeated evaluation and across shuffled input order; the function never throws on an unparseable shape. Proves FR-003, FR-005, SC-013; contracts/runtime-internal.md §1
- [X] T006 [P] Write the failing pure spec `test/human-unit-economics.test.ts`: `cut.fixedMinutes` null or `<= 0` → `unmapped_economics`; `vaPayoutCents` absent or `<= 0` → `unmapped_economics`; `estimatedMinutes` absent or `<= 0` → `unmapped_economics`; all four booleans satisfied → admitted; and an assertion that varying `expectedMinutes` / the three PERT columns **never** changes the verdict. Proves FR-035, FR-058, research R-05
- [X] T007 [P] Write the failing pure spec `test/human-unit-state.test.ts` covering the whole transition table in plan.md § State transition table: every legal pair permitted; every illegal pair refused; `revision_requested → submitted` permitted for the same claimant at the current generation (C6); `resumed` / `exhausted` / `withdrawn` never transition out (C5); every non-terminal state yields **exactly one** safe next action matching contracts/projections.md §4; and the `cause` vocabulary is the **closed** set in contracts/audit-events.md §1 with no additional or counterfactual name. Proves FR-046, FR-052, SC-011, FR-049
- [X] T008 [P] Write the failing pure spec `test/human-unit-result-schema.test.ts`: `compileFrozenOutputSchema` returns `null` (a refusal) for an uncompilable frozen schema and never an empty permissive schema; `validateCandidate` returns `missing` naming each absent required field and each absent required artifact kind; a passing validation is never treated by any caller as an acceptance signal. Proves FR-017, readiness CHK040; contracts/runtime-internal.md §3
- [X] T009 [P] Write the failing pure spec `test/worker-eligibility.test.ts` asserting the extracted predicate set matches, field for field, the eligibility predicates `claimTask` applies today in `src/server/actions/va-tasks.ts:37-159` — approved-VA status, category certification when enabled, tier/score/rated-count gate, prior-rejection exclusion, WIP cap. Proves FR-009, plan A4
- [X] T010 Implement `src/lib/ai-work-engine/human-unit-admission.ts` — `AdmissionStep`, `AdmissionEconomics`, `AdmissionVerdict`, `admitHumanCut`. Pure: no `server-only` import, no database, no clock, no randomness, no network; cycle-safe with an explicit in-progress set at least as defensive as `src/lib/ai-work-engine/topology.ts:75-112`. Makes T005 and T006 pass. Proves FR-003, FR-005, FR-035
- [X] T011 [P] Implement `src/lib/ai-work-engine/human-unit-definition.ts` — `freezeHumanUnitDefinition`, every result field derived from an accepted-contract column or a frozen setting, with **no parameter** through which an operator-authored instruction, input, output, artifact or acceptance obligation can enter. Proves FR-002, FR-035, readiness CHK020; contracts/runtime-internal.md §2
- [X] T012 [P] Implement `src/lib/ai-work-engine/human-unit-result-schema.ts` — `compileFrozenOutputSchema`, `validateCandidate`. Makes T008 pass. Proves FR-017
- [X] T013 [P] Implement `src/lib/human-unit-state.ts` — the state table, the allowed-transition predicate, the terminal set, the safe-next-action map, and the closed `cause` vocabulary. Makes T007 pass. Proves FR-046, FR-052, SC-011
- [X] T014 Implement `src/lib/worker-eligibility.ts` by extracting the eligibility predicates **verbatim** out of `claimTask` in `src/server/actions/va-tasks.ts:37-159`, and change `claimTask` to call them so claim-path behaviour is byte-identical. Makes T009 pass; existing claim tests must stay green. Proves FR-009, plan A4

### Settings — test first

- [X] T015 Extend `test/settings.test.ts`: `humanWorkUnitResumeEnabled` defaults to `false`; `humanWorkUnitRevisionBound` defaults to `2`; `humanWorkUnitPublicationDeadlineHours`, `humanWorkUnitSubmissionDeadlineHours` and `humanWorkUnitClaimLeaseHours` each default to `72` and are independent of expected minutes; a malformed database override falls back to the reviewed defaults. Proves FR-058, FR-064
- [X] T016 Add those five keys to **all three** of `Settings`, `SettingsSchema` and `DEFAULT_SETTINGS` in `src/lib/settings.ts` — `getSettings` overlays a database row only for keys already present in `DEFAULT_SETTINGS` (`settings.ts:260-265`), so omitting any one silently discards its override (`OBLIG-SETTINGS`). Makes T015 pass. Proves FR-058, FR-064

### Database schema and invariants — test first

> **T011/option-B rider**: `second_shift_accepted_plan_step_guard` is row-level and names no column, so the two new plan-step columns inherit accepted-plan immutability the moment they exist — no new trigger. T017 must still carry a case proving a direct `UPDATE` of `humanOutputSchema` / `humanRequiredArtifactKinds` on an accepted plan is refused, because inheritance that is not pinned is inheritance that can be silently lost. Until that case passes on the disposable database, the protection is PROVEN BY CODE, not PROVEN BY TEST, and must not be described as DB-enforced.

- [X] T017 Write the failing real-PostgreSQL spec `test/integration/human-unit-schema-invariants.itest.ts` with **one case per row** of contracts/db-invariants.md §1 (`INV-1`…`INV-17`) and §2 (`CHK-1`…`CHK-6`), each asserting the **database** rejects the violation: second unit per run; second unit per accepted contract; second resume per run; second acceptance per unit; second decision per candidate; generation decrement; audit `UPDATE`/`DELETE`/`TRUNCATE`; decision and resume-record `UPDATE`/`DELETE`; definition mutation; candidate mutation beyond a one-way status change; two pending candidates; `vaPayoutCents` change on an admitted task; unit claimant diverging from `Task.claimedById`; fencing on a prior non-null claimant change **and no bump on the initial `NULL → worker` assignment** (C4); `WorkflowBudgetHold` insert while the unit waits; a terminal state reopening (C5); decider equal to submitter; and `@@unique([unitStateId, seq])` with `transitionSeq` allocated monotonically in the same statement (C7). Proves db-invariants §5, SC-006, SC-004, SC-005, SC-009
- [X] T018 Add to `prisma/schema.prisma`: the nine models of data-model.md §4–§11 (`HumanWorkUnitDefinition`, `HumanWorkUnitRunState`, `HumanWorkUnitCandidate`, `HumanWorkUnitCandidateFile`, `HumanWorkUnitReviewDecision`, `HumanWorkUnitAcceptance`, `HumanWorkUnitResumeRecord`, `HumanWorkUnitTransition`, `HumanWorkUnitAlert`), the six new enum types of §3, the two new values on `TaskWorkflowRunStatus` and `TaskWorkflowStepStatus` from §2, and the relations of §12 on `Task`, `TaskWorkflowRun`, `TaskAcceptanceSnapshot`, `TaskExecutionPlanVersion`, `TaskExecutionPlanStep`, `File` and `User`. No existing column is dropped, renamed, re-typed or given a new meaning. **No `prisma db push`** (C2). Proves FR-001, FR-002, FR-048, FR-063.
  **Plus the T011 founder decision (option B, 2026-08-15)**: two additive nullable columns on the EXISTING `TaskExecutionPlanStep` — `humanOutputSchema Json?` and `humanRequiredArtifactKinds String[]`. Human-specific names, because the frozen artifacts name `outputSchema`/`requiredArtifactKinds` only on `HumanWorkUnitDefinition`, never on the plan step. Never derived from `params`: that field configures a machine capability, and a human obligation needs its own column or nobody can later say what the client accepted. Never backfilled. Already written to `prisma/schema.prisma`; the DDL is T020
- [X] T019 Create `prisma/migrations/20260814<hhmmss>_human_work_unit_enums/migration.sql` containing **only** enum work: `ALTER TYPE "TaskWorkflowRunStatus" ADD VALUE IF NOT EXISTS 'awaiting_human_unit';`, `ALTER TYPE "TaskWorkflowStepStatus" ADD VALUE IF NOT EXISTS 'blocked_on_human_unit';` and `CREATE TYPE` for the six new enums. `IF NOT EXISTS` is mandatory so a replayed deploy or a `migrate resolve` does not fail, following `prisma/migrations/20260806170000_workflow_enum_values/migration.sql`. Must sort **before** T020's directory name. Proves db-invariants §4.1, research R-11
- [X] T020 Create `prisma/migrations/20260814<hhmmss>_human_work_unit/migration.sql` — beginning with the two additive `ALTER TABLE "TaskExecutionPlanStep" ADD COLUMN` statements from the T011 decision (nullable `humanOutputSchema` jsonb, `humanRequiredArtifactKinds` text[] defaulting to empty; **no backfill of existing rows**) — then the tables, indexes (`@@index([state])`, `([state, publicationDeadlineAt])`, `([state, submissionDeadlineAt])`, `([claimedById])`), unique constraints, the `WHERE "status" = 'pending'` partial unique index, the check constraints `CHK-1`…`CHK-4`, and **every trigger** in contracts/db-invariants.md §1 as a **new function with a new name** (`afterdesk_*`), never a `CREATE OR REPLACE` of an existing guard. Trigger bodies use `$$` quoting and built-in PostgreSQL functions only. The fencing trigger carries the `OLD."claimedById" IS NOT NULL AND OLD."claimedById" IS DISTINCT FROM NEW."claimedById"` guard verbatim (C4) and allocates `seq` by incrementing `transitionSeq` in the same statement (C7). **In this same task**, register every table given a `BEFORE TRUNCATE` guard — `HumanWorkUnitAcceptance` and `HumanWorkUnitTransition` — as `{ table, trigger }` entries in `TRUNCATE_GUARDED_TABLES` in `test/integration/per-file-setup.ts:55-59`, or the whole integration suite breaks on the next file (C3). Proves db-invariants §1–§4, `OBLIG-TRUNCATE`
- [X] T021 Apply the migration chain to the disposable database from T004 and make every case in `test/integration/human-unit-schema-invariants.itest.ts` pass, via `AFTERDESK_TEST_DATABASE_URL=... ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration`. Fix the migration, never the assertion, when a case fails. Proves db-invariants §5
- [X] T022 Extend `test/data-isolation.test.ts` to the nine new tables (`HumanWorkUnitDefinition`, `HumanWorkUnitRunState`, `HumanWorkUnitCandidate`, `HumanWorkUnitCandidateFile`, `HumanWorkUnitReviewDecision`, `HumanWorkUnitAcceptance`, `HumanWorkUnitResumeRecord`, `HumanWorkUnitTransition`, `HumanWorkUnitAlert`) so each is covered by the existing isolation pinning. Proves FR-008, SC-014

**Checkpoint**: pure verdicts, settings and the full database contract exist and are proven by a real PostgreSQL instance. User story work may begin.

---

## Phase 3: User Story 1 — A mandate resumes machine work after one human judgment (Priority: P1) 🎯 MVP

**Goal**: an accepted mandate in the supported shape executes *machine → human → machine* — the pre-cut block runs, descendants are blocked rather than demoted, the unit publishes through the existing pool at the accepted fixed payout, the claim is the task's sole assignment, acceptance resumes the run exactly once, and the run finishes without touching the payout.

**Independent Test**: run the quickstart §2 Scenario A mandate end to end with `humanWorkUnitResumeEnabled = true`. Because the admin review gate is User Story 2, this phase's integration spec seeds the `HumanWorkUnitAcceptance` row directly through the fixture layer and calls `applyResume`, which is exactly the durable resume intent the acceptance transaction will later write — so US1 is testable and demonstrable on its own. Assert: pre-cut steps `done`; descendants `blocked_on_human_unit` and not `handed_to_human`; run `awaiting_human_unit`; unit `published`; task `open` with `claimedById = null` and `vaPayoutCents` unchanged from the accepted quote; no `TaskHumanWorkPackage`; claim establishes both assignments in one act at `claimGeneration = 1`; resume makes each eligible downstream step `pending` exactly once; each executes once within the frozen ceiling; `finishAdmittedRun` marks the run `done` with the task still `claimed` by the same worker.

### Tests for User Story 1 ⚠️ write first, observe failing

- [X] T023 [P] [US1] Extend `test/workflow-compile.test.ts`: with `humanCut` **absent**, `compileDecisions` output is byte-identical to today (the existing assertions stay green); with `humanCut` **present**, a descendant of the cut whose *only* demotion reason is the pure `depends_on_human` cascade compiles `executionMode: "automated"` and is flagged for `blocked_on_human_unit`, while every other refusal — no registered primitive, moved primitive version, invalid frozen params, forbidden reach, non-executable mode, mandate-level sensitive/access gate, prior budget demotion — still demotes and keeps **its own reason verbatim**. Proves FR-024, FR-025, FR-038; contracts/runtime-internal.md §4
- [ ] T024 [P] [US1] **PARTIAL — publication half written and green; steps 5-11 need the T035+ runtime** Write `test/integration/human-unit-lifecycle.itest.ts` for quickstart §2 Scenario A, steps 1–11 in order, ending with an **accepted-contract diff before and after**: scope, client price, plan version, capability versions, budget ceiling, payout totals, data classification and stored artifact bytes must compare identical, field for field and byte for byte. Assert each eligible downstream step executed **exactly once**. Proves SC-001, SC-008, FR-039; User Story 1 scenarios 1–4
- [ ] T025 [US1] Extend `test/integration/human-unit-lifecycle.itest.ts` with quickstart §3 Scenario B, partial resume: a downstream step that is not machine-runnable on its own merits — no registered primitive, a moved primitive version, or a prior budget demotion — is **not** resumed, its own reason is preserved and reported unchanged, its id appears in `skippedStepRunIds`, it is never labelled a human dependency, and a budget-demoted step is still reported as a budget decision. Same file as T024, so not parallel. Proves FR-024, FR-025, FR-038; User Story 1 scenario 5
- [ ] T026 [P] [US1] Write `test/integration/human-unit-zero-spend.itest.ts`: across `published`, `claimed`, `submitted`, `in_review` and `revision_requested`, assert **zero** `WorkflowBudgetHold` rows for the run, **zero** `AccountProviderSpendHold` rows whose `operationKey` names the run's snapshot id, **zero** `TaskToolInvocation` rows attributable to the run, and that no provider client is constructed. Include the database-level assertion that `afterdesk_human_unit_no_spend_while_waiting` rejects a hand-inserted `WorkflowBudgetHold`. Proves SC-006, FR-031, `INV-15`, research R-08
- [ ] T027 [P] [US1] Write `test/integration/human-unit-payout.itest.ts`: the payout shown pre-claim (`vaPoolSelect`) equals the payout at claim equals the payout at completion, with zero drift; the residual payout computation is never entered on an admitted run; `finishAdmittedRun` writes neither `vaPayoutCents` nor `estimatedMinutes` and creates no `TaskHumanWorkPackage` on the happy path; exactly one `Payout` row exists, to exactly one payee. Proves SC-003, SC-004, FR-033, FR-034, FR-057
- [ ] T028 [US1] Extend `test/integration/human-unit-payout.itest.ts` with the **residual bypass after downstream failure**: when a resumed downstream step fails permanently, `publishAdmittedResidualScope` inserts **at most one** existing `TaskHumanWorkPackage` for the **same** claimant, whose payout-reference fields equal the frozen accepted `Task.vaPayoutCents`; `Task.vaPayoutCents` and `Task.estimatedMinutes` are unchanged; no second claim and no second payee is created; a replayed call loses the existing `runId`/`taskId` unique keys and changes nothing; and if the claimant is no longer eligible the run pauses for an admin **before** publication instead. Same file as T027, so not parallel. Proves FR-045, FR-057, C8, research R-07, readiness CHK030/CHK031
- [ ] T029 [P] [US1] Write `test/integration/human-unit-replay.itest.ts` covering the **resume half** of quickstart §6: a crash injected between acceptance and resume converges, through `recoverPendingHumanUnitResumes`, on **exactly one** `HumanWorkUnitResumeRecord`; `applyResume` invoked concurrently from `after()` and from the recovery sweep yields one resume record, one set of `pending` steps and one audit row; a full double, concurrent replay of the maintenance path yields zero duplicate resumes and zero duplicate downstream executions. Proves FR-026, FR-027, FR-029, SC-005

### Implementation for User Story 1

- [X] T030 [US1] Add the optional `humanCut?: { order: number }` gate to `compileDecisions` in `src/lib/ai-work-engine/compile.ts`: when present, convert **only** the pure `depends_on_human` cascade on descendants of the cut into an `automated` step flagged `blocked_on_human_unit`; apply every other refusal reason first and preserve it verbatim; leave the mandate-level short-circuit at `compile.ts:124-148` untouched. When absent, behaviour is byte-identical to today. Makes T023 pass. Proves FR-024, FR-025, FR-038
- [X] T031 [US1] Extend the frozen plan-row select at `src/server/workflow-runs.ts:262-286` with the columns admission and the definition freeze need: `fixedMinutes`, `secondsPerUnit`, the three PERT minute columns, `title`, `description`, `verificationMethod`, `acceptanceCriteria`, `riskLevel`, `humanRole`. Read-only change. Proves FR-035, FR-002
- [X] T032 [US1] In `compileWorkflowForTask` (`src/server/workflow-runs.ts:288-356`) implement transaction **T1**: read `humanWorkUnitResumeEnabled` **here and nowhere else** (C10); call `admitHumanCut`; on an `admitted` verdict freeze the definition via `freezeHumanUnitDefinition`, insert `HumanWorkUnitDefinition` and `HumanWorkUnitRunState` (`runId`/`taskId`/`snapshotId` unique), persist the blocked descendants with `status: "blocked_on_human_unit"`, make the run eligible for `awaiting_human_unit`, and write the `admitted` transition audit row with `seq` from `transitionSeq` (C7). The not-admitted recording is T050. Proves FR-003, FR-004, FR-005, FR-006, FR-064; plan T1
- [X] T033 [US1] Implement `publishHumanWorkUnit(runId)` in the new `src/server/human-unit.ts` (`import "server-only"`) as transaction **T2**: pre-transaction refusals for `input_unavailable` (a producing step failed permanently, or an accepted snapshot file no longer resolves or no longer matches its frozen hash) and `classification_conflict` (the unit's reach exceeds the most restrictive class among `declaredInputs`), each pausing the run with its own cause and publishing nothing; pool audience resolved **outside** the transaction per `workflow-runs.ts:1663-1670`; inside: CAS unit `admitted → published` stamping `publishedAt`/`publicationDeadlineAt`, `transitionTask({ tx, from: "ai_processing", to: "open", action: "human_unit_published" })` with **no** `vaPayoutCents` or `estimatedMinutes` write, `writePoolNotifications`, the publication `HumanWorkUnitAlert` row, and the transition audit. Proves FR-007, FR-034, plan A3/T2
- [X] T034 [US1] Wire the runtime in `src/server/workflow-runs.ts`: at the drain tail (`:1436-1442`) call `publishHumanWorkUnit` when the next incomplete step of an admitted run is the cut, and `finishAdmittedRun` when all its steps are done; widen the `advanceWorkflow` lifecycle guard (`:833`) so an admitted run is **not** abandoned while its task is `open` or `claimed`, while still abandoning on `cancelled`/`expired` and terminal states. Proves FR-007, FR-028, FR-042, FR-057
- [X] T035 [US1] Implement `bindClaimToHumanUnit(tx, { taskId, workerId })` in `src/server/human-unit.ts` and call it inside the **existing** `claimTask` transaction in `src/server/actions/va-tasks.ts:37-159`, after its `transitionTask({ from: "open", to: "claimed", guard: { claimedById: null } })` succeeds (transaction **T3**): CAS unit `published | revision_requested → claimed`, set `claimedById`, increment `claimGeneration` **exactly once** for the initial `NULL → worker` assignment (C4), stamp `claimLeaseExpiresAt` and `submissionDeadlineAt` from the frozen durations, and audit with `assignmentEstablished: true | false`. Keep the existing advisory-locked WIP cap and use the T014 predicates. `Task.claimedById` stays the sole assignment (C9). Proves FR-011, FR-012, FR-013, FR-048
- [ ] T036 [US1] Implement `src/server/human-unit-resume.ts` (`import "server-only"`) — `applyResume(unitStateId)` as transaction **T10**: CAS unit `accepted → resumed` **and** `resumeGeneration` `n → n+1`; insert `HumanWorkUnitResumeRecord` with `runId` and `acceptanceId` unique (this constraint **is** the exactly-once guarantee); `updateMany` the run's `blocked_on_human_unit` steps to `pending`, excluding any step not machine-runnable on its own merits and recording it in `skippedStepRunIds` with its own reason preserved; CAS the run `awaiting_human_unit → running`; insert the transition audit. Refuse and change nothing when the run has left the executing lifecycle, when the run is in an admin-owned pause, or when the resume generation is stale. Add `recoverPendingHumanUnitResumes()` — per-item isolated, finds `accepted` units with no resume record, calls `applyResume`. Makes T029 pass. Proves FR-024–FR-029, SC-005
- [ ] T037 [US1] **PARTIAL — the minimal function exists from T034 (mark done, stamp finishedAt, audit, nothing else); T037 still owns the finishRun defensive guard and making T027 pass** Implement `finishAdmittedRun(runId)` in `src/server/workflow-runs.ts` as transaction **T13**: mark the run `done`, stamp `finishedAt`, write the audit — **and nothing else**. No residual computation, no `vaPayoutCents`/`estimatedMinutes` write, no `TaskHumanWorkPackage`, no task transition; the task stays `claimed` by the same worker who delivers through the existing `submitDeliverable → submitted_for_qc → approveDeliverable` path. Add a defensive guard to `finishRun` (`:1525`) refusing to run for an admitted run. Makes T027 pass. Proves FR-057, SC-003, SC-004
- [ ] T038 [US1] Implement `publishAdmittedResidualScope(runId)` in `src/server/workflow-runs.ts` as transaction **T14**: CAS a `running | awaiting_human_unit` run whose unit is terminal `resumed | exhausted`, re-check the **same** claimant against the identical T014 eligibility predicates, insert the one existing `TaskHumanWorkPackage` with payout-reference fields taken from the **frozen accepted** `Task.vaPayoutCents`, move only the run to the existing `awaiting_human` with `finishedAt`, and audit. Never write `Task.vaPayoutCents` or `Task.estimatedMinutes`, never transition the task, never open a second claim; pause for an admin instead when the claimant is no longer eligible (C8). Makes T028 pass. Proves FR-045, FR-057, research R-07

**Checkpoint**: *machine → human → machine* runs end to end with a seeded acceptance, at the accepted fixed payout, with zero provider spend while waiting and exactly one resume. This is the MVP.

---

## Phase 4: User Story 2 — An admin accepts or rejects a candidate result, with a bounded number of revisions (Priority: P1)

**Goal**: submission is a candidate, never an authority. An authorized admin who is not the submitter accepts — the only event that can resume machine work — or rejects within a frozen bound, and the exhausted bound fails closed into existing manual residual handling.

**Independent Test**: quickstart §4 Scenario C — submit, verify no downstream step can start and no hold exists; reject, verify the unit returns to workable for the **same** claimant with `remainingRevisions` decremented by exactly one and the previous candidate retained; resubmit from `revision_requested` (C6); accept, verify exactly one `HumanWorkUnitAcceptance` and exactly one resume. Plus: self-review refused **and recorded**, a second decision refused as a duplicate with the first standing unmodified, and a schema-invalid or artifact-missing submission refused with a naming message while the worker keeps the task and the unit.

### Tests for User Story 2 ⚠️ write first, observe failing

- [ ] T039 [P] [US2] Write `test/integration/human-unit-review.itest.ts` for quickstart §4 Scenario C in full: submit → no downstream step runnable and zero provider spend, reservation or hold for it; reject with instructions inside the bound → `revision_requested`, `remainingRevisions - 1` exactly, previous candidate retained as evidence, no machine step resumed; resubmit → `submitted` (C6); accept → exactly one acceptance, unit `accepted`, exactly one resume; reject **at** the bound or as `unsafe_or_unverifiable` → unit `exhausted`, handed to the existing manual residual handling with that cause and zero downstream budget; the submitting worker attempting to review or accept their own candidate is refused **and recorded** as `refused:self_review`; a second decision on the same candidate is refused as `duplicate` and the first stands unmodified; a payload failing the frozen output schema, or missing a required declared artifact, is refused naming what is missing while task and unit stay with the worker. *(Recorded addition: plan.md's test matrix left Scenario C to the lifecycle spec; it is given its own file here so User Story 2 is independently runnable — see [§ Deviations](#deviations-from-the-plans-test-matrix).)* Proves FR-016–FR-023, User Story 2 scenarios 1–6
- [ ] T040 [US2] Extend `test/integration/human-unit-replay.itest.ts` with the **candidate half** of quickstart §6: a crash injected immediately **before** candidate commit leaves no candidate, no state change and no audit row, so the same request is safe to retry; a crash immediately **after** commit leaves **exactly one** candidate, one state change and one matching audit row, with no partial state observable; a duplicate submission against an already-submitted claim generation loses `@@unique([unitStateId, claimGeneration, revisionIndex])`, is reported as `duplicate`, creates no second candidate and reopens no concluded review. Same file as T029, so not parallel. Proves FR-018, SC-015, `INV-C1`, `INV-11`

### Implementation for User Story 2

- [ ] T041 [US2] Implement the submit runtime in `src/server/human-unit.ts` as transaction **T5**: load the unit bound to `taskId` **and** `claimedById = actor` **and** `state IN ('claimed','revision_requested')` **and** `claimGeneration = :g`; re-evaluate the frozen `definition.eligibility` criteria against **live** worker facts via `src/lib/worker-eligibility.ts`; compile the frozen `outputSchema` and `safeParse` the payload, refusing `schema_invalid` naming the missing field or artifact **without** taking task or unit away (FR-017); attach `fileIds` with the same `updateMany` ownership guard `submitDeliverable` uses (`va-tasks.ts:392-406`); insert the candidate at `(unitStateId, claimGeneration, revisionIndex)`; CAS unit → `submitted`; insert the transition audit with `seq` from `transitionSeq` (C7). **Candidate, transition and audit are one atomic outcome.** Makes T040 pass. Proves FR-016, FR-017, FR-018, SC-015
- [ ] T042 [US2] Implement the decide runtime in `src/server/human-unit.ts` as transactions **T6/T7/T8/T9**: `openHumanUnitReview` CAS `submitted → in_review` + audit (optional — a decision is legal from either state); `decideHumanUnitCandidate` refusing and **recording** `refused:self_review` when the actor is the candidate's `submittedById` (FR-019, backed by `INV-R2`), inserting `HumanWorkUnitReviewDecision` with `candidateId` unique so a second decision loses the constraint and the first stands unmodified (FR-020), then branching — **accept**: insert the single `HumanWorkUnitAcceptance` (`unitStateId`/`candidateId`/`decisionId` unique) copying the payload and stamping `resultSha256`, mark the candidate `accepted`, CAS unit → `accepted`, audit; **reject with revisions remaining**: candidate `superseded`, CAS unit → `revision_requested` with `remainingRevisions - 1` exactly, audit, notify the claimant; **reject at the bound or unsafe/unverifiable**: candidate `rejected`, CAS unit → `exhausted`, audit, admin alert, hand to the existing manual residual handling. The acceptance row **is** the durable resume intent; `remainingRevisions` is never raised for a live run (FR-022). Makes T039 pass. Proves FR-019–FR-023, FR-040, FR-041
- [ ] T043 [US2] Implement `withdrawHumanUnit(tx, { taskId, cause, actorId })` in `src/server/human-unit.ts` as transaction **T12** and call it from the existing cancellation / lifecycle-exit paths inside their transaction: CAS unit → `withdrawn` with `withdrawn:lifecycle_exit`, audit, refuse every subsequent claim, submission and review, guarantee no downstream step becomes runnable, and leave already-durable candidates untouched as immutable evidence. Proves FR-042, FR-041
- [ ] T044 [US2] Create `src/server/actions/human-unit-worker.ts` (`"use server"`) with `submitHumanUnitResult(input)` per contracts/server-actions.md: `requireApprovedVa()` first, Zod `safeParse` at the boundary, the discriminated `HumanUnitResult` shape with `code` for a distinct cause, refusals `not_available | stale_generation | not_eligible | schema_invalid | duplicate | lifecycle_exit`, and post-commit-only `stopAllOpenSessions` then `revalidatePath` outside the transaction. Release stays the **existing** `releaseTask` (`va-tasks.ts:166-199`) — no new release action; the fencing trigger performs the generation bump and the audit, and a revision consumed before release stays consumed (FR-015, FR-022). **Gated on T002** (C1). Proves FR-009, FR-014, FR-015, FR-017, FR-018
- [ ] T045 [US2] Create `src/server/actions/human-unit-admin.ts` (`"use server"`) with `openHumanUnitReview(taskId)`, `decideHumanUnitCandidate(input)` and `continuePausedHumanUnitRun(input)` per contracts/server-actions.md: `requireRole("ADMIN")` first, Zod at the boundary, refusals `not_available | duplicate | self_review | stale_generation | lifecycle_exit | paused`, and `after(() => applyResume(unitStateId))` on the accept branch as an **accelerator only** — `recoverPendingHumanUnitResumes` converges on the same single resume if that process dies. `continue_within_ceiling` retains the original frozen ceiling, may reserve only the authorized remainder, never re-derives or raises it, never adjusts the payout, and is refused outright for a cancelled, abandoned or finished run. **Gated on T002** (C1). Proves FR-019, FR-020, FR-028, FR-032, FR-037

**Checkpoint**: the full verification gate exists. Submission ≠ acceptance ≠ final QC ≠ delivery, and acceptance is the only event that resumes machine work.

---

## Phase 5: User Story 3 — Unsupported shape or unpriceable effort keeps today's behaviour (Priority: P2)

**Goal**: a mandate outside the supported shape never enters this path and behaves exactly as it does today, plus one distinct recorded refusal cause that is never a missing capability and never a budget decision.

**Independent Test**: quickstart §7 — compile one mandate per refusal row (two human steps; a step neither ancestor nor descendant; a cycle; a dangling dependency; `fixedMinutes` null/zero; no positive `vaPayoutCents`/`estimatedMinutes`; and the flag **off** with an otherwise supported shape) and assert each produces exactly today's demotion-and-residual outcome, zero unauthorized downstream budget, an available manual next action, and a cause named in its own terms. Then re-evaluate the same accepted contract and assert the verdict is unchanged.

### Tests for User Story 3 ⚠️ write first, observe failing

- [ ] T046 [P] [US3] Write `test/integration/human-unit-fail-closed.itest.ts` covering every quickstart §7 row plus `input_unavailable`, `classification_conflict`, `revisions_exhausted` and `lifecycle_exit`: each lands in the existing manual residual path or an admin-visible pause with a **named** cause and an available manual next action; zero unauthorized downstream budget is consumed; and no surface added by this feature renders the cause as a missing-capability or a budget-demotion label, following the `compile-preview.ts:154-176` disambiguation precedent. Include the admission-replay assertion: re-evaluating the same frozen contract yields the same verdict. Proves SC-007, FR-003–FR-005, FR-038, FR-053, research R-13
- [ ] T047 [P] [US3] Write `test/integration/human-unit-rollout.itest.ts` for quickstart §8: with the flag **off**, a mandate in the supported shape behaves exactly as today (down to the same residual package and pool outcome); turning it **on** admits only mandates compiled afterwards and never retroactively admits an earlier run; turning it **off while a run is waiting on a claimed, submitted unit** yields zero new admissions while that run still reaches acceptance, rejection or a named admin-owned fail-closed state — **nothing strands a mandate or a claimant**; and the code-reverted-but-migration-kept degraded path leaves the new tables inert with the admitted run resolvable by an admin through the existing task paths. Proves SC-013, FR-064, FR-065
- [ ] T048 [P] [US3] Write `test/integration/human-unit-history.itest.ts`: apply the two migrations to a database holding pre-feature runs, packages, payouts and audit records, and assert every one reads identically before and after — no backfill, no historical run admitted retroactively, `awaiting_human` keeping its terminal-handover meaning, and no existing enum value changing meaning. Proves data-model §16, plan § Migration policy, FR-065
- [ ] T049 [P] [US3] Write the pure spec `test/human-unit-rollout-surface.test.ts` asserting by source slicing — the style `test/price-wall.test.ts` already uses — that `humanWorkUnitResumeEnabled` is read in **exactly one** place, `compileWorkflowForTask` in `src/server/workflow-runs.ts`, and appears nowhere in `src/server/human-unit.ts`, `src/server/human-unit-resume.ts`, `src/server/human-unit-deadlines.ts`, `src/server/actions/human-unit-worker.ts`, `src/server/actions/human-unit-admin.ts` or `src/server/actions/va-tasks.ts` (C10). This is what makes disable-midflight recovery structural. Proves FR-064, FR-065, research R-10/D9

### Implementation for User Story 3

- [ ] T050 [US3] In `compileWorkflowForTask` (`src/server/workflow-runs.ts:288-356`) record the not-admitted verdict: persist the cause on the run in its **own** field drawn from `HumanWorkUnitRefusalCause` — a vocabulary disjoint from any capability or budget vocabulary — write the `human_unit_not_admitted` `TaskEvent` with `meta` carrying only non-sensitive scalars, create **no** `HumanWorkUnitRunState`, and compile exactly as today so the demotion-and-residual path is byte-identical. Makes T046 pass. Proves FR-004, FR-053, FR-038; contracts/audit-events.md §1
- [ ] T051 [US3] Audit every module touched by this feature and remove any rollout-flag read outside `compileWorkflowForTask`, so publish, claim, submit, decide, accept, resume and the sweeps carry no flag gate at all (C10). Makes T049 pass; makes T047's disable-midflight case pass. Proves FR-064, FR-065

**Checkpoint**: every unsupported and unpriceable mandate keeps today's behaviour, the flag is a one-place admission gate, and rollback strands nothing.

---

## Phase 6: User Story 4 — Two workers reach for the same unit and only one gets it (Priority: P2)

**Goal**: exactly one holder, exactly one task assignment, fencing that holds for every path that moves a claimant, and worker reads that are deny-by-default and rechecked at the point of use.

**Independent Test**: quickstart §5 — fire concurrent claims from several eligible workers and assert exactly one success and exactly one task assignment; let a claim lapse, reclaim from a second eligible worker, and assert the stale holder's late submission is refused **as stale**, never merged; release voluntarily and assert no revision consumed, no run advance and no money moved; and assert every unauthorized actor class is refused **at the point of use** in every lifecycle state.

### Tests for User Story 4 ⚠️ write first, observe failing

- [ ] T052 [P] [US4] Write `test/integration/human-unit-concurrency.itest.ts`, following the existing `test/integration/concurrency.itest.ts` idiom: N simultaneous claims on one published unit → exactly one winner, exactly one task assignment, zero duplicate holders, zero second assignments, and `claimGeneration` incremented **exactly once** by the initial `NULL → worker` bind with the fence trigger **not** firing (C4); a task already held by a different claimant refuses the unit claim; simultaneous duplicate submissions produce one candidate; two admins deciding simultaneously produce one decision with the loser refused as `duplicate`; a submit carrying a superseded generation after reassignment is refused as `stale_generation`. Proves SC-002, SC-005, FR-011, FR-012, FR-013
- [ ] T053 [P] [US4] Write `test/integration/human-unit-authorization.itest.ts` — adversarial, across **every** lifecycle state and data classification: a non-approved worker; a worker failing category certification, tier/score/rated-count, the prior-rejection exclusion or the WIP cap; a non-claimant approved worker; a claimant at a superseded generation; a worker whose approval is withdrawn **after** claiming; and cross-task / cross-contract id guessing on every read and mutation. Each is refused at the point of use regardless of any earlier successful check, with the refusal message revealing nothing about what exists behind the gate. Assert a global eligibility-configuration change affects only units admitted afterwards while an individual worker-fact change affects live access. Proves SC-014, FR-009, FR-010, FR-043
- [ ] T054 [P] [US4] Write `test/integration/human-unit-leakage.itest.ts` (query-layer half): worker projections contain no undeclared field, no client price, no cross-task or cross-contract material, no credentials, no step internals, no `WorkflowBudgetHold`/`AccountProviderSpendHold` field, and no post-acceptance unit inputs or candidate content; a superseded generation returns `null`, indistinguishable from "does not exist"; client projections contain no worker payout; and **no worker-side access decision depends on client-tenant membership**. Assert the lifecycle visibility windows of contracts/projections.md §2 for each unit state. Proves SC-014, FR-010, FR-014, FR-054, FR-055, FR-061

### Implementation for User Story 4

- [ ] T055 [US4] Create `src/lib/queries/human-unit.ts` (`import "server-only"`) with `humanUnitForWorker({ taskId, workerId, claimGeneration })`: every clause of contracts/projections.md §2 in the **SQL `where`**, not a later check; the selected field set exactly as enumerated there and nothing more, enumerated from `definition.declaredInputs` so a field added to an underlying record later never becomes visible; the never-selected list omitted from the projection rather than fetched and filtered; the worker's payout left where it is today on `Task.vaPayoutCents` via the existing `vaTaskSelect`, not duplicated; and the lifecycle visibility windows applied per unit state. Makes T054 pass. Proves FR-014, FR-054, FR-055, FR-061, SC-014
- [ ] T056 [US4] Wire the point-of-use rechecks and stale refusals through `src/server/actions/human-unit-worker.ts` and `src/server/human-unit.ts`: live approved-VA status, the frozen-criteria/live-facts split from `src/lib/worker-eligibility.ts`, unit↔task↔contract binding, active claim holder **at the current generation**, and the classification projection — each evaluated inside the transaction that binds, never inherited from an earlier successful check. Add the `released` / `reclaimed` audit causes on the existing `releaseTask` path in `src/server/actions/va-tasks.ts:166-199` without changing its substance. Makes T052 and T053 pass. Proves FR-009, FR-013, FR-015, FR-043

**Checkpoint**: contention, staleness, fencing and worker-side isolation are proven adversarially against a real PostgreSQL instance.

---

## Phase 7: User Story 5 — An admin can see why a run is waiting and what to do next (Priority: P3)

**Goal**: no waiting run ages invisibly. Every waiting state and every refusal cause yields a distinguishable cause, actor set, deadline, revision count and exactly one safe next action, backed by durable alerts and replay-safe sweeps.

**Independent Test**: quickstart §9 — put runs into **every** waiting state and every refusal cause and assert the admin projection answers all five questions per state per contracts/projections.md §4; let each deadline lapse and assert exactly one durable admin alert, zero auto-acceptance, zero auto-rejection, zero revision consumption and zero provider spend, with the sweep idempotent under repeated and concurrent invocation; assert zero runs reach a waiting state with no owner and no next action. The admin *rendering* of this data is Phase 8; this phase is provable at the query and sweep layer.

### Tests for User Story 5 ⚠️ write first, observe failing

- [ ] T057 [P] [US5] Write `test/integration/human-unit-deadlines.itest.ts`: a publication lapse with no claim, a submission/lease lapse with no submission, and a `revision_requested` lapse with no reclaim each produce **exactly one** durable `HumanWorkUnitAlert` (`@@unique([unitStateId, kind, dueAt])`) and exactly one `Notification`, cause zero automatic acceptance, zero automatic rejection, zero revision consumption and zero provider spend, and leave `remainingRevisions` unchanged (FR-060); a submission/lease lapse returns the task to the pool through the **existing** release semantics so the fencing trigger refuses a late submission as stale; and running the sweep twice and concurrently still yields exactly one alert. Also assert every waiting state and refusal cause yields a distinguishable cause, authorized-actor set, deadline, revision count and exactly one safe next action from `humanUnitForAdmin`, and that zero runs reach a waiting state with no owner and no next action. Proves SC-010, SC-011, SC-016, FR-044, FR-052, FR-059, FR-060
- [ ] T058 [P] [US5] Write `test/integration/human-unit-final-qc.itest.ts`: a final-quality rejection after internal acceptance leaves the `HumanWorkUnitAcceptance`, the `HumanWorkUnitResumeRecord` and every already-completed downstream execution unchanged, triggers no automatic replay and no downstream rerun, and routes through the existing task revision or residual path identifying the **same** claimant or an explicit authorized reassignment. Include the database assertion that the acceptance is unmutatable even if a path attempted it. Proves SC-017, FR-062
- [ ] T059 [P] [US5] Extend `test/integration/cron-entrypoint.itest.ts` to assert the **real** cron entry point invokes `sweepHumanWorkUnitDeadlines` and `recoverPendingHumanUnitResumes`, that each is isolated by the existing `run(name, job)` wrapper so a transient failure in one cannot fail-fast the batch, and that both appear in the JSON response. Proves FR-029, FR-044, FR-059

### Implementation for User Story 5

- [ ] T060 [US5] Add `humanUnitForAdmin(taskId)` to `src/lib/queries/human-unit.ts`, gated by `requireRole("ADMIN")`: selects the definition, the full state, every candidate with its status, every decision, the acceptance, the resume record, the transition trail and the alert history, and derives the five FR-052 answers — why it waits (`state` + `refusalCause` + `pausedDetail`), who may act, the applicable deadline, `remainingRevisions`, and the safe next action from the exhaustive map in contracts/projections.md §4. Topology and economics refusals are rendered in their **own** terms and never as a missing capability or a budget decision. Same file as T055, so not parallel. Proves FR-052, FR-053, SC-010, SC-011
- [ ] T061 [US5] Implement `src/server/human-unit-deadlines.ts` (`import "server-only"`) — `sweepHumanWorkUnitDeadlines()` as transaction **T11**: every action is a CAS transition plus an `HumanWorkUnitAlert` insert keyed `(unitStateId, kind, dueAt)` plus the durable `Notification`, all in one transaction, so a re-run, a concurrent run or a replay loses the unique constraint and changes nothing — no "have we already notified?" read. A publication lapse pauses with `publication_deadline`; a submission or claim-lease lapse performs the same task-level CAS `claimed → open` clearing `claimedById` that `releaseTask` performs, letting the fencing trigger bump the generation; a lapse never auto-accepts, never auto-rejects, never consumes a revision, never resumes and never spends. Per-item isolated with a bounded `take`, matching every sweep in `src/server/sweeps.ts`. Makes T057 pass. Proves FR-044, FR-059, FR-060, SC-016
- [ ] T062 [US5] Register `sweepHumanWorkUnitDeadlines` and `recoverPendingHumanUnitResumes` in `runOperatorSweeps` in `src/server/sweeps.ts` (`:313-340`), with the same per-item isolation the other sweeps use. Proves FR-029, FR-044, FR-059
- [ ] T063 [US5] Register both sweeps in the isolated `run(...)` list and the JSON response of `src/app/api/cron/maintenance/route.ts` (`:59-96`), keeping `export const runtime = "nodejs"`, the `GET` export and the `timingSafeEqual` bearer check untouched. **Gated on T002** — confirm the route-handler shape against the recorded guide path before editing (C1). Makes T059 pass. Proves FR-029, FR-044, FR-059

**Checkpoint**: every waiting run is owned, deadlined, alerted and answerable, and the sweeps are replay-safe.

---

## Phase 8: User Surfaces (UI) — last by design

**Purpose**: render what the server already enforces. No authorization, projection or state decision is made here — a surface that needs a new decision is a bug in Phases 3–7. Serves User Story 1 (FR-014, FR-055, FR-061) and User Story 5 (FR-052, FR-053). **Every task in this phase is gated on T002** (C1).

- [ ] T064 [P] Extend `test/price-wall.test.ts` to pin the new worker and admin selects in `src/lib/queries/human-unit.ts`, in the same source-slicing style it already uses for `releaseTask`: assert the worker select's **key set itself**, not only its output, and assert the absence of `clientPriceCents`, `clientId`, `client`, `clientDeadlineUtc`, every `ai*` field, `computedPayoutCents`, `reservedBudgetCents`, `runAutomationBudgetMicros`, `actualAiCostMicros`, `actualToolCostMicros`, every budget/spend-hold field, step internals, `handoffReason` and every primitive id. Proves FR-054, SC-014; contracts/projections.md §7
- [ ] T065 [P] Extend `test/client-timeline.test.ts` to assert that **no** `human_unit_*` action appears in `CLIENT_TIMELINE_LABELS` (`src/lib/queries/tasks.ts:636`) — the whitelist is what makes adding an audit row structurally unable to publish anything to a client — and that the existing client task timeline and execution report render identically with the new `TaskEvent` rows present. Proves FR-061, SC-014, research R-14
- [ ] T066 Extend `test/integration/human-unit-leakage.itest.ts` with the page-level cases: on an admitted run, `src/app/va/tasks/[id]/page.tsx` renders the unit's declared projection and **suppresses** the generic worker brief and the raw input-file list, so no undeclared field reaches the worker through an existing surface; and the client-facing task view and timeline are byte-identical to a non-admitted run. Same file as T054, so not parallel. Proves FR-014, FR-055, FR-061, research R-03 residual risk
- [ ] T067 [P] Create `src/components/human-work-unit-worker.tsx` — the worker unit panel and submit form, rendering only `WorkerUnitView` from `humanUnitForWorker` and calling only `src/server/actions/human-unit-worker.ts`. Follows the existing component precedent (`src/components/human-package.tsx`, `deliverable-form.tsx`) and the guide shape recorded in T002. It adds no field the projection did not return. Proves FR-014, FR-055, FR-061
- [ ] T068 [P] Create `src/components/human-work-unit-admin.tsx` — the admin unit panel and decide form, rendering `AdminUnitView` from `humanUnitForAdmin`: cause, authorized actors, applicable deadline, revisions remaining and the one safe next action, with topology and economics refusals named in their own terms and **no** missing-capability or budget-demotion badge for them. Proves FR-052, FR-053, SC-010
- [ ] T069 Modify `src/app/va/tasks/[id]/page.tsx` to render the worker unit panel on an admitted run and suppress the generic brief and the raw input-file list in favour of the unit's declared projection, keeping the existing async-server-component `params` shape verified in T002. Makes T066 pass. Proves FR-014, FR-055, FR-061
- [ ] T070 Modify `src/app/admin/tasks/[id]/page.tsx` to render the admin unit panel alongside the existing generic `TaskEvent` mapping, without adding any `human_unit_*` action to the client whitelist. Proves FR-052, FR-053, SC-010

**Checkpoint**: both surfaces render enforced state only, and the client sees exactly what it saw before.

---

## Phase 9: Polish, Validation & Release Gate

**Purpose**: prove the whole thing, in the order that is safe to run.

- [ ] T071 Run `npm run lint`, `npm run typecheck` and `npm run test:run` at the repository root (pure loop, `vitest.config.mts`, `server-only` aliased to `test/server-only.ts`) and drive them green, comparing against the T003 baseline so no pre-existing failure is misattributed. Safe: no database access
- [ ] T072 Run the full real-PostgreSQL suite (`vitest.integration.config.ts`, `test/integration/**/*.itest.ts`) against the **disposable** cluster from T004 — use the TCP URL printed by `prisma dev ls` (the database port, not the API or shadow port), with `AFTERDESK_TEST_DATABASE_URL="postgres://…/afterdesk_integration?sslmode=disable&pgbouncer=true&connection_limit=10" ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration` — and drive every new `.itest.ts` plus every existing one green. The suite commits for real, which is the only way the new constraint triggers and partial indexes are exercised at all
- [ ] T073 ⚠️ **Confirmation required before running.** `npm run build` executes `prisma migrate deploy && next build`, so it applies both new migrations to whatever `DATABASE_URL` is set. Confirm explicitly that `DATABASE_URL` points at a **disposable, non-production** database, then run it. Never run it against production or a shared environment, and never substitute `prisma db push` or `prisma migrate reset` (C2)
- [ ] T074 If T002 recorded any contradiction between an installed Next.js 16 guide and a shape in `specs/001-human-workunit-resume/contracts/server-actions.md` or `contracts/runtime-internal.md`, amend the contract file to match the guide and note the amendment in [§ Implementation Notes](#implementation-notes--installed-nextjs-16-guides). The guide wins (C1, research R-01)
- [ ] T075 Write the release note as `docs/launch-checklist-human-work-unit.md`, following the existing precedent `docs/launch-checklist-provider-spend.md`, recording: migration status (two additive migrations, enums first, no backfill), the rollback order — **flag first, then the code deploy, never the schema** (a down-migration is not offered while any `HumanWorkUnitRunState` exists, a deliberate one-way door) — observability coverage, and the evidence label **`UNKNOWN`** for every commercial claim: demand, frequency, coverage gain, willingness to pay, and revenue and margin impact. State explicitly that human work through this path is **not** counted as machine or Work Compiler coverage. Proves FR-047, SC-012, quickstart §11
- [ ] T076 Record the explicit constitution compliance check for review in `specs/001-human-workunit-resume/checklists/constitution-compliance.md`, alongside the existing `checklists/readiness.md` and `checklists/requirements.md`, naming **Principle III** (a new worker-facing surface is a new leak site for client price and classification, and the claim now happens mid-run — FR-034, FR-014, FR-054 address it) and **Principle IV** (this mechanism could forward work wholesale while reporting automation — FR-047 and SC-012 address it) as the two principles this change puts at risk, each pointing at the requirement addressing it. Proves plan § Post-design constitution re-check, quickstart §11
- [ ] T077 Verify this file before declaring the feature done: every task line matches `- [ ] T0xx [P?] [US?] description with an exact repository path`; task IDs are contiguous **T001–T077** with no gap and no reuse; every user-story-phase task carries its story label and no Setup / Foundational / Surfaces / Polish task does; and every item of quickstart §11 "Definition of done" is satisfied

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — T001 blocks everything. T002 blocks T044, T045, T063, T067, T068, T069, T070 (every `src/app/**` and server-action task)
- **Phase 2 (Foundational)** — depends on Phase 1; **blocks all user stories**. Within it: T005–T009 (tests) → T010–T014 (pure impl) → T015 → T016 (settings) → T017 (invariant test) → T018 → T019 → T020 → T021 → T022. T019 must sort before T020 by directory name
- **Phase 3 (US1, P1)** — depends on Phase 2. The MVP
- **Phase 4 (US2, P1)** — depends on Phase 2; shares `src/server/human-unit.ts` and `test/integration/human-unit-replay.itest.ts` with Phase 3, so it lands after Phase 3 in a single-developer sequence. It replaces US1's seeded acceptance with the real review gate
- **Phase 5 (US3, P2)** — depends on Phase 2 and on T032 (the admission call site it adds the refusal branch to)
- **Phase 6 (US4, P2)** — depends on Phase 2, T035 (claim bind) and T044 (worker actions to recheck)
- **Phase 7 (US5, P3)** — depends on Phase 2 and Phase 6's `src/lib/queries/human-unit.ts`
- **Phase 8 (Surfaces)** — depends on T002 and on Phases 6–7's projections. Last by design
- **Phase 9 (Polish)** — depends on everything. T073 additionally requires the explicit `DATABASE_URL` confirmation

### User story dependencies

- **US1 (P1)** — independently testable after Phase 2 by seeding the acceptance row; delivers the machine-side spine
- **US2 (P1)** — independently testable after Phase 2; needs US1's unit state and blocked steps to have something to accept. Together US1 + US2 are the MVP
- **US3 (P2)** — independently testable after Phase 2 + T032; touches only the refusal branch and the flag surface
- **US4 (P2)** — independently testable after Phase 2 + T035 + T044
- **US5 (P3)** — independently testable after Phase 2; its rendering lands in Phase 8

### Within each phase

- Tests are written and observed **failing** before the implementation task they constrain
- Pure decisions before database schema; schema before runtime transactions; runtime before role-shaped reads and actions; reads and actions before UI
- Two tasks touching the same file are never both `[P]` (T024/T025, T027/T028, T029/T040, T054/T066, T055/T060)

### Parallel opportunities

- Phase 1: T003, T004
- Phase 2: T005–T009 together; then T011, T012, T013 together (T010 and T014 are sequential — T010 is the target of two specs, T014 edits `va-tasks.ts`)
- Phase 3: T023, T024, T026, T027, T029 together
- Phase 5: T046, T047, T048, T049 together
- Phase 6: T052, T053, T054 together
- Phase 7: T057, T058, T059 together
- Phase 8: T064, T065 together; T067, T068 together
- With multiple developers, US3, US4 and US5 can proceed in parallel once Phase 3 has landed

---

## Parallel Example: User Story 1

```bash
# Launch the User Story 1 test tasks together (different files, no shared state):
Task: "T023 Extend test/workflow-compile.test.ts for the humanCut gate"
Task: "T024 Write test/integration/human-unit-lifecycle.itest.ts for quickstart Scenario A"
Task: "T026 Write test/integration/human-unit-zero-spend.itest.ts"
Task: "T027 Write test/integration/human-unit-payout.itest.ts"
Task: "T029 Write test/integration/human-unit-replay.itest.ts (resume half)"

# Then the pure Phase 2 implementations that share no file:
Task: "T011 Implement src/lib/ai-work-engine/human-unit-definition.ts"
Task: "T012 Implement src/lib/ai-work-engine/human-unit-result-schema.ts"
Task: "T013 Implement src/lib/human-unit-state.ts"
```

---

## Validation commands

| Command | Safety | When |
|---|---|---|
| `npm ci` | Safe — installs the locked tree, no database | T001 |
| `npm run lint` | Safe | T003, T071 |
| `npm run typecheck` | Safe | T003, T071 |
| `npm run test:run` | Safe — pure loop, `vitest.config.mts`, no database | T003, T071 |
| `AFTERDESK_TEST_DATABASE_URL=… ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration` | Safe **only** against the disposable cluster from T004; the six-condition guard in `test/integration/guard.ts` and the isolation probe in `global-setup.ts` refuse anything else | T021, T072 |
| `npm run build` | ⚠️ **Requires explicit confirmation that `DATABASE_URL` is a disposable, non-production database** — it runs `prisma migrate deploy` before `next build` and will apply both new migrations to whatever it points at | T073 |
| `npx prisma dev --name integration` | Safe — its own port, never the app's | T004 |

**Never run**: `prisma db push` (forbidden by the constitution and used nowhere in this repository), `prisma migrate reset` against a shared or production database, or `npm install` in place of `npm ci` (it would move the lockfile).

---

## Implementation Notes — installed Next.js 16 guides

> **Recorded by T002 on 2026-08-14 against the tree installed by T001 (`npm ci`, lockfile `cf32332…` unchanged).** Paths are relative to `node_modules/next/dist/docs/`.

| Topic | Exact guide path | Verified shape / deprecation notice |
|---|---|---|
| Server actions (`"use server"`) | `01-app/02-guides/server-actions.md` | No API-shape deprecation. One operational notice at L174: action IDs are build artifacts and **Next rotates them at most every 14 days**, so a client on a previous build can invoke a missing ID → "Failed to find Server Action". Affects deploy behaviour, not our signatures |
| Route handlers | `01-app/01-getting-started/15-route-handlers.md` | `export async function GET(request: Request) {}`. No deprecation affecting this feature |
| Caching & revalidation | `01-app/03-api-reference/04-functions/revalidatePath.md` (+ `01-getting-started/09-revalidating.md`, `02-guides/how-revalidation-works.md`) | `import { revalidatePath } from "next/cache"` — **matches existing repo usage** (`src/server/actions/va-tasks.ts:3`). Next 16 also exports `updateTag` from `next/cache`; not required here |
| `after()` | `01-app/03-api-reference/04-functions/after.md` | `import { after } from "next/server"` — **matches existing repo usage** (`src/server/actions/va-tasks.ts:8`) |
| Async server components / `params` | `01-app/03-api-reference/03-file-conventions/page.md` | `params: Promise<{ slug: string }>` and `const { slug } = await params` — **params are async and must be awaited** |

**Contradictions found against `contracts/`:** none. Both Next.js APIs this feature needs (`after`, `revalidatePath`) are already imported from those exact module paths by existing repo code, so the contracts and the installed guides agree. Nothing to amend in T074 on this basis.

**T003 baseline (2026-08-14, worktree `feat/human-workunit-resume` @ `c5e5bcf`):** `npm run lint` exit 0, clean · `npm run typecheck` exit 0, clean · `npm run test:run` **1186/1186 passed, 54 files**. **Zero pre-existing failures** — any later red is attributable to this feature.

**T003 baseline** (pre-existing lint / typecheck / unit failures, if any): _to be recorded in T003._

**T004 integration database** (`AFTERDESK_TEST_DATABASE_URL` shape and port, never the app's): start the named disposable instance, read its **TCP** URL from `npx prisma dev ls`, and use its database port (not the main API port or shadow port): `postgres://postgres:postgres@127.0.0.1:<TCP-port>/afterdesk_integration?sslmode=disable&pgbouncer=true&connection_limit=10`. The compatibility flag prevents prepared-statement collisions through the local multiplexing proxy; transaction-scoped advisory locks remain held for the transaction. Pair it with `ALLOW_INTEGRATION_DB_RESET=1`.

---

## Deviations from the plan's test matrix

Recorded rather than silently absorbed, per the constitution's evidence discipline.

| Deviation | Why |
|---|---|
| `test/integration/human-unit-review.itest.ts` (T039) is a new file not named in plan.md § Test matrix | The plan's matrix left quickstart §4 Scenario C — revision then acceptance — to the lifecycle spec. Giving it its own file is what makes User Story 2 independently runnable, which the phase structure requires. Nothing in the matrix is dropped |
| `test/human-unit-rollout-surface.test.ts` (T049) is a new pure spec not named in the matrix | It converts D9 / C10 — "the flag is read in exactly one place" — from a review convention into a build-failing assertion, using the source-slicing idiom `test/price-wall.test.ts` already establishes. Without it, disable-midflight safety rests on reviewer memory |
| User Story 1's integration spec seeds the `HumanWorkUnitAcceptance` row directly | The acceptance row **is** the durable resume intent (plan A6). Seeding it is what makes the machine-side spine independently testable before the review gate exists; T039 and T040 then exercise the real acceptance path end to end |

---

## Implementation Strategy

### MVP (User Story 1 + User Story 2 — both P1)

1. Phase 1 — clear `BLOCK-NEXT-DOCS`, establish the baseline and the disposable database
2. Phase 2 — pure verdicts, settings, schema, two migrations, every invariant proven by PostgreSQL
3. Phase 3 — the machine-side spine, validated with a seeded acceptance
4. **STOP and VALIDATE** — quickstart §2 Scenario A end to end, plus zero-spend and payout
5. Phase 4 — the real review gate replaces the seeded acceptance
6. **STOP and VALIDATE** — quickstart §4 Scenario C end to end. This is the demonstrable MVP: *machine → human → machine* with one accepted human result, at the accepted fixed payout, with zero provider spend while waiting

### Incremental delivery after the MVP

1. Phase 5 (US3) → every unsupported mandate provably keeps today's behaviour and rollback strands nothing
2. Phase 6 (US4) → contention, fencing and worker-side isolation proven adversarially
3. Phase 7 (US5) → deadlines, alerts and admin answerability
4. Phase 8 → surfaces
5. Phase 9 → validation and the release gate

Each increment adds value without breaking the previous one, and the flag stays **off** in every environment until the full integration suite passes against a real PostgreSQL instance.

### Parallel team strategy

Phases 1–3 are sequential and shared. Once Phase 3 lands: developer A takes Phase 4 (US2), developer B takes Phase 5 (US3), developer C takes Phase 6 (US4) then Phase 7 (US5). Phase 8 waits for both projections. Phase 9 is done together.

---

## Notes

- `[P]` means different files and no dependency on an incomplete task — never two tasks editing the same file
- Every task names its exact repository paths and the requirement or scenario it proves
- Verify each test **fails** before writing the implementation it constrains
- Commit after each task or logical group; the flag stays `false` throughout
- **`Task.claimedById` remains the sole worker assignment and `Task.vaPayoutCents` remains authoritative in every task above.** No orchestrator, no child task, no second payee (C9)
- Stop at any checkpoint to validate the story independently
- The commercial questions — demand, frequency, coverage gain, willingness to pay, revenue and margin impact — remain `UNKNOWN` and must be labelled so on every surface and in the release note
