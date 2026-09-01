# R19 Closeout — Canonical Job, Crew and Dependency Scheduling

## Result — CODE

R19 adds one canonical PostgreSQL schedule for construction jobs, assignments,
dependencies, availability and immutable transitions. Owner and office roles can
prepare and commit bounded schedule commands; field workers receive only their
assigned operational work with financial and provenance-bearing command data
removed.

Commands use stable workspace-scoped identifiers, advisory transaction locks,
optimistic job versions and immutable stored results. Exact replay returns the
original result, changed-content reuse is refused, and concurrent copies create
one canonical transition. Rescheduling projects downstream impact without
silently moving successors.

## Observed gates — TEST

- R19 deterministic contract and scheduling tests: 6/6 passed;
- R19 disposable-PostgreSQL tests: 4/4 passed on a freshly rebuilt 46-migration
  database;
- R13/R15/R18/R19 disposable-PostgreSQL regression run: 10/10 passed;
- focused operating-core unit regressions: 17/17 passed;
- complete mobile suite: 41/41 passed across 10 files;
- root and mobile lint and typecheck: passed;
- Prisma schema validation: passed;
- forward-only R19 migration applied inside the fresh 46-migration chain;
- local Next.js Webpack compile: 109/109 routes generated, including the jobs
  API, with synthetic local auth material and no deployment;
- `git diff --check`: passed;
- specification, plan, tasks and implementation align with no unresolved
  placeholder or contradictory requirement;
- root and mobile lockfiles: unchanged.

## Refusal and reconstruction proof — TEST

- cross-workspace projects, members, contacts and job access are refused;
- self-dependencies and cyclic dependency graphs are refused;
- overlapping assignments, unavailable intervals and outside-availability
  windows block commitment before a canonical schedule change;
- exact sequential replay and concurrent identical copies produce one effect;
- changed-body command-ID reuse and stale expected versions are refused;
- committed state reconstructs identically from a fresh PostgreSQL query;
- schedule impact includes transitive successors without rewriting them;
- field projection is assigned-only and recursively rejects financial fields.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, customer data, live SMS/call/email/calendar, external transport
  or external write;
- no dependency or lockfile change;
- no push, Preview deployment, Production, EAS or store action;
- this is local build proof, not provider readiness, customer value, product-
  market fit or Verified-E2E coverage.
