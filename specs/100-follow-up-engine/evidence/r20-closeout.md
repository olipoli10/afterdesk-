# R20 Closeout — Durable Follow-up, Escalation and Next-owner Engine

## Result — CODE

R20 extends the existing R6 follow-up record into one durable operational
responsibility engine. Each managed follow-up retains an authorized project
target, accountable member or contact, next decision, due time, retry policy,
attempts, escalation level, optimistic version and immutable before/after
transition history.

Due evaluation is local, atomic and transport-free. Communication work creates
an approval-gated `PREPARED_UNSENT` action; internal work becomes
`READY_FOR_REVIEW`; closed targets are cancelled. Exact replays return the
stored result, changed-content identifier reuse is refused and concurrent due
sweeps produce one attempt. A process restart reconstructs the same queue from
PostgreSQL.

The native Follow-ups surface exposes the current responsible person, next
decision, due time and escalation state. Owner/office users can record an exact
outcome with the protected outbox. Field workers see only their own
non-receivable follow-ups, with financial, message-body, policy and provenance
data recursively refused.

## Observed gates — TEST

- R20 deterministic contract and policy tests: 6/6 passed;
- R20 disposable-PostgreSQL tests: 3/3 passed;
- R6/R13/R15/R18/R19/R20 disposable-PostgreSQL regressions: 16/16 passed on a
  freshly rebuilt 47-migration database;
- focused R6/R15/R18/R19/R20 unit regressions: 23/23 passed;
- complete mobile suite: 45/45 passed across 11 files;
- root and mobile lint and typecheck: passed;
- Prisma schema validation and generation: passed;
- the forward-only R20 migration applied inside a fresh 47-migration chain and
  through Prisma's transactional shadow migration path;
- migration diff contains no R20 table, column, constraint or new-index drift;
  remaining reported differences predate R20 and are recorded historical
  naming/default mismatches;
- local Next.js Webpack compile: 109/109 routes generated, including the
  follow-ups API, with synthetic local auth material and no deployment;
- `git diff --check`: passed;
- root and mobile lockfiles: unchanged.

## Refusal and reconstruction proof — TEST

- cross-workspace projects, contacts, targets and accountable owners are
  refused;
- exact sequential replay and concurrent identical commands produce one
  canonical transition;
- changed-body command-ID reuse and stale expected versions are refused;
- concurrent due sweeps create one canonical attempt;
- target closure cancels stale work before an action can be prepared;
- no response follows the exact retry threshold, changes the accountable owner
  once when configured, then stops at `DECISION_REQUIRED`;
- communication attempts remain `PREPARED_UNSENT` and report zero external
  transport;
- state, attempt, owner, due time and transition history reconstruct from a
  fresh PostgreSQL connection;
- field projection excludes receivables and recursively refuses financial,
  message, policy and provenance fields;
- interrupted mobile outcome commands restore byte-for-byte as
  `OUTCOME_UNKNOWN` and are never automatically resent.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, customer data, live SMS/call/email/calendar, external transport
  or external write;
- no dependency or lockfile change;
- no push, Preview deployment, Production, EAS or store action;
- no always-on runtime consumer was activated;
- this is local build proof, not provider readiness, customer value, product-
  market fit or Verified-E2E coverage.
