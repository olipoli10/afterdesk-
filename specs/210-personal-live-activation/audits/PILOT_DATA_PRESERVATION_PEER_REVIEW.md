# Pilot data preservation — peer review

## Scope and status

2026-09-10. Worktree `C:/dev/endvera-astra-r03`. Plan `PILOT_DATA_PRESERVATION_PLAN.md` read completely. Engineering code-review skill read and used for the bounded review matrix below.

Initial status was `REVIEW_PENDING_SOURCE_FREEZE`. Author owns `deployment/pilot-data-preservation.mjs` and its tests. Reviewer owns only this audit and `test/personal-pilot-data-preservation-review.test.ts`. No database, network, credential, provider, migration, commit or author-file mutation is authorized for this review.

## Required contradictory checks

1. Exact catalog70 table/old-column allowlist, including every legacy table. Reject duplicate names/positions, missing columns, unsupported structures and unknown fields; quote all identifiers rather than accept caller SQL fragments.
2. History exception is explicit: compare exactly the original70 migration names and old columns while nine later migration rows are checked separately by controller. An unknown extra migration must not be represented as covered by this aggregate.
3. One READ ONLY REPEATABLE READ transaction; fixed statement/lock timeouts and deterministic PostgreSQL serialization settings. No partial-snapshot success or writes, temporary helper functions or dynamic authority calls.
4. Ordered row-hash multiset, not a DISTINCT set; equal counts with a modified row must differ; repeated rows remain repeated; SQL NULL remains different from text `null`, empty string and missing columns.
5. Result count remains a canonical decimal string, not an unsafe JavaScript number. Missing/extra/duplicate results, malformed hashes and wrong plan/capture binding refuse rather than produce empty success.
6. Query/table/column/string sizes bounded before costly output; byte counts and safe quoting independently checked. Per-table full scans and aggregate memory are still an execution-sizing concern for controller, not removed by a bounded SQL string.
7. Equal hashes mean only comparison of supplied values. Never set backup/provenance/execution permission true; full schema, new79 columns/proof tables and external effects remain separate.

## Evidence distinction

Pure SQL-shape/fixture tests are not PostgreSQL execution. Native PG17 synthetic validation and later explicitly approved PG18 aggregate reads belong to the controller. Distinct-agent review is not independent model-quality certification.

## Final source review — bounded GREEN

Source and all39 author tests read completely after publication. No confirmed actionable defect found. The additive migration-catalog export was also read: it delegates to the existing exact catalog inspector and freezes its result; it does not fabricate successful history rows. No source edit by reviewer.

Fresh reviewer run:37/37 PASS at18:39:05 local. Fresh combined run:76/76 (39 author +37 reviewer) PASS at18:39:44 local. Scoped reviewer ESLint exit0. Both Vitest runs used the existing safeEnvironment; no database runtime, network or service was invoked. No RED claimed: all reviewer cases passed on their first execution.

| Pinned file | SHA-256 |
|---|---|
| `PILOT_DATA_PRESERVATION_PLAN.md` | `88b1e6a6307cd64af0bca3c101ee633381852c5c08cac8981d3164be9ccd70da` |
| `deployment/pilot-data-preservation.mjs` | `934efe005c283d29eb3904853421e420aa4a4eb1962b36c86816f739ec1afdc7` |
| `test/personal-pilot-data-preservation-review.test.ts` | `030e603075a334543fff51bc60e7903d2fb728a814f21be428d6d22fd360d676` |

## What the37 cases and code reading establish

- Positive comparison is deeply immutable and returns no table digest or permission. It separately reports new columns/new proof tables unverified and history prefix70 scope.
- Equal supplied row counts with one changed digest report changed data; changed counts still report a change even if a supplied digest is equal. Input table order is irrelevant.
- Missing/extra/duplicate/unknown tables, wrong version/plan/catalog binding, malformed or overflowing decimal counts, truncation, incomplete history and79-row prefix captures refuse. Empty tables require the actual SHA-256 of empty bytes. No JavaScript integer rounding is used.
- Getters, prototype keys, sparse arrays, extra keys and oversized arrays refuse. The oversized-array indexed accessor is never invoked. Duplicate column positions refuse; permutation of source objects preserves SQL, while a renamed old column changes plan binding.
- Table identifiers and output-name literals independently escape quotes; oversized UTF8 identifiers refuse. Array lower-bound metadata accompanies its JSONB value instead of silently losing dimensions.
- Generated SQL explicitly fixes UTC, DateStyle, IntervalStyle, bytea and floating-point output, search_path, row-security behavior and statement/lock/transaction deadlines in one READ ONLY REPEATABLE READ transaction. All old columns are explicit, not `t.*`.
- Data digest is an ordered multiset of fixed-length row SHA-256 values, never DISTINCT. The test's synthetic reference multiset distinguishes A,A,B from A,B,B and tolerates row permutation; **this reference is not execution of the SQL**. The exact emitted cap is500001 input rows and500000 accepted rows; overflow is marked and rejected. SQL shape asserts those exact numbers.
- Prisma history alone uses the exact70 migration-name allowlist plus70 distinct completed/non-rolled-back rows. The nine new rows and any unknown added history remain outside this comparison and require controller verification. This exception does not authorize ignoring arbitrary legacy tables.

