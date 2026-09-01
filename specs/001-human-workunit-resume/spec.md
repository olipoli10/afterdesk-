# Feature Specification: HumanWorkUnit and Safe Resume v1

**Feature Branch**: `feat/human-workunit-resume`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Create HumanWorkUnit and Safe Resume v1 for AfterDesk. Existing CODE limitation: any human step currently causes all dependent downstream machine steps to be demoted, so the runtime cannot do machine -> human -> machine. Founder explicitly skips the 20-case validation; demand, frequency, coverage gain, willingness to pay and revenue impact are UNKNOWN. V1 must support exactly one non-parallel structured human unit inside an immutable accepted workflow run, then resume eligible downstream machine steps exactly once from an accepted typed human result. [...] Success: deterministic machine-human-machine completes with one accepted human result and each downstream step once; concurrency/replay/crash cannot duplicate resume; unsupported/economically unknown cases spend zero unauthorized downstream budget and expose a manual path; authorized users understand state; commercial outcome remains UNKNOWN."

---

## Problem Statement and Evidence

**The limitation.** When an accepted plan contains a step that a person must execute, every step that transitively depends on it is classified as not-machine-runnable and folded into the residual human package. The run reaches a waiting state, publishes one residual mandate covering all remaining human work, and never returns to machine execution. A plan of the shape *machine → human → machine* therefore executes as *machine → human(everything after)*. `CODE` — read from the dependency-resolution rule and from the terminal handover path in the run engine.

**Denominator.** The population this problem applies to is: accepted mandates whose accepted plan contains at least one human-executed step with at least one machine-runnable step downstream of it. The size of that population is `UNKNOWN` — it has not been measured against real customer mandates.

**Explicitly unmeasured.** The founder has elected to build this capability without the 20-case validation. The following are `UNKNOWN` and MUST remain labelled `UNKNOWN` on every surface, report and release note until real customer evidence exists:

| Question | Label |
| --- | --- |
| How often customers need a mid-run human judgment | `UNKNOWN` |
| How much truthful coverage this adds | `UNKNOWN` |
| Whether customers will pay for it | `UNKNOWN` |
| Revenue and margin impact | `UNKNOWN` |
| Worker supply and latency for structured mid-run units | `UNKNOWN` |

This specification is selected against an `UNKNOWN`, and says so, as the constitution's feature-selection rule requires. The work is scoped so that the cost of being wrong is bounded: the supported shape is narrow, everything outside it keeps today's behaviour, and no economics change.

---

## Clarifications

### Session 2026-08-14

- Q: Are approved workers members of a client tenant, and is worker access gated by tenant membership? → A: No. Approved VAs are platform workers, not members of a client tenant, and no worker-side tenant membership model exists. Worker access rechecks approved-VA status, task/category/tier eligibility, the unit's binding to one task and accepted contract, active claim holder and claim generation, and the data classification projection, at every use. Cross-client isolation comes from that binding plus minimum-necessary field projection, not from worker tenancy. Client and admin paths continue to enforce client ownership or admin role.
- Q: Does the Human Work Unit create a second worker engagement, or is it worked by the task's single payable worker? → A: One payable task-level worker, not a second engagement. Claiming the unit atomically establishes or matches the task's sole worker assignment; that worker remains the task claimant and payee through resumed machine work and any later residual completion. The accepted fixed task payout is shown before that claim and stays unchanged afterwards. If the task already has a different claimant, the unit claim is refused. No second worker is paid for the unit and no partial payout is invented. Existing voluntary release, final QC and payout semantics remain as they are today.
- Q: Who reviews and accepts a candidate result in V1? → A: An authorized admin, who must not be the submitting VA. V1 has no separate reviewer membership model and introduces no new reviewer role.
- Q: Does accepting the human result create a second claim or a second economic relationship when the run resumes? → A: No. The run may wait while the task is already bound to its worker, and acceptance resumes the run only. If downstream automation later fails, the existing residual path routes the remaining work to the same task claimant where that worker is still eligible; otherwise it pauses for an admin rather than silently opening a second paid claim.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A mandate resumes machine work after one human judgment (Priority: P1)

An accepted mandate's plan is: the machine gathers and normalizes source material, a qualified person makes one bounded structured judgment that the machine cannot make, and the machine then formats and assembles the result from that judgment. Today the person receives everything from their step onward. With this feature, the machine runs its first block, pauses at the human unit, an eligible approved worker takes the task and receives only that unit with only the inputs it needs, an authorized admin accepts the typed result, and the machine runs the remaining steps once — with the same worker still holding the task.

**Why this priority**: This is the entire feature. Without it the run engine cannot express *machine → human → machine* at all, and every other story in this specification exists only to make this one safe.

**Independent Test**: Take a mandate whose accepted plan matches the supported shape, run it end to end, and verify that the pre-human machine steps executed, the human unit was published with exactly its declared inputs, one worker took the task at the accepted fixed payout, the accepted typed result fed the downstream steps, and every eligible downstream step executed exactly once.

**Acceptance Scenarios**:

1. **Given** an accepted run in the supported shape whose pre-human machine steps have all completed, **When** the run reaches the human unit, **Then** the run enters a waiting state, the human unit becomes available to eligible approved workers at the accepted fixed task payout, and no downstream step is started, reserved against, or shown as runnable.
2. **Given** an eligible approved worker who claims the human unit, **When** the claim succeeds, **Then** the task's sole worker assignment is established in the same atomic action, the payout the worker saw before claiming is the one frozen to them, and that worker remains the task claimant and payee for the rest of the mandate.
3. **Given** a human unit whose typed result has been accepted by an authorized admin, **When** the run resumes, **Then** every downstream step that is machine-runnable on its own merits becomes runnable exactly once, receives the accepted result as an input, and executes at most once — while the task stays bound to the same worker and no new claim or engagement is created.
4. **Given** a run that has resumed and completed its downstream machine steps, **When** the run finishes, **Then** it hands over through the existing completion path with the accepted human result recorded as the resume source, and the accepted contract's scope, price, plan and capability versions, budget ceiling, payout totals, data classification and stored artifact bytes are byte-for-byte and value-for-value unchanged.
5. **Given** a downstream step that is not machine-runnable for a reason unrelated to the human dependency — no registered capability, a capability version that moved since acceptance, or an earlier budget demotion — **When** the run resumes, **Then** that step is not resumed, its own reason is preserved and reported unchanged, and it remains work for the same task claimant under the existing residual path.

---

### User Story 2 - An admin accepts or rejects a candidate result, with a bounded number of revisions (Priority: P1)

A worker submits their result for the human unit. That submission is a candidate, never an authority. An authorized admin, who is not the submitting worker, examines it against the frozen acceptance criteria and either accepts it — which is the only event that can resume machine work — or rejects it with a revision request. Revisions are bounded. When the bound is exhausted, the run does not guess: it fails closed into the existing manual residual path.

**Why this priority**: Acceptance is the gate that turns human output into machine input. Without a separate, authorized, non-self-serve acceptance step, a submission would silently become a contract input, and the constitution's separation of producing, verifying and delivering would collapse into one gate.

