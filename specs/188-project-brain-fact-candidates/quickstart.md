# Quickstart: Project Brain Fact Candidates R36W

## Boundary

Use only synthetic text/metadata and a disposable local PostgreSQL database. Do not configure or call a model, OCR, transcription, vision, document parser, messaging provider or external transport. The test must fail if candidate generation opens a binary object.

## Targeted contract and service validation

```powershell
npm test -- --run test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts test/construction-operating-assistant-r36w-fact-candidates-api.test.ts test/construction-operating-assistant-r36w-fact-candidates-server.test.ts
```

Expected:

- six fixed owner fields and seven fixed metadata fields are the complete adapter registry;
- Unicode text reconstructs exactly with UTF-16 half-open ranges;
- unknown fields/adapters and semantic candidate kinds refuse;
- all candidates remain unconfirmed with non-probabilistic confidence;
- storage/binary/provider sentinels observe zero imports, reads and calls;
- exact replay is stable and body drift conflicts;
- cross-tenant and unauthorized callers receive no protected projection.

## Disposable PostgreSQL validation

Create one fresh uniquely named local database, apply every migration normally, and run:

```powershell
npm run test:integration -- test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts
```

Acceptance sequence:

1. Create two synthetic workspaces, authorized owner memberships and projects.
2. Create and confirm one R36V intake containing Unicode owner text and two distinct identical-byte source provenance rows.
3. Generate R36W candidates using the exact confirmed snapshot hash.
4. Verify exact text ranges, canonical metadata equality, stable ordering and candidate-set hash.
5. Replay and race the exact command; verify one batch, one candidate per fingerprint and one accepted decision effect.
6. Reuse the command ID with a changed body and attempt stale/non-confirmed/cross-workspace/source-reuse inputs; verify zero new effects and no disclosure.
7. Forge otherwise-valid raw SQL rows with an out-of-range text span, changed text value, changed metadata, mismatched source tenant, wrong kind/confidence pairing, confirmed status and missing reciprocal batch relation; verify every transaction refuses at commit.
8. Start a fresh process/Prisma client and verify the authorized projection is canonical-byte equivalent.
9. Install binary-storage, provider and network sentinels and verify generation/read still succeeds with zero binary read or external effect.

## Required mutations

For each mutation, capture the targeted failing guard, restore the file byte-exactly, compare before/after SHA-256 and rerun the smallest relevant test:

- `unregistered-adapter-is-accepted`;
- `owner-text-is-semantically-split-or-inferred`;
- `text-range-no-longer-reconstructs-value`;
- `source-metadata-comes-from-request`;
- `metadata-is-promoted-to-job-fact`;
- `binary-object-is-opened`;
- `provider-or-network-path-is-reachable`;
- `candidate-is-automatically-confirmed`;
- `confidence-becomes-probability`;
- `replay-creates-second-candidate-set`;
- `command-id-body-drift-is-accepted`;
- `cross-workspace-source-or-batch-is-visible`;
- `partial-batch-commits-after-failure`;
- `candidate-history-can-be-updated-deleted-or-truncated`.

## Proportional final gates

```powershell
npx prisma validate
npm run validate:provider-boundary
npm run lint
npm run typecheck
npm run test:run
npm run build
git diff --check
```

No readiness, customer, provider, founder, mobile-store, Preview or Production claim follows from these local synthetic checks.
