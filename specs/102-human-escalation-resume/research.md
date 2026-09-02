# R22 Research: Human Escalation and Exact Resume

## Decision 1 — Reuse the existing Human Work Unit engine

**Decision**: R22 will compose `ConstructionHumanEscalation`, the R5 bridge, and the existing Human Work Unit lifecycle.

**Rationale**: Current code already provides admission, frozen definitions, eligibility, claim fencing, candidate submissions, independent decisions, acceptances, resume records, immutable transitions, deadline alerts, payout boundaries, and recovery. The Construction R5 bridge already binds a construction loop to that engine.

**Alternatives considered**:

- New Construction-specific human task tables: rejected because they duplicate a proven engine and would split audit/resume semantics.
- Free-form operator notes: rejected because they lack typed outputs, quality review, idempotency, and exact resume.
- Blocking the Construction loop until an owner manually updates it: rejected because it breaks ENDVERA's owned-outcome model.

## Decision 2 — Bound R22 to the existing missing-evidence purpose

**Decision**: The first productized R22 purpose remains `OBTAIN_MISSING_EVIDENCE`, with written approval, photo, or supporting document as closed-world evidence kinds.

**Rationale**: This path is already safely compiled and applied to invoice-readiness loops. Broader call, SMS, calendar, email, and accounting human tasks belong to later connector releases and must not be implied by this local release.

**Alternatives considered**:

- Generic arbitrary human prompt: rejected because it cannot guarantee minimal context, result schema, verification, or safe application.
- Add outbound calling now: rejected because voice disclosure, consent, provider, authority, and transport belong to R25.

## Decision 3 — Build an owner cockpit, not another worker portal

**Decision**: Add a mobile owner/office Human Support cockpit that lists bound escalations, prepares eligible missing-evidence work, exposes state/next owner/next action, and withdraws non-terminal work. Existing worker and admin surfaces remain canonical for claim/submission/review.

**Rationale**: The missing product gap is visibility and orchestration for the contractor. Worker and reviewer mechanics already exist and are extensively tested.

**Alternatives considered**:

- Duplicate worker and reviewer flows inside the contractor app: rejected because it mixes roles and expands sensitive data reach.
- Show raw Task or HumanWorkUnit identifiers: rejected because the owner should operate on project and loop context.

## Decision 4 — No new schema by default

**Decision**: Use existing lifecycle records and derive the R22 projection transactionally.

**Rationale**: `ConstructionHumanEscalation` already retains the source loop, task, unit state, acceptance, result fingerprint, and applied timestamp. Adding another projection table would introduce drift without a missing invariant.

**Alternatives considered**:

- Materialized R22 state table: rejected unless measured query or consistency evidence later proves it necessary.

## Decision 5 — Activation remains fail-closed

**Decision**: Mobile preparation may create a `PREPARED` escalation; it cannot fabricate funding or activate publication. The existing activation path remains dependent on a durable authorized/received payment record.

**Rationale**: This release has no real payment authority. Synthetic integration fixtures may exercise the existing activation and full lifecycle, but the product route must not create fake money state.

**Alternatives considered**:

- Auto-activate with zero price: rejected because the existing contract explicitly tracks client price and worker payout and the constitution forbids bypassing economics.
- Add a test-only product activation endpoint: rejected because test fixtures can call canonical server functions without widening runtime authority.

## Decision 6 — Resume evidence is the delivery gate

**Decision**: Owner status is `APPLIED` only after the accepted payload and required clean artifact are verified and the construction transition is committed exactly once.

**Rationale**: Human acceptance proves review, not that the construction state was updated. R22 must keep acceptance, resume, and construction application distinct.

**Alternatives considered**:

- Treat `accepted` as complete: rejected because process loss can occur before application.
- Reconstruct from the worker's latest candidate: rejected because only immutable acceptance records are authoritative.

## Evidence Labels

- Existing implementation findings: `CODE`.
- Automated local lifecycle results: `TEST` and `SYNTHETIC`.
- Customer value, provider behavior, real worker operations, and market demand: `UNKNOWN` in R22.
