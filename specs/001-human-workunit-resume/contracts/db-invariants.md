# Contract: Database Invariants

**Parent**: [README.md](./README.md) | **Entities**: [../data-model.md](../data-model.md)

The constitution requires that *"invariants the application claims MUST be backed at the database level (constraints, triggers) wherever a bypass would be unrecoverable."* Each row below names the invariant, why its violation is unrecoverable, and the mechanism.

**Repository rules this contract follows** (`CODE`):

- New guards are **new functions with new names**. `CREATE OR REPLACE` replaces the whole body, so a clause omitted is a clause deleted — this repository lost the standing-capacity guard exactly that way and documented it (`20260806170200_workflow_guards/migration.sql:37-44`).
- Enum values are added in their own earlier migration with `ADD VALUE IF NOT EXISTS` (`20260806170000_workflow_enum_values/migration.sql`).
- Only built-in PostgreSQL functions, so the same migration runs on managed Postgres and the local development cluster (`20260730001000_integrity_triggers/migration.sql:1-3`).
- Trigger bodies use `$$` quoting, which the integration harness's SQL splitter handles (`test/integration/global-setup.ts:25-116`).

---

## 1. Unrecoverable-if-violated (database-enforced)

| ID | Invariant | Mechanism | Unrecoverable because | Requirement |
|---|---|---|---|---|
| `INV-1` | One human unit per run | `HumanWorkUnitRunState.runId @unique` | A second unit means a second waiting state and a second resume path on one contract; there is no way to decide afterwards which one was authoritative | FR-008 |
| `INV-2` | One unit per accepted contract | `HumanWorkUnitRunState.snapshotId @unique` | Same, stated at the contract level, matching `TaskWorkflowRun`'s deliberate double `snapshotId`/`taskId` uniqueness | FR-008 |
| `INV-3` | **One resume per run** | `HumanWorkUnitResumeRecord.runId @unique` | A second resume can run a downstream step twice and spend twice against a frozen ceiling. Money already left the building | FR-026, FR-029, SC-005 |
| `INV-4` | One immutable acceptance per unit | `HumanWorkUnitAcceptance.unitStateId @unique` + `afterdesk_human_unit_acceptance_immutable` on `UPDATE`/`DELETE`/`TRUNCATE` | A mutated accepted result silently changes what downstream steps consumed and what was delivered; the original is gone | FR-023, FR-040, FR-062 |
| `INV-5` | Exactly one decision per candidate | `HumanWorkUnitReviewDecision.candidateId @unique` + append-only trigger | Two decisions on one candidate make "which decision stood" unanswerable after the fact | FR-020 |
| `INV-6` | Generations are monotonic | `afterdesk_human_unit_generations_monotonic` on `UPDATE` | A generation that can go backwards is not a fencing token: a superseded actor becomes current again and a stale submission is accepted | FR-013, FR-027 |
| `INV-7` | The audit trail is append-only | `afterdesk_human_unit_transition_append_only` — `UPDATE` refused unconditionally, `DELETE` only under the retention GUC, `TRUNCATE` refused | An editable audit trail is not evidence; the thing it recorded cannot be recovered | FR-050, FR-063 |
| `INV-8` | Decisions and resume records are append-only | `afterdesk_human_unit_decision_append_only`, `afterdesk_human_unit_resume_append_only` | Same | FR-020, FR-051, FR-063 |
| `INV-9` | The definition is immutable | `afterdesk_human_unit_definition_immutable` on `UPDATE`/`DELETE` | A mutated definition retroactively changes what a worker was asked to do and what a reviewer judged against | FR-001, FR-006 |
| `INV-10` | A candidate is immutable except for a one-way status change | `afterdesk_human_unit_candidate_append_only`; `DELETE` only under the retention GUC | Rewriting a candidate destroys the evidence of what was actually submitted | FR-041 |
| `INV-11` | At most one pending candidate per unit | partial unique index `WHERE "status" = 'pending'` | Two undecided candidates make the review queue ambiguous — the idiom `Dispute_one_pending_per_task` already uses | FR-018 |
| `INV-12` | **The payout is frozen from admission** | `afterdesk_admitted_payout_is_frozen` on `Task` UPDATE | A worker paid a different amount than the one they accepted. The existing freeze only fires when `claimedById` is non-null on both sides, so a release-and-reclaim cycle can still move it | FR-034, FR-036, FR-057, SC-004 |
| `INV-13` | The unit's claimant is the task's claimant | `afterdesk_human_unit_claimant_matches_task` on INSERT/UPDATE | Divergence is a second engagement in all but name, and the payee becomes ambiguous | FR-011, FR-033 |
| `INV-14` | **A prior claimant change fences atomically with clearing** | `afterdesk_human_unit_fence_on_claim_change`, `AFTER UPDATE OF "claimedById" ON "Task"`, guarded by `OLD."claimedById" IS NOT NULL AND OLD."claimedById" IS DISTINCT FROM NEW."claimedById"` | A stale holder submitting after reassignment gets merged or accepted. Excluding initial `NULL → worker` prevents a double generation bump; the trigger and task update commit atomically | FR-011, FR-013 |
| `INV-15` | No run-level provider reservation while the unit waits | `afterdesk_human_unit_no_spend_while_waiting` on `WorkflowBudgetHold` INSERT | Spend that left the platform cannot be un-made by a check that runs afterwards — the ordering rule `workflow-runs.ts:1024-1035` already states | FR-031, SC-006 |
| `INV-16` | A terminal unit state never reopens | `afterdesk_human_unit_state_is_terminal_once` | Reopening `resumed`, `exhausted` or `withdrawn` would re-run downstream work or revive a withdrawn mandate | FR-028, FR-042 |
| `INV-17` | The decider is not the submitter | `afterdesk_human_unit_decider_is_not_submitter` on INSERT | Self-acceptance turns a candidate into a contract input with no independent gate — a collapse of Principle V that no later audit can undo | FR-019 |

