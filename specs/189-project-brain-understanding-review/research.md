# Research: Project Brain Understanding Review

## Decision 1 — Human-declared contradictions

**Decision**: R36X allows OWNER/OFFICE_MANAGER users to explicitly group two or more review candidates as a contradiction. It does not automatically detect semantic conflict.

**Rationale**: R36W deliberately provides exact-copy candidates, not semantic understanding. Automatic conflict detection would invent meaning or require a forbidden provider.

**Alternatives considered**:

- Compare unequal strings in the same field: rejected because difference is not necessarily contradiction.
- Model-based contradiction detection: forbidden and not locally provable.
- Hide contradictions until a later provider release: rejected because the owner already has authority to identify a real conflict.

## Decision 2 — Append resolutions; never rewrite conflict

**Decision**: Contradiction membership is immutable. A resolution is a separate append-only record and all historical dispositions remain retained.

**Rationale**: Erasing the losing statement destroys provenance and makes later audit impossible.

## Decision 3 — Three explicit resolution modes

**Decision**: A resolution selects supported member candidates, rejects all members, or retains bounded verbatim owner resolution text labelled `OWNER_RESOLUTION`.

**Rationale**: These modes cover supported evidence, unsupported claims and an explicit owner correction without implying machine-derived truth.

**Alternatives considered**:

- Free-form machine synthesis: rejected as invented understanding.
- Numeric confidence winner: rejected because R36W confidence is copy provenance, not truth probability.

## Decision 4 — Full disposition coverage before sealing

**Decision**: Every candidate requires one current explicit disposition, and every contradiction requires a current resolution, before preparation.

**Rationale**: Partial review must not silently omit inconvenient candidates or conflicts from canonical memory.

## Decision 5 — Canonical preview and exact confirmation

**Decision**: Preparation builds a complete canonical snapshot and fingerprint. Confirmation requires the exact current version and fingerprint and atomically persists one immutable confirmed snapshot plus decision.

**Rationale**: The person confirms bytes they actually reviewed, not a mutable screen or server reconstruction performed later.

## Decision 6 — One mobile surface, server authority

**Decision**: Project navigation opens one review surface that resolves the current eligible review server-side. The client never asks users to copy technical IDs and never decides authorization/completeness.

**Rationale**: This preserves usability without moving tenant or confirmation authority into the UI.

## Decision 7 — Relational DB guards plus read validation

**Decision**: Additive entities and deferred guards enforce complete reciprocal review state and hash binding; projections recompute completeness/fingerprints and fail closed on corruption.

**Rationale**: A forged confirmed understanding is unrecoverable once later assistant memory relies on it.

## Decision 8 — Resolution determines coherent final disposition

**Decision**: Preparation applies one canonical matrix. Selection accepts selected members and rejects the rest; reject-all rejects every member; owner-resolution rejects every member and accepts only the verbatim owner resolution. A candidate in multiple groups must derive the same outcome everywhere.

**Rationale**: Independent disposition and resolution records could otherwise seal both acceptance and rejection of the same candidate. `RETAIN_FOR_CONTRADICTION` remains useful during draft review but cannot enter a prepared snapshot.

## Decision 9 — Project-scoped confirmation sequence

**Decision**: Exact confirmation allocates a monotonic project-scoped sequence under the same project lock/transaction. Current understanding is selected by `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`.

**Rationale**: Timestamps do not provide a safe total order under concurrent confirmation or restart. The sequence makes R36Y selection reproducible.
