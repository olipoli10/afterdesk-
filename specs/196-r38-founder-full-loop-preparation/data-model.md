# Data model

- **FounderAccessToken**: digest, expiry, consumed timestamp; loopback-only and one-time.
- **FounderSession**: synthetic user, current stage, start time, one-time seal state.
- **CanonicalOpenLoop**: one Laval extra with work, claims, evidence, contradictions, owner resolution and readiness status.
- **PreparedFollowUp**: Marc, simulated SMS, exact body, `PREPARED_UNSENT`, transportAuthorized false.
- **TechnicalMeasurements**: association, canonical count, duplicate/replay effects, before/after reload digest, missing proofs, contradiction retention, readiness, next owner, transport, tenant leak, financial leak and invented fact count.
- **FounderObservation**: immutable human answers plus technical measurement digest and allowed verdict.
