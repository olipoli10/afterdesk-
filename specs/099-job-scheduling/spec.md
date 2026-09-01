# Feature Specification: Job, Crew and Dependency Scheduling

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Feature**: `099-job-scheduling`
**Status**: Implementation authorized by the rolling R13-R40 program

## Product outcome

ENDVERA maintains one canonical, project-scoped operating schedule. An owner or
office manager can create work, assign an active workspace member or an active
project contact, declare availability and dependencies, inspect conflicts, and
commit or reschedule work without contacting any external person or provider.

## User scenarios and acceptance

### 1. Prepare and commit work

An authorized owner creates a proposed work block with a start and end time,
assigns an employee or subcontractor, and asks ENDVERA to commit the schedule.

- The project and assignee must belong to the same workspace.
- A work block cannot end before it starts.
- Commit succeeds only when no assignment, availability, or dependency conflict
  exists.
- A successful state change increments the canonical version and creates one
  immutable transition.

### 2. Detect conflicts before commitment

ENDVERA reports all deterministic conflicts before making a schedule binding.

- The same resource cannot overlap a scheduled or in-progress work block.
- An unavailable interval blocks commitment.
- When availability windows exist for the resource, the work block must fit in
  one of them.
- A predecessor must finish before a successor begins unless it is already
  completed.

### 3. Preserve dependencies and downstream impact

An owner can declare a prerequisite between jobs and reschedule a predecessor.

- Self-dependencies and cycles are refused.
- A reschedule never rewrites a successor automatically.
- The response identifies transitively affected successors and their delay risk.
- Previous values remain reconstructible in immutable transitions.

### 4. Role-safe mobile projection

- Owner and office-manager projections include all project jobs, conflicts,
  dependencies, and schedule impact.
- A field worker sees only jobs assigned to their workspace-member identity.
- Field projections never include financial amounts, invoices, receivables,
  payment details, arbitrary command payloads, or other workers' schedules.

### 5. Replay and concurrency safety

- A command ID is unique inside a workspace.
- Replaying the exact command returns the stored result without a second effect.
- Reusing a command ID with different content is refused.
- Concurrent copies produce one canonical transition.
- A stale expected version is refused without modifying the job.

## Requirements

- **FR-001**: Persist jobs, assignments, dependencies, availability, and
  immutable transitions in PostgreSQL.
- **FR-002**: Scope every row and every query to one construction workspace.
- **FR-003**: Validate project, member, and contact authority server-side.
- **FR-004**: Use explicit lifecycle states: proposed, scheduled, blocked,
  in_progress, completed, cancelled.
- **FR-005**: Detect conflicts deterministically before schedule commitment.
- **FR-006**: Preserve exact before/after snapshots for every canonical change.
- **FR-007**: Require optimistic versions for updates.
- **FR-008**: Refuse dependency cycles.
- **FR-009**: Project different views for owner/office and field roles.
- **FR-010**: Perform zero provider calls, external transport, or external write.

## Non-goals

- Google Calendar or Microsoft Calendar synchronization.
- Live SMS, email, phone, voice, provider AI, OAuth, or credentials.
- Payroll, time sheets, financial job costing, route optimization, or GPS.
- Automatic reassignment or silent movement of downstream jobs.

## Completion evidence

- Unit proof for validation, cycle detection, conflict evaluation, schedule
  impact, and field redaction.
- Disposable PostgreSQL proof for migration, reconstruction, exact replay,
  changed-command collision, optimistic concurrency, and fresh-query parity.
- Mobile contract and screen proof.
- R18 and existing calendar/contact/timeline regressions remain green.
