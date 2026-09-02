# R24 data model

## Existing records reused

- `ConstructionConnectorAccount`, grant and operation: provider-neutral SMS
  authority and `PREPARED_UNSENT` operations.
- `ConstructionCommunicationIdentity`: workspace/contact-bound opaque identity.
- `ConstructionMessage`: immutable inbound/outbound source message.
- `ConstructionAction`: exact outbound body, version and approval fingerprint.
- `ConstructionOpenLoopEvidence`: selected and inspected MMS evidence.
- `ConstructionAuditEvent`: reconstructible authority and policy trail.

## Additive records

### ConstructionMessagingPermission

One workspace/contact/purpose policy record.

- purpose: `service` or `commercial`
- consentStatus: `unknown`, `granted`, `withdrawn`
- suppressionStatus: `allowed`, `suppressed`, `review_required`
- evidenceRef, sourceMessageId, actorUserId, effectiveAt, stateVersion

The row contains no phone number. STOP updates both purposes atomically. START
changes suppression to review-required and never grants consent.

### ConstructionMessageMediaReference

Immutable link between one admitted message and one selected evidence record.
It retains project, evidence identifier, kind and exact content hash. It contains
no remote URL, provider download token or file bytes.

### ConstructionMessageDeliveryEvent

Immutable lifecycle observation for one prepared connector operation. It retains
opaque provider-event hash, status rank, proof level, observed time and
fingerprint. The derived status is the highest accepted rank; duplicate and
regressive events cannot change it.

## Atomic boundaries

- Inbound admission: identity + project resolution + message + keyword policy +
  media references + audit.
- Policy command: authority + version check + permission row + audit.
- Outbound preparation: exact approval + contact policy + connector operation +
  audit.
- Delivery observation: trusted assertion + monotonic check + event + audit.

