# Data Model: Project Brain Intake

## `ConstructionProjectBrainIntake`

Represents one versioned capture/review lifecycle for a single workspace project.

Fields:

- `id`: immutable primary identity.
- `workspaceId`, `projectId`: mandatory tenant and project binding.
- `intakeSequence`: positive project-scoped sequence allocated while the project is serialized.
- `createCommandId`, `createCommandHash`: body-bound idempotency identity.
- `status`: `DRAFT`, `READY_FOR_REVIEW`, `CONFIRMED` or `REJECTED`.
- `stateVersion`: positive compare-and-swap version starting at 1.
- owner brief fields: `summary`, `scope`, `importantPeople`, `importantDates`, `blockers`, `nextDecision`.
- `reviewFingerprint`: nullable until review submission.
- `createdByUserId`, `submittedAt`, `confirmedAt`, `rejectedAt`, `createdAt`, `updatedAt`.

Relationships:

- belongs to one `ConstructionWorkspace` and one `ConstructionProject`;
- owns zero or more sources, snapshots and decisions.

Rules:

- unique `(workspaceId, createCommandId)`;
- indexed by `(workspaceId, projectId, createdAt)` and `(workspaceId, status, updatedAt)`;
- only `DRAFT` accepts brief/source changes;
- every accepted mutation increments `stateVersion` exactly once.

## `ConstructionProjectBrainSource`

Represents one securely admitted source in an intake.

Fields:

- tenant/project/intake identity;
- `commandId`, `commandHash` for exact replay;
- `kind`: `PHOTO`, `DOCUMENT` or `VOICE_NOTE`;
- existing secure `fileId` plus immutable `contentHash`;
- bounded display metadata: `displayName`, `mimeType`, `sizeBytes`, optional `durationMs`;
- `ordinal` allocated under the intake lock;
- `transcriptionState`: `NOT_REQUESTED_LOCAL_ONLY`;
- `documentUnderstandingState`: `NOT_REQUESTED_LOCAL_ONLY`;
- actor and creation time.

Rules:

- unique `(workspaceId, commandId)`, `(intakeId, ordinal)` and `(intakeId, fileId)`;
- append-only in R36V;
- bytes live only behind the existing `File`/object-storage boundary;
- no extracted content field exists.

## `ConstructionProjectBrainSnapshot`

Immutable proposed or confirmed representation of one exact intake version.

Fields:

- tenant/project/intake identity;
- `stateVersion` represented;
- `status`: `PROPOSED` or `CONFIRMED`;
- strict canonical `snapshot` JSON;
- `canonicalHash`;
- actor and creation time.

Rules:

- unique `(intakeId, stateVersion, status)`;
- confirmed rows are append-only and never updated or deleted by product code;
- JSON contains only project identity, owner assertions, source inventory, provenance labels and limitations; never raw bytes or invented extraction.

## `ConstructionProjectBrainDecision`

Immutable body-bound transition receipt.

Fields:

- tenant/project/intake identity;
- `commandId`, `commandHash`;
- `decision`: `CREATE`, `ADD_OWNER_BRIEF`, `ADMIT_SOURCE`, `SUBMIT_FOR_REVIEW`, `CONFIRM_EXACT` or `REJECT`;
- `priorStateVersion`, `nextStateVersion`;
- optional snapshot hash;
- strict result JSON;
- actor and creation time.

Rules:

- unique `(workspaceId, commandId)` and `(intakeId, nextStateVersion)`;
- written in the same serialized transaction as its state transition and snapshot when applicable;
- exact command replay returns the retained result; same ID with different body refuses.

## State Transitions

```text
CREATE -> DRAFT v1
DRAFT + OWNER_BRIEF -> DRAFT vN
DRAFT + SOURCE -> DRAFT vN
DRAFT + SUBMIT -> READY_FOR_REVIEW vN + PROPOSED snapshot
READY_FOR_REVIEW + CONFIRM_EXACT -> CONFIRMED vN + CONFIRMED snapshot
READY_FOR_REVIEW + REJECT -> REJECTED vN
```

Source additions after `READY_FOR_REVIEW` are refused. Changes require a new intake version rather than mutating a reviewed or confirmed packet.

## Canonical Snapshot Shape

```json
{
  "schemaVersion": 1,
  "project": { "id": "...", "code": "...", "name": "..." },
  "ownerBrief": {
    "provenance": "OWNER_CONFIRMED",
    "summary": "...",
    "scope": "...",
    "importantPeople": "...",
    "importantDates": "...",
    "blockers": "...",
    "nextDecision": "..."
  },
  "sources": [
    {
      "sourceId": "...",
      "kind": "DOCUMENT",
      "displayName": "...",
      "contentHash": "...",
      "transcriptionState": "NOT_REQUESTED_LOCAL_ONLY",
      "documentUnderstandingState": "NOT_REQUESTED_LOCAL_ONLY"
    }
  ],
  "limitations": ["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED"]
}
```
