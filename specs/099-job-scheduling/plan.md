# R19 Plan — Canonical Job, Crew and Dependency Scheduling

## Objective

Create the persistent operating schedule behind ENDVERA: jobs and work blocks
belong to a construction project, have accountable people or subcontractors,
retain dependencies and availability, expose conflicts before commitment and
show the downstream schedule impact of a change.

## Product slice

- canonical job and work-block state with versioned lifecycle;
- crew, employee and subcontractor assignments from workspace-authorized
  identities and contacts;
- prerequisite and blocking dependencies without cycles;
- availability windows and deterministic overlap/conflict detection;
- proposed, scheduled, blocked, completed and cancelled state transitions;
- schedule-impact projection for the owner/office role and a financially
  redacted assigned-work projection for field workers;
- strict mobile read/prepare controls that never contact anyone externally;
- replay-safe commands, optimistic version checks and concurrent-write proof.

## Reuse

- reuse canonical Construction Workspace, Project, Contact and Calendar state;
- reuse R18 intent/entity resolution for natural-language entry points;
- reuse existing role and audit helpers;
- do not create another calendar, messaging or permission engine.

## Allowed implementation

- `specs/099-job-scheduling/**`;
- `src/lib/construction-operating-assistant-r19/**`;
- `src/server/construction-operating-assistant-r19/**`;
- `src/app/api/endvera/v1/mobile/jobs/**`;
- `apps/mobile/src/app/(app)/jobs.tsx` and navigation wiring;
- `apps/mobile/src/lib/jobs.ts`, API and session wiring;
- R19 unit/mobile/disposable-PostgreSQL tests;
- `prisma/schema.prisma` plus one forward-only R19 migration if persistent job
  state cannot be expressed safely with existing models.

No dependency or lockfile change is permitted.

## Completion gate

- a job, assignments and dependencies reconstruct exactly after a fresh query;
- invalid project/contact, cross-workspace assignment and dependency cycles are
  refused;
- overlapping assignments and unavailable windows are visible before schedule
  commitment;
- one reschedule updates downstream impact without overwriting history;
- exact replay and concurrent copies produce one canonical transition;
- field workers see only assigned operational detail and no financial data;
- R18, calendar/contact and timeline regressions remain green;
- no provider, customer data, external transport, external write, push,
  deployment or store action.
