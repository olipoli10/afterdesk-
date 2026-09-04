# Contract: Project Brain Assistant Memory R36Y

All schemas are strict and use `schemaVersion: 1`. Results always include:

```json
{
  "providerExecutionPerformed": false,
  "binaryUnderstandingPerformed": false,
  "externalTransportPerformed": false,
  "externalWritePerformed": false,
  "approvalPerformed": false,
  "automaticResolutionPerformed": false
}
```

## Unified assistant route

`POST /api/endvera/v1/mobile/assistant`

R36Y extends the existing authenticated no-store assistant route with two strict Project Brain command families. Mobile project context supplies navigation; the server resolves the current confirmed memory. Users never copy memory/candidate/source IDs.

## Recall confirmed memory

```json
{
  "schemaVersion": 1,
  "action": "RECALL_CONFIRMED_PROJECT_MEMORY",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "expectedConfirmedUnderstandingSequence": 7,
  "expectedMemoryCanonicalHash": "64-lowercase-hex",
  "questionKind": "NEXT_DECISION"
}
```

Supported `questionKind` values are the eight values in `data-model.md`. The answer contains fixed labels, exact confirmed values, limitations and ordered citations. If no valid confirmed memory exists, the route refuses/clarifies without falling back to R36W candidates or chat history.

## Prepare narrow project action

```json
{
  "schemaVersion": 1,
  "action": "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "expectedConfirmedUnderstandingSequence": 7,
  "expectedMemoryCanonicalHash": "64-lowercase-hex",
  "family": "SMS_MMS",
  "recipientContactRef": "visible-project-contact-ref",
  "channel": "SMS",
  "body": "Exact user-authored text",
  "citationSelections": [
    { "kind": "NEXT_DECISION" }
  ]
}
```

Family-specific strict fields apply: email requires subject/body; voice call requires a disclosure-safe script; evidence request requires the existing evidence-request payload. The server resolves the visible contact reference within the same project and validates every selected citation against current confirmed memory.

Success delegates to the existing family service and returns:

- `status: PREPARED_UNSENT`;
- visible recipient/contact and channel;
- complete frozen body/script/subject;
- family entity ID, version and payload fingerprint;
- complete memory citations;
- required approval role and `approvalRequired: true`;
- `approvalPerformed: false`, `externalTransportPerformed: false`.

R36Y never invokes the separate family approval command.

## Read/recovery projection

`GET /api/endvera/v1/mobile/assistant/project-memory?workspaceId=<id>&projectId=<id>`

Returns supported question availability, the exact current `confirmedUnderstandingSequence`, confirmed snapshot identity/hash, truthful binary/provider limitations and locally retained recall/prepared-action history for the authorized role. It returns no draft/unconfirmed content and uses a non-enumerating response across unauthorized/nonexistent contexts.

## Error semantics

- `400`: malformed JSON, unknown field/question/family or invalid strict family payload; no domain mutation/audit.
- `401`: unauthenticated; no target audit.
- `404`: inactive/unauthorized/cross-workspace/project/nonexistent memory/contact/action; no protected detail.
- `409`: stale current sequence or memory hash, command-body conflict, prepared-family version race.
- `422`: ambiguous recipient, unavailable citation, unresolved/binary-dependent claim or corrupt provenance/hash chain; no partial answer/action.
- `429`: existing authenticated assistant rate limit.

## Explicitly unavailable

Open-ended semantic synthesis, binary interpretation, OCR, transcription, vision, document parsing, provider calls, contact discovery, new capability families, approval, delivery, scheduling, external transport/write and automatic resolution remain unavailable.
