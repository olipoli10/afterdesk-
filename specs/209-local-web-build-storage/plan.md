# R0.3 — local web build without runtime storage authority

## Goal

Resolve the exact build-time storage import refusal while retaining fail-closed
production storage behavior. Reproduce with instrumented module tests; implement
the smallest build-only disabled mode; review; run focused/root regressions and
a genuine local Next build; verify the compiled runtime still refuses absent R2.
No production-ready, runtime-provider or device claim follows from a local build.

Base HEAD 3a507c3e97f4d0274391c0b0f6bb6af85ffd6dd8, TREE
d46d3f9a04b388d7e755439d3b93680a0d29b29d. Brain admission
5fdd8ccb7670f59176afe6faf781eb456e262edc. Both freshly verified clean.
Worktree C:/dev/endvera-astra-r03; branch codex/endvera-astra-r03.
Allowed source changes: storage module and direct storage tests; bounded local
validation scripts/spec209, generated .next, pinned generated Prisma output;
canonical Brain checkpoint. Existing evidence/source worktrees remain unchanged.

## Design and order

1. Installed Next 16.2.12 build/index.js sets NEXT_PHASE=phase-production-build
   before static worker/page collection; its define-env does not inline that
   variable. Read installed docs for environment/config phases before coding.
2. Add build-disabled only for the exact Next build phase. No S3 construction,
   no filesystem or network operation, no successful storage operation. Partial
   credentials remain an error. Preserve preview-disabled and local-dev behavior.
   Without the build phase, unconfigured NODE_ENV=production still throws.
3. Instrument tests for every operation, synchronous stream refusal, accidental
   complete/partial R2 values, wrong/absent phase and runtime imports. No real R2.
4. Capture red then green targeted tests, distinct critical review, fresh root
   suite, static provider boundary, production-optimized local Next build and
   compiled route import without build phase. No VERCEL preview/production run;
   no migration. Child auth secret is ephemeral synthetic memory only, withheld
   if found in raw output; do not set dummy R2 credentials.
5. Retain every attempt and native/semantic outcomes. Record code/command hashes,
   installed runtime and generated input fingerprints, build artifact hashes.
   Use one versioned local queue. Finish after result validation, local commits
   and Brain checkpoint, or no useful authorized work remains.

Do not reuse R0.2 PASS as a fresh result; do not alter its contract/seal. This
ordinary bounded block is not an overnight program or a full G0-G7 campaign.
No provider calls, credentials, personal/customer data, SMS/call/email, OAuth,
spending, push, deployment, Preview, Production, publication, timer or founder test.
No authentication guard bypass. Model proposals remain untrusted.

## Acceptance and stop

Focused storage tests and full root tests pass; actual local build exits zero
and emits BUILD_ID plus route manifests. Compiled production storage consumers
must refuse without R2 when NEXT_PHASE is absent; a lingering build phase must
still never permit storage effects. Build failures remain exact recorded failures.
No metric changes without a real rubric transition; report all five separately.
If missing external authority is the only way to continue, record that blocker;
do not invent configuration or activation.
