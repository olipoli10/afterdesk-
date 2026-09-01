# Data Model: R8 Mobile Foundation

R8 adds no database table or migration. These are boundary/view models only.

## MobileBootstrap

- `schemaVersion`: supported mobile API version (`1`)
- `generatedAt`: server timestamp
- `user`: authenticated identity summary (`id`, `name`, `email`)
- `workspaces`: ordered active membership projections

## MobileWorkspaceSummary

- `id`, `name`, `defaultTimezone`, `defaultLocale`
- `role`: `OWNER | OFFICE_MANAGER | FIELD_WORKER`, derived from membership
- `permissions`: financial and command booleans derived by server
- No financial records, messages, or credentials

## MobileCockpit

Existing R7 schema-versioned projection containing workspace, permissions, projects, calendar, open loops, actions, and receivables. The field-worker variant omits prohibited fields structurally.

## MobileCommandAttempt

- `requestId`: stable identifier for one attempt
- `idempotencyKey` or `eventId`: stable effect identity
- `type`: one accepted R7 command
- `state`: `READY | SENDING | CONFIRMED | REPLAYED | CONFLICT | OUTCOME_UNKNOWN | REFUSED`
- `publicError`: bounded non-secret category

## State Transitions

`READY -> SENDING -> CONFIRMED | REPLAYED | CONFLICT | REFUSED | OUTCOME_UNKNOWN`

`OUTCOME_UNKNOWN -> SENDING` reuses the exact same request and idempotency material.

The client never transitions canonical project, financial, or action state itself; only a subsequent validated cockpit response can do that.