**Independent Test**: Submit a candidate, verify no downstream step can start; reject it, verify the unit returns to workable state with the revision counter decremented and the task still held by the same worker; resubmit and accept, verify the run resumes exactly once.

**Acceptance Scenarios**:

1. **Given** a submitted candidate result awaiting review, **When** any downstream machine step is evaluated for execution, **Then** it is not runnable and no provider spend, budget reservation or hold is created for it.
2. **Given** a submitted candidate result, **When** an authorized admin rejects it with revision instructions and the frozen revision bound is not exhausted, **Then** the unit becomes workable again by the same task claimant, the remaining revision count decreases by exactly one, the previous candidate is retained as evidence, and no machine step resumes.
3. **Given** a candidate result whose revision bound is exhausted, or which the admin judges unsafe or unverifiable, **When** the admin rejects it, **Then** the run fails closed into the existing manual residual handling with an explicit recorded cause, and zero downstream budget is spent.
4. **Given** a submitted candidate, **When** the submitting worker attempts to review or accept their own submission, **Then** the action is refused and recorded.
5. **Given** a result that does not satisfy the frozen output schema or is missing a required declared artifact, **When** it is submitted, **Then** the submission is refused with a message naming what is missing, and the worker keeps the task and the unit.
6. **Given** an already-accepted or already-rejected candidate, **When** a second review decision arrives for it, **Then** the second decision is refused as a duplicate, the first decision stands, and no state is overwritten.

---

### User Story 3 - Unsupported shape or unpriceable effort keeps today's behaviour (Priority: P2)

A mandate whose plan contains more than one human unit, human work on parallel branches, or a human unit whose effort cannot be honestly contained within the accepted fixed task payout, must not enter this feature's path at all. It keeps exactly today's behaviour: everything downstream of the human work becomes the residual package, one mandate reaches the worker pool, and nobody is told automation happened that did not.

**Why this priority**: The narrow supported shape is what makes V1 defensible against an `UNKNOWN` demand signal. The fallback must be provably identical to today's path, or the feature has widened the blast radius rather than narrowed it.

**Independent Test**: Compile mandates with two human steps, with a human step on a parallel branch, and with a human step carrying no usable effort provenance, and verify each produces exactly the residual outcome it produces today.

**Acceptance Scenarios**:

1. **Given** an accepted plan with two or more human-executed steps, **When** the run is admitted, **Then** it is refused admission to the resume path, keeps today's demotion-and-residual behaviour, and records the refusal cause as an unsupported topology.
2. **Given** an accepted plan with exactly one human-executed step but at least one machine step that is neither an ancestor nor a descendant of it, **When** the run is admitted, **Then** it is refused admission on the same fail-closed basis.
3. **Given** an accepted plan with exactly one human-executed step that fails the frozen-provenance test in FR-035, **When** the run is admitted, **Then** it is refused admission, the run pauses or falls back to manual handling, and no payout, price or effort figure is inferred, derived, split or invented.
4. **Given** any refusal above, **When** an admin inspects the run, **Then** the reason is stated in its own terms — unsupported topology, or unmapped economics — and never as a missing capability and never as a budget decision.

---

### User Story 4 - Two workers reach for the same unit and only one gets it (Priority: P2)

The human unit is offered to eligible approved workers. Several may open it at the same moment. Exactly one may take it, and taking it is the same act as becoming the task's single worker. A holder who disappears must not block the unit forever, and a holder whose lease has lapsed must not be able to submit as if nothing happened.

**Why this priority**: Every safety property of the resume depends on there being one identified holder, one task assignment and one submission lineage. Contention is the ordinary case in a pool, not an edge case.

**Independent Test**: Fire concurrent claims from several eligible workers against one unit and assert exactly one success and exactly one task assignment; let a claim lapse, reclaim it from a second eligible worker, then have the first attempt to submit.

**Acceptance Scenarios**:

1. **Given** a published human unit and several simultaneous claim attempts from eligible approved workers, **When** the claims are processed, **Then** exactly one succeeds and establishes the task's sole worker assignment in the same atomic action; the others are refused with an "already taken" outcome, and no duplicate holder or second assignment is ever recorded.
2. **Given** a task that already has a different claimant, **When** a worker attempts to claim its human unit, **Then** the claim is refused, and no second worker becomes able to work or be paid for that unit.
3. **Given** a claim whose lease has expired without a submission, **When** another eligible worker claims the unit, **Then** the claim succeeds under the existing reassignment semantics, the stale holder loses the ability to submit against it, and any late submission from the stale holder is refused as stale rather than accepted or silently merged.
4. **Given** an actor who is not an approved worker, who fails the task's category, tier or prior-delivery eligibility, who is not the active claim holder, or whose approval is withdrawn after claiming, **When** they attempt to view, claim, submit or revise, **Then** the action is refused at the point of use, regardless of any earlier successful check.
5. **Given** a claimed human unit, **When** the worker opens it, **Then** they see only the declared minimum necessary inputs for this one task and no client price, no material belonging to any other task, client or accepted contract, no credentials, and no identity-bearing content that the mandate's data classification does not permit.
6. **Given** a worker who cannot complete the unit, **When** they release the task, **Then** the existing voluntary release semantics apply unchanged, no revision is consumed, the run does not advance, and no money moves.

---

### User Story 5 - An admin can see why a run is waiting and what to do next (Priority: P3)

A run sitting in a waiting state is an operational liability if nobody can tell whether it is healthy. The admin surface must answer, without reading storage directly: why is this waiting, who is allowed to act, how long until it goes stale, how many revisions remain, and what is the safe next action.

**Why this priority**: It does not change what the system can execute, but it is what keeps a waiting run from silently ageing into a support incident — the failure mode the residual pause path was already found to have.

**Independent Test**: Put runs into each waiting state — published, claimed, submitted, in review, revision requested, exhausted, paused for economics, refused for topology — and confirm each renders a distinguishable cause, actor set, deadline, revision count and next action.

**Acceptance Scenarios**:

1. **Given** a run waiting on a human unit in any of its states, **When** an authorized admin views it, **Then** they see the cause of the wait, who is authorized to act — the eligible worker pool, the current claimant, or an admin — the applicable deadline, the revisions remaining, and one recommended safe next action.
2. **Given** a run that failed closed for unsupported topology or unmapped economics, **When** an admin views it, **Then** the surface names that cause specifically and offers the manual path, and does not display a missing-capability or budget-demotion badge for that step.
3. **Given** any transition of the human unit, **When** an auditor reads the trail afterwards, **Then** the actor, timestamp, source state, target state, cause, claim generation and resume generation are reconstructable, and no money value, credential, raw input, submitted content or material belonging to another task, client or accepted contract appears anywhere in that trail.

---

### Edge Cases

