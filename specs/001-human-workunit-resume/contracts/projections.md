# Contract: Role-Shaped Projections and Authorization

**Parent**: [README.md](./README.md)

The rule this file states, inherited verbatim from `src/lib/queries/tasks.ts:7-18`: **a field a role may not see is omitted from the SQL projection, not fetched and filtered.** The excluded field is absent from the payload regardless of any UI bug. `test/price-wall.test.ts` pins the shapes; this contract adds the new selects to that pinning.

New file: `src/lib/queries/human-unit.ts`, `import "server-only"`.

---

## 1. Deny-by-default, field by field

FR-014 is a whitelist over the *frozen definition*, not a blocklist over a row. A field or artifact reaches a worker only when **all three** hold:

1. it is named in `definition.declaredInputs`;
2. it is required by an instruction, an output field or an acceptance criterion;
3. it is permitted by the applicable data classification.

Otherwise it is omitted. **A field added to an underlying record later never becomes visible**, because the projection enumerates `declaredInputs` and nothing else — which is the readiness gate's CHK006 requirement that the protection keeps working as new fields appear.

---

## 2. Worker projection

```ts
export async function humanUnitForWorker(input: {
  taskId: string;
  workerId: string;
  claimGeneration: number;
}): Promise<WorkerUnitView | null>;
```

**Where clause** — every clause below is part of the SQL, not a later check:

```
unitState.taskId          = :taskId
unitState.claimedById     = :workerId
unitState.claimGeneration = :claimGeneration
unitState.state          IN ('claimed', 'submitted', 'in_review', 'revision_requested')
task.claimedById          = :workerId
task.status              IN VA_FILE_ACCESS_STATUSES
```

**Plus, re-evaluated at the point of use and inherited from nothing** (FR-009): live approved-VA status; category certification when `requireCategoryCertification` is on; the tier / score / rated-count gate; the prior-rejection exclusion; the WIP cap; the unit's binding to this task and this accepted contract; that the actor is the active claim holder at the current claim generation; and the classification projection. **Criteria come from the frozen `definition.eligibility`; worker facts are read live** — a platform configuration change affects only units admitted afterwards, an individual approval withdrawal affects live access (readiness CHK009).

**Selected**

| Field | Source | Note |
|---|---|---|
| `instructions` | definition | sanitised, identity-safe |
| `declaredInputs[]` | definition | `{ label, kind, value \| fileRef }` — resolved per entry, nothing else |
| `outputSchema` | definition | to render the form |
| `requiredArtifactKinds[]` | definition | |
| `acceptanceCriteria[]` | definition | the standard the work is judged against, readable before submitting |
| `remainingRevisions` | state | |
| `submissionDeadlineAt` | state | |
| `state` | state | one of the four workable/read-only values above |
| `latestOwnCandidate` | candidate | own candidate only, read-only while under review |
| `revisionInstructions` | latest decision | operator-authored, identity-safe |

**Never selected — and each is a named leak the repository already guards against**

`clientPriceCents`, `clientId`, `client`, `clientDeadlineUtc`, any `ai*` field, `computedPayoutCents`, `reservedBudgetCents`, `runAutomationBudgetMicros`, `actualAiCostMicros`, `actualToolCostMicros`, any `WorkflowBudgetHold` or `AccountProviderSpendHold` field, any step internals, `handoffReason`, any primitive id, any other task's or contract's material, any credential, any `HumanWorkUnitTransition` row, any other worker's candidate.

**The worker's payout** stays exactly where it is today: `Task.vaPayoutCents` via the existing `vaTaskSelect`, unchanged since the pool showed it and frozen by trigger. It is not duplicated into this view — `humanPackageForVa` makes the same choice and documents why (`src/lib/queries/execution.ts:35-39`).

### Lifecycle visibility windows (FR-055, FR-061)

| Unit state | Worker sees |
|---|---|
| `claimed`, `revision_requested` | the full minimum projection above, workable |
| `submitted`, `in_review` | the same projection, **read-only** |
| `accepted`, `resumed`, `exhausted`, `withdrawn`, `paused` | **no inputs, no candidate content.** One status value from `{accepted, resuming, running, paused, completed}` and one safe next action |
| any state, superseded generation | `null` — indistinguishable from "does not exist" |

Rejected and superseded candidates remain retained evidence and are **not** generally worker-visible data.

---

## 3. Pre-claim projection

**None is added.** The pool card is the existing `vaPoolSelect` / `vaPoolDetailSelect` (`queries/tasks.ts:160-273`), which already carries `vaPayoutCents` (the accepted fixed task payout on this path), `estimatedMinutes`, the category and its `disputeCriteria`, and deliberately **no filenames** because the task is still unclaimed and visible to every approved worker.

