# ENDVERA Construction Operating Assistant R3 — Calendar connector authority

## Outcome

Create the provider-neutral account, grant, revocation, idempotency, audit, and Google Calendar request-preparation foundation required by the mobile assistant. R3 does not connect a real Google account and never performs external transport.

## Required behavior

- Connector authority is scoped to one Construction workspace.
- Only an active owner or admin can prepare or revoke a connector.
- Read and write permissions are distinct; the smallest required Google scope is requested.
- A prepared connection is not represented as connected.
- OAuth credentials and sync tokens are not stored in PostgreSQL; only future secret-store references may be stored.
- Local revocation is immediate, clears all secret references and active scopes, and is idempotent.
- Google Calendar insert and patch requests are deterministic, permission-gated, notification-suppressed, and never executed by R3.
- A Google `410 Gone` incremental-sync response becomes `FULL_RESYNC_REQUIRED`; it is not silently retried with stale state.
- Every connector operation records `externalTransportPerformed=false`.
- Cross-workspace reads and writes fail closed.

## Explicit non-goals

- Live OAuth, Google credentials, refresh tokens, provider traffic, customer data, deployment, push, iOS, Android, SMS, voice, email, or production activation.