- **Cancellation while a unit is claimed or under review.** The mandate is cancelled or otherwise leaves the executing lifecycle. The unit is withdrawn, the worker is told it is no longer actionable, any later submission or decision is refused, every already-durable candidate is retained as immutable evidence under the existing purge policy, and no downstream step ever becomes runnable.
- **The task already has a different claimant.** The unit claim is refused. The feature never creates a second worker able to work or be paid for the same task.
- **Acceptance arriving after the run has already left the executing lifecycle.** The acceptance is refused as a lifecycle-exit conflict; it cannot revive a finished, abandoned or cancelled run.
- **Crash between acceptance and resume.** Recovery replays the resume from the accepted result. Each eligible downstream step still transitions exactly once; a step that had already been made runnable is not made runnable again.
- **Crash mid-downstream-step.** The existing lease, fencing and replay rules govern. A downstream step that is not safe to replay is not eligible for resume in the first place.
- **Downstream automation fails after the resume.** The remaining work routes through the existing residual path to the same task claimant where that worker is still eligible; otherwise the run pauses for an admin. It never silently opens a second paid claim.
- **Duplicate submission.** A second submission from the same holder against the same claim generation is refused as a duplicate; it does not create a second candidate and does not reopen a completed review.
- **Two admins deciding simultaneously.** Exactly one decision is recorded; the loser is refused as a duplicate and sees the decision that stood.
- **Acceptance racing a lease expiry or a reclaim.** A decision carrying a stale claim or resume generation is refused; the newer state is never overwritten by the older actor.
- **Worker releases the task while the run waits.** Existing voluntary release semantics apply: the task returns to the pool, the abandonment is recorded, no new revision is consumed, no money moves, and the run stays waiting for a new eligible claimant. A revision consumed before release stays consumed and follows the unit to the next claimant; if nobody reclaims before the frozen deadline, the run pauses and alerts an admin without another revision being consumed.
- **Worker loses eligibility mid-flight** — approval withdrawn, or the task's tier or category requirements stop being met. Their subsequent actions are refused at the point of use, any candidate already submitted is preserved as evidence, and reassignment follows the existing path rather than opening a second paid claim.
- **Deadline passes with no claim, or with a claim but no submission.** The run pauses for an admin with an explicit cause. It does not resume, does not auto-accept, and does not spend.
- **The human unit's declared inputs are not available** — a producing step failed permanently, or an input's data classification forbids the unit's reach. The unit is not published; the run fails closed to manual handling with that cause.
- **Downstream step was already budget-demoted before the human unit ran.** It stays demoted, is reported as a budget decision, and is never resurrected by acceptance.
- **Accepted result would need more effort than the accepted contract reserved.** The run pauses for an admin decision. No payout is silently reduced, no reserve is silently raised, and no partial or per-unit payout is invented.
- **A worker submits far more or far less than the unit's declared scope.** The frozen acceptance criteria decide; there is no automatic acceptance, and volume alone never accepts or rejects.
- **Replay of the admission decision.** Re-admitting the same accepted contract yields the same supported/unsupported verdict; the verdict is a property of the frozen contract, not of when it was evaluated.

---

## Requirements *(mandatory)*

### Functional Requirements

**Role terminology used below.** `VA` and `worker` name the same platform-worker role. An `approved worker` is a worker whose current approval and eligibility facts satisfy the rules frozen on the unit. The `claimant` is that approved worker while they hold the task at the current claim generation. An `admin` is the separately authorized reviewer and operator; the submitting worker can never act as that candidate's admin reviewer.

#### A. The frozen human work unit and topology admission

- **FR-001**: The system MUST represent a mid-run human step as a structured Human Work Unit whose definition is frozen when the plan version is accepted and is never mutated for the lifetime of the run.
- **FR-002**: A frozen Human Work Unit definition MUST carry, at minimum: the instructions given to the worker; the minimum necessary inputs it may see; the required output schema and the required artifacts; the acceptance criteria a reviewer applies; the worker eligibility requirements that gate it; the reviewer authority required; the expected minutes; the bounded number of revisions; the publication, submission and claim-lease durations; and the provenance of the accepted effort and economics it draws on.
- **FR-003**: The system MUST admit a run to the resume path only when the accepted plan contains exactly one human-executed step and every other step is either an ancestor or a descendant of it in the accepted plan's dependency graph, so that the unit is a single ordering cut with no branch crossing it. A dependency cycle or dependency on a nonexistent step MUST fail this admission test as unsupported topology.
- **FR-004**: A run that fails the admission test for any reason MUST fail closed to the existing behaviour — downstream demotion and one residual human package — with no change to what a worker, client or admin is shown today beyond an added, distinct refusal cause.
- **FR-005**: The admission verdict MUST be a deterministic function of the frozen accepted contract, so that re-evaluating it at any later time or after any restart produces the same verdict.
- **FR-006**: A change to the definition of a Human Work Unit MUST produce a new plan version and MUST NOT alter any run already executing against the previous one.

#### B. Publication, eligibility, claim and worker safety

- **FR-007**: The system MUST publish a Human Work Unit only after every step it depends on has completed, and MUST NOT publish it if any declared input is unavailable or if the unit's reach exceeds the most restrictive data classification present in its inputs.
- **FR-008**: Each Human Work Unit MUST be bound to exactly one task and one accepted contract. Isolation from every other client's work MUST come from that binding together with minimum-necessary field projection.
- **FR-009**: Every worker-side read and mutation on a Human Work Unit MUST recheck, at the point of use: the worker's current approval, certification, tier, prior-delivery and work-in-progress facts against the eligibility rules frozen on the unit; the unit's binding to this task and accepted contract; that the actor is the active claim holder at the current claim generation; and the data classification projection. No check MUST be inherited from an earlier step, an earlier successful check, or a client-supplied value. A global eligibility-configuration change MUST affect only units admitted afterwards, while a change to the individual worker's facts MUST affect live access.
- **FR-010**: Worker access MUST NOT require, imply or be modelled on membership of a client tenant. Client-side and admin-side access MUST continue to be enforced by client ownership and admin role respectively.
- **FR-011**: Claiming a Human Work Unit MUST atomically establish the task's sole worker assignment, or match it when the claiming worker already holds the task. If the task already has a different live claimant, the claim MUST be refused. An expired-lease reassignment MUST first atomically invalidate the prior generation and clear both the unit holder and task claimant under the existing non-payment release/reassignment semantics; only then MAY a new claim establish the next sole assignment, with no overlap and no second payout record.
- **FR-012**: The system MUST allow at most one holder of a Human Work Unit at any time, and MUST resolve simultaneous claims so that exactly one succeeds, the rest are refused, and no second task assignment is created.
- **FR-013**: A claim MUST carry a bounded lease and a claim generation. An expired lease MUST be reclaimable through the existing reassignment path without duplicating any effect, and any action carrying a superseded claim generation MUST be refused as stale.
- **FR-014**: The worker surface MUST show only the frozen minimum necessary inputs for this task. Every visible field or artifact MUST be declared in the frozen unit, required by an instruction, output or acceptance rule, and permitted by the applicable data classification; everything else MUST be omitted. Exposure is deny-by-default, including for fields added after the unit definition was frozen. The surface MUST NOT expose the client price, material belonging to any other task, client or accepted contract, credentials, or identity-bearing content that the mandate's data classification does not permit.
- **FR-015**: A worker who cannot complete the unit MUST be able to release the task under the existing voluntary release semantics. A release MUST consume no new revision, advance no run state, and move no money. If a revision was already consumed before release, it MUST remain consumed and the next valid claimant MUST inherit the frozen remaining count.

