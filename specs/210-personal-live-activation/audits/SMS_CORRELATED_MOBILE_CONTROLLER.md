# Controller — exact correlated approval mobile integration

2026-09-10, local OFF validation; predecessor db655fffb2f65b67e4e626dc2185bd7913e99693.

## Delivered and independently checked

Selected returned offer is rendered with both unchanged source texts and its
exact draft before a separate explicit approval gesture. The five-field command
comes from that copied offer. No render, focus, selection or historical lookup
posts an approval. An origin/owner-scoped, versioned metadata journal must persist
and pass exact read-back first. Failed/unknown attempts cannot automatically retry.
Recorded result checks remain accessible after source expiry and do not assert
current Google state. Account, workspace, origin, background and generation fences
discard late responses and hide obsolete content. The old V1 evidence card and
default read-only list behavior remain intact.

Controller read the implementation, contract/API peer tests and audit, storage/
lifecycle counter-tests and audit, final component and lifecycle deltas. The
React skill informed stable hook dependencies, lifecycle cleanup and minimal
versioned storage; no lint rule was disabled to accept render-ref writes.

New controller file personal-correlated-calendar-approval-render-controller.test.ts
contains eighteen tests rendering the actual component and V1 evidence card with
synthetic hooks/API/storage adapters. Checks cover source-before-action ordering,
explicit selection/send separation, busy/expiry/unknown/capacity states, historical
dismissal, six invalid identity contexts, origin binding, AppState transitions and
English UI preserving original French source text. These mocks do not prove native
effect scheduling, SecureStore, physical focus behavior or a human interaction.

The author audit retains contract preflight getter/byte-accounting/provenance REDs
and six storage/lifecycle REDs from separate reviewers. Last lifecycle correction
returns for a stale generation before cancelling any newly activated generation.
No repaired test is presented as an initial green run or a provider observation.

## Fresh full-suite receipts after source freeze

- mobile-1789072190008: 766/766 tests, 72 files, exit0,
  2026-09-10T20:29:58.773Z.
- mobile-export-1789072199920: Android Hermes export exit0,
  2026-09-10T20:30:56.160Z; output directory
  apps/mobile/dist-personal-210-mobile-export-1789072199920. This is a bundle,
  not an APK build, distribution or Samsung installation.
- root-1789072210645: 6030 PASS, three historical skipped PostgreSQL tests,
  422 passed files, exit0, 2026-09-10T20:31:43.043Z. Includes the new 27-case
  root-only actual-server-schema/mobile-contract parity review.
- Controller mobile TypeScript and scoped lint exit0 after final source freeze.

These receipts use the existing safeEnvironment harness and synthetic HTTP/store
fixtures. There were no paid product API calls, secrets read, remote database
changes, dependency installations, deployments or newly distributed applications.
Earlier native367/367 and built OFF HTTP7+7 remain backend predecessor evidence;
they are not relabeled as native mobile evidence. No backend source changed here.

## Exact source fingerprints

SHA256:

- contract: 0bfbfc7775444217cfcc87440a5638a3cb4a91c2d9147eacdaae418a15abe54f
- attempts: b4caafa68ac38fa6f975090d9d1d8cf3096de9ff06188d1330e671b3b9f74110
- lifecycle: 48179afc105de0f6ce2d92d4f1a7f86cdc99b6330684bb67146b36fc192a0870
- component: b641cb73d07b8ded9865fd69a864bed56d508edd524723a798a1b19853b94933
- API: 7c109d620a24585309ee2fa7445c7fa8d2b7669d8ea8c20dd1607821fe017e50

## Remaining boundaries and continuation

Local feature DONE_LOCAL, not live service completion. SecureStore storage size
and key behavior on device remain unobserved; the journal closes approval on
storage failure. Its JS serialization is not multiprocess/device CAS. Durable
SQL one-use guards remain authoritative. No rubric transition: roadmap22%,
local build46.75%, C2 preparation18of18, real provider/customer test NO-GO,
Verified-E2E0%.

The next voice slice must not invent an ASR session or turn a synthetic transcript
display into product value. Existing source-to-session discovery and post-commit
disclosure expiry need a bounded design before a mobile reader. Live transcription
requires separately resolved provider routing/privacy/audio authority; current
SMS authorization does not silently authorize an audio service. Continue compatible
local work while preserving these blockers and the active heartbeat.
