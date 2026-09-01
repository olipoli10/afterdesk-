# Plan

1. Add additive PostgreSQL connector accounts, grants, and immutable operation evidence.
2. Implement a Google Calendar adapter that only builds validated requests and fails closed on execution.
3. Implement owner/admin preparation, status, and local-revocation services with audit and idempotency.
4. Expose authenticated status/prepare/revoke API routes for future mobile clients.
5. Validate pure contracts, disposable PostgreSQL behavior, migration safety, lint, typecheck, and build.
