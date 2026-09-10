# C1 — peer code review of expired correlated calendar claims

Date: 2026-09-10. Scope: local source review and synthetic counter-tests only.

## Verdict

No additional actionable critical defect found in the reviewed C1 patch. This is a peer code review, not independent validation of model quality, PostgreSQL execution, provider behavior, or production readiness.

Reviewed `claim-recovery.ts` SHA256: `06ef140b3f7f9dc55eef31445776d0199c9439ac64744f95eb8f692ccee8faf9`.
Frozen migration79 SHA256: `05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7`.

Read the complete recovery module, complete migration79, approval backend plan (including sections 5–6), strict TypeScript approval-state contract, and author tests/diff. No production, schema, migration, budget, namespace, or provider changes were made by this reviewer.

## Findings and boundaries checked

- Correlated classification is global: operation marker OR review row OR approval row. Incomplete correlated provenance cannot fall through to the legacy result merger.
- The nested eligibility CASE precedes LIMIT and isolates calendar-only serializers. Both processing phases require committed immutable approval provenance, exact approval lease, binding, and strict state validity.
- Only candidate operation rows are locked (`FOR UPDATE OF p SKIP LOCKED`). Immutable approval/review history remains untouched; no mutable consent, connector, workspace authority, or namespace is consulted for this bookkeeping.
- The emitted correlated terminal is the exact strict `UNCERTAIN` union with `CLAIM_LEASE_EXPIRED`. Old proof remains in immutable history; incompatible extra `priorClaimResult` is not added to that union. Legacy merging remains separate.
- Exact CAS retains request, actor/account, lease, attempts, budget reservation, prior result, marker, and transport pins. Neither reservation nor transport state is rewritten; no retry or effect is initiated.
- Deadline failure remains inside the transaction callback. SQL rejection and unknown commit acknowledgment propagate without success receipts or retry.
- Migration79 immediate/deferred uncertain branches allow bookkeeping without reviving current authority or extending preparation TTL. The frozen migration was not edited.

## Fresh local evidence

`test/correlated-calendar-claim-recovery-review.test.ts`: 7 new counter-tests.

Command: `node node_modules/vitest/vitest.mjs run test/correlated-calendar-claim-recovery-review.test.ts test/personal-assistant-claim-recovery.test.ts`

Result: **34/34 PASS** (7 reviewer + 27 author), 2026-09-10 14:21:26 America/Toronto, exit 0. Global TypeScript `--noEmit` and ESLint for the new reviewer file subsequently completed exit 0.

The tests execute the real recovery function with a mocked database boundary. A tiny closed-expression inspector checks the actual emitted JSON object against the real strict TypeScript schema; it is explicitly **not a SQL engine**. Migration assertions are static. Neither these mocks nor SQL-shape assertions establish PostgreSQL lock, trigger, or concurrency behavior.

## Native follow-up owned by controller

Exercise CLAIMED and DISPATCH_CLAIMED expiration under UTC/New York/Tokyo; retain immutable approval/review history, full reservations and transport knowledge; allow bookkeeping after WRITE revocation and source preparation expiry; combine legacy and typed candidates; prove replay returns zero and actual concurrent backend SKIP LOCKED behavior. Malformed or missing global typed provenance must never receive a legacy terminal. Report native evidence separately from this source verdict.

No provider, external candidate, native database, deployment, or activation was executed in this review.

## Addendum — review of controller's native evidence

Read-only review after the controller's run: the 97-line fixture addition in `temporal-registry.postgres.test.ts` and both `result.json` / `output.txt` under `evidence/postgres-native-1789064872948` were inspected. No test or database command was launched by this reviewer.

The recorded native run reports **130/130 PASS**, exit 0, finish `2026-09-10T18:29:09.051Z`, PostgreSQL 17.11, 79 migrations, one migrated-template database clone, and `PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED`. The retained cluster is `personal-pg-native-dc316aa6dda54ca295b4ad2b4eb11cbf`. This is recorded evidence from the controller's execution, not an additional reviewer execution.

The nine new cases exercise the real recovery helper and real SQL: CLAIMED and DISPATCH_CLAIMED in three database timezones, expired original-source TTL, a mixed legacy/typed batch, and two distinct native backend PIDs. The timezone wrapper delegates to the real transaction and changes its local TimeZone; it does not replace query results. Approval choices remain test-created and transport HTTP remains fake.

Strong observed oracles in the fixture:

- All six phase/timezone cases check the entire exact terminal JSON against an expected union and the actual pure inspector, status/attempt/lease/transport fields, retained approval and review records, and replay count zero plus unchanged operation readback.
- WRITE revocation precedes recovery. Source, receipt, shared expectation history, other operations, and global reservation/ceiling snapshots are compared before/after. Actual DB-clock waits avoid rewriting immutable expiration timestamps.
- The two-PID case requires both transactions to reach a bounded barrier, total successful recoveries exactly one, and only explicit serialization-conflict errors if a contender rejects. Unknown errors cannot make that oracle pass.

Coverage limits, not reproduced product defects:

- The two-PID barrier releases before the recovery work. It demonstrates at-most-once completion under concurrent transaction starts, but does not hold the candidate row lock at a known intermediate point to deterministically observe the losing query's SKIP LOCKED branch. One transaction may reach the statement after the other's commit.
- The preservation snapshot excludes the complete target calendar operation. Its request/hash/scope/marker/budget columns are therefore not individually compared by these nine new cases; the SQL exact-CAS/source review covers those pins, and SQL79's typed binding requires null operation budget pins. The legacy mixed case checks retained JSON, not a separately populated nonzero legacy hold in that same test.
- The two dispatch phases use synthetic `externalTransportPerformed:false`; neither the fixture nor a successful recovery proves an HTTP request occurred, Google accepted an event, or a human approved the displayed draft.
- These nine cases do not create malformed/orphan typed provenance to exercise pre-LIMIT exclusion. Healthy frozen SQL constraints already prevent ordinary creation of such rows; no constraint bypass is proposed as part of this review.

Verdict remains positive for this bounded C1 bookkeeping patch. The native receipt now supplies real SQL execution evidence in addition to the earlier mock/source checks; broader campaign results and any future actual typed approval/executor behavior remain separate.
