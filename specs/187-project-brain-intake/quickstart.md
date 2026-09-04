# Quickstart: Project Brain Intake R36V

## Boundary

Use only a disposable local PostgreSQL database and synthetic files. Do not configure an AI, transcription, OCR, messaging or other external provider.

## Targeted validation

```powershell
npm test -- --run test/construction-operating-assistant-r36v-project-brain-contracts.test.ts test/construction-operating-assistant-r36v-project-brain-query.test.ts test/construction-operating-assistant-r36v-project-brain-api.test.ts test/construction-operating-assistant-r36v-project-brain-file-ownership.test.ts test/construction-operating-assistant-r36v-project-brain-server-hardening.test.ts test/construction-operating-assistant-r36v-local-storage-scan.test.ts
npm --prefix apps/mobile test -- --run test/project-brain-intake.test.ts
```

Expected: strict contracts, streamed 64 KiB JSON enforcement with and without `Content-Length`, authorized hash-bound source reads, truthful limitations, mobile one-surface/global-queue recovery and deterministic queries pass with zero provider or transport effect.

The contract suite also injects fake Cloudmersive configuration and a failing `fetch` sentinel. The local-only inspector must still succeed with `providerExecutionPerformed: false` and zero calls to `fetch`; removing environment variables around a request is not an accepted substitute.

The same suite injects a complete fake R2 configuration and an AWS module-import sentinel, then writes, reads, checks and idempotently deletes a binary fixture through `storage-local`. The round trip must remain byte-exact with zero provider import and zero network call; runtime environment mutation is not an accepted storage selector.

The API suite must also prove that malformed or unauthorized requests never invoke a domain mutation or manufacture a target refusal audit, while a valid authorized source read returns private/no-store bytes with the verified `X-Content-SHA256` header. The mobile suite opens project A while project B has a pending source and proves that the global durable queue preserves B's file; B reports a missing durable file only when B is opened.

## Disposable PostgreSQL validation

Apply the forward migration to a fresh disposable database, then run:

```powershell
npm run test:integration -- test/integration/construction-operating-assistant-r36v-project-brain-file-ownership.itest.ts
npm run test:integration -- test/integration/construction-operating-assistant-r36v-project-brain.itest.ts
pwsh -NoProfile -File specs/187-project-brain-intake/scripts/validate-r36v-full-integration.ps1
```

The integration schema marker fingerprints the sorted migration names and their exact SQL bytes. This forces a disposable rebuild when an uncommitted migration is amended. The per-file reset harness temporarily disables only the four named R36V `BEFORE TRUNCATE` guards, truncates the disposable tables, and restores every guard before a test begins.

The integration-only `@/lib/db` alias uses explicit bounded transaction acquisition and execution limits for Prisma Dev/PGlite. It does not change `src/lib/db.ts`, production transaction defaults, application locks or the deliberate `Promise.all` concurrency gates.

Acceptance scenario:

1. Create a synthetic workspace and project.
2. Create one intake.
3. Admit a PDF, two images and one short real AAC/M4A fixture through separate commands. Verify its bounded codec/sample-table structure and server-derived timeline duration; refuse malformed, over-120-second and materially drifted declarations without claiming perceptual audio decoding.
4. Add an owner brief whose blocker and next decision appear nowhere else.
5. Submit for review and retain the exact fingerprint.
6. Confirm the exact version/fingerprint.
7. Select the same synthetic bytes twice through two distinct command bodies. Verify two ordered source/provenance rows and two `ADMIT_SOURCE` decisions, but one canonical `File` row and one local object; replay both and verify all counts stay fixed.
8. Retrieve one admitted source through its local source route, verify byte length/MIME/SHA-256 and one download access log, then prove a user outside the workspace receives no bytes or metadata.
9. Age a referenced file beyond the generic sweep threshold and verify the `File` row/blob remains. Create stale unreferenced and `.tmp` crash remnants, advance beyond 24 hours, reconcile, and verify only those remnants disappear.
10. Start a separate Node process with a fresh Prisma client, read the projection there, and compare its canonical JSON byte-for-byte.
11. Ask for the blocker and next decision.
12. Replay all commands, repeat an authorized state/media refusal, race source/review operations and reuse one command ID concurrently across two projects.

Expected:

- one intake and one canonical effect per command;
- two separate source/decision provenance effects for two deliberate identical-byte selections, backed by one canonical `File`/object;
- exact workspace/project binding;
- immutable source hashes and limitations;
- source retrieval that verifies bytes and appends access provenance without cross-workspace disclosure;
- generic sweep and 24-hour crash cleanup that retain every referenced source;
- one stable redacted replay/refusal audit for each eligible authorized command, and no target audit for malformed or unauthorized requests;
- server-measured M4A audio-track duration at or below 120 seconds;
- atomically confirmed snapshot/decision;
- byte-equivalent projection after a genuine process restart;
- answer only from owner-confirmed fields;
- refusal to claim document/audio interpretation;
- zero external transport, provider execution, credential read or spend.

## Mobile crash and cross-project recovery

Queue one source for synthetic project A and one for synthetic project B, then simulate a process interruption. On remount:

1. Load the complete encrypted durable intent index.
2. Open project A and reconcile the source-file inventory using every queued source as the retention set.
3. Confirm that A shows only A's intents while B's copied source remains present.
4. Remove B's copied file and reopen A; A still loads because B is not the actionable context.
5. Open B; the missing durable source is now refused visibly and retryably.

Expected: there is no cross-project file deletion, no silent loss, no external access and no requirement to reconstruct the queue manually.

## Proportional final gates

```powershell
npm run lint
npm run typecheck
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm run validate:provider-boundary
git diff --check
```

Run the full root suite and Next.js Webpack build before the local release is closed because this release adds a schema, migration and authenticated API boundary.
