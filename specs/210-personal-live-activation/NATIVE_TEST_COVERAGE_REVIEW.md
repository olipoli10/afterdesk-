# Native test coverage review — 2026-09-10

This is a static scope review of the 12 current PostgreSQL test files, not proof that all tests passed natively. Parametrized declarations produce multiple runtime cases; declaration counts must not be substituted for the runner's observed count.

## Observed native result

`evidence/postgres-native-1789024560494/output.txt`: PostgreSQL17.11, distinct simultaneous backend PIDs, all migrations applied, Google7PASS/4FAIL, owned server stopped. The failures occur in write execution/uncertainty/recovery/concurrent approval. Existing successful OAuth/read tests do not establish calendar writes are correct.

## Authored test boundaries

| File | Direct test declarations | Parameterized declarations | Principal boundary |
| --- | ---: | ---: | --- |
| google.postgres.test.ts | 11 | 1 | OAuth single consumption, encrypted credential lifecycle, current write grant, one exact approval, uncertain late response; new two-zone diagnostic |
| outbox.postgres.test.ts | 10 | 0 | Original sender binding, standing self-reply consent, one dispatch/reservation, contention, cancellation and uncertain holds |
| inbox.postgres.test.ts | 6 | 0 | Durable inbound deduplication, same message changed payload refusal, owner revocation, encrypted storage |
| personal-subject.postgres.test.ts | 5 | 0 | Immutable personal subject FK, no foreign workspace, exactly one attempt, USD reservation transaction |
| personal-model.postgres.test.ts | 12 | 1 | Disabled/consent gates, atomic CAD/USD holds, post-latency revocation, proposals not actions, unknown result retained |
| personal-model-connection.postgres.test.ts | 9 | 1 | Explicit owner consent distinct from provisioning, encrypted key binding/rotation, unverified owner and non-owner admin refusal |
| recovery.postgres.test.ts | 5 | 0 | Exact expired claim, SKIP LOCKED, concurrent recovery, holds retained, late completion CAS loses |
| sms-inbound-recovery.postgres.test.ts | 6 | 0 | Bounded25-row draining, evidence retained across JSON shapes, no replay, stale source CAS loses |
| sms-calendar-read.postgres.test.ts | 3 | 0 | Current Google read/disclosure authority, revoked or cross-workspace disclosure refusal |
| confirmation.postgres.test.ts | 19 | 1 | OFF default, immutable summary/nonce, exact phrase and source, one calendar claim, app/SMS contention, expiry/wrong attempts |
| confirmation-worker.postgres.test.ts | 4 | 1 | Atomic source/review/draft/challenge/messages, fake-HTTP bridge, source replay drift, revoked Google consent |
| confirmation-maintenance.postgres.test.ts | 5 | 1 | Expiry/terminal reconciliation, owner/workspace isolation, transaction rollback, OFF preservation |

The new Google diagnostic uses `set_config('TimeZone', ..., true)` inside a transaction for UTC and America/New_York. It checks the real column's `timestamp without time zone` precision3, Date equality without a cast, a temporary UPDATE with inferred Date parameter, mixed timestamptz equality/clock comparisons and explicit UTC alternatives. It leaves all11 original assertions intact and restores local timezone state. At authoring, this diagnostic is **not yet executed**. The actual native server timezone is America/New_York; the harness must not force UTC to hide mixed-type behavior.

Primary semantics checked2026-09-10: PostgreSQL17 [timestamp types](https://www.postgresql.org/docs/17/datatype-datetime.html#DATATYPE-DATETIME-INPUT-TIMESTAMPS) documents that implicit conversion between naive timestamps and zoned timestamps uses the session timezone. [Date/time operators and AT TIME ZONE](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT) document explicit conversions. This supports the suspected failure mechanism, but the exact Prisma Date bind and application failure still require the prepared executable diagnostic. Proposed targeted expression for a UTC-naive column: compare against `($n::timestamptz AT TIME ZONE 'UTC')` and `(clock_timestamp() AT TIME ZONE 'UTC')`; do not reinterpret local calendar event text as UTC.

## Gaps and next decision

1. Native Google writes are demonstrably failing. First reproduce comparison/type behavior, then fix UTC conventions at each affected boundary. A pure timezone adjustment to the harness is not a fix; no migration or global column-type rewrite is proposed.
2. Raw SQL in outbox/recovery/confirmation/model/source leases also mixes database instants and UTC-naive columns. Their static tests are relevant but do not yet establish native non-UTC correctness; audit each actual column and parameter type, not a blanket string replacement.
3. Direct transport functions use injected fake HTTP. These tests establish deterministic backend behavior only, not actual Google/Twilio/OpenRouter service delivery, billing or network cancellation.
4. They do not establish Android permissions, background execution, real Samsung audio/camera behavior, app-store installation or complete user-facing end-to-end readiness.
5. Keep filtered native results separate from full-suite results and PGlite history. Count the final native runner output and cleanup, not this inventory, as executable evidence. Retain failed runs and do not increase deadlines or weaken concurrency assertions to make them pass.
