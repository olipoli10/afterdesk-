# Development observations — before freeze

Source and Brain verified clean at the pinned heads in plan.md. New isolated
worktree only. Old app goal slot cannot be replaced without falsely completing
the whole-project goal; durable bounded manifests are used instead.

Astra source audit confirmed retry cardinality, incomplete report, historical
failure aggregation, multiple tested heads, token scanner and inventory defects.
This is static source review, not a fresh product audit or quality benchmark.

First protocol test run: 33 passed, 1 failed. The duplicate-ID test accidentally
overwrote the first intent fixture and reached INTENT_MISMATCH before the intended
duplicate-ID guard. The fixture was corrected; no production validator weakened.
Second run: 34 passed, zero failures. Node default reporter was not TAP; explicit
--test-reporter=tap is required by the frozen parser. Both are pre-freeze setup,
not campaign observations. Live history inventory: 1978 spec206 files, 381 command
records, 93 exit mismatches, eight audit attempts, one incident, zero stream hash
errors. Old snapshot 379 remains unchanged, not substituted with 381.

Sol source review found reproducible P1 issues before freeze: contradictory Vitest
and TAP reports could appear green; journal rewrite was not atomic; a junction
could cause mkdir side effects before refusal; labeled/UTF16 secret output could
escape pattern scanning; mutable lifecycle metadata conflicted with the evidence
anchor; dependency executables were not fingerprinted. These were corrected.

Now 41 pure tests pass and eight real temporary-filesystem/Git tests pass. They
cover anchor byte and file-set tampering, source mutation, interruption before
journal rename, junction confinement, dependency drift and metadata-only closeout.
These are synthetic test fixtures, not actual product audit attempts.
Runtime fingerprint hashes both installed dependency trees and the Node binary;
generated top-level .cache/.vite/.vite-temp are explicitly excluded. This does not
attest a hostile host or OS isolation. Temporary test repositories are removed only
after resolving their own generated path under the system temp directory.

Program admission initially refused two estimates below its 45-minute minimum;
updated honest bounded range remains 1–3 hours (150 planned chapter minutes).
Canonical program and queue admission now pass. No overnight duration claimed.
No provider or founder action. Sol re-review continues before freeze.
