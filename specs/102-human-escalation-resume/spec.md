# Feature Specification: Human Escalation and Exact Resume

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-01

**Status**: Accepted for local implementation

**Input**: Continue the ENDVERA Construction Operating Assistant roadmap with Human Work Unit creation, bounded worker access, independent quality review, and exact automated resume.

## User Scenarios & Testing

### User Story 1 - Escalate a blocked operating loop (Priority: P1)

An authorized owner or office user sees that an operating loop cannot continue safely because evidence or a human result is missing. They prepare one bounded human escalation whose purpose, inputs, required result, cost, deadline, and next automated step are explicit.

**Why this priority**: ENDVERA cannot own an outcome if an exception silently becomes manual work outside the operating lifecycle.

**Independent Test**: From one eligible blocked loop, prepare the escalation twice with the same command and verify that exactly one canonical escalation exists, is bound to the same project and loop, and performs no external transport.

**Acceptance Scenarios**:

1. **Given** an authorized office user and an eligible unresolved loop, **When** the user prepares a human escalation, **Then** ENDVERA creates exactly one versioned, auditable work unit with frozen scope, economics, deadline, output requirements, quality criteria, and resume target.
2. **Given** the same command is retried or submitted concurrently, **When** ENDVERA processes it, **Then** the original escalation is returned without a second task, work unit, charge, or loop effect.
3. **Given** an unauthorized role, cross-workspace reference, stale loop version, unsupported purpose, missing budget, or disabled human-work policy, **When** preparation is attempted, **Then** ENDVERA refuses without creating partial state.

---

### User Story 2 - Complete and independently review bounded human work (Priority: P2)

An eligible human worker receives only the minimum information needed, submits the required structured result and evidence, and an independent reviewer accepts it, requests a bounded revision, or exhausts the escalation.

**Why this priority**: Human support is useful only when it is structured, private, reviewable, and does not become an uncontrolled forwarding channel.

**Independent Test**: Claim one activated synthetic work unit as an eligible worker, verify the role-safe projection, submit a schema-valid result with the required clean evidence, and independently accept it while proving forbidden financial and identity fields never enter the worker projection.

**Acceptance Scenarios**:

1. **Given** an active work unit, **When** an eligible worker claims it, **Then** the worker sees only the frozen instructions, declared inputs, required evidence, quality criteria, deadline, and their own submission state.
2. **Given** a submitted candidate, **When** an independent reviewer evaluates it, **Then** acceptance, revision, or exhaustion is durably recorded with the exact candidate and decision provenance.
3. **Given** missing, unsafe, wrong-project, or schema-invalid evidence, **When** the worker submits or the reviewer decides, **Then** ENDVERA refuses acceptance or requests revision without changing the construction loop.

---

### User Story 3 - Resume the operating loop exactly once (Priority: P3)

After an accepted human result, ENDVERA applies the verified result to the bound construction loop and continues from the frozen resume point without requiring the owner to reconstruct context.

**Why this priority**: The economic value is not the human task itself; it is ENDVERA retaining responsibility and continuing automatically afterward.

**Independent Test**: Accept one valid synthetic result, apply resume concurrently and again after process restart, and verify one canonical construction effect, one durable resume record, unchanged evidence provenance, and the correct next owner or next state.

**Acceptance Scenarios**:

1. **Given** an independently accepted result with required clean evidence, **When** resume runs, **Then** ENDVERA applies exactly one authorized canonical transition to the originally bound loop and records the accepted result fingerprint and evidence provenance.
2. **Given** resume is retried, concurrent, or recovered after process loss, **When** ENDVERA reprocesses the escalation, **Then** no second construction effect, work unit, or external action occurs.
3. **Given** the loop was closed, revoked, changed incompatibly, or the accepted result no longer matches its immutable fingerprint, **When** resume is attempted, **Then** ENDVERA refuses and exposes a specific operator-owned exception.

### Edge Cases

- The source loop becomes ready or closes before the human unit is activated.
- A prepared escalation is withdrawn before funding or publication.
- A worker loses eligibility or their claim lease expires during the assignment.
- The submitted payload is valid but the required artifact is missing, unscanned, rejected, or belongs to another task.
- Review accepts a candidate while a duplicate review or resume attempt runs concurrently.
- The application restarts after acceptance but before the construction transition is recorded.
- The role-safe projection is requested by a different workspace, worker, or claim generation.
- The human-work feature is disabled after a unit is admitted; already accepted immutable work remains recoverable while new admissions fail closed.

## Requirements

### Functional Requirements

