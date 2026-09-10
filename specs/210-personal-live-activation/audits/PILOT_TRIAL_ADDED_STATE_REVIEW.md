# Trial added-state — bounded independent test review

2026-09-10, `C:/dev/endvera-astra-r03`.

**GREEN for the pure query builder, supplied-result inspector and targeted tests.** No new concrete defect was found. This does not claim PostgreSQL execution, branch identity, full schema equivalence, enabled guards, preservation, backup or migration success.

Read completely: `PILOT_TRIAL_MIGRATION_PLAN.md` (especially section 5C), `deployment/pilot-trial-added-state.mjs` and its 57 author tests. Compared the exact inventory with `migration-rehearsal/rehearsal.mjs` and inspected the relevant CREATE/ALTER/ADD declarations in immutable migrations 71,72,73,75,76,78,79. No executable rehearsal module or synthetic full-row snapshot query was invoked.

Reviewed source SHA-256: `ef420bfcaa453198d6d4200cab336a44fbdf4c05ac392ef188c833e5c93dbdfe`.
Author test SHA-256: `4968072fda991a894efbc94d0490fdbc8bc8161ae9f6baed814d5ac9b827cda5`.
Peer test SHA-256: `f29e167cc630c8fec1a5ab9a9e913fd5281deb9402311611e90d93ed99655c22`.

Reviewer owns only this audit and `test/personal-pilot-trial-added-state-review.test.ts`; no product source, SQL, native fixture, credentials or other tests were changed.

## Scope reconciliation

- Seven exact new proof tables: two calendar-SMS confirmation tables from 73; clarification, reply and conversation expectation from 76; correlated review from 78; approval from 79. Each query observes only empty/nonempty through `LIMIT 1` and a decimal count capped at one. It does not claim the full count of a nonempty proof table.
- Three legacy table projections: AiOperation has one new NULL field, PersonalAssistantOperation has three, VoiceIntakeSession has ten NULL fields plus subjectKind equal to `voice_intake`. Thus **14 NULL checks + one subject-kind check = 15 added columns**; the count is not a claim of 15 NULL columns.
- Each legacy query projects only a combined violation boolean, then count/invalid-count/truncation. `IS NOT NULL` correctly treats JSONB literal null as a non-NULL SQL value; subjectKind comparison is null-safe. No application value, ID, raw row, JSON payload or row hash leaves the query.
- `FROM ONLY` and the fixed regular-table scope match the accepted schema assumptions. Inheritance/partition changes belong to the separate catalog gate, not an implicit completeness claim by this query.
- Up to 500001 rows are sampled per legacy table; more than 500000 is explicitly refused, regardless of any other known violation. Physical scan work on bloated tables is not bounded by row count alone; fixed query/lock/transaction timeouts remain necessary.
- SQL begins a READ ONLY REPEATABLE READ transaction, fixes search_path to pg_catalog, UTC and row_security=off, and has one final catalog-independent aggregate SELECT. The statements wrapper contains the same settings/select for an already managed transaction; the controller must execute the entire sequence in one transaction, not isolated autocommit calls.

## Supplied-result semantics

Closed shape, exact family coverage, canonical decimal-string counts, upper bounds, invalid<=total, and truncation refusal were reviewed. Numeric aggregation uses BigInt, then decimal strings. Reordered supplied arrays normalize deterministically; duplicate/missing/unknown entries refuse. Returned data is detached and frozen.

`SUPPLIED_ADDED_STATE_MATCH` may coexist with vacuous legacy tables; per-table vacuity and `allLegacyTablesNonEmpty:false` remain explicit. A nonempty proof table or any invalid legacy row yields `SUPPLIED_ADDED_STATE_VIOLATIONS`. Neither label authenticates the supplied snapshot. Flags for databaseRead, provenance, branch, migration history, old data, UTC defaults, schema guards, full equivalence, backup and execution remain false.

This module intentionally does **not** cover the remaining section 5C gates: 18 UTC defaults, exact FK/unique/check/trigger definitions, enabled/enforced/validated state, index health, migration77 function hashes, or PG17/PG18 catalog reconciliation. Those require their separate catalog evidence. Empty proof tables alone cannot certify them.

## Fresh evidence and test limits

- **19:49:15: 63/63 PASS** (57 author + six peer), command `node node_modules/vitest/vitest.mjs run test/personal-pilot-trial-added-state-review.test.ts test/personal-pilot-trial-added-state.test.ts`.
- Peer ESLint exit 0. No peer RED was observed on this frozen source.
- Fresh `tsc --noEmit --pretty false`, session 27976: exit 0, including the six new peer cases.
- Six focused peer cases test simultaneous proof/legacy violations, truncation despite a known violation, mixed vacuity and violations, and the exact per-table NULL/subject predicate allocation in each capped SQL branch.
- Static SQL branch checks and the author's line-oriented migration extraction are **not general SQL parsers**. Direct DDL/source reading supports the inventory finding; successful PostgreSQL parsing/execution is still not demonstrated by these tests.
- No SQL, actual database connection, provider call, credential handling, real child process or network request was performed by this reviewer.
