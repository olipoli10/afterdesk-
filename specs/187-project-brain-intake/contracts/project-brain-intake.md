# Contract: Project Brain Intake R36V

All schemas are strict and use `schemaVersion: 1`. Every result includes `externalTransportPerformed: false` and `providerExecutionPerformed: false`.

## Read projection

`GET /api/endvera/v1/mobile/project-brain-intake?workspaceId=<id>&projectId=<id>`

Returns the latest intake for that authorized workspace project, including current state/version, owner brief, admitted source inventory, proposed/confirmed snapshot, decisions and explicit limitations. Returns a non-enumerating not-found response for unauthorized or mismatched resources.

## Create packet

```json
{
  "schemaVersion": 1,
  "action": "CREATE_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id"
}
```

Creates `DRAFT` version 1 or returns the exact existing effect on replay.

## Add or replace owner brief while draft

```json
{
  "schemaVersion": 1,
  "action": "ADD_OWNER_BRIEF",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 1,
  "brief": {
    "summary": "Owner supplied summary",
    "scope": "Owner supplied scope",
    "importantPeople": "Owner supplied people",
    "importantDates": "Owner supplied dates",
    "blockers": "Owner supplied blockers",
    "nextDecision": "Owner supplied next decision"
  }
}
```

At least `summary` is non-empty. Each field is whitespace-normalized, bounded, retained as owner-provided text and never parsed as model output.

## Admit source

`POST /api/endvera/v1/mobile/project-brain-intake/sources` using multipart form data:

- `command`: strict JSON with action `ADMIT_PROJECT_BRAIN_SOURCE`, command/workspace/project/intake IDs, expected state version, kind, name, MIME, declared bytes and optional bounded duration;
- `file`: exactly one binary part.

Allowed types: JPEG, PNG, PDF, DOCX and M4A-compatible audio. Maximum declared and actual size: 10 MiB. Server validates byte signature and scan evidence before admission. Exact replay returns the prior source; a body mismatch refuses.

## Submit for review

```json
{
  "schemaVersion": 1,
  "action": "SUBMIT_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 6
}
```

Requires a complete owner brief and at least one admitted source. Produces `READY_FOR_REVIEW`, a proposed snapshot and `reviewFingerprint`. No source may be added after this transition.

## Confirm exact understanding

```json
{
  "schemaVersion": 1,
  "action": "CONFIRM_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 7,
  "reviewFingerprint": "64-lowercase-hex"
}
```

Requires exact current version/fingerprint and OWNER or OFFICE_MANAGER authority. Atomically creates the confirmed snapshot and decision receipt, then transitions the intake to `CONFIRMED`.

## Reject review

Same identity/version contract with action `REJECT_PROJECT_BRAIN_INTAKE`. Transitions only `READY_FOR_REVIEW` to `REJECTED`; it does not delete sources, snapshots or history.

## Error semantics

- `400`: malformed or unknown field/action/media declaration.
- `404`: unauthorized, inactive, cross-workspace, cross-project or nonexistent resource; no protected detail.
- `409`: stale version, changed fingerprint, command-body conflict, invalid state or exact replay conflict.
- `413`: source exceeds the bounded size.
- `429`: route rate limit.
- `503`: local storage/scanner unavailable; no admission is recorded.

## Assistant query boundary

Only the latest `CONFIRMED` snapshot may answer:

- project summary;
- blockers;
- next decision;
- admitted source inventory.

Any question that requires interpreting a binary source returns the truthful limitation. Draft/proposed snapshots, filenames and source metadata never become job facts.

