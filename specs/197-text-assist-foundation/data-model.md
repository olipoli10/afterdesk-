# Data model — TextAssist foundation

No Prisma migration is introduced in this slice. The model below is a versioned contract over existing canonical identities, messages, connector accounts, grants, actions and audit records.

## TextAssistSetupManifest

- `schemaVersion`
- `productMode`: `ASSISTANT_FIRST`
- `entryChannels[]`: app chat and dedicated SMS number; each has readiness and transport state
- `protectedResources[]`: permission key, purpose, request timing, state and revocation route
- `modelGateway`: provider-neutral state, secret location, budget enforcement and data-policy requirement
- `routeLanes[]`: lane, allowed inputs, provider requirement and output kinds
- `actionBoundary`: preview, approval, idempotency, verification and audit requirements

## InboundRequestEnvelope

- stable request and provider-message identifiers
- channel and normalized sender
- verified user/workspace binding
- exact original content and attachment references
- occurrence time and locale
- idempotency fingerprint

## RouteDecision

- request identifier
- one lane: canonical operations, external research, document analysis, general reasoning or human escalation
- data classification and required connector scopes
- provider readiness and reason code
- one outcome: answer, clarification, prepared action, refusal or human handoff
- `externalTransportPerformed=false` until an explicitly authorized adapter executes

## ActionProposal

- actor, workspace and canonical target
- exact versioned payload
- internal/external effect class
- policy evaluation and approval requirement
- idempotency key
- postcondition and verification state

## Invariants

- A model response cannot directly mutate canonical or external state.
- Duplicate provider-message identifiers create at most one canonical effect.
- A revoked or missing grant cannot be inferred from prior success.
- Private canonical context is disclosed only to lanes and providers permitted for its data classification.
- External writes remain prepared until policy and exact approval gates pass.
