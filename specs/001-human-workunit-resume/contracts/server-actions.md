# Contract: Server Actions

**Parent**: [README.md](./README.md)

> **`BLOCK-NEXT-DOCS`** — `node_modules/` is absent from this working tree, so the installed Next.js 16 documentation could not be read as `AGENTS.md` requires. Every shape below is copied from an existing in-repo server action with a citation. Before any of these files is written, run `npm install` and read the relevant guides under `node_modules/next/dist/docs`; if a guide contradicts a shape here, the guide wins and this contract is amended. See [../research.md#r-01](../research.md#r-01).

## Shared result type

Copied verbatim from `src/server/actions/va-tasks.ts:15`:

```ts
export type HumanUnitResult =
  | { ok: true }
  | { ok: false; error: string; code: RefusalCode };
```

`code` is added beyond the existing shape so the admin surface can render a *distinct* cause (FR-053) without parsing prose. `error` remains the only string shown to a worker.

---

## Worker actions — `src/server/actions/human-unit-worker.ts`

All are `"use server"`. All begin with `await requireApprovedVa()` (`src/lib/authz.ts:144-152`), which re-reads `VaProfile.status` on every call, so a worker suspended mid-session loses access on their next request.

### `submitHumanUnitResult(input: unknown): Promise<HumanUnitResult>`

```ts
const submitSchema = z.object({
  taskId: z.string(),
  claimGeneration: z.number().int().min(0),   // the actor's belief, checked under CAS
  result: z.unknown(),                        // validated against the FROZEN schema, inside the tx
  fileIds: z.array(z.string()).max(20).default([]),
});
```

Inside **one** transaction (T5 in the plan's transaction table):

1. load the unit bound to `taskId` **and** `claimedById = user.id` **and** `state IN ('claimed','revision_requested')` **and** `claimGeneration = input.claimGeneration`;
2. re-evaluate the frozen eligibility criteria against live worker facts;
3. compile the frozen `outputSchema` to Zod and `safeParse` the payload; on failure refuse `schema_invalid` naming the missing field or artifact, **without** taking the task or the unit away from the worker (FR-017);
4. attach `fileIds` with the same `updateMany` ownership guard `submitDeliverable` uses (`uploaderId`, `taskId: null`, `scanStatus: "clean"` — `va-tasks.ts:392-406`), refusing if the claimed count differs;
5. insert the candidate at `(unitStateId, claimGeneration, revisionIndex)`;
6. CAS the unit `claimed|revision_requested → submitted`;
7. insert the transition audit row.

**Refusals**: `not_available`, `stale_generation`, `not_eligible`, `schema_invalid`, `duplicate` (unique-constraint loss), `lifecycle_exit`.

**Guarantee**: candidate + transition + audit are one atomic outcome. A crash before commit leaves no candidate and no state change, so the same request is safe to retry; a crash after commit leaves exactly one candidate and exactly one audit row (FR-018, SC-015).

**After commit, outside the transaction**: close the worker's open timer (`stopAllOpenSessions`, the same post-commit ordering and for the same connection-pool reason as `va-tasks.ts:452-460`), then `revalidatePath`.

### `releaseHumanUnitTask(taskId: string)`

**Not a new action.** The existing `releaseTask` (`va-tasks.ts:166-199`) is the release, unchanged in substance: task `claimed → open`, `claimedById` cleared, one abandonment recorded, no money moved. The unit's generation bump, assignment clearing and audit row are performed by the `afterdesk_human_unit_fence_on_claim_change` trigger, so **every** path that moves a claimant fences identically — voluntary release, admin reassignment, QC-exhaustion repool, and any future one (FR-015, FR-013).

A revision consumed before release stays consumed and follows the unit to the next claimant (FR-015, FR-022) — the trigger leaves `revision_requested` and `remainingRevisions` untouched.

---

## Admin actions — `src/server/actions/human-unit-admin.ts`

All begin with `await requireRole("ADMIN")`.

### `openHumanUnitReview(taskId: string): Promise<HumanUnitResult>`

CAS `submitted → in_review` + audit. Optional: a decision is legal from `submitted` **or** `in_review`, so an admin can never be blocked by a missing review-open.

### `decideHumanUnitCandidate(input: unknown): Promise<HumanUnitResult>`

```ts
const decideSchema = z.object({
  candidateId: z.string(),
  outcome: z.enum(["accept", "reject"]),
  cause: z.enum(["revisions_exhausted", "unsafe_or_unverifiable", "quality"]).optional(),
  revisionInstructions: z.string().trim().min(5).max(4000).optional(),
});
```

One transaction (T7 / T8 / T9):

1. refuse `self_review` when `admin.id === candidate.submittedById`, **and record the attempt** (FR-019). The database refuses it too (`INV-R2`);
2. insert `HumanWorkUnitReviewDecision` with `candidateId` unique — a second decision loses the constraint, is reported as `duplicate`, and the first stands unmodified (FR-020);
3. branch:
   - **accept** → insert the single `HumanWorkUnitAcceptance` (copying the payload and stamping its digest), mark the candidate `accepted`, CAS unit → `accepted`, audit. The acceptance row **is** the durable resume intent;
   - **reject, `remainingRevisions > 0`** → candidate `superseded`, CAS unit → `revision_requested`, `remainingRevisions - 1` (exactly one), audit, notify the claimant;
   - **reject at the bound, or `unsafe_or_unverifiable`** → candidate `rejected`, CAS unit → `exhausted`, audit, admin alert, hand the run to the existing manual residual handling with that cause. Zero downstream budget is spent.

**Post-commit**: `after(() => applyResume(unitStateId))` on the accept branch — an accelerator only. If that process dies, `recoverPendingHumanUnitResumes()` converges on the same single resume, exactly as `after()` is only an accelerator for `processWorkflowRuns` today (`workflow-runs.ts:37-49`).

**Refusals**: `not_available`, `duplicate`, `self_review`, `stale_generation`, `lifecycle_exit`, `paused`.

### `continuePausedHumanUnitRun(input: unknown): Promise<HumanUnitResult>`

```ts
const continueSchema = z.object({
  taskId: z.string(),
  decision: z.enum(["continue_within_ceiling", "fail_closed_to_manual"]),
  reason: z.string().trim().min(3).max(2000),
});
```

The FR-037 continuation. `continue_within_ceiling` **retains the original frozen ceiling** and may reserve only the authorized budget that remains; it never re-derives or raises it, and it never adjusts the payout. Refused outright for a cancelled, abandoned or finished run (FR-028). Every continuation is recorded with its actor and reason.

### `withdrawHumanUnit(taskId, cause)` — internal, called by the existing cancel path

Not a standalone admin button in V1. The existing `cancelTask` / lifecycle-exit paths call it inside their transaction: CAS unit → `withdrawn`, audit, refuse all subsequent claims, submissions and reviews, and guarantee that no downstream step becomes runnable (FR-042). Already-durable candidates are retained untouched as immutable evidence (FR-041).

---

## Actions deliberately **not** added

| Not added | Why |
|---|---|
| A separate "claim the human unit" action | The claim is the existing `claimTask`. A second claim action would be a second engagement in all but name ([research R-03](../research.md#r-03)) |
| Any client-facing action | V1 adds no client surface (FR-061) |
| A reviewer-role management action | V1 introduces no reviewer role; the separation enforced is submitter ≠ decider (FR-019) |
| A "raise the revision bound" action | The bound is frozen at admission and may not be raised for a live run by any actor or configuration change (FR-022) |
| A "re-admit this run" action | The verdict is a property of the frozen contract, not of when it was evaluated (FR-005) |