## Controller native gates and limitations retained

Execute the actual generated query on the owned synthetic PostgreSQL17 rehearsal before any managed PG18 data read. Required native contradictions include same-count changed row, duplicate multiplicity, NULL/text/empty distinctions, array lower bounds, serialization across session timezones, old history changes, added79 columns and missing/truncated results. Pure shape checks do not prove PostgreSQL syntax or runtime results.

The500000-row cap,4MB work_mem and SQL timeouts are not an OS memory/CPU/IO sandbox. Sorting and hashing can still consume resources or fail; controller must size the real branch before authorizing reads. A digest match compares the selected old values, not physical tuple bytes, full database/schema semantics, endpoint identity, restored provider state or a backup. Provenance and all execution/backup flags remain false.

Peer tests frozen after the76/76 run. Fresh `tsc --noEmit --incremental false` launched after this file existed, session26583, completed exit0; no shared incremental cache was written.

## Controller native adapter pre-execution review

Read the complete new `deployment/pilot-data-preservation-native.mjs` and the plan's local native addendum. No execution or edit by reviewer. The exact owned cluster/port, sealed baseline, prior inspection70 and upgraded79 identities match the retained receipts. New writes are bounded to one named negative clone and its one known synthetic workspace-name update. Baseline is not unsealed; existing databases are not mutated. Synthetic password remains child-environment-only. Query/output files are exclusive-create inside the owned cluster. Finally stops the exact data directory and requires status3/PID absence. No remote address or provider action is present.

Pre-run recommendations sent to controller, not claimed as reproduced failures:

1. Pin the schema-drift module before the dynamic data-builder import, since it is an executed transitive dependency; also pin the migration catalog's source-binding dependency as practical. Initial adapter pins only the two direct modules.
2. Independently verify current whole migration history counts/state on before70 and after79, because a preservation query restricted to the original70 history rows could also match two databases still at70. Database names and previous receipts alone do not provide this fresh oracle.
3. Compare differing aggregate identities privately and require exactly `ConstructionWorkspace` for the one-row negative, not merely one unidentified changed table.
4. If claiming native duplicate-multiset, NULL, array-bound or timezone coverage, add explicit read-only computed SQL controls. Existing populated seed alone does not prove each serialization distinction. No extra data table is required.

These are review conditions before controller execution. Awaiting the narrow updated adapter; no native PASS or backup claim is made here.

### Final adapter delta — bounded GREEN before execution

Read the entire updated adapter and complete current plan/addendum again. Verified adapter SHA-256 `e8d7952d30fa36376dc2da9ce5a6d38683eba27fd0d9db21d0e7fcb43cab331b`. No adapter code or runtime execution by reviewer. The initial recommendations above remain as dated review history, not reproduced RED tests.

- Both executed non-built-in transitive dependencies are now pinned before dynamic imports and again before each data capture. Read import declarations to confirm the schema-drift and source-binding files cover that graph; built-in Node imports add no new local module path.
- The actual before/after databases must independently return exactly70/79 ordered migration rows. Each name, successful/non-rolled-back state, steps1 and checksum must match the locally rebuilt ordered catalog; checksum acceptance is restricted to its explicit raw/LF/CRLF alternatives. These checks occur before the full data SQL, preventing two unchanged70 databases from satisfying the upgraded79 oracle merely by matching their shared history prefix.
- Four computed read-only SQL controls require true: NULL versus text null versus empty; A,A,B versus A,B,B; row permutation invariance; and differing array lower bounds with identical elements. These are explicit SQL expression controls, not application-row fixtures or execution results yet.
- The full generated query is captured against70 with an ambient New York timezone,79 with Tokyo, and the negative clone with UTC; the query itself fixes UTC and its other serialization settings. This proves no timezone behavior until actually executed, and does not imply coverage of every PostgreSQL type edge case.
- The negative oracle now requires exactly one changed digest, zero changed counts and the exact private differing table list `[ConstructionWorkspace]`. Its receipt preserves the named negative database separately. Existing70/79 and sealed baseline stay unmodified; only the authorized new clone receives the one guarded synthetic update.
- Finally cleanup remains exact-cluster stop plus status3 and PID absence; a failed query/clone/oracle is retained as an opaque failure and cannot be reported as a successful comparison. Captures and the negative clone are retained; no drop/reset or remote action was added.

Verdict: no remaining blocking defect found for the controller's explicitly authorized one-shot local synthetic run on this exact frozen adapter. This is code-review readiness only, not native PASS, remote safety evidence, restored-backup verification or full database equivalence. The reviewer did not start PostgreSQL, read credentials, execute SQL or invoke providers. Author/controller reported syntax and lint PASS separately; this addendum does not relabel those as reviewer-run checks.
