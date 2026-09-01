# Phase 1 Data Model: HumanWorkUnit and Safe Resume v1

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

**Status**: design artifact. No Prisma model, migration or SQL file is created by this phase. Field names, types and constraint names below are the contract the implementation phase must honour; the SQL fragments are illustrative of intent, not files to copy.

**Conventions inherited from the repository** (`CODE`): `String @id @default(cuid())`; money as integer minor units only; microdollar amounts as `BigInt`; Postgres identifiers quoted and PascalCase; trigger functions prefixed `second_shift_` (legacy) or `afterdesk_` (recent — `20260810200000_file_and_data_foundation`), and new guards are always **new functions with new names**, never a `CREATE OR REPLACE` of an existing one.

---

## 1. Entity map

```text
TaskAcceptanceSnapshot (existing, immutable)
   └─ TaskWorkflowRun (existing, one per snapshot)
        ├─ TaskWorkflowStepRun (existing; a descendant of the cut may now be `blocked_on_human_unit`)
        └─ HumanWorkUnitRunState ........................ 1:1 with the run  ← the live state
             ├─ definition → HumanWorkUnitDefinition ..... N:1, frozen with the plan version
             ├─ HumanWorkUnitCandidate ................... 1:N, append-only revisions
             │     └─ HumanWorkUnitCandidateFile ......... N:M to File (declared artifacts)
             ├─ HumanWorkUnitReviewDecision .............. 1:N, exactly one per candidate
             ├─ HumanWorkUnitAcceptance .................. 0..1, immutable
             ├─ HumanWorkUnitResumeRecord ................ 0..1, one per run
             ├─ HumanWorkUnitTransition .................. 1:N, append-only audit
             └─ HumanWorkUnitAlert ....................... 1:N, deadline / notification facts

Task (existing)
   ├─ claimedById ......... the single worker assignment; the unit mirrors and is fenced by it
   └─ vaPayoutCents ....... the accepted fixed task payout; frozen from admission by a new trigger
```

**Why the definition is separate from the state**: the definition belongs to an accepted plan version and must be identical for every reader forever; the state belongs to one run and changes on every transition. Putting them on one row would make "frozen" and "mutable" the same object, and would make the definition's immutability trigger impossible to write.

**Why the acceptance is its own table**: it must be immutable, unique per unit, and structurally unreachable by the final-QC path (FR-062). A nullable column on the state row could be updated by any writer that touches the state.

---

## 2. New enum values on existing types

| Type | New value | Meaning |
|---|---|---|
| `TaskWorkflowRunStatus` | `awaiting_human_unit` | The machine block up to the cut is complete; the run waits on the human unit. Distinct from `awaiting_human`, which means *terminal handover of everything remaining* and must keep its current meaning for every historical run. |
| `TaskWorkflowStepStatus` | `blocked_on_human_unit` | An `automated` step downstream of the cut that is not yet runnable. Not claimable: `claimNextStep` breaks at it. |