#### C. Submission and review

- **FR-016**: A submission MUST be recorded as a candidate result only. A candidate MUST NOT be readable as an input by any machine step, and MUST NOT satisfy any downstream dependency.
- **FR-017**: The system MUST refuse a submission that does not satisfy the frozen output schema or is missing a required declared artifact, and MUST state what is missing without taking the task or the unit away from the worker.
- **FR-018**: Persisting a candidate, transitioning the unit to submitted, and appending the transition audit record MUST be one atomic outcome. A crash before commit MUST leave no candidate and no state change so the same request can be retried safely; a crash after commit MUST expose exactly one candidate. The system MUST refuse a duplicate submission against an already-submitted claim generation, and MUST NOT create a second candidate or reopen a concluded review.
- **FR-019**: Only an authorized admin who is not the submitting worker MUST be able to accept or reject a candidate. V1 MUST NOT introduce a separate reviewer role or a reviewer membership model.
- **FR-020**: The system MUST record exactly one review decision per candidate. A second decision MUST be refused as a duplicate, and the first MUST stand unmodified.
- **FR-021**: A rejection MUST either return the unit to workable state by the same task claimant with the remaining revision count decremented by exactly one, or — when the bound is exhausted, or the admin judges the work unsafe or unverifiable — fail the run closed into the existing manual residual handling with that cause recorded.
- **FR-022**: The remaining revision count MUST be bounded by the value frozen at admission and MUST NOT be raised for a live run by any actor or configuration change.
- **FR-023**: Acceptance MUST produce a typed accepted human result that is immutable thereafter, and MUST be the only event in the system capable of resuming downstream machine execution.

#### D. Safe resume

- **FR-024**: On acceptance, the system MUST make runnable exactly those downstream steps that are machine-runnable on their own merits — a non-human executor, a registered capability at the version pinned by the accepted contract, no prior budget demotion, and all other dependencies satisfied.
- **FR-025**: A downstream step that is not machine-runnable for a reason other than the human dependency MUST NOT be resumed, and its own reason MUST be preserved and reported unchanged.
- **FR-026**: Each eligible downstream step MUST transition out of its waiting state exactly once for a given accepted result, and MUST execute at most once, under concurrent triggers, retries, scheduled sweeps, process crashes and replays.
- **FR-027**: The resume MUST carry a monotonic generation. Any resume attempt carrying a stale generation, a superseded claim, or a superseded acceptance MUST be refused and MUST NOT overwrite newer state.
- **FR-028**: A resume attempt MUST be refused when the run has left the executing lifecycle — cancelled, abandoned or finished — and MUST NOT revive it. A run in an admin-owned pause MUST refuse every automatic, retried, swept or replayed resume and MAY continue only through an explicit recorded admin decision under FR-037; that continuation MUST NOT apply to a cancelled, abandoned or finished run.
- **FR-029**: Recovery after a crash between acceptance and resume MUST converge on the same outcome as an uninterrupted resume, with no step made runnable twice and no accepted result applied twice.
- **FR-030**: Acceptance MUST resume the run only. It MUST NOT create a second claim, a second worker assignment, a second payable engagement or any new economic relationship. The task's existing claimant and payee MUST be unchanged by the resume, and the run MAY continue to wait while the task remains bound to that worker.

#### E. Economics and spend containment

- **FR-031**: The system MUST spend nothing with any external execution provider on behalf of a run between the publication of its Human Work Unit and the acceptance of its result. Provider spend means a provider reservation, hold, invocation or settlement attributable to the run; ordinary first-party storage, user-interface and notification overhead is outside that measure and MUST NOT be relabelled as provider execution spend. Waiting, claiming, viewing, submitting, reviewing and revision-requested states MUST create no provider call, budget reservation, spend hold or settlement.
- **FR-032**: Downstream machine steps MUST reserve and settle spend only after acceptance, and only within the automation budget ceiling frozen on the accepted contract. The ceiling MUST NOT be raised, recomputed or re-derived because a human unit ran.
- **FR-033**: Exactly one worker MUST be payable per task. The system MUST NOT create a per-unit payout, a second payable engagement, or a partial payout for the Human Work Unit.
- **FR-034**: The accepted fixed task payout MUST be shown to a worker before they claim the unit, MUST be frozen to that worker at claim by the existing mechanism, and MUST NOT be recomputed, reduced or raised afterwards by anything in this feature, including the later completion handover.
- **FR-035**: The system MUST NOT infer, derive, split or invent any effort, price or payout figure from the existence, duration, difficulty or content of a Human Work Unit. Economic admission MUST succeed only when the frozen unit's provenance identifies exactly one accepted human plan step, that step already carries non-null frozen effort provenance in the accepted plan, the accepted task carries its fixed payout, and the unit adds no instruction, input, output, artifact or acceptance obligation beyond that step. A missing provenance value, a scope mismatch or a unit not mapped one-to-one to that accepted human step MUST refuse admission as unmapped economics. The test MUST use only frozen accepted-contract fields and MUST NOT calculate adequacy from expected minutes.
- **FR-036**: The accepted contract's client price, worker payout totals, reserved budget and expected margin MUST be identical before and after the human unit runs. The existing task-level payout integrity rules, including the refusal to reduce a payout without a proven reduction, MUST NOT be weakened.
- **FR-037**: A run whose accepted result would require exceeding the reserved payout or the frozen budget ceiling MUST pause for an admin decision rather than adjust either figure. That pause and any later continuation MUST retain the original ceiling; continuation MAY reserve only the authorized budget that remains and MUST NOT rederive or raise the ceiling.
- **FR-038**: A step demoted for budget MUST continue to be reported as a budget decision and MUST NOT be reported as a missing capability or as a human dependency, on any surface added by this feature.

#### F. Immutability of the accepted contract

- **FR-039**: The accepted scope, client price, plan version, capability versions, automation budget ceiling, payout totals, data classification and stored artifact bytes MUST be unchanged by every path introduced by this feature, including every failure and recovery path.
- **FR-040**: The accepted human result MUST be additive evidence attached to the run. It MUST NOT overwrite, reinterpret or supersede any part of the accepted contract or any previously recorded artifact.
- **FR-041**: Every durably submitted candidate — pending, rejected, superseded, or present when the unit is cancelled or withdrawn — MUST be retained as immutable evidence under the platform's authorized retention and purge policy, extended to these candidate records and artifacts, MUST NOT be mutated after withdrawal, and MUST NOT be presented as a deliverable or downstream input unless it is the accepted result.

#### G. Cancellation, exit and fail-closed behaviour

