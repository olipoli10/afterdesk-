# R0.1 — evidence contract repaired; product retest REWORK

The new local evidence seal validates successfully. Its result is
LOCAL_CHECKS_REWORK / LOCAL_REVALIDATION_REWORK, not product readiness.
The immutable spec206 result remains LOCAL_REVALIDATION_BLOCKED — UNSEALED.

## Source and evidence

- Worktree: C:/dev/endvera-astra-r01; branch codex/endvera-astra-r01.
- Tested/frozen HEAD: 61f3b47553710a3f157c63cdba0e2f62983522ea.
- Tested TREE: 24d21da36a40ae9f496b083105da64fe15e07e0c.
- Evidence anchor HEAD: d4c036f5b879359c943b5674211de930cc2042c5.
- Evidence TREE: 8915c4fdb86d5b3b4fe6d2adaae320a299838f6a.
- Starting Brain: d96866623558ede5ac5f25274e636db12bd8e79b.
- reports/seal.json is derived from that exact evidence anchor; later metadata
  and report commits are delivery commits, not newly tested product HEADs.

## What was fixed

Separate exhaustive attempts from current selections; preserve incomplete outputs;
derive results from native exits plus semantic parsers; retain incidents even
after source restoration; anchor all evidence files and bytes to Git; refuse path
and junction escapes; atomically replace the journal; detect contradictory test
summaries and secret-shaped/non-UTF8 output; bind Node and installed dependencies;
accept only strict Git LF/CRLF source equivalence outside the byte-exact specs.

The testing-strategy review prioritized adversarial evidence integrity and real
filesystem/Git cases rather than repeating unchanged production builds. Requested
Astra source audit and Sol correction review had distinct responsibilities. Sol
approved freeze after its own pure tests and syntax checks; the parent ran all
filesystem cases. These reviews are not a model-quality benchmark.

## Fresh observations

| Check | Observed result | Limits |
| --- | --- | --- |
| Proof contract | 52 passed, 0 failed | 43 pure cases + 9 real temporary-filesystem/Git cases |
| Root unit suite | FAIL; 2280 passed, 8 assertions failed | 2288 discovered assertions; 45 failed Vitest suite entries, including 39 with no assertions after load failure |
| Mobile unit suite | 195 passed, 0 failed | No installation, login, permissions or physical Samsung proof |
| Provider boundary | PASS | Static source graph, not hostile-host/OS isolation |
| Canonical metrics | PASS, unchanged | Same accepted rubric, no gate credit from these tests |

All five attempts remain in the journal. Four current checks pass and one fails;
there are no incomplete attempts or capture incidents in R0.1. Every completed
attempt verified the runtime fingerprint before and after execution. The recorded
attempt duration includes post-check fingerprint verification, not model latency.

Historical source inventory separately retains 1978 spec206 files, 381 command
records, 93 native exit mismatches, eight audit attempts and one incident. Stream
hash errors: zero. The earlier 379-command snapshot is not rewritten.

## Root failure — diagnosed, not silently repaired after freeze

The new worktree lacks the ignored `.prisma-client` output. tsconfig.json maps
`@prisma-client` to that directory; prisma/schema.prisma declares that output.
The preceding worktree has it, the new worktree does not. Dependency junctions
alone did not reproduce the full local build setup. This was a preparation
omission in this run, not proof that 39 product suites regressed.

The current release projection also expects exact LF bytes for
release/endvera-construction-v1/release-definition-v3.json. Its expected hash and
the Git blob hash both equal
3ef53060e71a7868a9db3602e230032044b92f9531555cd6090138a9b0dc6b48;
the worktree hash is
7348e14aebdfa5d1f24dde68ccbc9b18349df8ca0ffcb7c5ab4f0084e17734e6.
The working bytes are exactly the Git LF bytes materialized as CRLF. The product's
exact-byte projection correctly refuses them; it was not regenerated or weakened
to change the frozen result.

Generated-client admission/fingerprinting and current-projection preparation must
be completed BEFORE the next freeze. They are not covered by hashing node_modules
alone. See NEXT_LOCAL_PREPARATION.md. No second campaign was silently substituted
and the previous 2712-passed observation is not this run's result.

## Dashboard

- Strict canonical roadmap phase exits: 22%.
- Local AI engine build readiness: 46.75%.
- C2 preparation: 18/18.
- Real provider/customer test readiness: NO-GO.
- Verified-E2E observed coverage: 0%.
- Runtime candidate: UNPROBED; providerVerdict and adoptionDecision: null.

No product provider API, personal/customer data, SMS/call/email, OAuth, spending,
push, deployment, Preview, Production, store publication, founder session or
three-minute timer. No app UI or gateway runtime code changed. No database or
server was started by this campaign; local test subprocesses terminated and owned
temporary test repositories were cleaned up. Existing services were not stopped.

This bounded repair can close with a valid REWORK evidence package. The older
whole-project goal in the app remains blocked and was not marked complete to
clear its slot. Program/queue closure does not mean ENDVERA is finished.
