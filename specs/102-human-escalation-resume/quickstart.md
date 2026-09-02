# R22 Quickstart Validation

## Preconditions

- Use only the campaign worktree and a disposable local PostgreSQL database.
- Apply forward migrations; never use `prisma db push`.
- Keep providers, transport, customer data, external writes, deployment, and store actions disabled.
- Enable the existing Human Work Unit resume policy only in the disposable test environment.

## Scenario A — Owner prepares one bounded escalation

1. Create synthetic owner, workspace, project, invoice-readiness loop, and missing evidence state.
2. Submit the same R22 prepare command concurrently and then replay it.
3. Verify one escalation, one task, one Human Work Unit, one source-loop binding, frozen separate economics, and zero transport.
4. Retry the key with changed input and verify a conflict with no partial state.
5. Attempt member, field-worker, stale-version, cross-workspace, and disabled-policy variants; verify refusal.

## Scenario B — Worker and independent review

1. Add a synthetic authorized payment record directly through test fixtures and activate via the existing canonical R5 function.
2. Claim through the existing Human Work Unit lifecycle as an eligible synthetic worker.
3. Inspect the worker projection and assert forbidden owner price, unrelated contacts, credentials, and tenant data are absent.
4. Submit a schema-valid result and required clean synthetic artifact.
5. Review independently and accept. Also cover invalid evidence and bounded revision on separate fixtures.

## Scenario C — Exact resume and recovery

1. Invoke accepted-result application concurrently.
2. Verify one resume record, one verified construction evidence effect, one next construction version, and immutable prior claims.
3. Reinvoke after a new process context and verify replay returns the same applied state.
4. Create an accepted-but-not-applied fixture, run recovery twice, and verify the first applies and the second is a no-op.
5. Close or revoke a source loop before resume and verify explicit refusal and accountable operator state.

## Scenario D — Mobile owner cockpit

1. Load the R22 projection for an authorized owner and verify state, next owner, next action, deadline, economics boundary, and zero transport.
2. Prepare and withdraw using stable persisted mobile outbox commands.
3. Restart the mobile session and verify command and canonical state parity.
4. Confirm field-worker and cross-workspace access receive no owner projection.

## Proportional Gates

- R22 unit, integration, and mobile tests.
- Construction R5 human escalation tests.
- Human Work Unit lifecycle, claim, concurrency, replay, final QC, and resume tests relevant to the bridge.
- Construction R0 open-loop tests.
- Prisma format, validate, generate, migration history, and disposable migration replay.
- Root and mobile lint/typecheck.
- Full mobile test suite.
- Next.js Webpack build if runtime product paths changed.
- `git diff --check` and lockfile hash comparison.

## Required Evidence Labels

- Code inspection: `CODE`.
- Local automated results: `TEST` / `SYNTHETIC`.
- Customer value, provider operation, and production readiness: `UNKNOWN` and not claimed by R22.