A worker therefore sees, before claiming, the same figure they will be frozen to at claim and paid at completion (FR-034, SC-004). Adding a unit-specific pre-claim projection was considered and rejected: the pool is visible to every approved worker, so anything added there is exposed to workers who will never hold the unit.

---

## 4. Admin projection

```ts
export async function humanUnitForAdmin(taskId: string): Promise<AdminUnitView | null>;
```

Gated by `requireRole("ADMIN")`. Selects the definition, the full state, every candidate with its status, every decision, the acceptance, the resume record, the transition trail and the alert history.

Must answer, without further interpretation (FR-052):

| Question | Field |
|---|---|
| Why is it waiting? | `state` + `refusalCause` + `pausedDetail` |
| Who may act? | derived: eligible worker pool \| the current claimant \| an admin |
| Until when? | the applicable deadline for the current state |
| How many revisions remain? | `remainingRevisions` |
| What is the safe next action? | the map below |

### Safe next action (FR-052, exhaustive)

| State / cause | Safe next action |
|---|---|
| `published` | claim, or keep waiting |
| `claimed` | submit, or release |
| `submitted` / `in_review` | accept, or reject |
| `revision_requested` | revise, or release |
| `paused:economics` | explicitly continue within the frozen ceiling, or fail closed |
| `paused:publication_deadline` / `paused:submission_deadline` | open the existing manual residual path |
| `exhausted` (revisions or unsafe) | open the existing manual residual path |
| `paused:input_unavailable` / `paused:classification_conflict` | open the existing manual residual path |
| not admitted — `unsupported_topology` / `malformed_topology` / `unmapped_economics` | open the existing manual residual path |

### Cause naming (FR-053, FR-038)

A topology refusal and an economics refusal are rendered **in their own terms**, from `HumanWorkUnitRefusalCause`, which is disjoint from any capability or budget vocabulary. Neither may be rendered as a missing capability or as a budget decision on any surface added by this feature, and a downstream step demoted for budget keeps `demotedForBudget` as its explanation and is never resurrected by acceptance. The precedent and the defect this rule exists to prevent are in `src/lib/ai-work-engine/compile-preview.ts:154-176`.

---

## 5. Client projection

**None.** V1 adds no client-facing Human Work Unit surface and no client data projection; existing client task visibility is unchanged (FR-061).

Structurally guaranteed rather than reviewed: the client execution report renders only actions named in the `CLIENT_TIMELINE_LABELS` whitelist and drops anything unrecognised (`queries/tasks.ts:609-741`). **No `human_unit_*` action is added to that whitelist**, and a test asserts their absence, so adding an audit event can never publish one.

---

## 6. Authorization matrix (normative)

| Capability | CLIENT | Approved worker, not claimant | Claimant, current generation | Claimant, superseded generation | ADMIN | Submitter acting as reviewer |
|---|---|---|---|---|---|---|
| Read definition + declared inputs | deny | deny | allow (minimum projection) | deny | allow | n/a |
| Claim | deny | allow (existing `claimTask`) | already holds | deny | deny | n/a |
| Submit / revise | deny | deny | allow in `claimed` / `revision_requested` | deny (`stale_generation`) | deny | n/a |
| Release | deny | deny | allow (existing `releaseTask`) | deny | reassign only | n/a |
| Read own candidate | deny | deny | allow, read-only under review | deny | allow | n/a |
| Read another worker's candidate | deny | deny | deny | deny | allow | n/a |
| Open review / decide | deny | deny | deny | deny | allow | **deny + record** |
| Read accepted result | deny | deny | status value only | deny | allow | n/a |
| Read audit trail | deny | deny | deny | deny | allow | n/a |
| Continue a paused run | deny | deny | deny | deny | allow (explicit, recorded) | n/a |
| See client price | own price only | never | never | never | allow | n/a |
| See worker payout | never | pool value | same frozen value | n/a | allow | n/a |

**No cell depends on client-tenant membership.** Approved workers are platform workers; cross-client isolation on the worker side comes from the unit's binding to exactly one task and one accepted contract plus minimum-necessary field projection (FR-008, FR-010). Client-side access remains client ownership; admin-side access remains admin role. Neither is changed.

---

## 7. What the tests must pin

| Assertion | Spec |
|---|---|
| The worker select's key set, asserted on the projection itself and not only on its output | SC-014 |
| No `human_unit_*` action in `CLIENT_TIMELINE_LABELS` | FR-061 |
| Every lifecycle state × every data classification: zero undeclared fields, zero forbidden categories, zero client prices, zero cross-task material, zero credentials, zero post-acceptance inputs or candidate content | SC-014 |
| Zero client projections containing a worker payout | FR-054 |
| Zero worker-side access decisions depending on client-tenant membership | FR-010 |
| Every post-acceptance claimant view shows exactly one permitted status value and one safe next action | FR-061, SC-014 |