## 2. Check constraints

| ID | Constraint |
|---|---|
| `CHK-1` | `HumanWorkUnitRunState`: `"remainingRevisions" >= 0` |
| `CHK-2` | `HumanWorkUnitDefinition`: `"revisionBound" >= 0 AND "expectedMinutes" >= 0` |
| `CHK-3` | `HumanWorkUnitDefinition`: all three deadline-hour columns `> 0` — a zero deadline is an unbounded wait, not a fast one |
| `CHK-4` | `HumanWorkUnitRunState`: `"state" NOT IN ('accepted','resumed') OR "acceptedAt" IS NOT NULL` |
| `CHK-5` | `HumanWorkUnitAlert`: `@@unique([unitStateId, kind, dueAt])` — the replay-safety mechanism for the deadline sweep (SC-016) |
| `CHK-6` | `HumanWorkUnitCandidate`: `@@unique([unitStateId, claimGeneration, revisionIndex])` — a duplicate submission cannot create a second candidate (FR-018) |

## 3. Deliberately **not** database-enforced

| Property | Why not | How it is covered instead |
|---|---|---|
| Zero account-level provider spend while waiting | `AccountProviderSpendHold` carries no run or task identity; the run appears only as a substring of a composite `operationKey`. A trigger parsing that string would couple the guard to a key format free to change | Structural unreachability (the reservation call site sits inside the claim loop, and a blocked step is never claimable) + an explicit assertion in `human-unit-zero-spend.itest.ts`. Labelled `TEST`, not `CODE` — [../research.md#r-08](../research.md#r-08) |
| "The worker sees only declared fields" | A projection is a query shape, not a row property | Enumerated projection contract + `price-wall.test.ts` pinning + `human-unit-leakage.itest.ts` |
| "The admission verdict is deterministic" | A property of a pure function | Unit tests over shuffled input and repeated evaluation |
| "No audit row contains a forbidden value" | Partly a shape property, partly a discipline | The audit table has **no column able to hold** a money value, a credential, submitted content or a cross-task reference (`INV-T3`), plus a test |

## 4. Migration obligations

1. **Two migrations, in order.** `..._human_work_unit_enums` (`ALTER TYPE ... ADD VALUE IF NOT EXISTS` for `TaskWorkflowRunStatus.awaiting_human_unit` and `TaskWorkflowStepStatus.blocked_on_human_unit`, plus the new enum types), then `..._human_work_unit` (tables, indexes, constraints, triggers). Postgres refuses to use an enum value in the transaction that adds it.
2. **No `prisma db push`**, ever. `npm run build` already runs `prisma migrate deploy`.
3. **No backfill.** Every existing run has no unit row, which is `not_admitted`, which is today's behaviour. Reconstructing a definition or a verdict for a historical run would invent provenance — the rule that made `maxCostMicrosPerAttemptAtQuote` deliberately nullable and never retro-filled.
4. **No existing trigger function is replaced.** Every guard here is a new function with a new name.
5. **`TRUNCATE` guards must be registered in the test harness.** Any table given a `BEFORE TRUNCATE` guard must be added to `TRUNCATE_GUARDED_TABLES` in `test/integration/per-file-setup.ts:55-59`, or the whole integration suite breaks on the next file. This applies to at least `HumanWorkUnitAcceptance` and `HumanWorkUnitTransition`. Easy to miss, loud when missed.
6. **The retention GUC** `afterdesk.retention_purge` is read with `current_setting('afterdesk.retention_purge', true)`, whose second argument returns `NULL` instead of raising when the setting is unset — so the default is refusal.
7. **Down-migration**: not offered while any `HumanWorkUnitRunState` exists. Dropping the tables would destroy acceptance and audit evidence. Rollback is the flag, then the code deploy — never the schema. Recorded as a deliberate one-way door.

## 5. What `human-unit-schema-invariants.itest.ts` must prove

One test per row of §1 and §2, each asserting that the **violation is rejected by the database**, against a real PostgreSQL instance that commits for real — because these are exactly the constraint triggers and partial indexes a rolled-back transaction would never exercise (`vitest.integration.config.ts:4-18`).