- **FR-042**: When the mandate is cancelled or otherwise leaves the executing lifecycle, the system MUST withdraw the Human Work Unit, refuse subsequent claims, submissions and reviews, and guarantee that no downstream step becomes runnable.
- **FR-043**: When a worker's approval or eligibility is lost or withdrawn, the system MUST refuse their subsequent actions at the point of use, preserve any candidate they had already submitted as evidence, and reassign only through the existing path — never by opening a second paid claim.
- **FR-044**: When a publication deadline or a submission deadline passes without progress, the system MUST pause the run with an explicit cause and MUST NOT resume, auto-accept, or spend.
- **FR-045**: When downstream automation fails after a resume, the system MUST route the remaining work through the existing residual path to the same task claimant where that worker is still eligible, and otherwise MUST pause for an admin. It MUST NOT open a second paid claim.
- **FR-046**: Every fail-closed path MUST land the mandate in the existing manual residual handling or in an admin-visible pause, and MUST NOT leave a run in a state with no owner and no next action.
- **FR-047**: Human work performed through this path MUST NOT be counted as machine coverage or Work Compiler coverage in any metric, report or external claim.

#### H. Audit and observability

- **FR-048**: The system MUST record every state transition of a Human Work Unit — admitted, published, claimed, released, reclaimed, submitted, accepted, rejected, revision requested, exhausted, withdrawn, resumed, paused — with actor, timestamp, source state, target state, cause, the claim and resume generations in force, and whether the task assignment was established or matched.
- **FR-049**: Audit records MUST NOT contain money values, credentials, raw inputs, submitted content, worker or client identity-bearing text, or any material belonging to another task, client or accepted contract.
- **FR-050**: Each transition and its audit record MUST be durable together, so that no transition can be observed without its record and no record can describe a transition that did not take effect.
- **FR-051**: The system MUST make reconstructable, after the fact, which accepted human result resumed which run, at which generation, which downstream steps that resume made runnable, and which worker held the task throughout.

#### I. Admin surface

- **FR-052**: An authorized admin MUST be able to see, for any run waiting on a human unit: the cause of the wait, who is authorized to act — the eligible worker pool, the current claimant, or an admin — the applicable deadline, the revisions remaining, and one recommended safe next action. The safe action MUST be: claim or keep waiting for a published unit; submit or release for a claimed unit; accept or reject for a submitted/in-review unit; revise or release after a revision request; explicitly continue within the frozen ceiling or fail closed for an economics pause; and open the existing manual residual path for a topology refusal, exhausted revisions, unavailable input, classification conflict or deadline lapse.
- **FR-053**: The admin surface MUST name a topology refusal and an economics refusal in their own terms, distinctly from a missing capability and from a budget demotion.
- **FR-054**: Role-scoped projections MUST omit fields a role may not see. The worker payout MUST NOT appear in a client projection, the client price MUST NOT appear in a worker projection, and candidate content MUST NOT reach an actor not authorized for the mandate's data classification.

#### J. Lifecycle visibility, deadlines, evidence and controlled rollout

- **FR-055**: While a unit is workable, its active claimant MUST have the minimum projection defined by FR-014. After submission that projection MUST be read-only until review; rejection within the bound MUST restore workable access. After acceptance, resume, completion or withdrawal, the unit's inputs and candidate content MUST no longer be available on worker unit surfaces. Rejected and superseded candidates remain retained evidence, not generally worker-visible data.
- **FR-056**: An accepted human result and every artifact it declares MUST inherit the frozen mandate classification and at least the most restrictive classification of its declared inputs. Classification MUST never be downgraded, and the platform's existing scanning, visibility, retention and purge rules MUST apply.
- **FR-057**: On an admitted resume path, the accepted fixed task payout MUST be authoritative from pre-claim display through final completion. Any residual payout recomputation or adjustment MUST be bypassed, including after a resumed downstream failure: residual scope MAY change, but the payout and sole payee MUST NOT.
- **FR-058**: The publication deadline MUST begin when the unit is published. The submission deadline and the claim lease MUST each begin at every successful claim or reclaim. Their durations MUST be frozen at admission, configurable only for future units, and default to 72 hours independently of expected minutes. Expected minutes MUST be descriptive capacity context only and MUST NOT be an input to a lease, price, payout, effort allocation or other economic computation.
- **FR-059**: A publication or submission deadline lapse and every admin-visible pause MUST create a durable admin alert through the platform's existing notification mechanism. An affected claimant MUST receive a status notice when applicable. A deadline lapse MUST NOT auto-accept, auto-reject, consume a revision, resume work or spend.
- **FR-060**: If a released or expired unit still has revisions remaining but no eligible worker reclaims it before the applicable deadline, the run MUST pause with an admin alert and the frozen remaining revision count unchanged.
- **FR-061**: After acceptance and while the task remains assigned, the claimant MUST be able to see only a minimal read-only status — accepted, resuming, running, paused or completed — and one safe next action. V1 MUST add no client-facing Human Work Unit surface or data projection; existing client task visibility remains unchanged.
- **FR-062**: Final quality review MUST NOT reopen, mutate or replace an internally accepted human result and MUST NOT automatically replay that result or rerun downstream steps. A final-quality rejection MUST use the existing task revision or residual handling for the same claimant, subject to the existing explicit reassignment path.
- **FR-063**: The Human Work Unit transition and decision audit trail MUST be append-only and immutable through normal product and operator paths. The authorized retention or purge policy MUST explicitly cover these records before any removal is possible; records MUST never change through an update or ad hoc delete.
- **FR-064**: The resume path MUST be off by default behind an explicit platform-level rollout control. Enabling it MUST affect only runs newly admitted afterwards; runs compiled or admitted while it was off and historical runs MUST keep their prior semantics.
- **FR-065**: Disabling the rollout control MUST refuse every new admission immediately while allowing an already-admitted or waiting run to resolve through acceptance, rejection or fail-closed admin handling. Rollback MUST NOT strand a mandate or claimant and MUST NOT change the meaning of any existing run, residual package, payout, accepted result or audit record.

### Key Entities

