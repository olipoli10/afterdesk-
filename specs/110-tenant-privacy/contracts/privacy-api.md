# Protected Tenant Privacy API

## Read

`GET /api/endvera/v1/mobile/privacy?workspaceId=<id>`

- authenticated verified client session;
- active membership rechecked server-side;
- private, no-store owner/office or field schema;
- never returns secret references or raw export content.

## Commands

`POST /api/endvera/v1/mobile/privacy`

Closed commands:

- `CREATE_POLICY_DRAFT`
- `ACTIVATE_POLICY`
- `PREPARE_EXPORT_MANIFEST`
- `REQUEST_DELETION`
- `APPROVE_DELETION`
- `REVOKE_DELETION`

Each command includes stable command/idempotency identity, exact workspace,
expected version where required and closed payload. Unknown fields fail closed.

## Invariants

- no request-provided role or arbitrary table name;
- no cross-workspace target;
- no raw secret, storage key or hidden economics;
- no wildcard/broad deletion;
- no provider/storage external deletion;
- exact replay returns one result and altered reuse refuses.
