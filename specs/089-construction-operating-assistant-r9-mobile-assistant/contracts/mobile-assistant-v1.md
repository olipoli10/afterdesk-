# Contract: Mobile Assistant V1

## POST `/api/endvera/v1/mobile/assistant`

Strict JSON body:

```json
{
  "schemaVersion": 1,
  "requestId": "00000000-0000-4000-8000-000000000001",
  "workspaceId": "workspace-id",
  "message": "Qu'est-ce que j'ai demain?",
  "occurredAt": "2026-09-01T13:00:00.000Z"
}
```

The server returns the existing strict Operating Command Result V1. `commandId` must equal `requestId`; `externalTransportPerformed` is always false.

## GET `/api/endvera/v1/mobile/assistant?workspaceId=...`

Returns strict history V1 ordered oldest to newest and scoped to the authenticated user's portal conversation. Unauthenticated, unverified, field-worker, revoked and cross-workspace access is refused.

## Retry

After an unknown outcome, the client sends byte-equivalent semantic fields with the same request ID and occurrence timestamp. A canonical existing command returns `replayed:true`.