Both are added in their own migration with `ADD VALUE IF NOT EXISTS`, per [research R-11](./research.md#r-11).

**Historical meaning is preserved**: no existing value changes; a pre-feature run has neither new value; `awaiting_human` continues to mean exactly what it meant.

---

## 3. New enum types

| Type | Values |
|---|---|
| `HumanWorkUnitState` | `admitted`, `published`, `claimed`, `submitted`, `in_review`, `revision_requested`, `accepted`, `resumed`, `exhausted`, `paused`, `withdrawn` |
| `HumanWorkUnitRefusalCause` | `unsupported_topology`, `malformed_topology`, `unmapped_economics`, `input_unavailable`, `classification_conflict`, `task_already_claimed`, `revisions_exhausted`, `publication_deadline`, `submission_deadline`, `claim_lease_expired`, `lifecycle_exit`, `unsafe_or_unverifiable`, `economics_exceeds_reserved` |
| `HumanWorkUnitCandidateStatus` | `pending`, `accepted`, `rejected`, `superseded`, `withdrawn` |
| `HumanWorkUnitDecisionOutcome` | `accepted`, `rejected` |
| `HumanWorkUnitAlertKind` | `publication_deadline`, `submission_deadline`, `claim_lease`, `admin_pause`, `revision_requested`, `withdrawn` |
| `HumanWorkUnitTransitionActorRole` | `worker`, `admin`, `system` |

`HumanWorkUnitRefusalCause` is deliberately **disjoint** from any capability or budget vocabulary. No value of it may ever be rendered as a missing capability or a budget decision (FR-038, FR-053, [research R-13](./research.md#r-13)).

---

## 4. `HumanWorkUnitDefinition` — the frozen definition

One row per admitted human plan step. Written inside the compile transaction; never mutated.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `planVersionId` | `String` | FK → `TaskExecutionPlanVersion`, `onDelete: Restrict` |
| `planStepId` | `String @unique` | FK → `TaskExecutionPlanStep`, `onDelete: Restrict`. Unique ⇒ one definition per accepted step; a new definition requires a new plan version (FR-006) |
| `instructions` | `String` | Copied from the accepted step's `title` + `description`, sanitised by the existing worker-copy sanitiser |
| `declaredInputs` | `Json` | Ordered array of typed refs: `{ kind: "payload_field" \| "snapshot_file" \| "artifact", ref: string, label: string, dataClass: string }`. **This array is the whole of what the worker may see** (FR-014) |
| `outputSchema` | `Json` | The frozen JSON-schema-shaped description the candidate must satisfy; compiled to Zod at read time by a pure module |
| `requiredArtifactKinds` | `String[]` | Declared artifacts the candidate must carry |
| `acceptanceCriteria` | `String[]` | Copied from the accepted step's `acceptanceCriteria` |
| `verificationMethod` | `String` | Copied from the accepted step |
| `eligibility` | `Json` | Frozen snapshot: `{ categorySlug, tier, requireCategoryCertification, highValueThreshold, minRatedDeliveries, maxActiveClaims }`. **Criteria are frozen; worker facts are read live** (FR-009) |
| `reviewerAuthority` | `String` | `"admin"` in V1. A column, not a new role |
| `expectedMinutes` | `Int` | Descriptive capacity context only. **Never** an input to a lease, price, payout or economic computation (FR-058) |
| `revisionBound` | `Int` | Frozen at admission; never raised for a live run (FR-022) |
| `publicationDeadlineHours` | `Int` | Frozen at admission, default 72 |
| `submissionDeadlineHours` | `Int` | Frozen at admission, default 72 |
| `claimLeaseHours` | `Int` | Frozen at admission, default 72 |
| `economicProvenance` | `Json` | `{ planStepId, fixedMinutes, secondsPerUnit, pertOptimistic, pertLikely, pertConservative, acceptedTaskPayoutCents, acceptedEstimatedMinutes }` — the exact frozen values the admission test read (FR-002, FR-035) |
| `dataClass` | `String` | The frozen mandate class, ≥ the most restrictive class among `declaredInputs` (FR-056) |
| `createdAt` | `DateTime @default(now())` | |

**Invariants**

- `INV-D1` `afterdesk_human_unit_definition_immutable` — `BEFORE UPDATE OR DELETE` raises. Same shape as `second_shift_acceptance_snapshot_immutable`.
- `INV-D2` `CHECK ("revisionBound" >= 0 AND "expectedMinutes" >= 0)`.
- `INV-D3` `CHECK ("publicationDeadlineHours" > 0 AND "submissionDeadlineHours" > 0 AND "claimLeaseHours" > 0)` — a zero deadline is an unbounded wait, not a fast one.

---

## 5. `HumanWorkUnitRunState` — the live state

Exactly one per admitted run.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `runId` | `String @unique` | FK → `TaskWorkflowRun`, `onDelete: Cascade`. **Unique ⇒ one unit per run** |
| `taskId` | `String @unique` | FK → `Task`, `onDelete: Cascade`. Denormalised so a trigger on `Task` can find the unit in one index lookup |
| `snapshotId` | `String @unique` | FK → `TaskAcceptanceSnapshot`, `onDelete: Restrict`. The unit is bound to exactly one accepted contract (FR-008) |
| `definitionId` | `String` | FK → `HumanWorkUnitDefinition`, `onDelete: Restrict` |
| `cutOrder` | `Int` | The accepted plan `order` of the human step |
| `state` | `HumanWorkUnitState` | |
| `claimGeneration` | `Int @default(0)` | Monotonic fencing token. Bumped **exactly once** by `bindClaimToHumanUnit` on the initial `NULL → worker` claim, and **exactly once per reassignment** by `INV-S3`. The two are disjoint: `INV-S3`'s `OLD."claimedById" IS NOT NULL` guard means the first claim is never double-bumped |
| `resumeGeneration` | `Int @default(0)` | Monotonic. Bumped once, by the resume |
| `transitionSeq` | `Int @default(0)` | Monotonic audit allocator. Every audited mutation increments it in the same CAS and uses the new value for the transition row |
| `remainingRevisions` | `Int` | Seeded from `definition.revisionBound` |
| `claimedById` | `String?` | FK → `User`, `onDelete: Restrict`. Mirrors `Task.claimedById` or is `NULL` |
| `claimedAt` | `DateTime?` | |
| `claimLeaseExpiresAt` | `DateTime?` | Restarts at every successful claim or reclaim (FR-058) |
| `submissionDeadlineAt` | `DateTime?` | Restarts at every successful claim or reclaim |
| `publishedAt` | `DateTime?` | |
| `publicationDeadlineAt` | `DateTime?` | Starts at publication |
| `submittedAt` | `DateTime?` | |
| `acceptedAt` | `DateTime?` | |
| `refusalCause` | `HumanWorkUnitRefusalCause?` | Set when the unit is `exhausted`, `withdrawn` or `paused` |
| `pausedDetail` | `String?` | Operator-facing, no money value, no identity-bearing text |
| `admittedAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

**Indexes**: `@@index([state])`, `@@index([state, publicationDeadlineAt])`, `@@index([state, submissionDeadlineAt])`, `@@index([claimedById])` — the three the deadline sweep and the admin aggregate need.

**Invariants**

- `INV-S1` `afterdesk_human_unit_generations_monotonic` — `BEFORE UPDATE` raises if `NEW."claimGeneration" < OLD."claimGeneration"` or `NEW."resumeGeneration" < OLD."resumeGeneration"`. A generation that can go backwards is not a fencing token.
- `INV-S2` `afterdesk_human_unit_claimant_matches_task` — `BEFORE INSERT OR UPDATE` raises unless `NEW."claimedById" IS NULL` or it equals the owning `Task."claimedById"`. This is the database statement of "one task claimant, and the unit claim *is* that claim" (FR-011, FR-033).
- `INV-S3` `afterdesk_human_unit_fence_on_claim_change` — `AFTER UPDATE OF "claimedById" ON "Task"`: when `OLD."claimedById" IS NOT NULL AND OLD."claimedById" IS DISTINCT FROM NEW."claimedById"` and a unit exists, increment `claimGeneration` and `transitionSeq`, clear the unit assignment/deadlines, move `claimed` / `submitted` / `in_review` to `published`, preserve `revision_requested` and `remainingRevisions`, and insert the transition audit row. Initial `NULL → worker` assignment is excluded so `bindClaimToHumanUnit` performs the only claim increment. Fence and clear commit atomically (FR-011, FR-015, FR-022).
- `INV-S4` `CHECK ("remainingRevisions" >= 0)`.
- `INV-S5` `afterdesk_human_unit_state_is_terminal_once` — `BEFORE UPDATE` raises on any state change out of `resumed`, `exhausted` or `withdrawn`.
- `INV-S6` `CHECK (("state" <> 'accepted' AND "state" <> 'resumed') OR "acceptedAt" IS NOT NULL)`.

**Application-level CAS**: every transition is an `updateMany` whose `where` names the expected `state` and, where relevant, the expected `claimGeneration` / `resumeGeneration`. `count === 0` throws and rolls back the whole transaction, including the audit row.

---

## 6. `HumanWorkUnitCandidate` — candidate revisions

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `unitStateId` | `String` | FK → `HumanWorkUnitRunState`, `onDelete: Restrict`. **Restrict**, not Cascade: a candidate is retained evidence and does not vanish with a state row |
| `claimGeneration` | `Int` | The generation that produced it |
| `revisionIndex` | `Int` | 0 for the first submission |
| `submittedById` | `String` | FK → `User`, `onDelete: Restrict` |
| `payload` | `Json` | Schema-conforming result. **Never an input to anything unless it is the accepted one** (FR-016) |
| `status` | `HumanWorkUnitCandidateStatus @default(pending)` | |
| `submittedAt` | `DateTime @default(now())` | |

**Constraints**

- `INV-C1` `@@unique([unitStateId, claimGeneration, revisionIndex])` — a duplicate submission against an already-submitted claim generation loses this constraint and is reported as a duplicate; it can never create a second candidate (FR-018).
- `INV-C2` `afterdesk_human_unit_candidate_append_only` — `BEFORE UPDATE` raises for any change other than `status`, and raises for any `status` change out of a non-`pending` value. `BEFORE DELETE` raises unless `current_setting('afterdesk.retention_purge', true) = 'on'` ([research R-09](./research.md#r-09)).
- `INV-C3` at most one `pending` candidate per unit: `CREATE UNIQUE INDEX ... ON "HumanWorkUnitCandidate" ("unitStateId") WHERE "status" = 'pending'` — the same partial-unique-index idiom as `Dispute_one_pending_per_task`.

### `HumanWorkUnitCandidateFile`

| Field | Type | Notes |
|---|---|---|
| `candidateId` | `String` | FK → `HumanWorkUnitCandidate`, `onDelete: Restrict` |
| `fileId` | `String` | FK → `File`, `onDelete: Restrict` |
| `artifactKind` | `String` | Must be one of the definition's `requiredArtifactKinds` or a declared optional kind |
| `@@id([candidateId, fileId])` | | |

Declared artifacts are ordinary `File` rows, so the existing scanning evidence constraint (`File_clean_requires_scan_evidence`), visibility rules and the existing retention purge (`purgeExpiredTaskFiles`) apply with no new policy (FR-041, FR-056).

---

## 7. `HumanWorkUnitReviewDecision` — one decision per candidate

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `candidateId` | `String @unique` | **Unique ⇒ exactly one decision per candidate.** A second decision loses the constraint; the first stands unmodified (FR-020) |
| `unitStateId` | `String` | FK, `onDelete: Restrict` |
| `decidedById` | `String` | FK → `User`. Must not equal `candidate.submittedById` (application check + `INV-R2`) |
| `outcome` | `HumanWorkUnitDecisionOutcome` | |
| `cause` | `HumanWorkUnitRefusalCause?` | Set on a rejection |
| `revisionInstructions` | `String?` | Operator-authored, worker-visible, identity-safe — the same discipline as `Task.revisionInstructions` |
| `remainingRevisionsAfter` | `Int` | The value written in the same transaction |
| `claimGeneration` | `Int` | The generation in force |
| `decidedAt` | `DateTime @default(now())` | |

- `INV-R1` `afterdesk_human_unit_decision_append_only` — `BEFORE UPDATE OR DELETE` raises (delete gated by the retention GUC).
- `INV-R2` `afterdesk_human_unit_decider_is_not_submitter` — `BEFORE INSERT` raises when `decidedById` equals the candidate's `submittedById`. FR-019 is a separation the database also states, because the application check is the one a refactor drops.

---

## 8. `HumanWorkUnitAcceptance` — the one immutable acceptance

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `unitStateId` | `String @unique` | **Unique ⇒ one acceptance per unit, ever** (FR-023) |
| `candidateId` | `String @unique` | The candidate that was accepted |
| `decisionId` | `String @unique` | The decision that accepted it |
| `acceptedById` | `String` | FK → `User` (admin) |
| `claimGenerationAtAcceptance` | `Int` | |
| `resultPayload` | `Json` | A **copy**, frozen at acceptance. Not a pointer to the candidate, so the accepted result cannot change even if the candidate table is ever touched |
| `resultSha256` | `String` | Digest of the canonical serialisation, so tampering is detectable, matching the repository's frozen-bytes idiom for accepted files |
| `dataClass` | `String` | Inherits the frozen mandate class and at least the most restrictive declared-input class. Never downgraded (FR-056) |
| `criteriaVersionRef` | `String` | The `definitionId` the criteria were read from — provenance for "against which frozen criteria" |
| `acceptedAt` | `DateTime @default(now())` | |

- `INV-A1` `afterdesk_human_unit_acceptance_immutable` — `BEFORE UPDATE OR DELETE` raises unconditionally, and `BEFORE TRUNCATE` raises. Same shape as `second_shift_acceptance_snapshot_immutable`. **This is what makes FR-062 structural**: final QC has no code path to the acceptance, and would be refused if it did.
- **`BEFORE TRUNCATE` obligation**: add `HumanWorkUnitAcceptance` to `TRUNCATE_GUARDED_TABLES` in `test/integration/per-file-setup.ts` or the whole integration suite breaks ([research R-12](./research.md#r-12)).

---

## 9. `HumanWorkUnitResumeRecord` — one resume per run

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `runId` | `String @unique` | **Unique ⇒ one resume per run. This single constraint is the exactly-once guarantee** across concurrent triggers, retries, scheduled sweeps, crashes and replays (FR-026, FR-029, SC-005) |
| `unitStateId` | `String @unique` | |
| `acceptanceId` | `String @unique` | Which accepted result resumed this run (FR-051) |
| `resumeGeneration` | `Int` | The generation in force at the resume (FR-027) |
| `resumedStepRunIds` | `String[]` | Which downstream steps this resume made runnable (FR-051) |
| `skippedStepRunIds` | `String[]` | Steps not resumed, retaining their own reason (FR-025) |
| `resumedAt` | `DateTime @default(now())` | |

- `INV-P1` `afterdesk_human_unit_resume_append_only` — `BEFORE UPDATE OR DELETE` raises.

---

## 10. `HumanWorkUnitTransition` — the append-only audit

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `unitStateId` | `String` | FK, `onDelete: Restrict` |
| `seq` | `Int` | Monotonic per unit |
| `actorId` | `String?` | Null for a system transition |
| `actorRole` | `HumanWorkUnitTransitionActorRole` | |
| `fromState` | `HumanWorkUnitState?` | Null for `admitted` |
| `toState` | `HumanWorkUnitState` | |
| `cause` | `String` | From the closed vocabulary in [contracts/audit-events.md](./contracts/audit-events.md) |
| `claimGeneration` | `Int` | In force at the transition |
| `resumeGeneration` | `Int` | In force at the transition |
| `assignmentEstablished` | `Boolean?` | `true` = the task assignment was created here; `false` = it already matched; `null` = not applicable (FR-048) |
| `occurredAt` | `DateTime @default(now())` | |

- `INV-T1` `@@unique([unitStateId, seq])`; `seq` is allocated by atomically incrementing `HumanWorkUnitRunState.transitionSeq` in the same CAS/trigger that writes the transition. No `MAX(seq)+1` allocation is permitted.
- `INV-T2` `afterdesk_human_unit_transition_append_only` — `BEFORE UPDATE` raises unconditionally; `BEFORE DELETE` raises unless the retention GUC is set; `BEFORE TRUNCATE` raises. Add to `TRUNCATE_GUARDED_TABLES`.
- `INV-T3` **there is no column able to hold a forbidden value.** No money field, no credential field, no free-text field carrying submitted content, no cross-task reference. `cause` is a closed vocabulary and `pausedDetail` lives on the state row, not here. FR-049 is enforced by shape, not by filtering — the same reasoning the repository uses for its client-timeline whitelist.

---

## 11. `HumanWorkUnitAlert` — deadline and notification facts

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `unitStateId` | `String` | FK, `onDelete: Restrict` |
| `kind` | `HumanWorkUnitAlertKind` | |
| `dueAt` | `DateTime` | The deadline instant this alert is about |
| `firedAt` | `DateTime @default(now())` | |
| `claimGeneration` | `Int` | Which generation's deadline this was |

- `INV-N1` `@@unique([unitStateId, kind, dueAt])` — **the replay-safety mechanism.** The sweep inserts the alert as part of the same transaction as the transition; a re-run, a concurrent run or a replay loses the constraint and changes nothing. That is what gives SC-016 its *exactly one durable actionable admin alert* without a "have we already notified?" read that would race.

The alert row is a *fact*; delivery is the existing `Notification` table drained by `deliverPendingNotifications`. Both are written in the same transaction as the transition.

---

## 12. Changes to existing models

| Model | Change | Why |
|---|---|---|
| `TaskWorkflowRun` | new relation `humanWorkUnit HumanWorkUnitRunState?`; new status value `awaiting_human_unit` | Live state per run |
| `TaskWorkflowStepRun` | new status value `blocked_on_human_unit` | A downstream automated step waiting on acceptance |
| `Task` | new relations `humanWorkUnit`, `humanUnitCandidatesSubmitted` (via `User`) as needed | Trigger lookups and admin reads |
| `TaskAcceptanceSnapshot` | new relation `humanWorkUnit` | One unit per accepted contract |
| `TaskExecutionPlanVersion` / `TaskExecutionPlanStep` | new relation to `HumanWorkUnitDefinition` | The definition belongs to the accepted plan version |
| `File` | new relation to `HumanWorkUnitCandidateFile` | Declared artifacts |
| `User` | new relations for `claimedById`, `submittedById`, `decidedById`, `acceptedById` | |

**No existing column is dropped, renamed, re-typed or given a new meaning.** No existing trigger function is replaced.

---

## 13. Task-level invariants added by this feature

| ID | Name | Statement | Requirement |
|---|---|---|---|
| `INV-K1` | `afterdesk_admitted_payout_is_frozen` | `BEFORE UPDATE ON "Task"`: if a non-refused `HumanWorkUnitRunState` exists for the task and `NEW."vaPayoutCents" IS DISTINCT FROM OLD."vaPayoutCents"`, raise | FR-034, FR-036, FR-057, SC-004 |
| `INV-K2` | `afterdesk_human_unit_no_spend_while_waiting` | `BEFORE INSERT ON "WorkflowBudgetHold"`: if the run's unit state is `published`, `claimed`, `submitted`, `in_review` or `revision_requested`, raise | FR-031, SC-006 |
| `INV-K3` | `INV-S2` (above) | The unit's claimant matches the task's claimant or is null | FR-011, FR-033 |
| `INV-K4` | `INV-S3` (above) | A prior claimant change fences the old generation atomically with clearing; initial assignment is excluded | FR-011, FR-013 |

**Not enforceable in the database, and stated as such**: `AccountProviderSpendHold` carries no run or task identity, so `INV-K2` has no account-level twin. Coverage is structural (the reservation call site is unreachable) plus an explicit integration assertion. See [research R-08](./research.md#r-08). `TEST`

---

## 14. Validation rules (application layer)

| Rule | Where | Refusal |
|---|---|---|
| Admission verdict is a pure function of frozen fields | `human-unit-admission.ts` | `unsupported_topology` / `malformed_topology` / `unmapped_economics` |
| Candidate satisfies the frozen output schema and carries every required artifact kind | `human-unit-result-schema.ts`, inside the submit transaction | Refused with a message naming what is missing; task and unit stay with the worker (FR-017) |
| Actor is the active claim holder at the current claim generation | every worker read and mutation | Refused as stale, recorded |
| Actor's live approval, category certification, tier/score/rated-count, prior-rejection exclusion and WIP cap satisfy the **frozen** eligibility criteria | `worker-eligibility.ts`, evaluated at every point of use | Refused at the point of use, never inherited (FR-009) |
| Every visible field is declared in `declaredInputs`, required by an instruction/output/criterion, and classification-permitted | projection layer | Omitted from the SQL select — deny-by-default (FR-014) |
| Decider is not the submitter | decide transaction + `INV-R2` | Refused and recorded (FR-019) |
| Publication requires every declared input to be available and the reach to be permitted by the most restrictive input class | publish path | `input_unavailable` / `classification_conflict`, run pauses (FR-007) |
| The accepted result would need more than the reserved payout or the frozen ceiling | acceptance / resume path | `economics_exceeds_reserved`, run pauses; neither figure adjusted (FR-037) |

---

## 15. Retention, classification and purge

- **Candidate artifacts**: `File` rows → already covered by `purgeExpiredTaskFiles`, by the scan-evidence constraint and by the existing visibility rules. Blob deleted first, row marked after — unchanged.
- **Candidate payloads, decisions, acceptances, resume records, transitions**: `UPDATE` refused unconditionally; `DELETE` refused unless a session sets `afterdesk.retention_purge = 'on'`; **no purge sweep ships in V1**, so nothing is removable yet. That is the fail-closed reading of FR-063.
- **Classification**: the accepted result and its artifacts inherit the frozen mandate class and at least the most restrictive declared-input class, and are never downgraded (FR-056). Publication is refused when the unit's reach exceeds the most restrictive class present in its declared inputs (FR-007).
- **Worker visibility windows** (FR-055): workable → the minimum projection; submitted → the same projection, read-only, until a decision; rejected within the bound → workable access restored; after acceptance, resume, completion or withdrawal → the unit's inputs and candidate content are no longer available on worker unit surfaces, and only a minimal status value plus one safe next action remains (FR-061).

---

## 16. Historical-semantics statement

Every existing run has no `HumanWorkUnitRunState`, which is `not_admitted`, which is today's behaviour. No historical row is read, rewritten or reinterpreted; no backfill runs; no enum value changes meaning; `awaiting_human` keeps its terminal-handover meaning; `finishRun` and `computeResidual` are untouched for every unadmitted run. The migration therefore satisfies the constitution's rule that no migration may silently reinterpret accepted work or historical evidence, and `human-unit-history.itest.ts` asserts it against a database holding pre-feature runs.