- **FR-001**: ENDVERA MUST create a human escalation only from an eligible, unresolved, version-matched construction loop and an authorized workspace member.
- **FR-002**: Each escalation MUST freeze its purpose, project and loop binding, required result, evidence kinds, acceptance criteria, reviewer authority, deadlines, revision limit, resume target, client price, worker payout, estimated effort, currency, data classification, contract version, and input fingerprint.
- **FR-003**: Preparation MUST be idempotent and concurrency-safe; a repeated command with identical input MUST return the original escalation, while reuse with different input MUST fail.
- **FR-004**: Unsupported purposes, unknown fields, stale versions, cross-workspace references, missing or invalid economics, disabled policy, and unauthorized roles MUST fail closed without partial state.
- **FR-005**: A prepared escalation MUST NOT become worker-visible until its separately authorized economic precondition is durably satisfied.
- **FR-006**: Worker access MUST be claim-bound, lease-bound, workspace-safe, role-safe, data-class-safe, and limited to the frozen minimum context required for the work.
- **FR-007**: Worker projections MUST omit client price, owner financial state, credentials, raw phone numbers, unnecessary identities, and unrelated project content.
- **FR-008**: Worker submissions MUST match the frozen output contract and include every required clean, task-bound evidence artifact.
- **FR-009**: An independent reviewer MUST record exactly one authoritative acceptance, revision request, or exhaustion decision for a candidate under bounded revision policy.
- **FR-010**: Only an independently accepted result whose payload and evidence fingerprints still match immutable acceptance records MAY resume the construction loop.
- **FR-011**: Resume MUST apply the accepted result to the original loop exactly once and MUST retain the prior construction history rather than overwriting contradictory or historical evidence.
- **FR-012**: Concurrent resume, replay, and process-recovery attempts MUST converge on one durable resume record and one canonical construction effect.
- **FR-013**: Closure, revocation, stale incompatible state, invalid evidence, contract mismatch, or exhausted review MUST produce an explicit exception and accountable next owner instead of invented success.
- **FR-014**: Owner and office projections MUST show purpose, status, next responsible role, next action, deadline, result provenance, review state, and whether the construction result was applied.
- **FR-015**: Field-worker projections MUST remain financially empty and expose no human-worker private data or review internals.
- **FR-016**: Every admission, activation, claim, submission, review, withdrawal, resume, refusal, and recovery decision MUST be reconstructible from immutable audit evidence.
- **FR-017**: This release MUST perform zero provider calls, customer communication, real payment capture, external transport, external write, deployment, or store action.
- **FR-018**: Existing Human Work Unit and Construction escalation contracts MUST be extended and surfaced; ENDVERA MUST NOT create a parallel human-task engine.

### Authorization and Tenancy

- Owner and office roles may prepare or withdraw eligible escalations inside their workspace.
- Workers may access only their current fenced assignment and only while eligible.
- Independent reviewers act through the existing review authority; requesters and workers cannot self-accept.
- Every read and mutation rechecks workspace, role, resource binding, state version, and claim or review authority at the point of use.

### Data Classification and Privacy

- Human escalation data is business-confidential by default.
- Worker-visible data is a deliberately minimal projection, not a filtered owner projection.
- Secrets, credentials, real customer data, unrelated contact data, and raw financial context are excluded from the human contract and logs.

### Economics

- Client price and worker payout are frozen separately in integer minor units before activation.
- Worker payout cannot exceed client price; no provider payment or payout occurs in this release.
- An absent authorization or configured limit is a refusal, never an unlimited budget.

### Verification, Delivery, Observability, Rollout, and Rollback

- Verification requires an independently accepted, schema-valid payload plus every required clean evidence artifact.
- Delivery means applying the accepted result to the bound construction loop; accepting a human submission alone is not completion.
- Audit and state projections must identify the exact contract version, candidate, decision, acceptance, evidence, resume record, and construction transition.
- Rollout is local and provider-disabled. Recovery and replay are exercised against disposable persistent storage.
- Rollback is withdrawal before terminal acceptance or a forward-only corrective transition after acceptance; immutable history is never deleted or rewritten.

### Key Entities

- **Construction Human Escalation**: Durable binding between an unresolved construction loop and one Human Work Unit, including immutable contract and resume intent.
- **Human Work Unit Definition**: Frozen worker instructions, minimum declared inputs, output schema, evidence requirements, eligibility, deadlines, revisions, economics, and reviewer authority.
- **Human Work Unit State**: Current fenced lifecycle state for admission, publication, claim, submission, review, acceptance, resume, withdrawal, pause, or exhaustion.
- **Human Candidate and Evidence**: The worker's structured result and bound evidence artifacts.
- **Review Decision and Acceptance**: Independent immutable quality decision and accepted payload fingerprint.
- **Resume Record**: Durable proof that one accepted result was resumed exactly once.
- **Construction Loop Transition**: The canonical construction effect produced from the accepted result.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One eligible escalation request produces exactly one canonical escalation, task, work unit, and source-loop binding across duplicate and concurrent attempts.
- **SC-002**: 100% of unauthorized, stale, cross-workspace, unsupported, unfunded, or contract-mismatched attempts are refused before partial state is created.
- **SC-003**: A worker can identify the requested result, required evidence, deadline, and quality criteria from one role-safe view while zero forbidden financial or unrelated identity fields are present.
- **SC-004**: An accepted result produces exactly one canonical construction effect and one durable resume record across concurrent resume and restart recovery.
- **SC-005**: Owner and office users can identify the current state, next responsible role, and next action without manually restating project context.
- **SC-006**: The full local admission-to-resume lifecycle remains reconstructible after restart with matching payload, evidence, acceptance, resume, and construction fingerprints.
- **SC-007**: External provider calls, transports, writes, customer data uses, and real money effects remain exactly zero.
- **SC-008**: Existing Human Work Unit lifecycle behavior continues to pass its targeted lifecycle, concurrency, replay, review, and resume regressions.

## Assumptions

- The existing Human Work Unit engine remains the single source of truth for human admission, worker claims, candidate submission, review, acceptance, and safe resume.
- The existing Construction R5 escalation is the canonical starting point and is extended rather than replaced.
- Local disposable records and synthetic actors may prove persistence and lifecycle mechanics but are not customer, provider, production, or market evidence.
- Real payment authorization, provider publication, worker marketplace operations, and external communication remain outside this release and require later explicit authority.
