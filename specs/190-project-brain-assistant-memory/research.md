# Research: Project Brain Assistant Memory

## Decision 1 — Latest valid confirmed understanding only

**Decision**: Select exactly the R36X project current pointer. R36X allocates a unique project-monotone `confirmedUnderstandingSequence` under the project lock/CAS; total order is `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`. Revalidate sequence, pointer, canonical hash and relational state; ignore draft/prepared reviews.

**Rationale**: Review recency is not authority. Only exact confirmation turns reviewed state into canonical project memory.

## Decision 2 — Closed deterministic question registry

**Decision**: Support eight explicit recall intents: summary, scope, people, dates, blockers, next decision, source inventory and resolved contradiction history.

**Rationale**: These map directly to sealed fields and decisions. Open-ended semantic answers would require unavailable model reasoning or invent claims.

**Alternatives considered**:

- Send snapshot to a model gateway: forbidden in R36Y.
- Return the whole snapshot for every question: rejected because it overexposes context and weakens least-privilege projections.
- Best-effort keyword synthesis: rejected as unverified interpretation.

## Decision 3 — Citations are first-class immutable links

**Decision**: Persist ordered citation records from every answer/action through R36X confirmation/disposition/resolution and R36W/R36V provenance.

**Rationale**: A copied citation JSON without relational guards can drift or point to unconfirmed content.

## Decision 4 — Reuse four existing prepared-action families

**Decision**: R36Y may delegate only to project evidence request, SMS/MMS, voice-call script and email draft contracts already present locally.

**Rationale**: A memory feature must not create a new execution capability. These families already model frozen visible content, separate approval and no external delivery.

**Alternatives considered**:

- Generic `DO_ANYTHING` action: rejected as an authority bypass.
- Calendar/accounting writes: rejected because R36Y's required `PREPARED_UNSENT` communication contract does not authorize them.
- A second prepared-action table: rejected; existing family records remain canonical.

## Decision 5 — User-authored content, no generated message

**Decision**: The user supplies the exact body/script and subject where applicable. Memory citations support context but do not silently synthesize new text.

**Rationale**: Provider-free deterministic recall cannot truthfully author nuanced outbound content from broad memory.

## Decision 6 — Preparation and approval remain separate

**Decision**: R36Y creates only `PREPARED_UNSENT` and exposes the existing exact approval boundary; it never invokes approval.

**Rationale**: Visibility of recipient/channel/body before approval is a consequential-action invariant.

## Decision 7 — Historical replay retains historical memory

**Decision**: New commands require both the current `confirmedUnderstandingSequence` and confirmed-memory hash, while exact replay returns the retained result even after a newer understanding is confirmed.

**Rationale**: Retrying response loss must not silently substitute newer meaning; new work must not knowingly use stale memory.
