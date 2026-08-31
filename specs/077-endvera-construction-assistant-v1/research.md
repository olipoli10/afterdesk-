# Research and ADR — Construction Assistant V1

## Decision 1 — Base and lineage

**Decision**: branch from fetched `origin/master` `a3182b1126ab104874d7f603be1df215fdb2a378`.

**Rationale**: it is the verified production/default lineage and contains the current ENDVERA portal and auth corrections. Construction R1 diverges at `c38cceb`; importing its whole history would also import unrelated engine/spec history.

**Alternative considered**: cherry-pick the R1 lane wholesale. Rejected because it is not a narrow product delta.

## Decision 2 — Thin additive domain

**Decision**: ten focused construction models, additive relations and one forward-only migration.

**Rationale**: membership and communication identity prevent one-user and phone-number-as-authority traps; message, interpretation, calendar, action and audit records cover the full proof without a generic ontology.

## Decision 3 — Bounded deterministic A2 interpreter

**Decision**: Phase 1 uses a closed, deterministic French/English interpreter validated by Zod.

**Rationale**: it demonstrates intent → validation → canonical state without provider cost, network, non-determinism or fabricated availability. Future model output must conform to the same contract.

## Decision 4 — Server-side data access and authorization

**Decision**: Server Components read DTOs; Server Actions re-authenticate and call server-only domain services. Every query includes workspace membership.

**Rationale**: Next.js 16.2.12 documentation says Server Actions are public POST entry points and authorization belongs close to the data source.

## Decision 5 — Provider-neutral simulators

**Decision**: local SMS/email envelopes share one normalized inbox contract. No Twilio or inbound-email adapter is implemented.

**Rationale**: this tests identity, idempotency, retry and project resolution while keeping all external surfaces absent.

## Decision 6 — Exact-version outbound approval

**Decision**: store a canonical payload hash and monotonically increasing action version. Approval and simulated delivery require both to match.

**Rationale**: recipient/body substitution and stale approval fail closed.

## Named exclusions

Human Work Unit resumption, costs, receivables, real providers, real phone/email identities, financial visibility policy, live AI, customer data, deployment and master integration.
