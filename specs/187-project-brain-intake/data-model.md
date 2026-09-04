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
- restrictive `fileId` relation to the canonical secure `File` plus immutable `contentHash`;
- bounded display metadata: `displayName`, `mimeType`, `sizeBytes`, optional `durationMs`;
- `ordinal` allocated under the intake lock;
- `transcriptionState`: `NOT_REQUESTED_LOCAL_ONLY`;
- `documentUnderstandingState`: `NOT_REQUESTED_LOCAL_ONLY`;
- actor and creation time.

Rules:

- unique `(workspaceId, commandId)` and `(intakeId, ordinal)`; `fileId` is indexed but intentionally may be shared by multiple source/provenance rows in the same intake;
- append-only in R36V;
- the `File` relationship uses `ON DELETE RESTRICT`/`ON UPDATE RESTRICT`, and generic orphan cleanup excludes every `File` with a project-brain source;
- two distinct owner selections with identical bytes create two sources at different ordinals and two body-bound `ADMIT_SOURCE` decisions, but reuse one canonical `File` row and one local object;
- exact replay of either selection returns its original source decision and creates no additional source, `File`, object or audit effect;
- bytes live only behind the local `File`/object-storage boundary and are retrieved only after workspace/project authorization plus actual size/hash/MIME verification;
- each successful retrieval appends a `FileAccessLog` action of `download` for the authorized actor;
- stale `.tmp`, object and unreferenced `File` remnants may be reconciled only after 24 hours; a referenced object is never eligible;
- no extracted content field exists.

## Canonical `File` and local object

The existing `File` row remains the durable binary identity. R36V stores one content-addressed canonical object for one admitted byte sequence and permits multiple `ConstructionProjectBrainSource` provenance rows to reference it.

Rules:

- canonical reuse is scoped to the authorized workspace/project intake boundary; it never exposes or links a different tenant's bytes;
- `sha256`, `sizeBytes`, detected MIME and local-signature scan details must agree before reuse or retrieval;
- `projectBrainSources` is a restrictive reverse relation, so deletion cannot orphan confirmed provenance;
- the generic file sweep includes `projectBrainSources: { none: {} }` and therefore cannot reap a referenced canonical file;
- the 24-hour crash reconciler deletes only stale local objects with no project-brain source and stale staging files; it does not shorten project-evidence retention.

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
- independently selected identical bytes still have distinct command bodies/identities and therefore distinct `ADMIT_SOURCE` decisions even when their `File` reference is shared.

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

## Audit and refusal records

Accepted transitions record redacted command/state provenance. Exact retries converge on one durable replay-audit effect. A domain refusal may create one redacted audit only after the command has parsed and the actor is re-authorized for the referenced workspace/project.

Malformed envelopes, unauthenticated actors, unauthorized roles, cross-workspace references and nonexistent resources create no target audit. Audit failure never replaces or weakens the original fail-closed result.

## Client-only durable intent state

The mobile encrypted queue is global across project contexts even though the visible projection is scoped to the open project. A selected source is copied into durable application storage before its intent is committed. Startup/remount reconciliation compares the complete global queue with the durable file inventory, preserves every globally retained source and reports a missing source only when that source's project is opened.

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
