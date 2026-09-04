# Contract: Project Brain Understanding Review R36X

All command schemas are strict, `schemaVersion: 1`, body-bound and require `expectedStateVersion` after creation. Every result includes six false flags: provider execution, binary understanding, external transport, external write, automatic resolution and automatic confirmation.

## Route

`GET|POST /api/endvera/v1/mobile/project-brain-understanding-review`

GET resolves the current review from authorized project navigation and returns the complete no-store projection. Unauthorized or mismatched resources return one non-enumerating not-found shape.

POST accepts one of the commands below. No command accepts candidate values, source metadata, canonical JSON or hashes other than the exact expected fingerprint used for confirmation.

## Create review

```json
{
  "schemaVersion": 1,
  "action": "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id"
}
```

The server selects the eligible exact current R36W batch for the project and returns its stable review. No technical intake/batch ID copying is required.

## Disposition candidate

```json
{
  "schemaVersion": 1,
  "action": "DISPOSITION_PROJECT_BRAIN_CANDIDATE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "reviewId": "review-id",
  "expectedStateVersion": 1,
  "candidateId": "candidate-id",
  "disposition": "ACCEPT_AS_REVIEWED"
}
```

The candidate must belong to the review's exact batch. The decision appends; it never changes the R36W candidate.

## Declare contradiction

```json
{
  "schemaVersion": 1,
  "action": "DECLARE_PROJECT_BRAIN_CONTRADICTION",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "reviewId": "review-id",
  "expectedStateVersion": 2,
  "candidateIds": ["candidate-a", "candidate-b"]
}
```

At least two distinct same-review candidates are required. Membership is immutable and remains visible after resolution.

## Resolve contradiction

Selection mode:

```json
{
  "schemaVersion": 1,
  "action": "RESOLVE_PROJECT_BRAIN_CONTRADICTION",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "reviewId": "review-id",
  "expectedStateVersion": 3,
  "contradictionId": "contradiction-id",
  "resolution": {
    "mode": "SELECT_SUPPORTED_CANDIDATES",
    "selectedCandidateIds": ["candidate-a"]
  }
}
```

Other strict modes are `REJECT_ALL_UNSUPPORTED` with no payload and `OWNER_RESOLUTION` with bounded verbatim `ownerResolutionText`. No automatic/default mode exists.

At preparation, resolution and disposition must satisfy the canonical matrix: selection accepts only selected members; reject-all rejects all members; owner-resolution rejects all member candidates and accepts only the owner-authored resolution. `RETAIN_FOR_CONTRADICTION` cannot be prepared. If one candidate participates in multiple groups, every derived outcome must agree or `CONFLICTING_RESOLUTIONS` is returned.

## Prepare exact understanding

```json
{
  "schemaVersion": 1,
  "action": "PREPARE_PROJECT_BRAIN_UNDERSTANDING",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "reviewId": "review-id",
  "expectedStateVersion": 4
}
```

Requires complete candidate disposition and contradiction resolution. Builds a server-derived canonical proposed snapshot and returns its exact `reviewFingerprint`.

## Confirm exact understanding

```json
{
  "schemaVersion": 1,
  "action": "CONFIRM_PROJECT_BRAIN_UNDERSTANDING",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "reviewId": "review-id",
  "expectedStateVersion": 5,
  "reviewFingerprint": "64-lowercase-hex"
}
```

Requires exact current version/fingerprint and active OWNER/OFFICE_MANAGER authority. Confirmation serializes on the project, allocates the next unique monotonic `confirmedUnderstandingSequence`, atomically writes one confirmed snapshot and decision, and makes the review terminal. Current selection uses `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`.

## Projection requirements

The projection contains human-readable project/source/candidate provenance, every current and historical disposition, every contradiction member and resolution, completeness counts, state/version, proposed/confirmed snapshot hashes and truthful limitations. It never marks an R36W candidate itself as confirmed.

## Error semantics

- `400`: malformed JSON, unknown field/action, invalid mode or invalid member cardinality; no domain mutation/audit.
- `401`: unauthenticated; no target audit.
- `404`: inactive, unauthorized, cross-workspace/project or nonexistent resource; no protected detail/audit.
- `409`: stale state, command-body conflict, changed fingerprint, invalid lifecycle or concurrent race.
- `422`: incomplete review, `CONFLICTING_RESOLUTIONS`, or corrupt relational/provenance/hash state; no partial trusted projection/snapshot.
- `429`: existing bounded authenticated route rate limit.

## Explicitly unavailable

R36X performs no contradiction detection, semantic ranking, OCR, transcription, vision, document parsing, binary read, model/provider execution, assistant recall, messaging, external transport/write or automatic resolution/confirmation.
