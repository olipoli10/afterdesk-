# R22 Closeout — Human Escalation and Exact Resume

## Result — CODE

R22 exposes the existing R5 Construction-to-HumanWorkUnit bridge through one
strict owner cockpit and one protected mobile API. An authorized owner or
office user can inspect an eligible evidence gap, supply explicit bounded
economics, and prepare exactly one unfunded Human Work Unit. The command does
not publish work, spend money, contact a worker, or invoke transport.

The canonical Human Work Unit lifecycle remains the only claim, submission,
evidence, revision, review and acceptance engine. R22 maps that lifecycle into
plain next-owner and next-action state without creating a second task engine.
An accepted result resumes the Construction loop only through the existing R5
application path. Workspace-scoped recovery can apply accepted-but-unapplied
results after restart, and a second recovery is a no-op.

The shared iOS/Android application now includes an Appui humain surface. It
uses the protected persistent outbox for stable prepare and withdraw commands.
Field-worker projections are intentionally empty and recursively reject owner
economics or unrelated tenant data.

## Observed gates — TEST / SYNTHETIC

- R22 contract and state-mapping tests: 4/4 passed;
- R22 disposable-PostgreSQL scenarios: 4/4 passed;
- R22 native mobile contract and outbox tests: 4/4 passed;
- focused R22/R5/R0 unit regressions: 24/24 passed across 5 files;
- R22/R5/R0 plus canonical Human Work Unit claim, review, concurrency, replay
  and final-QC PostgreSQL regressions: 83/83 passed across 8 serialized files;
- full native mobile suite: 53/53 passed across 13 files;
- root and mobile lint and typecheck: passed;
- Prisma formatting, validation and client generation: passed;
- all 48 forward-only migrations applied successfully from empty state in a
  separate disposable Prisma PostgreSQL instance; migration status is current;
- local Next.js Webpack build: 109/109 pages generated, including
  `/api/endvera/v1/mobile/human-escalations`, using synthetic local-only build
  variables and no deployment;
- `git diff --check`: passed;
- root and mobile lockfile hashes remain byte-identical to the frozen baseline.

## Refusal, review and recovery proof — TEST / SYNTHETIC

- concurrent prepare plus replay creates one escalation, one task, one Human
  Work Unit and one source-loop binding;
- changed-content idempotency reuse, stale source state, cross-workspace
  references, disabled policy and mismatched evidence kind are refused without
  partial state;
- worker claim and result submission use the canonical Human Work Unit APIs;
- the worker projection contains no client price, maximum human payout,
  claimant identity, unrelated contacts, credentials or cross-tenant state;
- clean required evidence and an independent accepted review produce one
  accepted result;
- canonical Human Work Unit regression gates retain bounded revision,
  exhaustion, concurrency, replay and final-QC behavior;
- restart recovery is limited to the requested workspace and applies an
  accepted result exactly once;
- one verified Construction evidence effect and one resume record are retained;
- exact withdraw replay is stable and no connector transport occurs;
- every mobile retry retains the exact command identity across restart;
- field-worker cockpit projection is empty and financial data is false.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, customer data, live SMS/call/email/calendar/accounting/payment
  rail, external transport or external write;
- no schema, migration, dependency or lockfile change in R22;
- no push, Preview, Production, EAS, deployment or store action;
- no always-on runtime consumer was activated;
- this proves local code and synthetic persistence behavior only. Customer
  value, provider operation, production readiness and Verified-E2E coverage
  remain unknown and are not claimed by R22.
