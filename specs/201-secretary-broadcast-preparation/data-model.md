# Data Model: Secretary broadcast preparation

## ConstructionSecretaryBroadcastDraft

- `id`, `workspaceId`, `requestId`, `requestHash`, `sourceMessageId`
- `status`: initially `PREPARED_UNSENT`
- `version`: initially 1
- `channel`: always `SMS`
- `body`: exact bounded message
- `recipientSnapshot`: ordered private array of contact id, display name and normalized phone
- `payloadHash`: canonical SHA-256 over all consequential fields
- `preparedByUserId`, `preparedAt`, `externalTransportPerformed=false`

Unique workspace/request and source-message bindings provide durable replay control. Approval fields are not added in this release because approval is a distinct transition and evidence gate.

## Projection

- Owner/admin: id, state, version, fingerprint, exact body, ordered display names and masked destinations.
- Field worker: count and state only; no identities, destinations or body.
