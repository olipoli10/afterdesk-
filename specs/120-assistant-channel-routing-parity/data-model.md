# Data Model: Assistant Channel Routing Parity

No schema change is required.

## TrustedAdmittedSource

- `senderAddress`: admitted opaque identity reference
- `provider`: admitted provider-neutral connector identifier
- `providerMessageId`: deterministic admitted event reference

The object is created server-side after R4 admission. It is required for SMS, email and voice transcript, and forbidden for mobile/portal client authority.

## Existing persistence

- Internal work: existing R2 `ConstructionMessage`, `ConstructionInterpretation` and canonical effect rows.
- Deferred work: existing R36C inbound/outbound messages plus immutable interpretation snapshot.
- Replays: workspace/request key plus exact accepted-source fingerprint.

No raw phone number, audio bytes, credentials or external result is persisted.
