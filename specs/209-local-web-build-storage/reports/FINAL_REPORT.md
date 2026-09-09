# R0.3 — local web build/storage boundary

Verdict: **LOCAL_BUILD_AND_RUNTIME_REFUSAL_PASS**.
Product verdict remains **LOCAL_REVALIDATION_REWORK**, not product-complete.

## What changed

Next 16.2.12 imports storage consumers during build page collection while
NODE_ENV is production. Previously that import required runtime R2 credentials.
The exact Next build phase now selects `build-disabled`: no S3 client and no
storage operation. Production runtime without R2 still fails at import, rather
than falling back to disk. Partial R2 configurations still fail everywhere.

The engineering debug workflow required red reproduction before the product fix:
three targeted failures before, 19/19 storage tests after. A distinct critical
review covered the fix and bounded recorder. This is not an independent model
quality benchmark or an external/hostile-host attestation.

## Fresh observations and provenance

- Worktree: C:/dev/endvera-astra-r03; branch codex/endvera-astra-r03.
- Product build/tests HEAD: fda5e2bbcc01973e943712c48b14005180a845b1.
- Product build/tests TREE: e153b5a884a17726f475bdf1ac8d58b6cff7ed0a.
- Recorder-corrected runtime/boundary HEAD: 10ba4fb0722143de7c6db2c5c62040b07be08888.
- Evidence anchor: 616a577527a69169da21814e81bfc186b634c776.
- Evidence TREE: e540f6a6d43abb56845a19ca34173e42bd98328b.

Five selected controls pass:

1. Focused storage tests: 19 passed, zero failed/skipped.
2. Full root suite, isolated retry: 2720 passed, zero failed, three skipped
   PostgreSQL tests. No DB observation inferred from those skips.
3. Static provider source boundary: exit zero, violation count zero.
4. Actual `next build --webpack`: exit zero, TypeScript passed, static page
   generation 113/113, BUILD_ID and route manifests produced.
5. Fresh compiled upload/download route imports, NODE_ENV production and no
   NEXT_PHASE/R2: both refuse with the original R2 configuration error.
   No HTTP request, database query or server startup is implied by this probe.

Build and runtime fingerprint the same 874 compiled server/BUILD_ID files:
`aa303d36236ff04233e9ac17a548f9c1cff3cf40f5686e66f8a20f1c6396faf8`.
Installed root dependency fingerprint includes 40184 files, excluding only
named generated caches. Generated Prisma client stays byte-identical (27 files).
The verifier proves the later recorder commit did not change product source or
the compiled-runtime probe. These are explicitly two tested HEADs, not one.

Ten attempts are preserved: six pass and four fail, including the initial red
reproduction. The first concurrent root attempt has 2719 pass/one failed binary
Git-fixture test; timing contention is plausible but not proven. Its isolated
same-HEAD retry passes. The concurrent boundary attempt has SOURCE_CHECK_FAILED
and withheld streams; this is a recorder incident, not proof the boundary failed.
The first compiled-runtime child returned both correct refusals, but the recorder
rejected its larger exact JSON object. Its JSON_RESULT_MISMATCH remains unchanged;
a separate corrected-recorder retry is recorded. Nothing retroactively becomes PASS.

Additional local helper tests: three observer cases passed, including failed OS
termination and overflow without close; three parser checks accept the exact
report and refuse a false pass or missing route outcomes. Commands/results were
observed in this task; they are not part of the ten anchored build attempts.

Validate retained evidence:

`node specs/209-local-web-build-storage/verify.mjs 616a577527a69169da21814e81bfc186b634c776`

## Boundaries and dashboard

No provider call, real credential, personal/customer data, transport, expense,
OAuth, migration, deployment, push, store action, timer or founder test. The local
build used an ephemeral synthetic authentication value in child memory only.
No DB or persistent app server was started. Generated .next stays local/ignored.
All four previous worktrees were rechecked clean at their admitted fingerprints.

Fresh rubric recalculation against clean Brain
5fdd8ccb7670f59176afe6faf781eb456e262edc:

| Indicator | Result |
|---|---|
| Strict canonical roadmap phase exits | 22% |
| Local AI engine build readiness | 46.75% |
| C2 preparation | 18/18 |
| Real provider/customer readiness | NO-GO |
| Verified-E2E observed coverage | 0% |

The pinned R0.2 metric wrapper correctly refused a newer Brain HEAD; the same
pure rubric calculator was then run against the freshly verified current Brain.
No rubric transition was earned by this storage fix. Candidate UNPROBED;
providerVerdict/adoptionDecision remain null. R0.1 REWORK and spec206's unsealed
historical status are untouched.

## Next useful block

Local integration of the portal/mobile conversation path against the guarded
intent gateway, using synthetic context and disabled provider adapters. Keep
exact ownership, approval and ambiguous-request behavior visible. Do not infer
phone/device readiness, real SMS/calendar access or model quality from this build.
Native device observation, live provider authority and complete G0-G7 observations
remain separate gates. The older blocked global goal is not marked complete.
