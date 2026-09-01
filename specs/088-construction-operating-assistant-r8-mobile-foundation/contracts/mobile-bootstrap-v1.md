# Mobile Bootstrap API v1

## Request

`GET /api/endvera/v1/mobile/bootstrap`

- Requires an authenticated `CLIENT` session.
- Accepts no query parameters or body.
- Returns `Cache-Control: private, no-store`.

## Success (`200`)

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-01T00:00:00.000Z",
  "user": {
    "id": "user-id",
    "name": "Olivier",
    "email": "synthetic@example.invalid"
  },
  "workspaces": [
    {
      "id": "workspace-id",
      "name": "ENDVERA Construction",
      "defaultTimezone": "America/Toronto",
      "defaultLocale": "fr-CA",
      "role": "OWNER",
      "permissions": {
        "financialsVisible": true,
        "canManageReceivables": true,
        "canScheduleFollowUps": true,
        "canApprovePreparedActions": true,
        "externalTransportAuthorized": false
      }
    }
  ]
}
```

## Refusals

- `401`: no valid session
- `404`: authenticated role is not a client
- `429`: rate limit reached

The endpoint returns no membership rows outside the authenticated user and no inactive workspace.

## Existing Operational API

Cockpit and command traffic continues through:

- `GET /api/endvera/v1/construction/operations?workspaceId=...`
- `POST /api/endvera/v1/construction/operations`

R7 schema version remains `1`. R8 does not add a command or external effect.
