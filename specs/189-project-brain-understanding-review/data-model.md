# Data Model: Project Brain Understanding Review

## `ConstructionProjectBrainUnderstandingReview`

Versioned aggregate bound to one exact R36W candidate batch.

Fields:

- `id`, `workspaceId`, `projectId`, `intakeId`;
- `confirmedIntakeSnapshotId`, `candidateBatchId`, `candidateSetHash`;
- `reviewSequence`, `status`: `DRAFT`, `READY_FOR_CONFIRMATION` or `CONFIRMED`;
- `confirmedUnderstandingSequence`: null until exact confirmation, then a positive monotonic project-scoped sequence;
- `stateVersion` beginning at 1;
- `reviewFingerprint`: null until preparation;
- `createCommandId`, `createCommandHash`, creator and timestamps.

Rules:

- reciprocal foreign keys bind every upstream identity to the same tenant/project/intake;
- one review per exact candidate batch/version;
- every accepted decision increments `stateVersion` exactly once;
- unique `(projectId, confirmedUnderstandingSequence)` when non-null; allocation occurs under the project confirmation lock;
- `CONFIRMED` is terminal and immutable.

## `ConstructionProjectBrainCandidateDisposition`

Append-only explicit decision for one R36W candidate.

Fields:

- review/candidate reciprocal identity;
- `disposition`: `ACCEPT_AS_REVIEWED`, `REJECT_AS_UNSUPPORTED` or `RETAIN_FOR_CONTRADICTION`;
- `priorStateVersion`, `nextStateVersion`;
- command/body hash, actor and timestamp.

Rules:

- candidate must belong to the review's exact batch;
- latest decision by state version is current; prior decisions remain immutable;
- no disposition changes candidate value, status, confidence or provenance.

## `ConstructionProjectBrainContradiction`

Immutable contradiction group declared by an authorized reviewer.

Fields:

- review/tenant/project identity;
- stable group sequence;
- command/body hash, actor and timestamp.

## `ConstructionProjectBrainContradictionMember`

Immutable ordered join from a contradiction to a review-bound candidate.

Rules:

- at least two distinct members must exist at transaction commit;
- every member belongs to the exact review candidate batch;
- members cannot be updated, removed or truncated.

## `ConstructionProjectBrainContradictionResolution`

Append-only resolution of one preserved contradiction.

Fields:

- contradiction/review reciprocal identity;
- `mode`: `SELECT_SUPPORTED_CANDIDATES`, `REJECT_ALL_UNSUPPORTED` or `OWNER_RESOLUTION`;
- selected member identities for selection mode;
- bounded verbatim `ownerResolutionText` only for owner-text mode;
- `provenance`: `OWNER_DECISION` or `OWNER_RESOLUTION`;
- prior/next state versions, command/body hash, actor and timestamp.

Rules:

- exactly one mode payload is populated;
- selected candidates must be members of the contradiction;
- latest resolution is current, but every earlier resolution remains retained;
- resolution never changes/deletes the contradiction or member rows.

### Canonical preparation coherence

- `SELECT_SUPPORTED_CANDIDATES`: selected members derive `ACCEPT_AS_REVIEWED`; unselected members derive `REJECT_AS_UNSUPPORTED`.
- `REJECT_ALL_UNSUPPORTED`: every member derives `REJECT_AS_UNSUPPORTED`.
- `OWNER_RESOLUTION`: every member derives `REJECT_AS_UNSUPPORTED`; only the verbatim resolution becomes accepted `OWNER_RESOLUTION` content.
- `RETAIN_FOR_CONTRADICTION` is not a valid prepared disposition.
- for a candidate in multiple groups, all group-derived outcomes and its current explicit disposition must match; disagreement returns `CONFLICTING_RESOLUTIONS` and creates no proposed snapshot.

## `ConstructionProjectBrainUnderstandingSnapshot`

Immutable exact representation of a prepared or confirmed review version.

Fields:

- reciprocal review/upstream identities and represented state version;
- `status`: `PROPOSED` or `CONFIRMED`;
- strict canonical `snapshot` JSON;
- `canonicalHash`, actor and timestamp.

Rules:

- unique `(reviewId, stateVersion, status)`;
- proposed snapshot is created during preparation; confirmed snapshot is created atomically with exact confirmation;
- relational guard reconstructs complete current candidate/disposition/contradiction/resolution/source state and validates canonical JSON/hash;
- relational guard enforces the canonical preparation coherence matrix and unique confirmation sequence;
- confirmed rows cannot be updated, deleted or truncated.

## `ConstructionProjectBrainUnderstandingDecision`

Body-bound append-only receipt for `CREATE_REVIEW`, `DISPOSITION_CANDIDATE`, `DECLARE_CONTRADICTION`, `RESOLVE_CONTRADICTION`, `PREPARE_UNDERSTANDING` and `CONFIRM_EXACT_UNDERSTANDING`.

Rules:

- unique `(workspaceId, commandId)` and `(reviewId, nextStateVersion)`;
- exact replay returns the retained result; same command ID/different body conflicts;
- transition, domain rows, snapshot and decision commit atomically.

## Canonical snapshot shape

```json
{
  "schemaVersion": 1,
  "project": { "id": "...", "code": "...", "name": "..." },
  "inputs": {
    "intakeId": "...",
    "confirmedIntakeSnapshotHash": "...",
    "candidateBatchId": "...",
    "candidateSetHash": "..."
  },
  "sources": [],
  "candidates": [
    {
      "candidateId": "...",
      "value": "...",
      "status": "CANDIDATE_UNCONFIRMED",
      "provenance": {},
      "disposition": "ACCEPT_AS_REVIEWED"
    }
  ],
  "contradictions": [
    {
      "contradictionId": "...",
      "memberCandidateIds": ["...", "..."],
      "resolution": {
        "mode": "SELECT_SUPPORTED_CANDIDATES",
        "selectedCandidateIds": ["..."]
      }
    }
  ],
  "limitations": [
    "VOICE_NOT_TRANSCRIBED",
    "DOCUMENT_CONTENT_NOT_INTERPRETED",
    "CANDIDATES_REQUIRE_EXPLICIT_REVIEW"
  ]
}
```

Candidate source status remains historically `CANDIDATE_UNCONFIRMED`; acceptance is represented only by the review disposition and confirmed understanding snapshot.

The current confirmed understanding for a project is the first row under `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`. A timestamp is never used as the deciding key.

## State transitions

```text
CREATE -> DRAFT v1
DRAFT + DISPOSITION -> DRAFT vN
DRAFT + DECLARE_CONTRADICTION -> DRAFT vN
DRAFT + RESOLVE_CONTRADICTION -> DRAFT vN
complete DRAFT + PREPARE -> READY_FOR_CONFIRMATION vN + PROPOSED snapshot
READY_FOR_CONFIRMATION + exact review change -> DRAFT vN (new appended decision)
READY_FOR_CONFIRMATION + CONFIRM_EXACT -> CONFIRMED vN + CONFIRMED snapshot
```

No transition performs provider work, binary interpretation, automatic resolution, external transport/write or assistant-memory activation.
