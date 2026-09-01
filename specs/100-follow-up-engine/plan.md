# R20 Plan — Durable Follow-up, Escalation and Next-owner Engine

## Objective

Turn reminders and operational obligations into durable managed state: one
canonical next owner, one next due time, explicit escalation rules, atomic
preparation and exact reconstruction after retry or restart.

## Product slice

- extend the existing R6 follow-up record instead of adding another engine;
- support job, calendar, open-loop and receivable targets;
- persist explicit member/contact ownership and next-decision text;
- add versioned lifecycle and immutable transition records;
- evaluate due, cancel, reassign, complete and escalate commands
  deterministically;
- prepare outbound work as `PREPARED_UNSENT` with approval required and zero
  transport;
- expose an owner/office queue and an assigned-only financially redacted field
  queue through strict web/mobile contracts;
- use stable command IDs, advisory transaction locks and optimistic versions.

## Reuse

- reuse `ConstructionFollowUp`, R6 preparation semantics and canonical actions;
- reuse R19 workspace-member/contact authority and role-safe mobile patterns;
- reuse R17 stable offline outbox for mutating mobile commands;
- reuse R5 Human Work Units only when a later bounded human escalation is
  explicitly created; R20 itself does not activate a worker.

## Allowed implementation

- `specs/100-follow-up-engine/**`;
- `src/lib/construction-operating-assistant-r20/**`;
- `src/server/construction-operating-assistant-r20/**`;
- `src/app/api/endvera/v1/mobile/follow-ups/**`;
- `apps/mobile/src/app/(app)/follow-ups.tsx` and navigation wiring;
- `apps/mobile/src/lib/follow-ups.ts`, API, session and outbox wiring;
- R20 unit/mobile/disposable-PostgreSQL tests;
- `prisma/schema.prisma` plus one forward-only R20 migration for canonical
  ownership, policy, version and immutable transition state;
- `test/integration/per-file-setup.ts` only if a new immutable test-table guard
  must be registered for disposable cleanup.

No dependency or lockfile change is permitted.

## Completion gate

- exact replay and concurrent copies create one canonical transition;
- due sweeps prepare or cancel each follow-up exactly once;
- ownership, attempts, escalation level and next due time reconstruct after a
  fresh database connection;
- closed targets cannot create stale prepared work;
- escalation follows the configured threshold and cannot skip levels;
- field workers see only their assignments and no financial or arbitrary
  command payload data;
- R6/R15/R18/R19 regressions remain green;
- no provider, customer data, external transport, external write, push,
  deployment or store action.
