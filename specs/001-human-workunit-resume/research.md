# Phase 0 Research: HumanWorkUnit and Safe Resume v1

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-14

**Method**: every finding below was read directly from this working tree at `C:\dev\nightlexicon-humanworkunit` on 2026-08-14. No subagent was used. Claims carry the constitution's evidence labels; `CODE` means "read from the implementation at the cited path", `TEST` means "asserted by a test in the repository", `INFERRED` means "reasoned from other facts in this document", `UNKNOWN` means "not established". Where a question could not be answered from the repository, it is left `UNKNOWN` and the consequence is stated rather than guessed.

---

## Index of unknowns

| ID | Question | Status |
|---|---|---|
| [R-01](#r-01) | Are the installed Next.js 16 docs available, as AGENTS.md requires? | **NO — recorded limitation, gates implementation** |
| [R-02](#r-02) | What exactly does the runtime do with a human step today? | Resolved `CODE` |
| [R-03](#r-03) | How does a mid-run unit reach a worker without a second engagement? | Resolved `CODE` + design decision |
| [R-04](#r-04) | Where does "the accepted fixed task payout" live? | Resolved `CODE` |
| [R-05](#r-05) | What is a checkable "non-null frozen effort provenance"? | Resolved `CODE` |
| [R-06](#r-06) | Is there an existing task-claim lease / automatic reclaim? | Resolved `CODE` — **none exists** |
| [R-07](#r-07) | Can a residual human package be written after a claim? | Resolved `CODE` — **no, by trigger** |
| [R-08](#r-08) | Can zero-provider-spend be enforced in the database? | Partially — recorded limitation |
| [R-09](#r-09) | How are candidate payloads retained and purged? | Resolved — design decision with a named risk |
| [R-10](#r-10) | How is the rollout flag added without breaking settings? | Resolved `CODE` |
| [R-11](#r-11) | How are new enum values migrated safely here? | Resolved `CODE` |
| [R-12](#r-12) | What does the real-Postgres integration harness require? | Resolved `CODE` |
| [R-13](#r-13) | How does the repo keep a budget demotion from reading as a missing capability? | Resolved `CODE` |
| [R-14](#r-14) | How does an audit event stay out of the client's view? | Resolved `CODE` |
| [R-15](#r-15) | Commercial denominators — demand, coverage, willingness to pay | **UNKNOWN, deliberately** |

---

## R-01 — Installed Next.js documentation {#r-01}

**Question**: `AGENTS.md` states "Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Is it available?

**Finding**: **No.** `node_modules/` does not exist in this working tree. `ls -d node_modules` returns nothing; `node_modules/next` does not exist; `find node_modules/next -maxdepth 3 -type d -name docs` returns nothing. `CODE` (measured 2026-08-14)

**Decision**: record the limitation exactly, do not guess a single Next.js API shape, and do not let the gap silently become an assumption.

- **No new Next.js pattern is proposed anywhere in this plan.** Every pattern used is copied from an existing in-repo call site with a citation: server actions as `"use server"` modules returning a discriminated result (`src/server/actions/va-tasks.ts:1-15`), `revalidatePath` after a successful mutation (`va-tasks.ts:156-158`), `after()` from `next/server` for post-response work (`va-tasks.ts:461`, `admin-qc.ts:367`, `sweeps.ts:314`), route handlers exporting `GET`/`POST` with `export const runtime = "nodejs"` and a `timingSafeEqual` bearer check (`src/app/api/cron/maintenance/route.ts`), and async server components awaiting `params` as a Promise (`src/app/va/tasks/[id]/page.tsx:31-35`).
- **`BLOCK-NEXT-DOCS`** — an implementation-phase blocker: before any file under `src/app/**` or any new server action is written, run `npm install` and read the relevant guides under `node_modules/next/dist/docs`, including any deprecation notices. If a guide contradicts a pattern cited above, the guide wins and the plan is amended rather than the code being written against this document.

**Rationale**: guessing a framework API from training data is exactly what `AGENTS.md` forbids, and this repository has already been bitten once by a framework assumption — the cron route exported `POST` only while Vercel Cron issues `GET`, so every scheduled invocation returned 405 and nothing ran (`src/app/api/cron/maintenance/route.ts:43-53`). `CODE`

**Alternatives considered**: (a) install dependencies during the planning phase — rejected, the phase is explicitly limited to Spec Kit artifacts and must not mutate the working tree; (b) write the plan against remembered Next.js 15 conventions — rejected as inventing facts; (c) defer the whole plan — rejected, because none of the design's substance depends on framework specifics, only its surface files do.

---

## R-02 — What the runtime does with a human step today {#r-02}

**Findings** (all `CODE`):

1. `resolveTopology` marks a step non-automatable if its executor is `human`, its primitive is missing/unknown/version-moved, or **any transitive dependency** is non-automatable — reason `depends_on_human` (`src/lib/ai-work-engine/topology.ts:62-112`).
2. `compileDecisions` re-applies that cascade over its own later gates (mode, reach, data class, params) so a decapitated machine chain is impossible (`compile.ts:250-299`).
3. A demoted step is persisted `status: "handed_to_human"`, `executionMode: "human"` (`workflow-runs.ts:341-352`).
4. `claimNextStep` fetches only `executionMode: "automated"` steps, walks in ascending `order`, skips `done` and `handed_to_human`, and **breaks at the first step that is not finished** — "first incomplete step or nothing" (`workflow-runs.ts:612-654`).
5. The only forward exit is `finishRun`: it computes the residual, writes `TaskHumanWorkPackage`, and moves the task `ai_processing → open` writing `vaPayoutCents` and `estimatedMinutes` (`workflow-runs.ts:1673-1725`). There is no return path to machine execution.

**Consequence for the design**: two facts do all the work. Because the claim walk breaks at the first unfinished step, a new non-claimable status blocks the rest of the pipeline with no new gate. Because only automated steps are fetched, a descendant that must resume later has to remain `automated` rather than be demoted — which is exactly the change `compileDecisions` needs, and nothing else. `INFERRED` from the five `CODE` findings above.

---

## R-03 — Reaching a worker without a second engagement {#r-03}

**Constraint** (spec Clarification 2, FR-011, FR-033): claiming the unit must atomically establish or match the task's sole worker assignment; no second payable engagement may exist.

**Repository facts** (`CODE`):

- `Task.claimedById` is the single assignment; `claimTask` sets it via `transitionTask({ from: "open", to: "claimed", guard: { claimedById: null } })` — a compare-and-swap whose `where` carries both the status and the null-claimant guard (`va-tasks.ts:136-145`).
- `ALLOWED_TRANSITIONS` permits `ai_processing → open | expired | cancelled` and `open → claimed | expired | cancelled` (`src/lib/state.ts:69-70`). There is **no** `ai_processing → claimed` edge.
- The pool query selects `status: "open", claimedById: null, isInternal: false, standingCapacityAccountId: null` plus a high-value gate (`src/lib/queries/tasks.ts:192-220`), and `poolTaskForVa` re-applies every filter so a URL guess cannot bypass the board.
- `second_shift_pool_payable_guard` refuses `status = 'open'` on a commercial task without a positive `vaPayoutCents` and a positive `estimatedMinutes` (`prisma/migrations/20260809100000_accepted_plan_economics/migration.sql:130-166`).
- The payment guard refuses `→ open` and `→ ai_processing` on a commercial task with no authorized/received payment (`20260806170200_workflow_guards/migration.sql:51-74`).

**Decision**: publish the unit through the **existing** `ai_processing → open` edge, leaving `vaPayoutCents`/`estimatedMinutes` at their accepted quoted values, and let the **existing** `claimTask` be the claim. The unit claim and the task claim are then the same act by construction rather than by coordination.

**Rationale**: it reuses discovery, eligibility, the advisory-locked WIP cap, the null-claimant CAS, both database guards, the file-access window (`VA_FILE_ACCESS_STATUSES`, `src/lib/status.ts:24-30`), work sessions, and the whole delivery path. FR-011 and FR-012 are then satisfied by machinery that already exists and is already tested under contention (`test/integration/concurrency.itest.ts`).

**Alternatives considered**:

- *Add an `ai_processing → claimed` edge and keep the task in `ai_processing` while waiting.* Rejected: it requires a parallel pool surface (the board selects `open` only), a parallel claim action, extending the payable guard to a new state, widening `VA_FILE_ACCESS_STATUSES`, and touching the delivery from-states. That is a second marketplace beside the first, which Principle VII forbids.
- *Create a child task for the unit.* Rejected outright: a second `Task` means a second claimant and a second `Payout` row — precisely FR-033's prohibition.
- *Keep the run in `ai_processing` and notify a specific worker directly.* Rejected: it invents an assignment mechanism that does not exist, and it cannot express contention, which User Story 4 requires.

**Consequences that must be handled, and are** (each is a plan touchpoint): `advanceWorkflow` currently abandons a run whose task has left `ai_processing` (`workflow-runs.ts:833`) and must not do so for an admitted run in `open`/`claimed`; `abandonStalledWorkflowRuns` only sweeps `ai_processing` (`sweeps.ts:356-359`) so the admitted waiting run is naturally out of its reach and gets its own deadline sweep instead; the generic worker brief on `/va/tasks/[id]` must be replaced by the unit's declared projection on an admitted run, or FR-014's deny-by-default projection would be violated by the page that already exists.

---

## R-04 — Where the accepted fixed task payout lives {#r-04}

**Finding**: `Task.vaPayoutCents` is the only depository of the accepted amount. The acceptance snapshot carries the *client price*, not the payout; `TaskExecutionPlanVersion.suggestedVaPayoutCents` is a suggestion the admin may have overridden, so reading it would publish a number the operator did not choose. This is stated verbatim in the code and is the reason `handoverBlockedForUnknownPayout` refuses to guess rather than defaulting to zero (`workflow-runs.ts:1450-1513`). `CODE`

**Finding**: the payout is frozen at claim by a database trigger — `IF OLD."claimedById" IS NOT NULL AND NEW."claimedById" IS NOT NULL AND NEW."vaPayoutCents" IS DISTINCT FROM OLD."vaPayoutCents" THEN RAISE` (`20260806170200_workflow_guards/migration.sql:82-86`). `CODE`

**Gap identified**: that guard does **not** fire when `claimedById` goes non-null → null → non-null, i.e. across a release-and-reclaim cycle, and does not fire before the first claim. On the admitted path the payout must be immutable from admission, because it is displayed pre-claim and must equal the figure at completion (FR-034, SC-004).

**Decision**: add a new, separate trigger `afterdesk_admitted_payout_is_frozen` that refuses any change to `vaPayoutCents` while the task carries a non-refused `HumanWorkUnitRunState`. New function, new name — never a `CREATE OR REPLACE` of `second_shift_protect_task_invariants`, because this repository has already lost a clause that way and documented it (`20260806170200_workflow_guards/migration.sql:37-44`). `CODE`

---

## R-05 — A checkable "non-null frozen effort provenance" {#r-05}

**Question** (FR-035, readiness CHK020): the economic admission test must be expressed so two reviewers reach the same verdict on the same plan.

**Findings** (`CODE`):

- `TaskExecutionPlanStep` carries `fixedMinutes Int?`, `secondsPerUnit Int?` and three non-nullable PERT columns (`schema.prisma:1620-1625`).
- `residual.ts` trusts the decomposition **only** when `step.fixedMinutes !== null && step.fixedMinutes > 0`, and documents the measured failure that made this the rule: a step with `fixedMinutes: null, secondsPerUnit: 60` paid 20 minutes instead of the quoted 240 — "five dollars for a sixty dollar mandate, and the arithmetic looked correct the whole way down" (`residual.ts:88-116`).
- `handoverBlockedForUnknownPayout` treats a payout as known only when `vaPayoutCents !== null && > 0 && estimatedMinutes !== null && > 0` (`workflow-runs.ts:1481-1488`), and `second_shift_pool_payable_guard` enforces the identical predicate in the database.

**Decision**: economic admission passes only when **all** of the following hold, and every one of them is a frozen accepted-contract field:

1. exactly one accepted human plan step exists, and it is the cut;
2. `cut.fixedMinutes !== null && cut.fixedMinutes > 0`;
3. `task.vaPayoutCents !== null && > 0` and `task.estimatedMinutes !== null && > 0`;
4. the unit definition is derived entirely from that step's own accepted columns, with no operator-authored additions in V1.

Otherwise the verdict is `unmapped_economics`.

**Rationale**: each clause is a boolean over a stored column, so the verdict is reproducible by inspection and by replay (FR-005). Clause 4 turns "adds no obligation beyond that step" from a judgment into a structural property: there is nowhere for an extra obligation to come from. **Expected minutes is deliberately not part of the test** — FR-035 forbids calculating adequacy from it, and FR-058 makes it descriptive capacity context only.

---

## R-06 — Existing task-claim lease or automatic reclaim {#r-06}

**Question**: the spec's failure table refers to "the existing lease expiry and reassignment path" for a silent holder.

**Finding**: **there is no task-level claim lease and no automatic reclaim.** The sweeps in `src/server/sweeps.ts` are: `expireStaleQuotes`, `expireStalePayments`, `releaseDisputeWindowFunds`, `reapOrphanFiles`, `purgeExpiredTaskFiles`, `advanceStandingCapacityPeriods`, `abandonStalledWorkflowRuns`, plus the Phase 1C hygiene sweeps. None reads `Task.vaDeadlineUtc` or `Task.claimedAt`; `vaDeadlineUtc` is written once at pricing (`admin.ts:137,159`) and read nowhere in `src/server`. `VaProfile.deadlinesMissed` exists and is never incremented by any sweep. `CODE`

What *does* exist: **leases with fencing on workflow steps** (`TaskWorkflowStepRun.leaseExpiresAt` + the `lockedBy` fencing token, `workflow-runs.ts:401-418, 716-745`), voluntary release (`releaseTask`, `va-tasks.ts:166-199`), and admin reassignment (`reassignTask`, `admin.ts:225-279`). `CODE`

**Decision**: V1 introduces a **unit-scoped** lease and deadline sweep, and expresses its expiry through the **existing** release/reassignment semantics — the sweep performs the same task-level CAS `claimed → open` clearing `claimedById`, which is byte-identical to what `releaseTask` already does, and the fencing trigger bumps the claim generation as a consequence. No new reassignment concept is invented, and the step-lease/fencing motif is copied rather than reinvented.

**Correction recorded**: the spec's phrase "the existing lease expiry and reassignment path" is accurate about *reassignment* and inaccurate about *lease expiry* at the task level. Rather than silently reading it as if a lease existed, this plan states what exists (`CODE`), states what is added, and keeps the added mechanism inside the existing semantics.

---

## R-07 — Can a residual human package be written after a claim? {#r-07}

**Finding**: **Yes, exactly once.** `second_shift_human_package_frozen_after_claim` fires `BEFORE UPDATE OR DELETE ON "TaskHumanWorkPackage"`; it does **not** fire on `INSERT` (`20260806170200_workflow_guards/migration.sql:103-126`). `TaskHumanWorkPackage.runId` and `.taskId` are both `@unique` (`schema.prisma:2243-2252`), so a package may be created once after a claim and then cannot be changed or removed while the task carries a claimant. `CODE`

**Decision**: the admitted happy path writes no package. If downstream automation fails after resume, or the unit exhausts into manual residual handling, a dedicated admitted-residual publisher MAY create the existing `TaskHumanWorkPackage` once to describe only the remaining scope. It MUST NOT write `Task.vaPayoutCents` or `Task.estimatedMinutes`, MUST NOT open another claim, and MUST set the package's payout-reference fields from the already-frozen accepted task payout rather than from residual payout recomputation. The existing worker projection can then show the remaining scope to the same claimant without creating a second engagement (FR-045, FR-057).

The existing freeze remains unchanged: after that one insert, the package is immutable under the same trigger. A duplicate publication loses the existing unique constraints. Normal admitted completion still uses `finishAdmittedRun` and writes neither a package nor a payout.

**Second consequence**: `TaskWorkflowRun.unitsTotal`, `unitsResolvedAutomatically`, `unitsPrefilled` and `unitsVerifiedByMachine` are written by `finishRun` only. On an admitted run they stay `null`. That is honest — no residual was computed — and any admin surface reading them must render a dash, never a zero, per the repository's existing display law. `INFERRED` from `CODE`.

---

## R-08 — Can zero-provider-spend be enforced in the database? {#r-08}

**Findings** (`CODE`):

- All provider spend flows through `reserveSpend` / `reserveAccountProviderSpend`, both called **only** from inside `advanceWorkflow`'s claim loop, after `claimNextStep` returned a step (`workflow-runs.ts:986-1104`). Pure primitives reserve nothing.
- `WorkflowBudgetHold` carries `runId` (`schema.prisma:2148-2149`).
- `AccountProviderSpendHold` carries **no** run or task identity: `(provider, periodKey, operationKey, attempt)` only (`schema.prisma:2200-2230`). The run identity is embedded inside `operationKey` as `${primitiveId}:${snapshotId}:${order}` (`workflow-runs.ts:1039`), i.e. only as a substring of a composite string.

**Decision**:

1. **Structural, primary**: a blocked step is never claimable, so the reservation call sites are unreachable while the unit waits. This is the guarantee, and it is the same shape as the repository's own "the absence of the import is the enforcement" reasoning in `residual.ts` and `pricing.ts`.
2. **Database, secondary**: a constraint trigger refuses `INSERT` into `WorkflowBudgetHold` for a run whose unit state is in a waiting state (`published`, `claimed`, `submitted`, `in_review`, `revision_requested`).
3. **Account-level**: **no database guard is proposed.** Parsing a run identity out of a composite string key inside a trigger would be fragile and would couple the guard to a key format that is free to change. Coverage is by test — `human-unit-zero-spend.itest.ts` asserts zero `AccountProviderSpendHold` rows whose `operationKey` names the run's snapshot across every waiting state.

**Recorded limitation**: the account-level circuit breaker's zero-spend property on this path is `TEST`-labelled, not database-enforced. Stated here rather than left implicit.

---

## R-09 — Retention and purge of candidate payloads {#r-09}

**Requirements in tension**: FR-041 requires every durably submitted candidate to be retained as immutable evidence *under the platform's authorized retention and purge policy, extended to these candidate records and artifacts*. FR-063 requires the transition and decision trail to be append-only and immutable *through normal product and operator paths*, removable *only* by the authorized retention or purge policy, and never by an update or ad hoc delete.

**Repository facts** (`CODE`):

- `LedgerEntry` is protected by an unconditional `RAISE EXCEPTION 'LedgerEntry is append-only'` on `UPDATE`, `DELETE` and `TRUNCATE` (`20260730001000_integrity_triggers/migration.sql:142-157`) — it is never purged.
- `purgeExpiredTaskFiles` deletes the blob first and only then records the purge, per task, isolated per item (`sweeps.ts:165-252`). It purges `File` rows, so **candidate artifacts are already covered** once they are `File` rows on the task.
- The integration harness disables three named triggers by name to truncate, and documents that this is acceptable only because a six-condition guard proved the database disposable (`test/integration/per-file-setup.ts:35-59`).

**Decision**:

- **Candidate artifacts**: `File` rows linked to the candidate by a join table. Already inside the existing purge, scanning, visibility and retention rules. No new policy.
- **Candidate payloads and the audit trail**: `UPDATE` is refused unconditionally. `DELETE` is refused unless the session sets `afterdesk.retention_purge = 'on'`, which only a new, explicitly named retention sweep does. Every purge writes its own audit row before deleting.
- **V1 ships the guard; it does not ship a purge sweep for these rows.** Nothing is removable until that sweep is written, which is the fail-closed reading of "the policy MUST explicitly cover these records before any removal is possible".

**Named risk**: a session GUC is a capability any code running on that connection could set. It is a weaker barrier than an unconditional block. It is chosen because the alternative — an unconditional block — makes FR-041's retention promise unkeepable, and a promise the database structurally cannot honour is worse than a narrow, named, audited carve-out. Recorded for review rather than buried.

**Alternative considered**: a separate archive table written before deletion. Rejected for V1 as more machinery than the requirement asks for, and it moves rather than solves the immutability question.

---

## R-10 — Adding the rollout flag without breaking settings {#r-10}

**Finding**: `getSettings` seeds from `DEFAULT_SETTINGS`, then overlays database rows **only for keys already present in the seed** (`if (row.key in merged)`), then validates the whole object with `SettingsSchema` and falls back to the reviewed defaults on any parse failure (`src/lib/settings.ts:258-274`). `CODE`

**Consequence**: a new setting must be added in **three** places — the `Settings` type, `SettingsSchema`, and `DEFAULT_SETTINGS` — or a database override for it is silently discarded.

**Decision**: add `humanWorkUnitResumeEnabled: boolean` (default `false`) plus `humanWorkUnitRevisionBound: number` (default `2`), `humanWorkUnitPublicationDeadlineHours` / `humanWorkUnitSubmissionDeadlineHours` / `humanWorkUnitClaimLeaseHours` (default `72` each, independent of expected minutes, per FR-058).

**Decision**: the flag is read **only** at admission, inside `compileWorkflowForTask`. The verdict is then persisted on the unit row and never re-derived. That single choice is what makes FR-064 and FR-065 both true: enabling affects only runs admitted afterwards, and disabling blocks new admissions without touching a run already waiting. There is deliberately **no** flag check in publish, claim, submit, decide, accept or resume — a check there is exactly how a rollback would strand a mandate.

**Precedent**: `requireCategoryCertification` defaults to `false` for the same class of reason, and its comment records why a retroactive flip would stop delivery dead (`settings.ts:41-53`). `CODE`

---

## R-11 — Migrating new enum values safely {#r-11}

**Finding**: Postgres refuses to use an enum value in the transaction that adds it, so this repository splits enum additions into their own migration applied before the one that uses them, and always writes `ADD VALUE IF NOT EXISTS` so a replayed deploy or a `migrate resolve` does not fail — stated explicitly in `20260806170000_workflow_enum_values/migration.sql:1-20`. `CODE`

**Decision**: two migrations, `..._human_work_unit_enums` then `..._human_work_unit`, following that precedent exactly. `prisma db push` is not used; `npm run build` already runs `prisma migrate deploy`. `CODE`

---

## R-12 — What the real-Postgres integration harness requires {#r-12}

**Findings** (`CODE`):

- `vitest.integration.config.ts` runs `test/integration/**/*.itest.ts` in a single fork with `isolate: false`, `fileParallelism: false`, `maxWorkers: 1`, 60s test / 120s hook timeouts.
- `global-setup.ts` applies every `migration.sql` statement by statement through a dollar-quoting-aware splitter, because the schema engine's named prepared statements collide through the local proxy. It rebuilds only when the migration chain changes, and it runs a physical isolation probe that refuses to proceed if a table created in the test database is visible through the app's own `DATABASE_URL`.
- `per-file-setup.ts` truncates every application table between files, disabling exactly three named append-only triggers by name to do so.
- The suite **commits for real**, because several invariants under test are constraint triggers and partial indexes a rolled-back transaction would never exercise.

**Consequences for this feature**: (a) the two new migrations must be splittable by that splitter — trigger bodies use `$$` quoting, which it handles; (b) any new `BEFORE TRUNCATE` guard must be added to `TRUNCATE_GUARDED_TABLES` in `per-file-setup.ts`, or the whole integration suite breaks on the next file. That is a concrete, easy-to-miss implementation obligation and is restated in [quickstart.md](./quickstart.md).

---

## R-13 — Keeping a budget demotion from reading as a missing capability {#r-13}

**Finding**: the repository already hit this exact defect and fixed it. A step demoted for budget is persisted with `primitiveId: null`; recompiling those stored rows makes `topology.ts` return `no_primitive` — the same reason a genuinely unresolvable capability gets — so every budget-demoted mandate showed `MISSING CAPABILITY` beside `DEMOTED FOR BUDGET`. The fix disambiguates on `demotedForBudget` before deciding the badge (`src/lib/ai-work-engine/compile-preview.ts:154-176`), and `test/compile-preview.test.ts` pins it. `CODE` / `TEST`

**Decision**: the same discipline, extended to the two new causes. `unsupported_topology`, `malformed_topology` and `unmapped_economics` are **their own** causes on **their own** surface field. No surface added by this feature may render them as a missing capability or as a budget decision, and a budget-demoted downstream step keeps `demotedForBudget` as its explanation and is never resurrected by acceptance (FR-025, FR-038, FR-053). Pinned by `human-unit-fail-closed.itest.ts`.

---

## R-14 — Keeping an audit event out of the client's view {#r-14}

**Finding**: `TaskEvent` is the platform-wide audit log, and the client-facing execution report renders **only** actions named in the `CLIENT_TIMELINE_LABELS` whitelist, dropping anything unrecognised — chosen deliberately over a blocklist because "adding an event to the audit log can never, by itself, publish it" (`src/lib/queries/tasks.ts:609-741`). `actorId`, `reason` and `meta` are never projected. `test/client-timeline.test.ts` pins the key set. `CODE` / `TEST`

**Decision**: mirror the unit's transitions into `TaskEvent` for the admin surfaces that already render it generically, and add **none** of the `human_unit_*` actions to the whitelist. Extend `client-timeline.test.ts` to assert their absence, so a future contributor cannot add one absent-mindedly. This is what makes FR-061's "no client-facing Human Work Unit surface" hold structurally rather than by review.

---

## R-15 — Commercial denominators {#r-15}

**Status**: `UNKNOWN`, by explicit founder decision recorded in the spec.

- Population of accepted mandates whose accepted plan contains one human step with machine work downstream: `UNKNOWN` — never measured against real customer mandates.
- Frequency of mid-run human judgment, coverage gain, willingness to pay, revenue and margin impact: `UNKNOWN`.
- Worker supply and latency for structured mid-run units: `UNKNOWN`.

**Design response**: the admission verdict and its cause are recorded for every compiled run, admitted or not. That makes the unsupported population countable in production and is the first real evidence toward the demand question. Nothing in this plan converts an `UNKNOWN` into an estimate, and every aggregate readiness claim about this feature carries `UNKNOWN`, the weakest label among its inputs.

---

## Consolidated decision list

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D1 | Block descendants (`blocked_on_human_unit`) instead of demoting them | The claim walk already breaks at the first unfinished step, so blocking needs no new gate and makes zero-spend structural | Demote and re-promote (loses the automated/human distinction and the reason strings); a separate scheduler (a second orchestrator) |
| D2 | Publish through the existing `ai_processing → open` edge; claim is the existing `claimTask` | Reuses discovery, eligibility, contention, both database guards, file access, work sessions and delivery | New `ai_processing → claimed` edge; child task; direct assignment — see [R-03](#r-03) |
| D3 | Admission is pure, deterministic, evaluated once at compile, persisted | FR-005 replay determinism; keeps the model out of an accepted contract | Re-evaluate at each publish (a code change could flip a live run's verdict) |
| D4 | Economic admission is four booleans over frozen columns | Two reviewers reach the same verdict; expected minutes never enters | A minutes-vs-payout adequacy calculation — forbidden by FR-035 |
| D5 | Acceptance and resume are separate durable steps, joined by a unique `runId` on the resume record | Exactly-once survives a crash without a distributed transaction | Resume inside the acceptance transaction (a crash mid-step-update would leave a partial resume with no record) |
| D6 | Claim fencing is a database trigger on `Task.claimedById` | Must hold for release, admin reassign, QC repool and any future path | Bumping the generation in each action (a future path forgets) |
| D7 | Payout immutability on the admitted path is a new database trigger | The existing freeze does not cover release-and-reclaim or pre-claim | Convention in `finishAdmittedRun` alone |
| D8 | No `TaskHumanWorkPackage` on the admitted happy path; one immutable existing package may be inserted for post-resume/manual residual scope | The trigger permits one insert but freezes every later update/delete, and the unique keys permit only one package. This reuses the existing residual worker surface while FR-057 keeps payout and payee fixed | Recomputing payout; a second package/model; weakening the trigger |
| D9 | Rollout flag read only at admission | Makes FR-064 and FR-065 simultaneously true | Checking the flag in publish/resume (rollback would strand a mandate) |
| D10 | Deadlines default to 72h, frozen at admission, configurable for future units only | FR-058; expected minutes stays descriptive | Deriving a lease from expected minutes |
| D11 | Alerts deduplicated by a unique key per deadline instance | Makes the sweep replay-safe and gives SC-016 its *exactly one* | "Have we already notified?" reads, which race |
| D12 | Audit `UPDATE` refused unconditionally; `DELETE` gated behind a named session GUC used only by an as-yet-unwritten retention sweep | Satisfies append-only and keeps the retention promise keepable | Unconditional block (retention promise unkeepable); no guard (append-only false) |

---

## Residual risks carried into implementation

| Risk | Severity | Mitigation | Label |
|---|---|---|---|
| Next.js 16 surface patterns unverified against installed docs | High for UI/route files, none for the domain design | `BLOCK-NEXT-DOCS`; no new pattern proposed | `CODE` (absence measured) |
| Account-level spend hold cannot be database-guarded on this path | Medium | Structural unreachability + explicit integration assertion | `TEST` |
| A GUC-gated delete is a weaker barrier than an unconditional block | Medium | Named, audited, single caller, no purge sweep shipped in V1 | `INFERRED` |
| The `/va/tasks/[id]` page must suppress the generic brief on an admitted run or FR-014 is violated by an existing surface | High | Explicit touchpoint + `human-unit-leakage.itest.ts` | `CODE` |
| A new `BEFORE TRUNCATE` guard silently breaks the integration harness | Medium | Restated obligation in quickstart; `human-unit-schema-invariants.itest.ts` fails loudly | `CODE` |
| Demand, coverage gain, willingness to pay | Unquantifiable | Recorded as `UNKNOWN` on every surface; admission verdicts make the population countable | `UNKNOWN` |
