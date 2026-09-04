# Quickstart: Project Brain Understanding Review R36X

## Boundary

Use only synthetic R36V sources and R36W candidates in a disposable local PostgreSQL database. Do not configure or call providers, OCR, transcription, vision, document parsers, messaging or external transport. Binary source bytes are not inputs to review logic.

## Targeted validation

```powershell
npm test -- --run test/construction-operating-assistant-r36x-understanding-contracts.test.ts test/construction-operating-assistant-r36x-understanding-api.test.ts test/construction-operating-assistant-r36x-understanding-server.test.ts
npm --prefix apps/mobile test -- --run test/project-brain-understanding-review.test.ts
```

Expected: strict commands, role-safe projection, append-only contradictions/resolutions, complete-review gate, exact hashes, body-bound replay, one-surface mobile flow and zero provider/binary/external/automatic effect.

## Disposable PostgreSQL validation

Create one fresh uniquely named local database, apply all migrations normally, then run:

```powershell
npm run test:integration -- test/integration/construction-operating-assistant-r36x-understanding.itest.ts
```

Acceptance sequence:

1. Create two synthetic workspaces/projects and one complete R36V→R36W chain.
2. Create the review from project navigation without supplying upstream technical IDs.
3. Inspect complete sources/candidates/provenance and record explicit dispositions.
4. Declare a contradiction with two candidates and verify neither member/history changes.
5. Resolve it through each valid mode in isolated cases and verify the canonical disposition matrix plus append-only history. Put one candidate in multiple groups and prove conflicting derived outcomes refuse preparation.
6. Attempt preparation with one missing disposition and one unresolved contradiction; verify refusal.
7. Complete the review, prepare the canonical snapshot and reproduce its fingerprint.
8. Confirm the exact version/fingerprint once; replay/race confirmations, verify unique monotonic project sequences and prove current selection is stable under `(sequence DESC, id DESC)`.
9. Restart with a fresh process/Prisma client and compare canonical projection bytes.
10. Attempt cross-workspace/project/candidate reuse, stale versions, body drift and unauthorized roles; verify no effect/disclosure.
11. Forge raw SQL that omits a candidate, violates the disposition/resolution matrix, creates conflicting multi-group outcomes, duplicates/reorders a confirmation sequence, changes contradiction membership, selects a non-member, mixes a tenant, falsifies completion or changes JSON/hash; verify commit refusal.
12. Install provider/storage/network sentinels; verify zero call/import/binary read.

## Required mutations

Each mutation must fail by its exact guard, be restored byte-exactly with before/after SHA-256, then rerun the smallest relevant test:

- `field-worker-can-read-or-decide`;
- `cross-workspace-candidate-enters-review`;
- `contradiction-member-is-overwritten-or-deleted`;
- `resolution-removes-original-conflict`;
- `automatic-resolution-is-accepted`;
- `resolution-selects-non-member`;
- `resolution-and-disposition-disagree`;
- `multi-group-derived-outcomes-conflict`;
- `candidate-without-disposition-is-omitted`;
- `unresolved-contradiction-can-seal`;
- `stale-fingerprint-can-confirm`;
- `canonical-hash-does-not-cover-complete-review`;
- `replay-creates-second-effect`;
- `command-id-body-drift-is-accepted`;
- `partial-transaction-commits`;
- `binary-or-provider-path-is-reachable`;
- `confirmed-history-can-update-delete-or-truncate`.
- `confirmation-sequence-is-duplicated-or-current-order-drifts`.

## Proportional final gates

```powershell
npx prisma validate
npm run validate:provider-boundary
npm run lint
npm run typecheck
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm run test:run
npm run build
git diff --check
```

These checks establish only local synthetic implementation evidence. They do not establish assistant recall, founder/customer value, provider readiness, store readiness, Preview, Production or deployment.
