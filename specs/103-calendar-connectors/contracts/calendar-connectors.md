# Calendar Connector Contract

## Providers

- `google_calendar`
- `microsoft_calendar`

## Modes

- `READ_ONLY`
- `READ_WRITE`

## Commands

- `PREPARE_CONNECTION`: exact provider, workspace, mode, command identity and
  expected state version;
- `PREPARE_SYNC`: exact provider/account state and optional opaque cursor
  presence only;
- `PREPARE_WRITE`: exact provider, canonical calendar item, item fingerprint,
  intended create/update behavior and expected remote precondition;
- `REVOKE_LOCAL`: exact provider/account state and command identity.

Every command is strict, workspace-bound, idempotent and unknown-field
rejecting.

## Public status

Status exposes provider label, local connection state, requested/granted
capabilities, read/write availability, state version, revocation state,
missing activation prerequisites and next action. It never exposes credential,
cursor, external account or external event values.

## Prepared provider envelope

The provider envelope exposes method, path template, non-secret query, safe
headers, canonical body, required capability, canonical fingerprint,
precondition kind and `externalTransportPerformed=false`. It cannot be executed
by R23.

## Dispositions

- `APPLY_PAGE`
- `FULL_RESYNC_REQUIRED`
- `REAUTHORIZATION_REQUIRED`
- `CONFLICT_REQUIRES_REVIEW`
- `RETRY_LATER`
- `REFUSED`

These states are decisions for later authorized orchestration, not evidence of
a provider call in R23.