- **Human Work Unit (frozen definition)**: The immutable description of the one human step admitted to the resume path — instructions, minimum necessary inputs, required output schema and artifacts, acceptance criteria, worker eligibility requirements, required reviewer authority, expected minutes, revision bound, and accepted economic provenance. Belongs to exactly one accepted plan version.
- **Human Work Unit state**: The live state of that unit inside one run — not admitted, admitted, published, claimed, submitted, in review, revision requested, accepted, exhausted, withdrawn — together with its claim generation, remaining revisions and applicable deadlines. Exactly one per admitted run, bound to exactly one task and accepted contract.
- **Claim**: The task's single worker assignment as seen through the unit — an approved eligible worker's exclusive, leased hold, carrying a holder identity, a lease expiry and a generation. Claiming the unit establishes or matches this assignment; there is at most one per task, and it is the same assignment that carries the payout and survives through resumed machine work and final completion.
- **Candidate result**: A submitted, schema-conforming, not-yet-authoritative result with its declared artifacts, bound to the claim generation that produced it. Multiple candidates may exist across revisions; none is an input to anything.
- **Accepted human result**: The single typed, immutable result an authorized admin accepted. The only resume source, and an input to eligible downstream steps.
- **Review decision**: One accept-or-reject record per candidate, carrying the deciding admin's identity, outcome, cause and — for a rejection — the revision instructions and the resulting remaining count.
- **Resume record**: The durable fact that a given accepted result resumed a given run at a given generation, and the set of downstream steps it made runnable. One per run.
- **Refusal cause**: The named reason a run was not admitted or was failed closed — unsupported topology, unmapped economics, unavailable input, classification conflict, task already claimed by another worker, revisions exhausted, deadline elapsed, lifecycle exit — distinct from missing capability and from budget demotion.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A mandate in the supported shape completes deterministically as machine → human → machine, with exactly one accepted human result and each eligible downstream step executed exactly once, in 100% of runs across the acceptance suite.
- **SC-002**: Under simultaneous claim attempts by multiple eligible workers on one unit, exactly one succeeds in 100% of trials, exactly one task worker assignment exists afterwards, and zero duplicate holders or second assignments are ever recorded.
- **SC-003**: Across every completed and every failed run, at most one worker is payable per task; zero per-unit payouts, second engagements or partial payouts are created.
- **SC-004**: The payout figure a worker sees before claiming equals the figure frozen to them at claim and the figure at final completion, with zero drift, in 100% of admitted runs.
- **SC-005**: Duplicate submissions, duplicate review decisions, stale claims, stale generations, process crashes and full replays produce zero duplicate resumes, zero duplicate downstream executions and zero second claims across the concurrency and recovery suites.
- **SC-006**: Provider spend attributable to a run between publication of its human unit and acceptance of its result is zero, measured in every case, with no exception.
- **SC-007**: Mandates whose shape is unsupported or whose effort cannot be contained within the accepted economics consume zero unauthorized downstream budget, and 100% of them land in the existing manual residual path or an admin-visible pause with a named cause and an available manual next action.
- **SC-008**: For every completed run, the accepted scope, client price, plan and capability versions, budget ceiling, payout totals, data classification and stored artifact bytes compare identical before and after — zero drift.
- **SC-009**: Every human-unit state transition has exactly one audit record; zero audit records contain money values, credentials, raw inputs, submitted content, or material belonging to another task, client or accepted contract; and zero transition or decision records are altered or removed outside the authorized retention or purge policy.
- **SC-010**: An authorized admin, viewing any waiting run, can state within 30 seconds and without querying storage directly why it waits, who may act, the deadline, the revisions remaining and the safe next action — verified on every waiting state, including every refusal cause.
- **SC-011**: Zero runs reach a waiting state with no owner and no available next action.
- **SC-012**: No surface, metric, report or release note counts human work performed through this path as machine coverage, and the commercial questions — demand, frequency, coverage gain, willingness to pay and revenue impact — remain labelled `UNKNOWN` at release.
- **SC-013**: Across the rollout suite, 100% of runs started with the control off and 100% of historical runs retain existing behaviour; disabling the control yields zero new admissions while every already-admitted run still reaches acceptance, rejection or a named admin-owned fail-closed state.
- **SC-014**: Across every lifecycle state and data classification in the authorization suite, zero worker projections contain undeclared fields, forbidden categories, client prices, cross-task material, credentials or post-acceptance Human Work Unit inputs and candidate content; zero client projections contain a worker payout; zero worker-side access decisions depend on client-tenant membership; and every post-acceptance claimant view shows exactly one permitted status value and one safe next action.
- **SC-015**: Across crashes injected immediately before and after candidate commit, every retry converges to exactly zero or one durable candidate consistent with the unit state and exactly one matching audit record; no partial submission state is observable.
- **SC-016**: Every publication or submission deadline lapse and every admin pause in the deadline suite creates exactly one durable actionable admin alert, causes zero automatic acceptance, rejection or revision consumption, and incurs zero provider execution spend.
- **SC-017**: Across final-quality rejection scenarios, the accepted human result, resume record and already-completed downstream executions remain unchanged in 100% of cases, and the existing task path identifies the same claimant or an explicit authorized reassignment.

---

## Authorization and Data Classification

**There is no worker-side tenant model, and V1 does not invent one.** Approved workers are platform workers, not members of a client organization. Isolation between clients on the worker side comes from binding each Human Work Unit to exactly one task and one accepted contract, and projecting only the minimum necessary fields into the worker's view.

- Every worker-side read and mutation rechecks, at the point of use: approved-worker status; the task's category, tier and prior-delivery eligibility rules; the unit's binding to this task and accepted contract; that the actor is the active claim holder at the current claim generation; and the data classification projection. No check is inherited from an earlier step of the same run, from a client-supplied value, or from a previously successful check by the same actor.
- Client-side access continues to be enforced by client ownership of the task. Admin-side access continues to be enforced by admin role. Neither is changed by this feature.
- Review authority in V1 is the admin role. The only additional constraint is that the deciding admin must not be the worker who submitted the candidate — the separation required is between submitter and decider, not between two named roles.
- Authorization is enforced in the server-side data access path. The unit is unreachable to an unauthorized actor, not merely hidden.
- Role-scoped projections omit fields a role may not see rather than fetching and filtering them. Client price and worker payout remain independent values, and neither appears in the other role's projection.
- A Human Work Unit whose reach is broader than the most restrictive data class present in its declared inputs is not published; the run fails closed.
- The accepted result and its artifacts inherit the frozen mandate classification and the most restrictive declared-input classification. Neither acceptance nor resume can downgrade them.
- Minimum necessary is field-by-field and deny-by-default: the field or artifact is declared in the frozen unit, required by an instruction, output or acceptance rule, and classification-permitted, or it is omitted. New fields never become visible merely because an underlying record gained them.
- Worker-visible text and filenames MUST keep identity-bearing content out by default and MAY include it only when the frozen classification permits an explicitly generated or operator-mediated projection.

## Economics

- **One payable worker per task.** The Human Work Unit is worked by the task's single claimant, who becomes the payee at claim and remains so through resumed machine work and any later residual completion. This feature creates no second engagement, no per-unit payout, no partial payout and no new money instrument.
- **Payout**: the accepted fixed task payout. It is shown to the worker before they claim, frozen to them at claim by the existing mechanism, and unchanged thereafter — including at the later completion handover. Nothing in this feature recomputes it upward or downward.
- **Residual handover on an admitted run**: residual scope may change after downstream automation, but the residual payout computation and every adjustment branch are bypassed. The accepted fixed task payout and the sole payee remain authoritative.
- **Cost ceiling**: unchanged. Downstream steps spend only within the automation budget ceiling already frozen on the accepted contract. The ceiling is not raised, recomputed, or re-derived because a human unit ran. An absent ceiling continues to mean no authorized spend, never unlimited spend.
- **Price**: unchanged. This feature does not reprice any accepted mandate.
- **Unmappable effort refuses.** A unit that fails the frozen one-to-one provenance test in FR-035 pauses for an admin or falls back to manual handling. No figure is inferred, derived or split.
- **Waiting and review have zero provider execution spend**: no external provider reservation, hold, invocation or settlement for the whole publication, claim, submission, review and revision-requested period. Ordinary first-party storage, UI and notification overhead is not represented as provider execution spend.
- **Expected margin**: `UNKNOWN`, and deliberately so. Since neither price nor payout nor ceiling changes, the accounting margin of an admitted mandate is by construction the margin it was quoted at; the incremental margin effect of the capability itself — including added review time and added latency — is unmeasured and is labelled `UNKNOWN` until real operations produce evidence.
- **Human time evidence**: worker time on the unit and admin review time extend the platform's existing task work-session measurement; this feature does not infer a new payout from those measurements.

