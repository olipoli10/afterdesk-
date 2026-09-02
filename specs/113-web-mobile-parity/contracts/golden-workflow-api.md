# R33 Golden Workflow API Contract

Private endpoint: `/api/endvera/v1/mobile/golden-workflow`

## GET

Returns the strict role projection for the current active workspace. Optional
query `workspaceId` selects one workspace already present in the authenticated
user bootstrap. The server derives actor and role, reloads membership and reads
canonical R13-R32 state in one bounded operation.

Headers: authenticated, rate-limited, `Cache-Control: private, no-store`.

The response carries codes, not localized sentences:

- registry/schema version;
- workspace, role, locale, timezone and currency;
- canonical state fingerprint;
- ordered step statuses and progress count;
- exact blockers;
- one primary and bounded secondary actions with stable internal route IDs;
- `providerObserved: false`, `externalEffectCount: 0`.

Field-worker response is an independent schema. Unknown step, blocker, action,
route, locale, role or leaked field invalidates the response.

R33 adds no command endpoint. Selected actions deep-link to existing private,
role-checked command surfaces and retain their existing exact idempotency,
approval and outbox behavior.
