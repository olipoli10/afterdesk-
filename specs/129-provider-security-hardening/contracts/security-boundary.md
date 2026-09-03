# Provider Security Boundary Contract

- The exported sealed executor validates its own runtime input.
- A controlled run cannot exist before actor role and grant ownership are proven.
- Adapter callbacks receive an opaque exact run ID and lease token.
- Only the current lease may write canonical evidence.
- Stored evidence is canonical only when its content-derived fingerprint matches both persisted fingerprint copies.
- Failed and in-progress results expose `canonicalEvidence: null`.
- External transport remains false.