## Failure Modes and Exception States

| Exception state | Trigger | Resolution owner | Guaranteed outcome |
| --- | --- | --- | --- |
| Not admitted — unsupported topology | More than one human step, or a branch crossing the boundary | Compiler, automatically | Today's demotion and residual behaviour, cause recorded |
| Not admitted — malformed topology | A cycle or dependency on a nonexistent accepted-plan step | Compiler, automatically | Same unsupported-topology demotion and residual behaviour; no partial admission |
| Not admitted — unmapped economics | The unit fails the frozen one-to-one provenance test in FR-035 | Admin | Pause or manual handling; no figure inferred or split |
| Not published — input unavailable | A producing step failed permanently | Admin | Fail closed to manual handling |
| Not published — classification conflict | Unit reach exceeds input data class | Admin | Fail closed to manual handling |
| Claim refused — task already assigned | A different worker already holds the task | Admin | No second worker becomes payable; existing reassignment path applies |
| Unclaimed past deadline | No eligible approved worker claimed in time | Admin | Run pauses, cause visible, no spend |
| Claimed but not submitted past deadline | Holder went silent | Admin, after the existing lease expiry and reassignment path | Lease expires, unit reclaimable; then pause |
| Voluntary release while the run waits | Worker cannot complete the unit | Worker, then the pool | Existing release semantics; no revision consumed, no money moves, run keeps waiting |
| Released after a revision was consumed | Claimant releases a revision-requested unit | Worker, then the pool | Consumed revision stays consumed; next claimant inherits the remainder; deadline lapse pauses and alerts |
| Worker loses approval or eligibility | Approval withdrawn, tier or category rules stop being met | Admin | Actions refused at point of use; candidate preserved; existing reassignment, never a second paid claim |
| Revisions exhausted | Admin rejected at the bound | Admin | Fail closed to existing manual residual handling |
| Unsafe or unverifiable result | Admin judgment | Admin | Fail closed; never accepted |
| Effort exceeds reserved payout or ceiling | Accepted effort outgrew the quote | Admin | Run pauses; neither figure adjusted; no partial payout |
| Downstream automation fails after resume | A resumed machine step fails permanently | Existing residual path, else admin | Remaining work routes to the same claimant where still eligible; otherwise pause |
| Lifecycle exit during any of the above | Cancellation, abandonment, completion | Admin | Unit withdrawn; resume impossible |
| Crash during candidate submission | Process loss before or after atomic candidate commit | Automatic recovery | Either no submission exists and retry is safe, or exactly one candidate, state and audit record exist |
| Crash between acceptance and resume | Process loss | Automatic recovery | Converges on one resume, one execution per step, one claim |
| Final quality review rejects delivery | Existing final review rejects after internal acceptance | Existing task owner, else admin | Accepted result stays immutable; existing revision or residual path applies; no automatic replay |

## Verification and Delivery Conditions

- Acceptance of a human result is a verification gate performed by an authorized admin against the frozen acceptance criteria. Schema conformance is a precondition for submission, never evidence of correctness — a well-formed result proves it is well formed and nothing more.
- This acceptance is internal to the run and is distinct from the existing final quality review of the delivered work, which continues to operate unchanged on the task's completed delivery.
- A final-quality rejection never reopens the internal acceptance gate, mutates the accepted result, or automatically reruns downstream machine steps. It follows the existing task revision or residual path for the same claimant unless the existing explicit reassignment path is authorized.
- Downstream machine steps keep their existing postconditions and evidence requirements. Being resumed from an accepted human result grants no step an exemption.
- Candidate results, rejected revisions, the accepted result and the customer deliverable keep distinct roles. Nothing produced by this feature is delivered to a customer automatically; delivery continues to occur only through the existing verification, review and delivery path.
- The accepted human result is retained as evidence with its provenance — which admin accepted it, when, at which generation, against which frozen criteria, and which worker produced it.

## Observability

- Every human-unit transition is recorded with actor, timestamp, source and target state, cause, claim and resume generations, and whether the task assignment was established or matched — with no sensitive payload.
- The waiting age, revision count, deadline and refusal cause of every waiting run are queryable in aggregate, so a run cannot age invisibly.
- Deadline lapses and admin pauses also emit a durable actionable admin alert through the existing notification mechanism; queryability alone is not treated as notification.
- Transition and decision audit records are append-only through normal product and operator paths and are removed only by the existing authorized retention or purge policy.
- Which accepted result resumed which run, at which generation, which downstream steps it made runnable, and which worker held the task throughout, is reconstructable after the fact.
- Admission verdicts are recorded with their cause, so the population of unsupported mandates becomes measurable — the first real evidence toward the currently `UNKNOWN` demand question.

## Rollout and Rollback

- **Rollout**: the resume path is off by default and gated by an explicit platform-level control. With the control off, every mandate — including one in the supported shape — behaves exactly as today. Enabling it changes behaviour only for mandates admitted by the topology and economics tests.
- **Existing runs**: unaffected. A run compiled before the feature exists keeps the classification frozen at its compilation and never enters the resume path.
- **Admission boundary**: enabling the control changes only runs admitted after enablement. A run evaluated while the control was off keeps the existing path and is never retroactively admitted.
- **Rollback**: disabling the control stops new admissions immediately. Runs already waiting on a human unit remain resolvable through their existing admin paths — accept, reject, or fail closed to the manual residual — with the task still bound to its single claimant, so rollback never strands a mandate or a worker. No historical record changes meaning.
- **Historical meaning**: nothing added by this feature reinterprets an existing run, package, payout or audit record.

## Out of Scope (Non-Goals)

- More than one human work unit per run, and any human work on parallel branches.
- Recurrence — scheduled or repeating human units, and any Operation-level recurrence semantics.
- New capability tiers: authenticated third-party account access, external API writes, browser or computer use, document generation, and sandboxed execution.
- Customer-facing approval of a human result, and any customer-visible step in this loop.
- Automatic delivery of anything produced by this path.
- Replacing, rewriting or re-architecting the existing run engine, compiler, lease model, claim model, quality review or residual handling.
- A second payable engagement, a per-unit payout, a partial payout, or any change to how a worker is paid.
- A worker-side tenant membership model, or a dedicated reviewer role.
- Changing accepted economics or scope: no repricing, no repayout, no ceiling changes, no scope edits.
- Counting wholesale forwarding of a job to a person as machine coverage or Work Compiler coverage.
- Establishing demand, frequency, coverage gain, willingness to pay or revenue impact — these remain `UNKNOWN` by explicit founder decision.

