# R0.2 preparation observations before freeze

Source and Brain were clean at admission. A new worktree preserves R0.1 unchanged.
Installed dependency junctions reuse the same resolved targets as R0.1; no install.
`node specs/208-astra-r02-local-preflight/prepare.mjs`: exit 0,
LOCAL_PREPARATION_PASS. Raw generation result is generation.json; Prisma 6.19.3
generated the 27-file client locally. Schema and client tree hashes are recorded
in preparation.json. No database connection or provider was requested.

`node --test --test-reporter=tap specs/208-astra-r02-local-preflight/protocol.test.mjs specs/208-astra-r02-local-preflight/io.test.mjs`:
exit 0, 58 passed, zero failed/skipped, duration 32933.163 ms.
This is development evidence, not the later frozen run's raw output.

Current projection was regenerated against actual checkout bytes using the
unchanged buildCurrentProjection and validateCurrentProjection functions. Its
claims remain STATIC_SOURCE_CONFIGURATION_ONLY, provider/customer NO-GO,
whole-product readiness NOT_EVALUATED. Historical files were not regenerated.

The generic long-run validator refused three short chapter estimates and then a
single 90-minute chapter. Rather than invent multi-hour substance, this normal
bounded block uses WORK_STATUS.json and the validated continuation queue, per
PROJECT_MEMORY_PROTOCOL. The rejected development manifests were not admitted
as an execution proof and no long-run COMPLETE claim is made.

Review found two P1 defects before freeze: admission did not compare the generated
tree to the preparation manifest; generation output was decoded/JSON-escaped
before its secret/non-UTF8 scan. Both were corrected, with negative tests.
The first development generation/preparation captures remain in
development-generation-01.json and development-preparation-01.json. The corrected
generator ran again before freeze (exit 0), preserving the same 27-file tree hash.
The admitted preparation.json is now compared by freeze preflight to actual bytes.
Raw generation streams are individually scanned before any decode or serialization.

Combined rerun after these corrections: 61 passed, zero failed/skipped,
35998.2766 ms, native exit 0. A separate positive current-projection probe passed;
a deliberately altered in-memory input hash was refused by the unchanged validator.
