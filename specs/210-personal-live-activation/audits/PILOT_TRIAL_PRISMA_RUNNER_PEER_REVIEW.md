# Pilot trial Prisma runner — bounded peer review

Date: 2026-09-10. Worktree: `C:/dev/endvera-astra-r03`.

## Verdict and scope

**GREEN for the reviewed local implementation and mocked/pure tests.** This is not execution authorization, provider identity authentication, a live TLS test, Windows ACL certification, a backup, data preservation proof, or a migration result. The controller alone owns any separately authorized `PREFLIGHT_70` invocation. `MIGRATE_70_TO_79` remains hard-refused before source work or input admission; no injected approval option can enable it.

Read in full: `PILOT_TRIAL_PRISMA_RUNNER_PLAN.md`, the runner, its 67 author tests (including the final four stage-integrity cases), and the relevant reused source-binding/runtime/client/environment helpers. Used the engineering code-review skill to separate reproduced defects from design limitations. This is another agent's code review and separately written tests, not a claim of independent model-quality certification.

Reviewed final runner SHA-256: `618a826d8d105363a38ae254a4f02fd4dde40d3bf2182e25abc04e29b3bc4848`.

Peer test: `test/personal-pilot-trial-prisma-runner-review.test.ts`, final SHA-256 `3e29b0933c0aaf99c86e4678432798df4f846d65bcba123cdc27f447a5b37f51` (equivalent `toMatchObject` assertion avoids relying on incomplete inferred MJS environment keys).

## Reproductions retained unchanged

Times below are local test-runner timestamps.

1. **18:51:14 — 1 PASS / 3 FAIL.** A valid synthetic 70-row history was accepted when its rows array exposed an index getter, a proxy `get` trap, or an own `map` getter. The API invoked caller behavior instead of rejecting the supplied shape. These are defects at the exported JavaScript boundary, **not an exploit of the child JSON transport**, which cannot encode accessors or proxies.
2. **18:51:36 — 1 FAIL, 4 filtered skips.** The migration mode correctly refused, but destructuring `options.input` had already invoked a getter once. No actual stdin or secret was involved. The mode guard now precedes options destructuring.
3. **18:52:53 — 1 FAIL, 17 filtered skips.** The first array repair rejected an unexpected count only after materializing all array descriptors. A 71-element fixture and descriptor-call spy demonstrated order without a large allocation. The repair now rejects proxy/non-plain arrays, checks the length descriptor and exact own-key count, then materializes row descriptors. No assertion was relaxed.

Author applied all production fixes; reviewer edited only its test and this audit.

## Fresh checks

- **18:53:57: 81/81 PASS**, two files: 63 author and 18 peer tests. **18:57:21: final stage-integrity delta, 85/85 PASS**, 67 author + 18 peer. **18:58:35: final test type corrections, 85/85 PASS again** in this reviewer run. Command: `node node_modules/vitest/vitest.mjs run test/personal-pilot-trial-prisma-runner-review.test.ts test/personal-pilot-trial-prisma-runner.test.ts`.
- Scoped peer ESLint: exit 0.
- Typecheck history retained: reviewer session 29212 reported three test-only diagnostics (two incomplete MJS-inferred environment keys in peer assertions, one overly narrow author mock-call tuple). Equivalent assertions/types corrected without changing production source or weakening expected values. Author reports final shared `tsc --noEmit` session **49717 exit 0**, including all 18 peer tests; author scoped lint exit 0 and rerun 85/85 at 18:58:52. No root test/build run launched by this reviewer.

Peer tests additionally cover holes, extra/symbol/hidden array properties, inherited array prototypes, row getters, the specifically catalogued historical LF checksum, exact migration-name refusal, frozen metadata-only output, hidden environment/engine/certificate/proxy flags, and non-retryable unknown/failed future migration classifications. They construct synthetic history metadata from the actual local immutable migration catalog; they do not fabricate successful database observations. Every child process is mocked to throw in this peer test file.

## Critical paths reviewed

- Exact trial hostname, database, role and canonical strict-TLS URL shape; pooled, alternate and ambiguous URLs are refused. Project/branch identifiers in the receipt remain configured labels, not provider authentication. The controller must independently bind the actual trial endpoint.
- Expected HEAD, clean worktree, whole-source binding, exact migration catalog, Prisma version/runtime and generated-client fingerprint are checked before credential admission and rechecked before the child. Optional Git locks are disabled. No Git/project initialization, installation, generation or commit is performed.
- Bounded private stdin envelope: 4096 bytes, 64 chunks, at most five seconds within the original overall budget; fixed errors, copied buffers cleared, no URL in arguments, staged files or receipts. JavaScript string clearing is not secure memory erasure, and child environment confidentiality is not an OS-level observer guarantee.
- Actual child command is the checked generated client under the current Node runtime, with a closed environment, hidden window, captured output, bounded process/output/transaction/query/lock deadlines. The single fixed history query shares one read-only transaction with identity checks. No application rows or raw migration logs are returned.
- Child failures and malformed output are opaque and non-retryable. Legacy history is exactly 70 names/order with only catalogued byte representations; the future 79 validator requires exact new checksums. These checks do not prove application data preservation.
- Private staged SQL/configs are preparatory copies, **not executed by the only enabled preflight path**. The final additive guard binds all staged file hashes/sizes, rechecks regular ancestors and exact inventories of known directories before the probe and before receipt publication, and refuses a failure receipt if stage integrity is lost. The four new author tests use a private in-memory filesystem simulation; they prove guarded code behavior, not Windows filesystem isolation. This review does not approve a future migrate implementation merely because a pure command-selection helper can describe it. Before enabling that phase, integration of those guards at the actual migration execution point and a separate preservation/execution contract still require review.

No SQL/DB/network/provider/EAS/build, credential retrieval, migration or deployment was performed by this reviewer. No production source, SQL, configuration or dependency files were edited.
