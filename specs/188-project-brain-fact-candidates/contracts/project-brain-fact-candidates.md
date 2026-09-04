# Contract: Project Brain Fact Candidates R36W

All schemas are strict and use `schemaVersion: 1`. Every success/refusal result states:

```json
{
  "providerExecutionPerformed": false,
  "binaryUnderstandingPerformed": false,
  "externalTransportPerformed": false,
  "externalWritePerformed": false,
  "automaticConfirmationPerformed": false
}
```

## Generate candidates

`POST /api/endvera/v1/mobile/project-brain-fact-candidates`

```json
{
  "schemaVersion": 1,
  "action": "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "confirmedSnapshotHash": "64-lowercase-hex",
  "adapterSetVersion": "PROJECT_BRAIN_FACT_CANDIDATES_V1"
}
```

The caller must be an authenticated verified CLIENT with an active OWNER or OFFICE_MANAGER membership for the referenced workspace/project. The server re-resolves the intake and exact confirmed snapshot inside the committing transaction. No candidate values, ranges or source metadata are accepted from the caller.

Success returns one immutable batch and its stable projection. Exact replay returns the original result. A command ID reused with any changed body returns conflict. A stale or non-confirmed snapshot creates no effect.

## Read candidate batch

`GET /api/endvera/v1/mobile/project-brain-fact-candidates?workspaceId=<id>&projectId=<id>&intakeId=<id>`

Returns the latest authorized batch for the exact intake or an empty projection. Unauthorized, inactive, cross-workspace, cross-project and nonexistent resources all use the same non-enumerating response.

Before returning a batch, the server verifies every owner-text range/value against the retained confirmed snapshot and every metadata value against the retained source row. Any mismatch returns a fail-closed corrupt-state result, not a partial candidate list.

## Candidate projection

Owner text:

```json
{
  "candidateId": "candidate-id",
  "kind": "OWNER_TEXT",
  "status": "CANDIDATE_UNCONFIRMED",
  "confidenceClass": "EXACT_OWNER_TEXT",
  "value": "Exact owner text",
  "provenance": {
    "confirmedSnapshotId": "snapshot-id",
    "confirmedSnapshotHash": "64-lowercase-hex",
    "ownerBriefField": "blockers",
    "rangeUnit": "UTF16_CODE_UNIT",
    "rangeStart": 0,
    "rangeEnd": 16
  }
}
```

Source metadata:

```json
{
  "candidateId": "candidate-id",
  "kind": "SOURCE_METADATA",
  "status": "CANDIDATE_UNCONFIRMED",
  "confidenceClass": "EXACT_CANONICAL_METADATA",
  "value": "application/pdf",
  "provenance": {
    "confirmedSnapshotId": "snapshot-id",
    "confirmedSnapshotHash": "64-lowercase-hex",
    "sourceId": "source-id",
    "sourceOrdinal": 1,
    "sourceContentHash": "64-lowercase-hex",
    "metadataField": "mimeType"
  }
}
```

Metadata candidates are explicitly labelled as metadata about a source. They do not assert document contents or job facts.

## Closed adapter registry

`PROJECT_BRAIN_FACT_CANDIDATES_V1` contains exactly:

- `OWNER_BRIEF_FIELDS_V1`: six allowlisted complete owner-text fields, exact UTF-16 ranges;
- `ADMITTED_SOURCE_METADATA_V1`: seven allowlisted canonical metadata fields, with absent optional duration omitted.

No runtime/plugin/provider adapter registration exists in R36W. Unknown versions or fields refuse.

## Error semantics

- `400`: malformed JSON, unknown field/action/adapter version or invalid strict value; no domain mutation/audit.
- `401`: unauthenticated; no target audit.
- `404`: inactive, unauthorized, cross-workspace, cross-project or nonexistent target; no protected detail or target audit.
- `409`: command-body conflict, stale snapshot hash, intake not confirmed or equivalent batch race.
- `422`: canonical confirmed input or retained candidate provenance is corrupt/inconsistent; no candidate is trusted or partially returned.
- `429`: existing bounded authenticated route rate limit.

## Explicitly unavailable

R36W has no endpoint or command for OCR, transcription, image understanding, document parsing, semantic entity extraction, contradiction resolution, candidate confirmation, assistant recall, messaging or external execution.
