# Implementation Plan: HumanWorkUnit and Safe Resume v1

**Branch**: `001-human-workunit-resume` (git branch `feat/human-workunit-resume`) | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-human-workunit-resume/spec.md`; pre-plan readiness gate [checklists/readiness.md](./checklists/readiness.md) (70/70 reviewed and satisfied).

**Phase scope**: this document and its sibling design artifacts only. No application code, no migration files, no tests, no commits are produced by this phase.

---

## Summary

Today the compiler demotes every transitive descendant of a human-executed plan step to human work (`resolveTopology` rule 3, `src/lib/ai-work-engine/topology.ts:99-108`, cascaded again by `compile.ts:266-299`), and the run's only forward exit is `finishRun`, which computes a residual, writes one human package, and moves the task `ai_processing → open` (`src/server/workflow-runs.ts:1525-1730`). A plan shaped *machine → human → machine* therefore executes as *machine → human(everything after)*. `CODE`

This plan adds one narrow, reversible path that keeps every existing mechanism and replaces none of them:

1. **Admission** — a new pure function decides, from the frozen accepted contract alone, whether the plan is exactly one non-parallel human cut whose economics map one-to-one onto one accepted human plan step. Anything else keeps today's behaviour byte for byte, with a distinct recorded refusal cause.
2. **Blocking instead of demotion** — on an admitted run the compiler leaves descendants of the cut as `automated` steps in a new `blocked_on_human_unit` status. The existing in-order claim walk (`claimNextStep`) cannot claim them, so no provider reservation, hold, invocation or settlement is reachable while the unit waits. Zero-spend is structural, not policed.
3. **Publication through the existing pool** — when the pre-cut block finishes, the run publishes the unit by taking the *existing* `ai_processing → open` edge with the *accepted fixed task payout already on the row*. Discovery, eligibility, contention and the single-claimant guarantee are the existing pool and the existing `claimTask` compare-and-swap. The unit claim and the task claim are literally one act, which is what FR-011 asks for.
4. **Candidate → admin acceptance** — submissions are candidates bound to a claim generation; exactly one admin decision per candidate; acceptance writes one immutable accepted result and a durable resume intent.
5. **Safe resume** — acceptance flips the blocked steps to `pending` exactly once under a monotonic resume generation, and the existing runner drains them. A crash between acceptance and resume converges through a replay-safe sweep, because the resume record is unique per run.
6. **Admitted finish** — the admitted run finishes without residual payout recomputation or any `vaPayoutCents` rewrite. The same claimant delivers through the existing `claimed → submitted_for_qc → completed` path at the accepted fixed payout.

Everything new is behind `Settings.humanWorkUnitResumeEnabled`, default `false`, read **only** at admission.

**Commercial claims**: demand, frequency, coverage gain, willingness to pay, revenue and margin impact remain `UNKNOWN`. This plan changes nothing about that.

---

## Technical Context

**Language/Version**: TypeScript 5 (`package.json` devDependencies `typescript: ^5`), Node.js runtime for route handlers (`export const runtime = "nodejs"`, `src/app/api/cron/maintenance/route.ts:21`). `CODE`

**Primary Dependencies**: Next.js 16.2.12, React 19.2.4, Prisma 6.19.3 / `@prisma/client` 6.19.3, Zod 4.4.3, better-auth 1.6.25, Stripe 22.3.2, `@anthropic-ai/sdk` 0.115.0. `CODE`

**Storage**: PostgreSQL via Prisma. Schema `prisma/schema.prisma` (2774 lines); 32 versioned migrations under `prisma/migrations`, `prisma migrate deploy` runs in `npm run build`. `prisma db push` is forbidden by the constitution and is not used anywhere in the repo. `CODE`

**Testing**: Vitest 4.1.10. Two configs — `vitest.config.mts` (pure unit loop, `test/**/*.test.ts`, `server-only` aliased to `test/server-only.ts`) and `vitest.integration.config.ts` (`test/integration/**/*.itest.ts`, real PostgreSQL behind the six-condition guard in `test/integration/guard.ts`, schema rebuilt from the migration chain by `test/integration/global-setup.ts`, tables truncated per file by `per-file-setup.ts`). `CODE`

**Target Platform**: Vercel-hosted Next.js app + managed PostgreSQL (Neon observed in `test/integration/per-file-setup.ts` comments); Vercel Cron drives `GET /api/cron/maintenance`. `CODE`

**Project Type**: Server-rendered web application with a server-only domain core (`src/server/**`, `src/lib/**` guarded by `import "server-only"`), a compiler/runtime (`src/lib/ai-work-engine`, `src/server/workflow-runs.ts`) and a task marketplace (pool, claim, QC, payout).

**Performance Goals**: none new. The unit adds no hot path. The waiting states are quiescent by construction; `latency is a business input, not a system property to optimize in V1` (spec Assumption 11). Existing bounds are inherited: `INVOCATION_BUDGET_MS = 60s` per invocation, `LEASE_MS = 6min` per step (`src/server/workflow-runs.ts:62-65`). `CODE`

**Constraints**:
- Additive migration only; accepted-run historical semantics preserved; no reinterpretation of any existing row.
- Zero external provider reservation/hold/invocation/settlement while the unit is waiting, claimed, submitted, in review or revision-requested.
- One payable worker per task; the accepted fixed task payout is authoritative from pre-claim display through completion.
- Deny-by-default, task-and-contract-bound, classification-scoped worker projections; no worker tenant model; client UI unchanged.
- Rollout flag off by default; disabling blocks new admissions and strands nothing.

**Scale/Scope**: one human cut per run, one run per accepted contract, one worker per task. Population of mandates in the supported shape: `UNKNOWN`.

### Blocking environment limitation (recorded, not worked around)

`AGENTS.md` requires reading the installed Next.js documentation under `node_modules/next/dist/docs` before writing any Next.js code. **`node_modules/` is not installed in this working tree** — `node_modules/next` does not exist and `find node_modules/next -maxdepth 3 -type d -name docs` returns nothing. `CODE` (measured 2026-08-14)

Consequences, honoured throughout this plan:
- **No new Next.js API or UI pattern is proposed.** Every server action, route handler, cache-revalidation call and `after()` usage named below is a copy of an existing in-repo pattern with a cited file and line. Where this plan says "server action", it means the exact shape already used in `src/server/actions/va-tasks.ts` and `src/server/actions/admin-qc.ts`.
- **A hard gate is placed on the implementation phase**: before any file under `src/app/**` or any new server action is written, run `npm install` and read the relevant guides under `node_modules/next/dist/docs`. Recorded as task-phase blocker `BLOCK-NEXT-DOCS` in [research.md](./research.md#r-01).
- Nothing in this plan is asserted about Next.js 16 behaviour beyond what the repository already demonstrates in code.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Source: `.specify/memory/constitution.md` v1.0.0.*

### Initial evaluation (pre-Phase 0)

| Principle / Constraint | Verdict | Basis |
|---|---|---|
| I. Owned outcomes and continuous operations | PASS | Every state in the transition table names a resolution owner and a next action; the fail-closed table has no unowned terminal. Recurrence is out of scope, so no continuity is promised. |
| II. Truthful closed-world capability, immutable run contracts | PASS | Admission is a deterministic function of frozen contract fields; unsupported shapes fail closed to today's behaviour; the accepted contract is never mutated; human work is excluded from machine-coverage metrics (FR-047). |
| III. Authorization, privacy, financial integrity | PASS with named risk | Deny-by-default projections rechecked at point of use; no money inferred; unmappable economics refuse. **Named risk**: a new worker-facing surface is a new leak site for client price and classification, and the claim now happens mid-run. Mitigated by projection contracts + extended `test/price-wall.test.ts` + a payout-immutability trigger. |
| IV. Durable hybrid execution without human dumping | PASS with named risk | The unit is a typed capability with scoped context, structured IO, eligibility gates, deadlines, economic bounds, audit and a machine resume point. **Named risk**: this mechanism could be used to forward work wholesale while reporting automation — FR-047/SC-012 and the coverage-metric exclusion address it. |
| V. Verification, evidence, delivery are separate gates | PASS | Submission ≠ acceptance ≠ final QC ≠ delivery; schema conformance is a submission precondition only; acceptance is immutable and final QC cannot reopen it (DB trigger, not convention). |
| VI. Evidence-led coverage and sustainable economics | PASS | Feature is explicitly selected against an `UNKNOWN` demand signal and says so; scope is minimal; admission verdicts are recorded so the unsupported population becomes measurable. |
| VII. Incremental evolution and proportionate testing | PASS | Compiler, runtime, claim, lease, budget, audit, QC and residual machinery are extended, not replaced; no orchestrator introduced; test matrix covers unit, real-Postgres integration, adversarial, concurrency, replay/crash, migration and end-to-end. |
| Server-only module boundary | PASS | New runtime and query modules carry `import "server-only"`; the admission decision core is pure and importable by tests, matching `compile.ts`'s documented split. |
| Planner proposes / compiler decides | PASS | Admission reads stored plan rows only; no model call, no network, no randomness. |
| Money as integer minor units | PASS | No new money value is computed. The only money read is `Task.vaPayoutCents` (Int cents). |
| Reserve → settle-or-release, unconfigured ceiling refuses | PASS | Unchanged. Downstream steps reserve only after acceptance, against the ceiling already frozen on the snapshot. |
| Migrations versioned; no `prisma db push` | PASS | Two additive migrations planned (enum values first, then tables/constraints), following the `20260806170000_workflow_enum_values` precedent. |
| Integration tests on real PostgreSQL | PASS | New `.itest.ts` files join the existing real-Postgres suite. |
| Next.js conventions of the installed version | **BLOCKED, recorded** | `node_modules` absent — see the limitation above and `BLOCK-NEXT-DOCS`. No Next.js pattern is invented; the gate moves to the implementation phase. |

**Gate result**: PASS to proceed to Phase 0, with one recorded environment blocker that constrains the implementation phase rather than the design.

### Re-evaluation (post-Phase 1)

See [Post-design constitution re-check](#post-design-constitution-re-check) at the end of this document.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-human-workunit-resume/
├── spec.md                     # Input (existing)
├── checklists/
│   ├── requirements.md         # Existing
│   └── readiness.md            # Existing, 70/70
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/                  # Phase 1 output
│   ├── README.md
│   ├── server-actions.md
│   ├── runtime-internal.md
│   ├── projections.md
│   ├── db-invariants.md
│   └── audit-events.md
└── tasks.md                    # Phase 2 — NOT created by /speckit-plan
```

### Source code (repository root)

The repository is a single Next.js application with a server-only domain core. This feature adds files in the existing directories and modifies a bounded set of existing ones. No new top-level directory is introduced.

```text
prisma/
├── schema.prisma                                   # MODIFY — additive models, 2 enum values
└── migrations/
    ├── 20260814<hhmmss>_human_work_unit_enums/     # NEW — ALTER TYPE ... ADD VALUE only
    └── 20260814<hhmmss>_human_work_unit/           # NEW — tables, indexes, constraints, triggers

src/lib/ai-work-engine/
├── human-unit-admission.ts                         # NEW — pure admission decision + causes
├── human-unit-definition.ts                        # NEW — pure freeze of the definition from accepted rows
├── human-unit-result-schema.ts                     # NEW — pure Zod builder for the frozen output schema
├── compile.ts                                      # MODIFY — admitted mode: block instead of demote
└── topology.ts                                     # UNCHANGED — reused by admission for ancestry

src/lib/
├── human-unit-state.ts                             # NEW — pure state machine table + guards
├── worker-eligibility.ts                           # NEW — single predicate set shared by claim and read
├── settings.ts                                     # MODIFY — rollout flag + 4 frozen-default settings
└── queries/
    └── human-unit.ts                               # NEW — role-shaped projections (worker / admin)

src/server/
├── human-unit.ts                                   # NEW — publish, claim-bind, submit, decide, accept
├── human-unit-resume.ts                            # NEW — resume application + crash recovery
├── human-unit-deadlines.ts                         # NEW — replay-safe deadline/alert sweeps
├── workflow-runs.ts                                # MODIFY — admitted compile, publish, resume-aware guard, admitted finish
├── sweeps.ts                                       # MODIFY — register the new sweeps
└── actions/
    ├── human-unit-worker.ts                        # NEW — worker server actions
    ├── human-unit-admin.ts                         # NEW — admin server actions
    └── va-tasks.ts                                 # MODIFY — claim/release bind and fence the unit

src/app/
├── va/tasks/[id]/page.tsx                          # MODIFY — render the unit panel; suppress generic brief on an admitted run
├── admin/tasks/[id]/page.tsx                       # MODIFY — render the unit panel
└── api/cron/maintenance/route.ts                   # MODIFY — register the new sweeps

src/components/
├── human-work-unit-worker.tsx                      # NEW — worker unit panel + submit form
└── human-work-unit-admin.tsx                       # NEW — admin unit panel + decide form

test/                                               # NEW unit specs (see Test Matrix)
test/integration/                                   # NEW .itest.ts specs (see Test Matrix)
```

**Structure Decision**: single-project layout, unchanged. The feature is an increment inside the existing `src/lib` (pure), `src/server` (server-only side effects), `src/app` (surfaces) and `prisma` (schema) split that the repository already enforces, and it introduces no new architectural layer.

---

## Architecture

### A1. The one-cut admission decision

`admitHumanCut(steps, economics)` — pure, in `src/lib/ai-work-engine/human-unit-admission.ts`. No imports from `server-only` modules, unit-testable without a database, exactly like `compile.ts` and `topology.ts`.

Input: the frozen accepted plan rows already read by `compileWorkflowForTask` (`order`, `executor`, `primitiveId`, `primitiveVersion`, `dependsOnOrder`, `params`) plus, newly selected, `fixedMinutes`, `secondsPerUnit`, the three PERT minute columns, `title`, `description`, `verificationMethod`, `acceptanceCriteria`, `riskLevel`, `humanRole`; and the accepted economics `{ vaPayoutCents, estimatedMinutes }` from `Task`.

Verdict (deterministic, FR-005):

| Verdict | Condition |
|---|---|
| `admitted` | exactly one `executor === "human"` step; graph is acyclic; every dependency names an existing order; every other step is an ancestor or a descendant of the cut; economic mapping passes |
| `malformed_topology` | a cycle, or a dependency on a nonexistent order |
| `unsupported_topology` | zero or ≥2 human steps, or ≥1 step neither ancestor nor descendant of the cut |
| `unmapped_economics` | topology admitted but the economic mapping fails |

Economic mapping (FR-035) uses **frozen accepted-contract fields only** and never computes adequacy from expected minutes:

1. exactly one accepted human plan step exists and it is the cut;
2. `cut.fixedMinutes !== null && cut.fixedMinutes > 0` — the repository's own predicate for a *trusted* frozen effort decomposition (`src/lib/ai-work-engine/residual.ts:111`), so "non-null frozen effort provenance" is checkable and not a judgment;
3. `task.vaPayoutCents !== null && > 0 && task.estimatedMinutes !== null && > 0` — the same predicate `handoverBlockedForUnknownPayout` (`workflow-runs.ts:1481-1488`) and the `second_shift_pool_payable_guard` trigger already use for "the accepted fixed payout is known";
4. the unit definition is derived **entirely** from that step's own accepted columns, with no operator-authored additions in V1 — which is how "adds no instruction, input, output, artifact or acceptance obligation beyond that step" becomes a structural property rather than a reviewer's opinion.

Determinism is a property of the frozen contract, so re-evaluating after a restart or a redeploy returns the same verdict (FR-005). Admission is evaluated **once**, at compile time, and the verdict is persisted; nothing re-derives it later.

### A2. Compile: block, do not demote

`compileDecisions` gains an optional `humanCut?: { order: number }` gate. When present:

- the cut step compiles `executionMode: "human"` exactly as today;
- descendants of the cut that would otherwise be demoted **solely** by the `depends_on_human` cascade compile `executionMode: "automated"` and are persisted with `status: "blocked_on_human_unit"`;
- every other refusal reason still wins and still demotes. A descendant with no registered primitive, a moved primitive version, invalid frozen params, a forbidden reach, a disallowed mode, or a prior budget demotion stays human with **its own** reason preserved verbatim (FR-025, FR-038). The cascade is applied first for those reasons and only the pure human-dependency demotion is converted into blocking.

When the gate is absent — flag off, unsupported topology, unmapped economics, or a pre-feature run — `compileDecisions` behaves exactly as today, and `test/workflow-compile.test.ts` continues to pin that.

The existing in-order walk in `claimNextStep` (`workflow-runs.ts:612-654`) needs no new logic to block: it takes the first step that is neither `done` nor `handed_to_human`, and a `blocked_on_human_unit` step is not claimable, so the loop breaks and nothing runs. **This is the structural guarantee behind FR-031/SC-006**: `reserveSpend` and `reserveAccountProviderSpend` are only reachable from inside the claim loop.

### A3. Publication through the existing pool

When the pre-cut automated block is drained and the unit state is `admitted`, `advanceWorkflow` calls `publishHumanWorkUnit(runId)` instead of `finishRun`.

One transaction:

1. CAS `HumanWorkUnitRunState` `admitted → published`, stamping `publishedAt` and `publicationDeadlineAt`;
2. `transitionTask({ tx, from: "ai_processing", to: "open", action: "human_unit_published", data: {} })` — the **existing** edge, with **no** `vaPayoutCents` / `estimatedMinutes` write. The accepted quoted values written by `approvePricing` stand;
3. `writePoolNotifications(tx, ...)` with the audience resolved *before* the transaction, the split `finishRun` and `releaseToPoolWithoutAutomation` already make for the 5-second interactive-transaction limit (`workflow-runs.ts:1663-1670`);
4. one `HumanWorkUnitTransition` audit row;
5. one deadline row for the publication clock.

Refusals before the transaction, each landing the run in an admin-visible pause with a distinct cause and no publication (FR-007): a declared input is unavailable (a producing step failed permanently, or its accepted file is purged/hash-moved), or the unit's reach exceeds the most restrictive classification present in its declared inputs.

Why the existing `open` edge rather than a new `ai_processing → claimed` edge: it reuses `poolForVa`/`poolTaskForVa` (eligibility and high-value gating), `claimTask`'s advisory-locked WIP cap and null-claimant CAS, the `second_shift_pool_payable_guard` payability trigger, the payment guard, `VA_FILE_ACCESS_STATUSES`, work sessions, and the whole delivery path. A new edge would require duplicating all of it. Alternatives and their rejection are recorded in [research.md R-03](./research.md#r-03).

### A4. Claim = the task's sole worker assignment

Claiming is the **existing** `claimTask` (`src/server/actions/va-tasks.ts:37-159`) with two additive obligations folded into its existing transaction:

- after the existing `transitionTask({ from: "open", to: "claimed", guard: { claimedById: null }, ... })` succeeds, bind the unit: CAS `HumanWorkUnitRunState` `published|revision_requested → claimed` setting `claimedById`, incrementing `claimGeneration`, stamping `claimLeaseExpiresAt` and `submissionDeadlineAt`, and writing the audit row with `assignmentEstablished: true|false`;
- the task-level eligibility predicates are extracted verbatim into `src/lib/worker-eligibility.ts` so the claim path and every unit read evaluate the identical set and cannot drift.

Because the guard is `claimedById: null` on a compare-and-swap, simultaneous claims resolve to exactly one winner with exactly one assignment (FR-012, SC-002) using machinery that already exists and is already tested (`test/integration/concurrency.itest.ts`). A task that already has a different claimant is refused by the same guard (FR-011, second sentence).

**Fencing** is a database trigger, not application code, because it must hold for every path that can move a claimant — voluntary release, admin reassignment, QC-exhaustion repool, and any future one:

> `afterdesk_human_unit_fence_on_claim_change` — `AFTER UPDATE OF "claimedById" ON "Task"`: when `OLD.claimedById IS NOT NULL AND OLD.claimedById IS DISTINCT FROM NEW.claimedById` and the task has a `HumanWorkUnitRunState`, increment `claimGeneration`, clear `claimedById`/`claimLeaseExpiresAt`/`submissionDeadlineAt` on the unit, move a `claimed`/`submitted`/`in_review` state to `published` (and preserve a `revision_requested` state's consumed-revision count), and insert the transition audit row. The `OLD IS NOT NULL` guard is load-bearing: the initial `NULL → worker` assignment is generation-bumped exactly once by `bindClaimToHumanUnit`, not a second time by this fence.

Fencing and assignment clearing therefore commit atomically in the same transaction; no observer can see a cleared task assignment with an unfenced unit. Any later action carrying the superseded generation is refused (FR-013, FR-011 third sentence).

### A5. Submission, review, acceptance

- **Submit** (worker): one transaction — validate the payload against the *frozen* output schema and required artifacts (refuse with a naming message, keeping task and unit with the worker, FR-017); insert one `HumanWorkUnitCandidate` keyed `(unitStateId, claimGeneration, revisionIndex)`; CAS unit `claimed|revision_requested → submitted`; insert the audit row. Atomic by construction: a crash before commit leaves no candidate and no state change; a crash after commit leaves exactly one of each (FR-018, SC-015). A duplicate submission against an already-submitted claim generation loses the unique constraint and is reported as a duplicate.
- **Open review** (admin): CAS `submitted → in_review`, audited. Optional — a decision is legal from `submitted` or `in_review`, so an admin can never be blocked.
- **Decide** (admin): one transaction — refuse if the actor is the submitting worker (FR-019); insert `HumanWorkUnitReviewDecision` with `candidateId` unique, which is what makes a second decision a duplicate refusal with the first standing unmodified (FR-020); then either
  - **accept**: insert the single `HumanWorkUnitAcceptance` (`unitStateId` unique — one immutable acceptance per unit), CAS unit `submitted|in_review → accepted`, stamp the durable resume intent, audit;
  - **reject with revisions remaining**: CAS → `revision_requested`, decrement `remainingRevisions` by exactly one, mark the candidate `superseded`, audit;
  - **reject at the bound, or unsafe/unverifiable**: CAS → `exhausted`, audit, and hand the run to the existing manual residual handling with that cause.

The accepted result is immutable by trigger. Final QC has no code path to it and could not mutate it if it had (FR-062).

### A6. Safe resume

Acceptance and resume are **separate durable steps** with a converging recovery, which is what makes "exactly once" survive a crash:

1. acceptance commits `HumanWorkUnitAcceptance` + unit state `accepted`. That row *is* the resume intent;
2. `applyResume(unitStateId)` runs in one transaction: CAS unit `accepted → resumed` **and** `resumeGeneration` from *n* to *n+1*; insert `HumanWorkUnitResumeRecord` with `runId` unique and `acceptanceId` unique; `updateMany` the run's `blocked_on_human_unit` steps to `pending`; CAS the run `awaiting_human_unit → running`; insert the audit row. The unique `runId` is the exactly-once guarantee: a second resume attempt, from any trigger class, loses the constraint and the whole transaction rolls back with nothing changed (FR-026, FR-027, FR-029, SC-005);
3. `recoverPendingHumanUnitResumes()` — a replay-safe sweep that finds units in `accepted` with no resume record and calls `applyResume`. It is the crash-recovery path and it is idempotent for the same reason.

Refusals: a resume attempt is refused when the run has left the executing lifecycle — task `cancelled`, `expired`, `completed`, or run `abandoned` — and cannot revive it (FR-028). A run in an admin-owned pause refuses every automatic, retried, swept or replayed resume and continues only through the explicit admin continuation of FR-037, which itself is refused for a cancelled/abandoned/finished run.

After the resume the **existing** runner drains the steps. `advanceWorkflow`'s lifecycle guard (`workflow-runs.ts:833`) is widened: a run carrying an admitted unit is not abandoned when the task is `open` or `claimed`; it is still abandoned for `cancelled`/`expired`/terminal states. The reserve→settle cycle, leases, fencing, backoff, exhaustion pause and account circuit-breaker are untouched and apply verbatim, within the ceiling already frozen on the snapshot (FR-032).

### A7. Admitted finish, and the residual bypass

`finishRun` stays exactly as it is for every run that is not admitted. An admitted run finishes through `finishAdmittedRun(runId)`, which:

- **never** calls residual payout recomputation and **never** writes `Task.vaPayoutCents` or `Task.estimatedMinutes`. On the happy path it creates no `TaskHumanWorkPackage` (FR-057);
- marks the run `done`, stamps `finishedAt`, and leaves the task in `claimed` with the same claimant, who delivers through the existing `submitDeliverable` → `submitted_for_qc` → `approveDeliverable` path at the accepted fixed payout;
- when downstream automation fails permanently after the resume, `publishAdmittedResidualScope` may insert the existing `TaskHumanWorkPackage` exactly once for the same claimant. The package describes changed residual scope, but its payout-reference fields use the frozen accepted task payout; it never writes the task payout/estimate and never opens a second paid claim. The existing `BEFORE UPDATE OR DELETE` trigger freezes the package after insertion and the existing `runId`/`taskId` unique keys make replay a no-op. If the claimant is no longer eligible, the run pauses for an admin before publication (FR-045, FR-057, CHK030/CHK031).

The bypass is additionally enforced in the database so no future code path can undo it:

> `afterdesk_admitted_payout_is_frozen` — `BEFORE UPDATE ON "Task"`: if the task has a `HumanWorkUnitRunState` in any state other than a refusal state, and `NEW."vaPayoutCents" IS DISTINCT FROM OLD."vaPayoutCents"`, raise. Strictly stronger than the existing claim-time freeze, which only bites when `claimedById` is non-null on both sides.

---

## Repository touchpoints (exact)

### Modified files

| File | Change | Requirements |
|---|---|---|
| `prisma/schema.prisma` | Add 8 models; add `TaskWorkflowRunStatus.awaiting_human_unit`; add `TaskWorkflowStepStatus.blocked_on_human_unit`; add relations on `Task`, `TaskWorkflowRun`, `TaskAcceptanceSnapshot`, `TaskExecutionPlanVersion`, `TaskExecutionPlanStep`, `File`, `User` | FR-001..FR-002, FR-048, FR-063 |
| `src/lib/settings.ts` | Add `humanWorkUnitResumeEnabled` (default `false`) and 4 frozen-default settings to `Settings`, `SettingsSchema`, `DEFAULT_SETTINGS`. `getSettings` only merges keys already present in `DEFAULT_SETTINGS` (`settings.ts:260-265`), so the addition must be made in all three places | FR-058, FR-064 |
| `src/lib/ai-work-engine/compile.ts` | Optional `humanCut` gate; convert pure `depends_on_human` demotion into blocking; every other reason unchanged | FR-024, FR-025, FR-038 |
| `src/server/workflow-runs.ts:262-286` | Select the additional frozen plan columns admission needs | FR-035 |
| `src/server/workflow-runs.ts:288-356` (`compileWorkflowForTask`) | Read the flag; call `admitHumanCut`; on admission freeze the definition, create the run state, persist blocked steps and set run status `awaiting_human_unit`-eligible; on refusal record the cause and compile exactly as today | FR-003..FR-006, FR-064 |
| `src/server/workflow-runs.ts:833` (`advanceWorkflow` lifecycle guard) | Do not abandon an admitted run when the task is `open`/`claimed`; still abandon on `cancelled`/`expired` | FR-028, FR-042 |
| `src/server/workflow-runs.ts:1436-1442` (drain tail) | On an admitted run whose next incomplete step is the cut, publish instead of finishing; on an admitted run whose steps are all done, call `finishAdmittedRun` | FR-007, FR-057 |
| `src/server/workflow-runs.ts:1525` (`finishRun`) | Guard: refuse to run for an admitted run (defensive; the caller already branches) | FR-057 |
| `src/server/actions/va-tasks.ts:37-159` (`claimTask`) | Bind the unit inside the existing transaction; use the extracted eligibility predicates | FR-009, FR-011, FR-012 |
| `src/server/actions/va-tasks.ts:166-199` (`releaseTask`) | Unchanged in substance — the fencing trigger does the generation bump; add the audit cause | FR-015, FR-013 |
| `src/server/sweeps.ts` | Register `sweepHumanWorkUnitDeadlines` and `recoverPendingHumanUnitResumes` in `runOperatorSweeps` | FR-029, FR-044, FR-059 |
| `src/app/api/cron/maintenance/route.ts:59-96` | Add both sweeps to the isolated `run(...)` list and the JSON response | FR-044, FR-059 |
| `src/app/va/tasks/[id]/page.tsx` | Render the worker unit panel; on an admitted run suppress the generic brief and the raw input-file list in favour of the unit's declared projection | FR-014, FR-055, FR-061 |
| `src/app/admin/tasks/[id]/page.tsx` | Render the admin unit panel (cause, actors, deadline, revisions, safe next action) | FR-052, FR-053 |
| `test/price-wall.test.ts` | Extend the pinned projection assertions to the new worker/admin selects | FR-054, SC-014 |

### New files

| File | Role | Purity |
|---|---|---|
| `src/lib/ai-work-engine/human-unit-admission.ts` | Admission verdict + refusal causes | pure |
| `src/lib/ai-work-engine/human-unit-definition.ts` | Freeze the definition from accepted rows | pure |
| `src/lib/ai-work-engine/human-unit-result-schema.ts` | Build the frozen Zod output schema; validate a candidate against it | pure |
| `src/lib/human-unit-state.ts` | State table, allowed transitions, safe-next-action map | pure |
| `src/lib/worker-eligibility.ts` | The single eligibility predicate set | pure + a thin server-only reader |
| `src/lib/queries/human-unit.ts` | Role-shaped projections | `server-only` |
| `src/server/human-unit.ts` | Publish / bind / submit / decide / accept | `server-only` |
| `src/server/human-unit-resume.ts` | `applyResume`, `recoverPendingHumanUnitResumes` | `server-only` |
| `src/server/human-unit-deadlines.ts` | Deadline sweeps + durable alerts | `server-only` |
| `src/server/actions/human-unit-worker.ts` | Worker server actions | `"use server"` |
| `src/server/actions/human-unit-admin.ts` | Admin server actions | `"use server"` |
| `src/components/human-work-unit-worker.tsx` | Worker panel | client/server component per existing precedent |
| `src/components/human-work-unit-admin.tsx` | Admin panel | client/server component per existing precedent |

---

## Transaction boundaries

Every row below is **one** `prisma.$transaction`. The compare-and-swap is a Prisma `updateMany` whose `where` carries the expected state and the expected generations; a `count === 0` throws and rolls the whole transaction back. The audit row is inserted inside the same transaction, always (FR-050, SC-009).

| # | Operation | CAS predicate | Writes in the same transaction | Notes |
|---|---|---|---|---|
| T1 | Compile + admit | `TaskWorkflowRun` created with `snapshotId` unique | run + step rows + `HumanWorkUnitDefinition` + `HumanWorkUnitRunState` + audit `admitted` | One run per contract is already guaranteed by `snapshotId @unique`; `runId @unique` on the state gives one unit per run |
| T2 | Publish | unit `state = 'admitted'` | unit → `published`; `transitionTask ai_processing→open`; pool notifications; deadline row; audit | Audience resolved before the transaction |
| T3 | Claim (inside existing `claimTask`) | task `status='open' AND claimedById IS NULL`; unit `state IN ('published','revision_requested')` | task → `claimed` + `claimedById`; unit → `claimed`, `claimGeneration+1`, lease + submission deadline; audit with `assignmentEstablished` | Existing advisory lock on the WIP cap retained |
| T4 | Release / reassign / repool | existing task CAS | trigger bumps generation, clears unit assignment, inserts audit | Fence and clear commit atomically; initial `NULL → worker` is excluded |
| T5 | Submit | unit `state IN ('claimed','revision_requested') AND claimGeneration = :g` | candidate insert `(unitStateId, claimGeneration, revisionIndex)` unique; candidate-file links; unit → `submitted`; audit | Atomic candidate+transition+audit (FR-018) |
| T6 | Open review | unit `state='submitted'` | unit → `in_review`; audit | Optional |
| T7 | Reject, revisions remain | unit `state IN ('submitted','in_review') AND claimGeneration=:g AND remainingRevisions > 0` | decision insert (`candidateId` unique); candidate → `superseded`; unit → `revision_requested`, `remainingRevisions-1`; audit; claimant notice | Second decision loses the unique constraint |
| T8 | Reject, bound exhausted / unsafe | unit `state IN ('submitted','in_review') AND claimGeneration=:g` | decision insert; candidate → `rejected`; unit → `exhausted`; audit; admin alert; hand to existing manual residual | Zero downstream spend |
| T9 | Accept | unit `state IN ('submitted','in_review') AND claimGeneration=:g` | decision insert; acceptance insert (`unitStateId` unique, `candidateId` unique); candidate → `accepted`; unit → `accepted`; audit | Durable resume intent = the acceptance row |
| T10 | Apply resume | unit `state='accepted' AND resumeGeneration=:n` | unit → `resumed`, `resumeGeneration = n+1`; resume record insert (`runId` unique, `acceptanceId` unique); blocked steps → `pending`; run → `running`; audit | Exactly once across every trigger class |
| T11 | Deadline lapse | unit `state=:expected AND <deadline> < now()` | unit → `paused` (or generation bump for a lease lapse); alert row insert (unique key); audit; admin notification | No auto-accept, no revision consumed, no spend |
| T12 | Withdraw on lifecycle exit | unit `state NOT IN terminal` | unit → `withdrawn`; audit; candidates retained untouched | Driven by the existing cancel path |
| T13 | Admitted finish | run `status='running'` and no incomplete automated steps | run → `done`, `finishedAt`; audit | No residual, no payout write, no package |
| T14 | Publish admitted residual scope | unit `state IN ('resumed','exhausted')`; run `status IN ('running','awaiting_human_unit')`; no package exists; same claimant remains eligible | insert the one `TaskHumanWorkPackage` with frozen-payout references; run → `awaiting_human`, `finishedAt`; audit event | No task payout/estimate write, no task transition, no second claim; unique `runId`/`taskId` make replay safe. If eligibility fails, pause the run for an admin instead |

**Outside any transaction, deliberately**: pool-audience resolution (an unbounded read that pushed `finishRun` past Prisma's 5-second interactive limit — `workflow-runs.ts:1663-1670`), work-session closure (`va-tasks.ts:452-460`), `after()` recomputations, and `revalidatePath`.

---

## State transition table

`HumanWorkUnitRunState.state`. Absence of the row is `not_admitted`.

| From | To | Trigger | Actor | Guard (CAS) | Audit cause |
|---|---|---|---|---|---|
| — | `admitted` | compile of an accepted contract with the flag on and a passing verdict | system | `TaskWorkflowRun.snapshotId` unique, `runId` unique | `admitted` |
| — | *(no row)* | refusal | system | — | `not_admitted:unsupported_topology` \| `not_admitted:malformed_topology` \| `not_admitted:unmapped_economics` recorded on the run + `TaskEvent` |
| `admitted` | `published` | pre-cut block drained, inputs available, classification permits | system | state = `admitted` | `published` |
| `admitted` | `paused` | declared input unavailable, or classification conflict | system → admin | state = `admitted` | `paused:input_unavailable` \| `paused:classification_conflict` |
| `published` | `claimed` | eligible approved worker claims the task | worker | task `claimedById IS NULL`, state = `published` | `claimed` (`assignmentEstablished: true`) |
| `published` | `paused` | publication deadline lapses with no claim | sweep → admin | state = `published`, deadline past | `paused:publication_deadline` |
| `published` | `withdrawn` | lifecycle exit | admin/system | state ≠ terminal | `withdrawn:lifecycle_exit` |
| `claimed` | `submitted` | worker submits a schema-valid candidate | worker | state = `claimed`, generation matches | `submitted` |
| `claimed` | `published` | voluntary release / admin reassign / repool | worker/admin | trigger on `Task.claimedById` change | `released` \| `reclaimed` (generation +1) |
| `claimed` | `paused` | submission deadline lapses | sweep → admin | state = `claimed`, deadline past | `paused:submission_deadline` |
| `submitted` | `in_review` | admin opens the review | admin | state = `submitted` | `review_opened` |
| `submitted`/`in_review` | `accepted` | admin accepts | admin (≠ submitter) | state, generation | `accepted` |
| `submitted`/`in_review` | `revision_requested` | admin rejects, `remainingRevisions > 0` | admin (≠ submitter) | state, generation, counter | `revision_requested` |
| `submitted`/`in_review` | `exhausted` | admin rejects at the bound, or judges unsafe/unverifiable | admin (≠ submitter) | state, generation | `exhausted:revisions` \| `exhausted:unsafe` |
| `revision_requested` | `submitted` | same claimant resubmits | worker | state, generation | `submitted` |
| `revision_requested` | `published` | release / reassign | worker/admin | trigger | `released` (counter preserved) |
| `revision_requested` | `paused` | deadline lapses with no eligible reclaim | sweep → admin | state, deadline past | `paused:submission_deadline` (counter unchanged) |
| `accepted` | `resumed` | resume applied | system | state = `accepted`, `resumeGeneration = n` | `resumed` |
| `accepted` | `paused` | accepted result would exceed the reserved payout or the frozen ceiling before resume | system → admin | state = `accepted` | `paused:economics` |
| `paused` (`economics_exceeds_reserved`) | `accepted` | explicit recorded admin continuation within the unchanged frozen ceiling | admin | state = `paused`, matching cause, run not cancelled/abandoned/finished | `admin_continued` |
| `paused` (any other cause) | `exhausted` | explicit recorded fail-closed-to-manual decision | admin | state = `paused`, run not cancelled/abandoned/finished | `admin_failed_closed` |
| any non-terminal | `withdrawn` | cancellation, abandonment, completion of the mandate | admin/system | state ≠ terminal | `withdrawn:lifecycle_exit` |

**Terminal**: `resumed` (success), `exhausted`, `withdrawn`. `paused` is admin-owned and non-terminal. Every non-terminal state has a named owner and a safe next action (FR-046, FR-052, SC-011).

---

## Authorization matrix

Deny-by-default. Every cell is enforced in the server-side data access path (`where` clauses in `src/lib/queries/human-unit.ts`), not by hiding UI. Full field-level projections are in [contracts/projections.md](./contracts/projections.md).

| Action | CLIENT | Approved worker, not claimant | Claimant (current generation) | Claimant (superseded generation) | ADMIN | Submitting worker acting as reviewer |
|---|---|---|---|---|---|---|
| See the task in the pool | — (client UI unchanged) | yes, existing `poolForVa` gating | n/a | n/a | yes | n/a |
| Read the unit definition + declared inputs | **no** | **no** | yes, minimum projection | **no** | yes | n/a |
| Claim | **no** | yes (existing `claimTask`) | already holds | **no** | **no** | n/a |
| Submit / revise | **no** | **no** | yes, states `claimed`/`revision_requested` | **no**, refused as stale | **no** | n/a |
| Release | **no** | **no** | yes (existing `releaseTask`) | **no** | reassign only | n/a |
| Read candidate content | **no** | **no** | own candidate, read-only while under review | **no** | yes, classification-scoped | n/a |
| Open review / decide | **no** | **no** | **no** | **no** | yes | **refused and recorded** (FR-019) |
| Read accepted result | **no** | **no** | status value only (FR-061) | **no** | yes | n/a |
| Read the audit trail | **no** | **no** | **no** | **no** | yes | n/a |
| Continue a paused run | **no** | **no** | **no** | **no** | yes, explicit + recorded | n/a |
| See the client price | **never** (own price only) | **never** | **never** | **never** | yes | n/a |
| See the worker payout | **never** | pool value = accepted fixed payout | same value, frozen | n/a | yes | n/a |

Rechecked at every point of use, inherited from nothing (FR-009): approved-VA status (`requireApprovedVa` reads `VaProfile.status` on every call — `authz.ts:144-152`), category certification when enabled, tier/score/rated-count gate, prior-rejection exclusion, WIP cap, unit↔task↔contract binding, active claim holder **and** claim generation, and the classification projection. A change to the platform eligibility configuration affects only units admitted afterwards, because the eligibility snapshot is frozen on the definition; a change to the individual worker's own facts affects live access, because those are read fresh.

---

## Migration, backfill and rollback policy

**Two additive migrations, in order** (following `20260806170000_workflow_enum_values` → `20260806170100_workflow_execution`, which exists precisely because Postgres refuses to use an enum value in the transaction that adds it):

1. `2026xxxx_human_work_unit_enums` — `ALTER TYPE "TaskWorkflowRunStatus" ADD VALUE IF NOT EXISTS 'awaiting_human_unit';` and `ALTER TYPE "TaskWorkflowStepStatus" ADD VALUE IF NOT EXISTS 'blocked_on_human_unit';` and the new enum types. `IF NOT EXISTS` is mandatory here — every enum migration in this repo uses it so a replayed deploy or a `migrate resolve` does not fail.
2. `2026xxxx_human_work_unit` — new tables, indexes, unique constraints, check constraints and triggers.

**Backfill: none, and that is a decision, not an omission.** No historical row is read, rewritten or reinterpreted. Every new table is empty; every existing run has no `HumanWorkUnitRunState`, which is exactly `not_admitted`, which is exactly today's behaviour. Reconstructing a definition or an admission verdict for a historical run would invent provenance — the same rule that made `maxCostMicrosPerAttemptAtQuote` deliberately nullable and never retro-filled (`schema.prisma:1641-1644`). `CODE`

**Forward correctness**: the new enum values are additive; no existing value changes meaning; no column is dropped, renamed or re-typed; no existing trigger function is replaced. The two new `Task` triggers are new functions with new names, so `CREATE OR REPLACE` cannot silently delete a clause from an existing guard — the exact failure recorded in `20260806170200_workflow_guards/migration.sql:37-44`.

**Rollback**:

| Level | Action | Effect |
|---|---|---|
| Operational (expected path) | set `humanWorkUnitResumeEnabled = false` | New admissions stop immediately; already-admitted and waiting runs still reach acceptance, rejection or a named admin-owned fail-closed state; no mandate or claimant is stranded (FR-065, SC-013) |
| Code | revert the application deploy, keep the migration | New tables are inert; runs already admitted keep their rows and are resolved by an admin through the existing task paths (release/reassign/cancel) — this is the degraded path and it must be exercised in the test matrix |
| Schema | a down-migration dropping the tables | **Not offered while any `HumanWorkUnitRunState` exists.** Dropping them would destroy audit and acceptance evidence, which the constitution forbids. Recorded as a deliberate one-way door |

**Deploy order**: migration first (`npm run build` already runs `prisma migrate deploy`), flag off. Enable per-environment only after the integration suite passes against a real PostgreSQL instance.

---

## Observability and alerting

**Audit** — `HumanWorkUnitTransition` is the primary record: actor, timestamp, source state, target state, cause, claim generation, resume generation, and whether the task assignment was established or matched (FR-048). Append-only through normal product and operator paths by trigger (FR-063). It carries **no** money value, credential, raw input, submitted content, worker or client identity-bearing text, or material belonging to another task, client or contract (FR-049) — enforced by a column set that has nowhere to put them and pinned by test.

**Mirror to `TaskEvent`** for the surfaces that already render it generically (`src/app/admin/tasks/[id]/page.tsx` maps every `TaskEvent`): `human_unit_admitted`, `human_unit_not_admitted`, `human_unit_published`, `human_unit_claimed`, `human_unit_released`, `human_unit_submitted`, `human_unit_accepted`, `human_unit_rejected`, `human_unit_exhausted`, `human_unit_resumed`, `human_unit_paused`, `human_unit_withdrawn`. **None** of these is added to `CLIENT_TIMELINE_LABELS` (`src/lib/queries/tasks.ts:636`), which is a whitelist — an event must be named there to reach a client, so adding audit rows cannot publish anything (FR-061). A test pins the client whitelist against the new action names.

**Alerts** — durable, through the existing `Notification` table and `deliverPendingNotifications` (`src/server/notifications.ts`), which the cron already drains. One alert per deadline instance, deduplicated by a unique key on the alert row rather than by "have we sent this yet", which is what makes the sweep replay-safe and gives SC-016 its *exactly one* (FR-059).

**Queryable aggregates** for the admin surface, so a waiting run cannot age invisibly: waiting age by state, revisions remaining, applicable deadline, refusal cause, and the admission-verdict population — the latter being the first real evidence toward the currently `UNKNOWN` demand question.

**Coverage metrics** — human work through this path is excluded from machine-coverage and Work-Compiler-coverage reporting (FR-047). `machineContribution` (`src/lib/ai-work-engine/machine-contribution.ts`) already measures cost share with explicit `planned`/`measured` provenance and never counts human work as machine; nothing in this feature feeds it a new number.

---

## Test matrix

Every row names its evidence label. Nothing here is `OBSERVED`; this is a pre-production plan.

### Unit (`test/*.test.ts`, pure loop, no database) — `TEST`

| Spec | Covers |
|---|---|
| `human-unit-admission.test.ts` | one/zero/many human steps; parallel branch; cycle → `malformed_topology`; dangling dependency → `malformed_topology`; ancestor/descendant closure; determinism across repeated evaluation and shuffled input order (FR-003, FR-005, SC-013) |
| `human-unit-economics.test.ts` | `fixedMinutes` null/zero → `unmapped_economics`; absent or non-positive `vaPayoutCents`/`estimatedMinutes` → `unmapped_economics`; expected minutes is never an input to the verdict (FR-035, FR-058) |
| `human-unit-state.test.ts` | the full transition table; every illegal pair refused; every non-terminal state yields exactly one safe next action (FR-046, FR-052, SC-011) |
| `human-unit-result-schema.test.ts` | frozen schema conformance; missing required artifact refused with a naming message; conformance is never treated as correctness (FR-017, CHK040) |
| `workflow-compile.test.ts` (extended) | admitted mode blocks only the pure human-dependency cascade; every other refusal reason still demotes and is preserved verbatim (FR-024, FR-025, FR-038) |
| `worker-eligibility.test.ts` | the extracted predicate set matches the predicates `claimTask` applies today, field for field |
| `settings.test.ts` (extended) | flag defaults to `false`; a malformed override falls back to the reviewed default (FR-064) |

### Integration, real PostgreSQL (`test/integration/*.itest.ts`) — `TEST`

| Spec | Covers |
|---|---|
| `human-unit-lifecycle.itest.ts` | machine → human → machine end to end; each eligible downstream step executes exactly once; accepted contract compared field-for-field and byte-for-byte before and after (SC-001, SC-008) |
| `human-unit-schema-invariants.itest.ts` | every constraint and trigger in [contracts/db-invariants.md](./contracts/db-invariants.md) rejects its violation: second unit per run, second resume per run, second acceptance per unit, second decision per candidate, generation decrement, audit UPDATE/DELETE, accepted-result mutation, payout change on an admitted task |
| `human-unit-concurrency.itest.ts` | N simultaneous claims → exactly one winner and exactly one assignment; duplicate submissions; two admins deciding simultaneously; stale-generation submit after reassignment refused as stale (SC-002, SC-005) |
| `human-unit-replay.itest.ts` | crash injected immediately before and after candidate commit → zero or one candidate with one matching audit row, never a partial state; crash between acceptance and resume → recovery sweep converges on exactly one resume (SC-015, FR-029) |
| `human-unit-zero-spend.itest.ts` | across publication, claim, submission, review and revision-requested: zero `WorkflowBudgetHold`, zero `AccountProviderSpendHold`, zero `TaskToolInvocation` rows attributable to the run, and no provider client constructed (SC-006, FR-031) |
| `human-unit-payout.itest.ts` | the payout shown pre-claim equals the payout at claim equals the payout at completion; the residual computation is never entered on an admitted run; exactly one `Payout` row and one payee (SC-003, SC-004, FR-057) |
| `human-unit-authorization.itest.ts` | adversarial: non-approved worker, wrong category/tier, prior-rejection exclusion, non-claimant, superseded generation, withdrawn approval mid-flight, cross-task and cross-contract id guessing — all refused at the point of use, in every lifecycle state and data classification (SC-014) |
| `human-unit-leakage.itest.ts` | worker projections contain no undeclared field, no client price, no cross-task material, no credentials, no post-acceptance unit inputs or candidate content; client projections contain no worker payout; no worker decision depends on client-tenant membership (SC-014, FR-054) |
| `human-unit-deadlines.itest.ts` | each deadline lapse produces exactly one durable admin alert, zero auto-acceptance, zero revision consumption and zero provider spend; the sweep is idempotent under repeated and concurrent invocation (SC-016, FR-044, FR-059) |
| `human-unit-rollout.itest.ts` | flag off → every mandate behaves exactly as today, including one in the supported shape; disabling mid-flight → zero new admissions while every already-admitted run still reaches acceptance, rejection or a named admin-owned state (SC-013, FR-065) |
| `human-unit-history.itest.ts` | migration applied to a database holding pre-feature runs: every existing run, package, payout and audit record reads identically before and after; no historical run is admitted retroactively |
| `human-unit-final-qc.itest.ts` | a final-quality rejection leaves the accepted result, the resume record and completed downstream executions unchanged and identifies the same claimant or an explicit authorized reassignment (SC-017, FR-062) |
| `human-unit-fail-closed.itest.ts` | unsupported topology, malformed topology, unmapped economics, unavailable input, classification conflict, exhausted revisions and lifecycle exit each land in the existing manual residual path or an admin-visible pause with a named cause, zero unauthorized downstream budget, and never a missing-capability or budget-demotion label (SC-007, FR-053, FR-038) |
| `cron-entrypoint.itest.ts` (extended) | the real cron entry point invokes both new sweeps and isolates their failures |

### Cross-cutting

- `test/price-wall.test.ts` — extended to pin the new worker and admin selects, in the same source-slicing style it already uses for `releaseTask`.
- `test/client-timeline.test.ts` — extended to assert that no `human_unit_*` action appears in `CLIENT_TIMELINE_LABELS`.
- `test/data-isolation.test.ts` — extended to the new tables.
- **Not merged on unit tests alone.** This change touches a security boundary, a money path and a run contract; the constitution forbids it, and the integration rows above are the gate.

---

## Complexity Tracking

No constitution violation requires justification. The two entries below are added abstractions that the constitution's complexity rule asks to be justified by measured risk reduction, and they are recorded here for review.

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| 9 new tables rather than columns on `TaskWorkflowRun` | The spec requires the frozen definition, live state, candidate revisions, declared candidate artifacts, one immutable acceptance, review decisions, the resume record, transition audit, and deadline/notification facts to be separable; several need their own uniqueness (`runId`, `candidateId`, `unitStateId`) and their own immutability triggers, which columns on a shared row cannot carry | Columns on `TaskWorkflowRun` would put mutable live state on the same row as an immutable acceptance and would make "one acceptance per unit" and "one resume per run" unenforceable at the database level, which is precisely where the constitution requires them |
| A GUC-gated delete on the audit and candidate tables | FR-041 requires candidate payloads to be retained under the authorized retention policy, and FR-063 requires the trail never to change through an update or ad hoc delete. A blanket `no delete` makes the retention promise unkeepable; an ungated delete makes the append-only promise false | An unconditional block would leave candidate payloads outside any purge policy; an application-level convention would be exactly the bypass the constitution says must be backed at the database level |
| A second `Task` trigger for payout immutability | The existing freeze only fires when `claimedById` is non-null on both OLD and NEW, so a release-and-reclaim cycle can still move `vaPayoutCents`. On the admitted path the payout must be frozen from admission, not from claim | Relying on `finishAdmittedRun` not writing the column is a convention a future code path can break silently, and the failure is invisible until a worker is paid a different amount than they accepted |

---

## Post-design constitution re-check

Re-evaluated against the artifacts produced in Phase 1 ([data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)).

| Principle / Constraint | Verdict | What the design does |
|---|---|---|
| I. Owned outcomes | PASS | Every state in the transition table has a resolution owner and a safe next action; `paused` is explicitly admin-owned; no terminal state is unowned |
| II. Immutable run contracts | PASS | The accepted contract is read, never written; the definition, the acceptance, the decisions, the resume record and the audit are immutable by trigger; admission is deterministic over frozen fields |
| III. Authorization, privacy, financial integrity | PASS | Projection contract is deny-by-default and field-enumerated; rechecks at point of use with no inherited trust; price and payout stay in separate projections; no money is inferred, derived or split; the unmappable case refuses; audit carries no sensitive payload; the payout is frozen by a database trigger, not by convention |
| IV. Durable hybrid execution | PASS | Typed unit, scoped context, structured IO, leases and generations with fencing at the database level, replay-safe sweeps, an explicit machine resume point, and an explicit exclusion from coverage claims |
| V. Separate gates | PASS | Submission, admin acceptance, final QC and delivery are four distinct events with distinct preconditions; schema conformance is a submission precondition expressed as a requirement; the acceptance is immutable so final QC structurally cannot reopen it |
| VI. Evidence-led coverage | PASS | The `UNKNOWN` demand signal is carried forward unchanged; the admission-verdict record is designed to make the unsupported population measurable |
| VII. Incremental evolution, proportionate testing | PASS | No rewrite, no orchestrator, no new architectural layer; two additive migrations; no historical row reinterpreted; the test matrix covers all seven categories the constitution names |
| Fail-closed defaults | PASS | Flag off by default; absent ceiling still refuses spend; unknown verdict refuses; unavailable input refuses publication; classification conflict refuses publication |
| Next.js conventions of the installed version | **BLOCKED, unchanged** | `node_modules` absent. No new pattern proposed; `BLOCK-NEXT-DOCS` gates the implementation phase |

**Gate result**: PASS. One recorded environment blocker (`BLOCK-NEXT-DOCS`) carries into Phase 2. No exception is requested and none is needed: the blocker constrains when code may be written, not what the design asserts.

**Open items carried into `/speckit-tasks`**: the fifteen research questions in [research.md](./research.md) are resolved or explicitly retained as `UNKNOWN`; three of them (`R-01` Next.js docs, `R-08` account-level hold has no run identity, `R-09` candidate-payload retention) impose obligations on the implementation phase and are restated at the top of [quickstart.md](./quickstart.md).
