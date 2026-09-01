# R17 Closeout — Offline-Safe Mobile Outbox and Recovery

## Result — CODE

R17 adds a bounded, versioned mobile command outbox backed by protected local
storage. Supported operating, assistant, prepared-action and local permission
commands are retained before dispatch with their original stable identifier.
An interrupted sending state becomes `OUTCOME_UNKNOWN` after restart and can
only be retried or discarded by an explicit foreground user action.

The recovery surface exposes queued, sending, confirmed, replayed, conflict,
refused and outcome-unknown states without showing the retained command body.
Exact re-enqueue is idempotent, identifier drift is refused, terminal commands
cannot be retried, workspace projections are isolated and sign-out is blocked
unless the protected outbox is cleared first.

## Observed gates — TEST

- protected outbox tests: 5/5 passed;
- complete mobile suite: 34/34 passed across 8 files;
- restart changed an interrupted `SENDING` entry to `OUTCOME_UNKNOWN` while
  retaining the exact command and stable identifier;
- exact re-enqueue retained one entry and changed-command identifier reuse was
  refused;
- workspace filtering, full sign-out clearing, corrupt index, oversized entry,
  forbidden terminal retry and explicit discard were verified;
- mobile lint and typecheck: passed;
- Expo Doctor: 21/21 passed;
- local Expo export: iOS, Android and Web passed with an inert HTTPS API URL;
- `git diff --check`: passed;
- root and mobile lockfiles: unchanged.

## Authority and limits — CODE

- local foreground recovery only; `automaticDispatchAllowed` is always false;
- no file-upload retry because a device file URI is not durable exact command
  data under the R17 boundary;
- no schema, migration, dependency or lockfile change;
- no provider, background worker, external transport, customer data, external
  write, push, Preview, Production, deployment, EAS or store action;
- this is local build proof, not provider readiness, customer value or
  Verified-E2E coverage.
