# Data Model: Context-Rich Intent Routing Gate

No schema change.

## Routing audit event

- entity type: `assistant_routing_decision`
- entity ID: R18 source ID
- action: `assistant_routing_decision_recorded`
- reason: routing disposition
- metadata: provider-neutral client routing projection, source kind and envelope ID
- fingerprint: canonical workspace/source routing key

The event is inserted once with no update-on-replay behavior.
