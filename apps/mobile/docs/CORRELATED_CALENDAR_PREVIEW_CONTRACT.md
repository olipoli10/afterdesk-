# Local two-source preview utility

2026-09-10 — accepted bounded local implementation, **not imported by production**.

The architecture decision is to validate only a small local presentation envelope while the backend relation/private DTO is still being designed. `personal-correlated-calendar-preview.ts` is not an API response schema and does not reserve server names, route fields, approval tokens or migration semantics. Future code must adapt an authenticated typed projection explicitly; do not cast an arbitrary response into this shape.

It accepts the exact version `personal-correlated-calendar-local-preview-v1`, two ordered distinct sources with complete supplied text, UTC millisecond timestamps, declared lowercase SHA-256 request hashes, four source-bound UTF-16 citations, the original anchor, clarified slot and exact four-field draft. Title must equal the original quote with only the existing trim normalization. Quotes and both texts are retained unchanged. Split surrogate-pair boundaries are refused, not normalized.

The answer timestamp must be strictly later than the original timestamp. This necessary local ordering does not authenticate the server's additional acceptance/receipt/claim causal chain.

Hashes are checked for syntax and consistent references **only**. This utility cannot authenticate the supplied hashes, prove that text is complete, verify receipt ownership/current permissions, recompute calendar intent, or prove that an explicit provenance label is truthful. All corresponding authority/semantic verification markers remain false. Source texts must be reloaded by the future server projection. Two different operation IDs are required; identical message contents are not themselves an identity collision.

`approvalAvailable` is literal false. No operation/approval id, action, network callback or execution output exists. Only explicit `SYNTHETIC_LOCAL` or `UNKNOWN` presentation provenance is admitted; a future external provenance variant needs its own reviewed mapping. UNKNOWN must never become a “live” claim. The local envelope deliberately does not claim Twilio delivery, model execution or Samsung observation.

The unchanged `personalCalendarDisplay` produces zone-specific display data. Invalid rendering (including absent Intl support) returns UNAVAILABLE local times while raw evidence remains available and approval stays false. This is distinct from malformed evidence, which returns no evidence. Existing formatter validation rejects reversed/invalid date boundaries; the preview must not present structurally invalid intervals as checked evidence.

New files are confined to this helper, its synthetic tests and this contract. No UI, API, imports, schema, flags, provider/device calls or deployment. Next gate: independent review, then controller approval of the actual server projection contract before integration. Test outcomes describe pure local behavior, not authenticated/backend/native-device proof.
