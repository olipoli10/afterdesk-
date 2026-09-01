# Feature Specification: Durable Follow-up and Escalation Engine

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Feature**: `100-follow-up-engine`
**Status**: Implementation authorized by the rolling R13-R40 program

## Product outcome

ENDVERA keeps operational commitments moving after the original conversation.
It knows what must be checked, when it becomes due, who currently owns the next
step, when to escalate, and which approval-gated action should be prepared. A
process restart, exact retry or navigation change cannot lose or duplicate that
responsibility.

## User scenarios and acceptance

### 1. Create a durable operational follow-up

An owner or office manager schedules a follow-up against an authorized project
target such as a job, calendar item, open loop or receivable.

- The target, contact and accountable owner belong to the same workspace.
- The follow-up retains its reason, due time, escalation policy and source.
- Exact replay returns the original result; changed-content reuse is refused.

### 2. Determine the next responsible human

ENDVERA projects one explicit next owner and next decision for every active
follow-up.

- The owner may be a workspace member or an active project contact.
- Reassignment is versioned and reconstructible.
- Field workers see only follow-ups assigned to them and no financial detail.

### 3. Prepare work when due

When a follow-up becomes due, a deterministic local sweep advances it once.

- A due communication becomes `PREPARED_UNSENT`, never sent.
- A due internal check becomes `READY_FOR_REVIEW`.
- A closed target cancels the follow-up instead of preparing stale work.
- Concurrent sweeps produce one canonical transition.

### 4. Escalate unanswered work

An authorized escalation policy defines attempt limits, waiting periods and the
next accountable owner.

- Escalation cannot skip its configured threshold.
- Escalation changes responsibility and records why.
- Exhausted policies stop and request an explicit owner decision.
- No provider or external transport is activated.

### 5. Recover exact state

After restart, ENDVERA reconstructs current status, attempts, owner, next due
time, escalation level and complete transition history from PostgreSQL.

## Requirements

- **FR-001**: Reuse and extend the canonical R6 follow-up model; do not create a
  parallel reminder engine.
- **FR-002**: Support authorized project targets and explicit accountable
  workspace-member or project-contact ownership.
- **FR-003**: Persist immutable before/after transitions for every change.
- **FR-004**: Use optimistic versions and workspace-scoped command IDs.
- **FR-005**: Prepare due actions atomically and idempotently.
- **FR-006**: Model escalation thresholds and ownership changes explicitly.
- **FR-007**: Cancel follow-ups whose canonical target is already closed.
- **FR-008**: Project owner/office and assigned-only field views.
- **FR-009**: Preserve zero external transport and approval-required outbound
  actions.
- **FR-010**: Expose the same strict state to web/mobile consumers.

## Non-goals

- Live SMS, email, phone, calendar or accounting-provider execution.
- Background cloud scheduling or an always-on production worker.
- Customer data, provider credentials, OAuth, push notifications or deployment.
- Replacing R6 receivables, R19 jobs or R5 Human Work Units.

## Completion evidence

- Unit proof for policy validation, due-state evaluation, reassignment,
  escalation and role-safe projection.
- Disposable PostgreSQL proof for exact replay, concurrent due sweeps,
  optimistic concurrency, cancellation and restart parity.
- Mobile contract and follow-up queue proof.
- R6, R15, R18 and R19 regressions remain green.