## Assumptions

Informed defaults chosen where the description did not specify. Each is a decision that can be revisited without reopening the specification's structure.

1. **Supported shape is a total order across the boundary.** Exactly one human step, and every other step is an ancestor or a descendant of it. A step unrelated to the human unit — one that could legitimately run alongside it — is treated as unsupported in V1, because admitting it would mean reasoning about concurrent branches on the first version of this path.
2. **Fail-closed means today's behaviour, not an error.** An unsupported mandate is not refused to the customer; it takes the path it takes today. This feature adds a path, it does not remove one.
3. **Worker eligibility is the platform's existing rule set** — approved worker status, plus the task's category, tier and prior-delivery rules, plus the existing work-in-progress limit. This feature adds no new eligibility concept and removes none.
4. **Revision bound defaults to 2 per unit**, frozen at admission, platform-configurable for future mandates, never raised for a live run. It is a distinct bound from the customer-facing revision rounds that govern delivery.
5. **Publication deadline, submission deadline and claim lease each default to 72 hours**, are frozen independently at admission, and expire into the stated pause or reassignment path. The publication clock starts at publication; the submission and lease clocks restart at a successful claim or reclaim. Expected minutes is descriptive capacity context only and is never used to derive a lease or any economic figure.
6. **The reviewer is an admin.** No dedicated reviewer role is created. The enforced separation is between the submitting worker and the deciding admin.
7. **The unit claim and the task claim are one act.** A worker takes the task by taking the unit, at the accepted fixed task payout, and stays the claimant and payee through the resume and to completion.
8. **The accepted human result is structured data plus declared artifacts**, sized like other run artifacts, and is subject to the platform's existing scanning, classification and retention rules.
9. **Existing infrastructure is reused**: the existing acceptance snapshot and its frozen bytes, plan and capability version pinning, the single-claimant task model with its payout freeze, worker eligibility checks, task release/admin reassignment, step leases and fencing, compare-and-swap transitions written with their audit records, budget reserve-and-settle, artifact scanning and file-retention purge, durable notifications, worker/reviewer work sessions, the worker pool, admin quality review and rejection transitions, and the existing residual handover. This feature extends them; it does not replace any of them.
10. **One unit per run, one run per accepted contract, one worker per task.** These three existing guarantees are unchanged and are what make "exactly once" statable at all.
11. **Latency is a business input, not a system property to optimize in V1.** A run may wait for as long as its deadlines allow; the specification constrains safety and visibility while waiting, not speed.

Requirement and success-criterion identifiers are append-only once published: they MUST NOT be renumbered or reused. A retired identifier remains reserved so plan and task references do not change meaning.

## Constitution Compliance Check

| Principle | How this specification complies |
| --- | --- |
| I. Owned outcomes and continuous operations | Every exception state names a resolution owner; no fail-closed path leaves a run unowned; a waiting run stays owned by its single claimant or by an admin. Recurrence is explicitly out of scope, so no continuity is promised that this version cannot hold. |
| II. Truthful closed-world capability and immutable run contracts | Unsupported topology fails closed; the accepted contract is immutable across every path including failure and recovery; human work is never reported as machine coverage; commercial claims stay `UNKNOWN` with denominators stated. |
| III. Authorization, privacy and financial integrity | Approved-worker status, task eligibility, unit-to-task binding, claim holder and generation, and classification projection are rechecked at every point of use; client and admin paths keep ownership and role checks; role-scoped projections keep price and payout apart; no money is inferred or split; an unmappable economic case refuses rather than guesses; audit carries no sensitive payload. |
| IV. Durable hybrid execution without human dumping | The unit is a typed capability with minimal scoped context, structured inputs and outputs, eligibility gates, deadlines, economic boundaries, an audit trail and an explicit machine resume point; wholesale forwarding is excluded from coverage claims. |
| V. Verification, evidence and delivery are separate gates | Submission, admin acceptance, final quality review and delivery remain distinct events; schema conformance is explicitly not correctness; nothing is delivered automatically. |
| VI. Evidence-led coverage and sustainable economics | The `UNKNOWN` demand signal is stated rather than papered over; scope is deliberately narrow; admission verdicts are recorded so the unsupported population becomes measurable. |
| VII. Incremental evolution and proportionate testing | The existing compiler, claim, lease, budget, audit, quality-review and residual machinery is extended, not replaced; the change is behind a control and is reversible without stranding a mandate or a worker; no historical record changes meaning. |

**Principles this change puts at risk**, to be watched in review: Principle III, because a new worker-facing surface is a new place for classification and price leakage, and because the claim now happens mid-run rather than at handover — the payout the worker sees must not move afterwards (FR-034); and Principle IV, because a mid-run human unit is exactly the mechanism that could be used to forward work wholesale while reporting automation — which is why FR-047 and SC-012 exist.

**Exceptions requested**: none.

## Evidence Labels

| Claim | Label |
| --- | --- |
| Any step transitively depending on a human step is currently classified as not-machine-runnable | `CODE` |
| The waiting state is currently terminal: it publishes one residual package and moves the mandate to the worker pool with no return path to machine execution | `CODE` |
| Workers are approved platform workers with no client-tenant membership; claiming is gated by approved status, category certification, tier thresholds, a prior-rejection exclusion and a work-in-progress limit | `CODE` |
| A task carries a single claimant, established under a null-claimant guard, and its payout is frozen at claim | `CODE` |
| Quality review of a delivery is performed by an admin | `CODE` |
| Voluntary release returns the task to the pool and records an abandonment, with no money moving | `CODE` |
| Step leases with fencing, compare-and-swap transitions written with their audit records, reserve-and-settle budget holds and frozen accepted bytes already exist and are reusable | `CODE` |
| A budget-demoted step is already required to be reported as a budget decision rather than a missing capability | `CODE` |
| The residual payout path already refuses to reduce a payout without a proven reduction | `CODE` |
| Task release and admin reassignment can clear the current claimant and return a task to the worker pool | `CODE` |
| Scanned task files and workflow artifacts already use visibility rules and an authorized retention purge | `CODE` |
| Durable in-product notifications exist for admins and workers and are delivered by the maintenance path | `CODE` |
| Worker and reviewer time is already measured in task work-session records | `CODE` |
| Final quality rejection already transitions a task back to the same worker for revision or to the pool when its existing bound is exhausted | `CODE` |
| Size of the population of mandates in the supported shape | `UNKNOWN` |
| Customer demand, frequency, willingness to pay, revenue and margin impact | `UNKNOWN` |
| Worker supply and latency for structured mid-run units | `UNKNOWN` |
| Coverage gain from this capability | `UNKNOWN` |

Aggregate readiness claims about this feature carry the weakest label among their inputs, which is `UNKNOWN`.
