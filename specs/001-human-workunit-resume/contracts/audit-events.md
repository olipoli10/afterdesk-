# Contract: Audit and Notification Vocabulary

**Parent**: [README.md](./README.md)

Two records are written for every transition, in the same transaction as the transition itself (FR-050): the primary `HumanWorkUnitTransition` row, and a mirror `TaskEvent` row for the surfaces that already render `TaskEvent` generically.

---

## 1. Closed cause vocabulary

`HumanWorkUnitTransition.cause` is a **closed** set. A cause not on this list may not be written, and the set is asserted by test — the same discipline `src/lib/ai-work-engine/exception-cause.ts` applies to its own vocabulary, where a build-failing test refuses any counterfactual-shaped name.

| Cause | From → To | Actor |
|---|---|---|
| `admitted` | — → `admitted` | system |
| `published` | `admitted` → `published` | system |
| `claimed` | `published` \| `revision_requested` → `claimed` | worker |
| `released` | `claimed` \| `submitted` \| `in_review` \| `revision_requested` → `published` | worker |
| `reclaimed` | same, via admin reassignment or a lease lapse | admin \| system |
| `submitted` | `claimed` \| `revision_requested` → `submitted` | worker |
| `review_opened` | `submitted` → `in_review` | admin |
| `accepted` | `submitted` \| `in_review` → `accepted` | admin |
| `revision_requested` | `submitted` \| `in_review` → `revision_requested` | admin |
| `exhausted:revisions` | `submitted` \| `in_review` → `exhausted` | admin |
| `exhausted:unsafe` | `submitted` \| `in_review` → `exhausted` | admin |
| `resumed` | `accepted` → `resumed` | system |
| `paused:publication_deadline` | `published` → `paused` | system |
| `paused:submission_deadline` | `claimed` \| `revision_requested` → `paused` | system |
| `paused:input_unavailable` | `admitted` → `paused` | system |
| `paused:classification_conflict` | `admitted` → `paused` | system |
| `paused:economics` | `accepted` → `paused` before resume | system |
| `admin_continued` | `paused:economics` → `accepted` within the unchanged ceiling | admin |
| `admin_failed_closed` | `paused` → `exhausted` | admin |
| `withdrawn:lifecycle_exit` | any non-terminal → `withdrawn` | admin \| system |
| `refused:self_review` | no state change — a **recorded refusal** (FR-019) | admin |
| `refused:stale_generation` | no state change — recorded refusal | worker \| admin |
| `refused:duplicate` | no state change — recorded refusal | worker \| admin |

Not-admitted verdicts (`unsupported_topology`, `malformed_topology`, `unmapped_economics`) produce **no** unit row, so they are recorded on the run and as a `TaskEvent` instead. This is what makes the unsupported population countable in production — the first real evidence toward the currently `UNKNOWN` demand question.

---

## 2. What an audit row may never contain (FR-049)

No money value. No credential. No raw input. No submitted content. No worker or client identity-bearing text. No material belonging to another task, client or accepted contract.

**Enforced by shape, not by filtering**: the table has no column able to hold any of them. `cause` is the closed vocabulary above; `actorId` is an opaque id, never a name or an email; there is no free-text column at all. Operator-facing detail lives in `HumanWorkUnitRunState.pausedDetail`, which is admin-only and separately constrained.

This mirrors the repository's own reasoning for the client timeline: a whitelist, not a filter, because "adding an event to the audit log can never, by itself, publish it" (`src/lib/queries/tasks.ts:609-627`).

---

## 3. `TaskEvent` mirror

Written with `action` set to one of:

`human_unit_admitted`, `human_unit_not_admitted`, `human_unit_published`, `human_unit_claimed`, `human_unit_released`, `human_unit_submitted`, `human_unit_accepted`, `human_unit_rejected`, `human_unit_exhausted`, `human_unit_resumed`, `human_unit_paused`, `human_unit_withdrawn`, `human_unit_refused`.

`meta` carries only non-sensitive scalars: `{ state, cause, claimGeneration, resumeGeneration, assignmentEstablished }`. Never a money value, never submitted content.

**None of these is added to `CLIENT_TIMELINE_LABELS`.** That map is a whitelist and anything unrecognised is dropped, so a client can never see these rows. A test asserts their absence so a future contributor cannot add one absent-mindedly (FR-061).

---

## 4. Notifications

Durable, through the existing `Notification` table, drained by `deliverPendingNotifications` and the existing cron (`src/server/notifications.ts`). **Queryability is not treated as notification** (spec Observability).

| Event | Audience | Type |
|---|---|---|
| Unit published | eligible pool workers, via the existing `writePoolNotifications` | existing pool type |
| Revision requested | the current claimant | `human_unit_revision_requested` |
| Publication deadline lapsed | admins | `human_unit_publication_deadline` |
| Submission deadline / lease lapsed | admins; a status notice to the affected claimant where applicable | `human_unit_submission_deadline` |
| Any admin-owned pause | admins | `human_unit_paused` |
| Revisions exhausted / unsafe | admins | `human_unit_exhausted` |
| Withdrawn on lifecycle exit | the current claimant, where applicable | `human_unit_withdrawn` |

**Exactly-once** comes from the `HumanWorkUnitAlert` unique key `(unitStateId, kind, dueAt)`, written in the same transaction as the notification. A replayed or concurrent sweep loses the constraint and sends nothing — no "have we already notified?" read, which would race (SC-016).

**A deadline lapse never auto-accepts, never auto-rejects, never consumes a revision, never resumes work and never spends** (FR-044, FR-059).

---

## 5. Reconstructability (FR-051, SC-009)

After the fact, from these records alone, an auditor can state:

| Question | Source |
|---|---|
| Which accepted result resumed which run | `HumanWorkUnitResumeRecord.acceptanceId` + `runId` |
| At which generation | `HumanWorkUnitResumeRecord.resumeGeneration` |
| Which downstream steps that resume made runnable | `resumedStepRunIds`; and which were not, with their own reasons, via `skippedStepRunIds` |
| Which worker held the task throughout | the `claimed` / `released` / `reclaimed` transitions with their `claimGeneration` and `assignmentEstablished` flags |
| Who accepted, when, at which generation, against which frozen criteria | `HumanWorkUnitAcceptance.acceptedById`, `acceptedAt`, `claimGenerationAtAcceptance`, `criteriaVersionRef` |
| Whether an assignment was established or matched | `HumanWorkUnitTransition.assignmentEstablished` |

**Every transition has exactly one audit record** — one, because the insert shares the transition's transaction and the CAS makes a repeat a no-op; at least one, because a rollback removes both together (SC-009).

---

## 6. Coverage-metric exclusion (FR-047, SC-012)

Human work performed through this path is **not** counted as machine coverage or Work Compiler coverage in any metric, report or external claim. `machineContribution` already measures cost share with explicit `planned`/`measured` provenance and never counts human work as machine (`src/lib/ai-work-engine/machine-contribution.ts`); nothing in this feature feeds it a new number, and nothing here may be presented as automation that did not happen.

The commercial questions — demand, frequency, coverage gain, willingness to pay, revenue impact — remain labelled `UNKNOWN` at release.
