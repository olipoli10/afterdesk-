# Data Model: R9 Mobile Assistant

R9 adds no database table or migration.

## MobileAssistantRequest

- `schemaVersion`: literal `1`
- `requestId`: UUID; stable across exact retry
- `workspaceId`: active authorized workspace
- `message`: trimmed natural-language request, 1–10,000 characters
- `occurredAt`: ISO timestamp retained across exact retry

## MobileAssistantResult

The existing operating result: command/message identifiers, intent, status, reply, optional canonical effect, replay flag and literal `externalTransportPerformed:false`.

## MobileAssistantHistory

- schema version, generation time and workspace
- ordered inbound/outbound portal messages scoped to the authenticated user
- each message has identifier, direction, body, status and creation time
- literal `externalTransportPerformed:false`

## MobileAssistantAttempt

In-memory client state: exact request plus `READY`, `SENDING`, `CONFIRMED`, `REPLAYED`, `OUTCOME_UNKNOWN` or `REFUSED`. It is not canonical business state.
