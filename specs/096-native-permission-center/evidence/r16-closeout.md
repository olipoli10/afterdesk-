# R16 Closeout — Native Permission and Connector Readiness Center

## Result

R16 adds one strict web/mobile permission center derived from canonical
PostgreSQL membership, connector-account and connector-grant state. Owners and
office managers see their effective internal capabilities, active team roles,
prepared connector readiness and local revocation controls. Field workers see
only their own active membership and non-financial internal capabilities.

Account and grant revocation require exact state versions, run in serializable
transactions under an advisory lock, preserve one result across concurrent
replay and append a canonical audit event. Account revocation also clears all
stored scope and opaque secret-reference columns and revokes every remaining
grant. The response and both interfaces expose no credential reference,
external-account hash or sync cursor.

## Observed gates

- R16 contract tests: 3/3 passed;
- mobile permission parser tests: 3/3 passed;
- full mobile suite: 29/29 passed;
- targeted R3/R4/R16 unit gates: 13/13 passed;
- disposable PostgreSQL R3/R4/R16 integrations: 13/13 passed on 45 migrations;
- concurrent grant revocation converged to one operation and one canonical
  state transition;
- stale state, same-command drift, field management, outsider and
  cross-workspace requests were refused;
- root and mobile lint and typecheck: passed;
- Expo Doctor: 21/21 passed;
- local Expo export: iOS, Android and Web passed with an inert HTTPS API URL;
- local Next.js 16.2.12 Webpack build: passed, including
  `/client/permissions` and `/api/endvera/v1/mobile/permissions`;
- `git diff --check`: passed.

## Authority and limits

- no schema, migration, dependency or lockfile change;
- no real secret, provider, OAuth, customer data, external transport,
  external write, push, Preview, Production, deployment, EAS or store action;
- connector states remain local or prepared-disabled; this is build proof, not
  provider readiness, customer value or Verified-E2E coverage.
