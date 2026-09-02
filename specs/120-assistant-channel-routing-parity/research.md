# Research: Assistant Channel Routing Parity

## Decision 1 — Keep adapter admission outside the brain

R4 already verifies adapter authenticity, prepared connector capability and opaque communication identity. R36C should not duplicate provider admission; it should accept only the trusted server result and recheck workspace role.

## Decision 2 — Reuse R2 for internal work

R2 already persists channel-specific messages, enforces non-portal identity permissions and owns canonical effects. R36C will construct its strict envelope instead of adding another execution engine.

## Decision 3 — Preserve deferred source provenance

When the routing decision is not internal, the deferred inbound row should retain the admitted channel, opaque sender, provider and provider message reference. This makes the future work request auditable without activating the provider.

## Alternatives rejected

- Route only the mobile app: leaves SMS/voice behavior inconsistent.
- Make R36C trust arbitrary client source fields: creates an authority bypass.
- Rebuild R4 inside R36C: duplicates admission and connector policy.
- Activate a live provider to test parity: outside current authority and unnecessary.
