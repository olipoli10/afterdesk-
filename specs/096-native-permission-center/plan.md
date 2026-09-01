# R16 Plan — Native Permission and Connector Readiness Center

## Objective

Give owners one plain-language web/mobile view of what ENDVERA can currently
read, prepare and change, who holds each role, which connector capabilities are
disabled or granted, and how to revoke a local grant without exposing secrets
or activating a provider.

## Allowed implementation

- project existing workspace roles, internal permissions, connector accounts
  and connector grants from canonical PostgreSQL state;
- distinguish `INTERNAL`, `PREPARED_DISABLED`, `GRANTED_LOCAL` and `REVOKED`
  capabilities with strict role-specific contracts;
- add idempotent local revocation for connector grants/accounts while external
  transport remains false;
- add native and web-compatible permission-center surfaces;
- add unit and disposable-PostgreSQL proof.

## Completion gate

- owner/office sees exact capabilities, scope state and revocation controls;
- field workers see only their own effective non-financial capabilities;
- revocation is atomic, idempotent and immediately reflected after refresh;
- no token, credential reference, external account hash or private grant detail
  leaves the server;
- no provider, OAuth, customer data, external transport or external write;
- no schema, migration, dependency or lockfile change.
