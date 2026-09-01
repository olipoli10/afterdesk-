# Contract: Runtime-Internal Functions

**Parent**: [README.md](./README.md)

Server-only functions called by the compiler, the runner, the sweeps and the cron entry point. Not reachable from a client bundle: every module carries `import "server-only"` except the three pure decision modules, which are pure by design so they can be unit-tested without a database — the same split `src/lib/ai-work-engine/compile.ts:24-27` documents for itself.

---

## 1. Admission — pure

`src/lib/ai-work-engine/human-unit-admission.ts`

```ts
export type AdmissionStep = {
  order: number;
  executor: "ai" | "human" | "deterministic_code";
  dependsOnOrder: number[];
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
};

export type AdmissionEconomics = {
  vaPayoutCents: number | null;
  estimatedMinutes: number | null;
};

export type AdmissionVerdict =
  | { admitted: true; cutOrder: number }
  | { admitted: false; cause: "unsupported_topology" | "malformed_topology" | "unmapped_economics" };

export function admitHumanCut(
  steps: AdmissionStep[],
  economics: AdmissionEconomics
): AdmissionVerdict;
```

**Contract**

- **Pure.** No model call, no network, no randomness, no clock read, no database. Same inputs → same verdict, forever (FR-005).
- **Order-independent**: the verdict does not depend on the order in which `steps` is supplied.
- **Cycle-safe**: a dependency cycle or a dependency on a nonexistent `order` returns `malformed_topology` and never hangs. `resolveTopology` already proves cycles are possible in stored plan data and handles them with an explicit in-progress set (`topology.ts:75-112`); this function must be at least as defensive.
- **Topology** (FR-003): admitted only when exactly one step has `executor === "human"`, the graph is acyclic and total, and every other step is an ancestor or a descendant of the cut. `ancestor(x, cut)` = `x` is reachable from `cut` by following `dependsOnOrder` transitively; `descendant(x, cut)` = `cut` is reachable from `x`. A step that is neither is a branch crossing the cut → `unsupported_topology`.
- **Economics** (FR-035): the four booleans in [../research.md#r-05](../research.md#r-05). **`expectedMinutes` is not read**, and a test asserts that changing it never changes the verdict.
- **Never throws.** An unparseable shape is a refusal, never an error — the same rule `compile.ts` states for itself.

## 2. Definition freeze — pure

`src/lib/ai-work-engine/human-unit-definition.ts`

```ts
export function freezeHumanUnitDefinition(input: {
  planVersionId: string;
  cut: AcceptedPlanStepRow;          // the accepted human step, verbatim
  acceptedTaskPayoutCents: number;
  acceptedEstimatedMinutes: number;
  dataClass: string;
  declaredInputs: DeclaredInput[];   // derived from the cut's dependencies
  settings: FrozenUnitSettings;      // revision bound + three deadline durations
}): FrozenHumanUnitDefinition;
```

**Contract**: every field of the result derives from an accepted-contract column or a frozen setting. There is **no** parameter through which an operator-authored instruction, input, output, artifact or acceptance obligation can enter — which is how "the unit adds nothing beyond that accepted step" is structural rather than reviewed (FR-035, readiness CHK020).

## 3. Result schema — pure

`src/lib/ai-work-engine/human-unit-result-schema.ts`

```ts
export function compileFrozenOutputSchema(outputSchema: unknown): z.ZodTypeAny | null;
export function validateCandidate(
  definition: FrozenHumanUnitDefinition,
  payload: unknown,
  artifactKinds: string[]
): { ok: true; value: unknown } | { ok: false; missing: string[] };
```

**Contract**: `null` from the compiler is a refusal, never an empty schema — the same rule `parsePrimitiveParams` states (`primitive-params.ts`, cited at `compile.ts:207`). `missing` names what is absent, which is what the worker is told. **Conformance is a precondition for submission and is never evidence of correctness** (FR-017, readiness CHK040); no caller may treat `ok: true` as an acceptance signal.

---

## 4. Compile integration — `src/lib/ai-work-engine/compile.ts`

```ts
export function compileDecisions(
  steps: CompileStepInput[],
  gate: CompileGate & { humanCut?: { order: number } }
): CompiledPlan;
```

**Contract**

- `humanCut` **absent** → byte-identical behaviour to today. Pinned by the existing `test/workflow-compile.test.ts`.
- `humanCut` **present** → a step that is a descendant of the cut and whose *only* reason for demotion is the pure human-dependency cascade compiles `executionMode: "automated"` and is flagged for persistence as `blocked_on_human_unit`. **Every other refusal still demotes and keeps its own reason verbatim**: no registered primitive, moved primitive version, invalid frozen params, forbidden reach, non-executable mode, mandate-level sensitive/access gate, prior budget demotion (FR-025, FR-038).
- The mandate-level gate still short-circuits the entire plan to human before anything else (`compile.ts:124-148`), so a sensitive or access-gated mandate is never admitted in practice even if the topology would allow it.

---

## 5. Runtime — `src/server/human-unit.ts`

```ts
export async function publishHumanWorkUnit(runId: string): Promise<PublishOutcome>;
export async function bindClaimToHumanUnit(
  tx: Prisma.TransactionClient,
  input: { taskId: string; workerId: string }
): Promise<{ assignmentEstablished: boolean }>;
export async function withdrawHumanUnit(
  tx: Prisma.TransactionClient,
  input: { taskId: string; cause: RefusalCause; actorId?: string }
): Promise<void>;
```

**`publishHumanWorkUnit`** — called by `advanceWorkflow` when the pre-cut block is drained and the unit is `admitted`.

Preconditions checked **before** the transaction, each refusing rather than degrading:
- every `declaredInput` is available — a producing step completed, and any accepted snapshot file still resolves and still matches the hash frozen at acceptance (the same `read()` discipline as `workflow-runs.ts:864-891`). Otherwise → pause, cause `input_unavailable`;
- the unit's reach does not exceed the most restrictive class present in its declared inputs. Otherwise → pause, cause `classification_conflict`;
- the pool audience is resolved **outside** the transaction (`resolvePoolAudience`), the split `finishRun` and `releaseToPoolWithoutAutomation` already make for Prisma's 5-second interactive-transaction limit (`workflow-runs.ts:1663-1670`).

Transaction (T2): CAS unit `admitted → published`; `transitionTask({ tx, from: "ai_processing", to: "open", action: "human_unit_published" })` **with no `vaPayoutCents` or `estimatedMinutes` write**; `writePoolNotifications`; alert row for the publication clock; transition audit.

**`bindClaimToHumanUnit`** — called inside the existing `claimTask` transaction, after its `transitionTask` succeeds. CAS unit `published | revision_requested → claimed`; set `claimedById`; `claimGeneration + 1`; stamp `claimLeaseExpiresAt` and `submissionDeadlineAt` from the frozen durations; audit with `assignmentEstablished`. Returns `false` for `assignmentEstablished` when the claiming worker already held the task (FR-048's "established or matched").

---

## 6. Resume — `src/server/human-unit-resume.ts`

```ts
export async function applyResume(unitStateId: string): Promise<ResumeOutcome>;
export async function recoverPendingHumanUnitResumes(): Promise<number>;
```

**`applyResume`** — one transaction (T10):

1. CAS unit `accepted → resumed` **and** `resumeGeneration` from *n* to *n+1*;
2. insert `HumanWorkUnitResumeRecord` (`runId` unique, `acceptanceId` unique) — **this constraint is the exactly-once guarantee**;
3. `updateMany` the run's `blocked_on_human_unit` steps to `pending`, **excluding** any step that is not machine-runnable on its own merits, whose own reason is preserved unchanged and whose id is recorded in `skippedStepRunIds` (FR-024, FR-025);
4. CAS the run `awaiting_human_unit → running`;
5. transition audit.

**Refusals, all of which change nothing**: the run has left the executing lifecycle — task `cancelled` / `expired` / `completed`, or run `abandoned` — and is not revived (FR-028); the run is in an admin-owned pause, in which case every automatic, retried, swept or replayed resume is refused and only the explicit recorded admin continuation may proceed; the resume generation is stale (FR-027).

**Idempotence**: a second call from any trigger class loses `runId @unique` and rolls back whole. `applyResume` is therefore safe to call from `after()`, from the recovery sweep, and from both at once (FR-026, FR-029, SC-005).

**`recoverPendingHumanUnitResumes`** — finds units in `accepted` with no resume record and calls `applyResume` on each, per-item isolated so one poisoned unit cannot stop the batch (the isolation `abandonStalledWorkflowRuns` learned the hard way, `sweeps.ts:378-393`). Replay-safe by the same constraint.

---

## 7. Deadlines — `src/server/human-unit-deadlines.ts`

```ts
export async function sweepHumanWorkUnitDeadlines(): Promise<{
  publicationLapsed: number;
  submissionLapsed: number;
  leaseLapsed: number;
}>;
```

**Contract**

- **Replay-safe by construction**: every action is a CAS transition plus an alert insert keyed `(unitStateId, kind, dueAt)`. A re-run, a concurrent run or a replay loses the unique constraint and changes nothing. That is what makes "exactly one durable actionable admin alert" true without a racy "have we notified?" read (SC-016).
- A publication deadline lapse pauses the run with cause `publication_deadline`.
- A submission deadline or claim-lease lapse returns the task to the pool through the **existing** release semantics — the same task-level CAS `claimed → open` clearing `claimedById` that `releaseTask` performs — after which the fencing trigger bumps the generation, so any late submission from the stale holder is refused as stale rather than accepted or merged (FR-013). If nobody eligible reclaims before the applicable deadline, the run pauses with the frozen remaining revision count **unchanged** (FR-060).
- **A lapse never auto-accepts, never auto-rejects, never consumes a revision, never resumes work and never spends** (FR-044, FR-059).
- Per-item isolation; bounded `take`, matching every other sweep in `sweeps.ts`.

---

## 8. Finish — `src/server/workflow-runs.ts`

```ts
export async function finishAdmittedRun(runId: string): Promise<void>;
export async function publishAdmittedResidualScope(runId: string): Promise<void>;
```

**Contract**: marks the run `done` with `finishedAt`, writes the transition audit, and **does nothing else**. On the happy path it performs no residual payout computation, writes neither `vaPayoutCents` nor `estimatedMinutes`, creates no `TaskHumanWorkPackage`, and never transitions the task. The same claimant delivers through the existing `submitDeliverable` → `submitted_for_qc` → `approveDeliverable` path at the accepted fixed payout (FR-057). The separate downstream-failure publisher below is the only admitted path allowed to insert a package ([../research.md#r-07](../research.md#r-07)).

`finishRun` gains a defensive guard refusing to run for an admitted run. The caller already branches; the guard exists so a future caller cannot re-enter the residual path by accident, and `INV-K1` refuses the payout write even if it did.

**Downstream failure after the resume** (FR-045, FR-057): `publishAdmittedResidualScope` reuses the existing `TaskHumanWorkPackage` as a one-time immutable remaining-scope record for the **same** task claimant while they satisfy the identical eligibility predicate set used at claim time. The existing trigger permits the initial `INSERT` and then refuses every `UPDATE`/`DELETE` while claimed; the existing unique keys make replay a no-op. The publisher may compute remaining scope, but MUST use the frozen accepted task payout for package payout-reference fields, MUST NOT write `Task.vaPayoutCents` or `Task.estimatedMinutes`, and MUST NOT open a second claim. Otherwise the run pauses for an admin before the package is published.

The publisher transaction CASes a `running|awaiting_human_unit` run whose unit is terminal `resumed|exhausted`, inserts the unique package, and moves only the run to existing `awaiting_human` with `finishedAt`. The unit remains terminal and immutable; the task remains `claimed` by the same worker. A duplicate call loses the package's existing unique keys and changes nothing.

---

## 9. Cron registration — `src/app/api/cron/maintenance/route.ts`

Both sweeps join the existing isolated `Promise.all` list and the JSON response, using the same `run(name, job)` wrapper so a transient failure in one cannot fail-fast the surrounding batch and cut a live Stripe call short (`route.ts:31-41`). Both are also registered in `runOperatorSweeps` (`sweeps.ts:313-340`), because a route that silently 405s for an unknown stretch is a failure this repository has already had, and opportunistic self-healing on operator page loads is its established answer.
