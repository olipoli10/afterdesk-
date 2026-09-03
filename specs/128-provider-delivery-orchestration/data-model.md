# Data Model: Provider Delivery Orchestration R37F

One forward-only additive migration extends `ControlledProviderRun` with:

- `canonicalEvidenceSnapshot Json?`
- `canonicalEvidenceFingerprint String?`

Both fields are nullable for historical R37C rows. A check constraint requires
both or neither. Existing run, spend-attempt, grant, audit and idempotency
records remain authoritative.
