# Specification Quality Checklist: Model Gateway v1

**Purpose**: Validate specification completeness and quality before proceeding to planning

**Created**: 2026-08-19

**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, SDKs or database schema)
- [x] Focused on user, operator and business needs
- [x] Written for technical and non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No `[NEEDS CLARIFICATION]` markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] Acceptance scenarios cover allowed and refused paths
- [x] Edge cases are identified
- [x] Scope and exclusions are explicit
- [x] Dependencies and assumptions are explicit

## Gateway Safety Contract

- [x] Classification is the only V1 canary (FR-002, FR-044)
- [x] Closed versioned routing and route-profile allowlists are required (FR-004)
- [x] Missing or contradictory policy facts fail closed before dispatch (FR-005)
- [x] Silent substitutions are prohibited (FR-015, SC-002)
- [x] Fallbacks are separately authorized, rechecked and cost-bounded (FR-014 to FR-017)
- [x] A direct-provider escape path has the same contract (FR-018, FR-019, FR-047)
- [x] No candidate is adopted by the specification (FR-020, Out of Scope)
- [x] Privacy and ZDR posture are route-specific, evidenced and expiring (FR-008, FR-009)
- [x] Tenant isolation and minimum outbound projection are explicit (FR-010 to FR-012)
- [x] Every billable attempt reserves before dispatch (FR-021)
- [x] Ambiguous dispatch preserves uncertain spend and blocks blind replay (FR-023, FR-024, FR-031)
- [x] Hidden provider or SDK retries are forbidden (FR-025)
- [x] Breakers are rechecked at dispatch and preserve in-flight identity (FR-026, FR-027)
- [x] Result-contract verification is distinct from provider success (FR-033)
- [x] Required evidence is durable before dispatch (FR-035)
- [x] Logs and ordinary evidence exclude raw sensitive content (FR-037)
- [x] Rollout is off by default and bounded by operation type (FR-043, FR-044)

## Constitution Alignment

- [x] Problem denominator and evidence labels are explicit
- [x] Quality, cost, reliability, coverage and commercial impact remain `UNKNOWN`
- [x] Authorization model is external to the runtime and model
- [x] Tenancy and data classification are stated
- [x] Failure states have owners and safe next actions
- [x] Economics preserve accepted price and payout and bound provider cost
- [x] Verification and delivery conditions are explicit
- [x] Observability and redaction are explicit
- [x] Rollout and rollback preserve historical meaning
- [x] Vendor lock-in is addressed through direct-path parity and exportable evidence

## Validation Notes

**Iteration 1 — 2026-08-19. Result: all items pass.**

- The Brain's candidate list remains a bake-off list. No vendor is selected, preferred or described as production-ready.
- Classification is the only admitted V1 operation. Engineering Factory and AfterDesk-DevBench remain a separate future feature.
- The spec distinguishes exactly-once platform decisions from provider-side uncertainty. It does not claim impossible exactly-once external execution when provider idempotency is absent.
- Spend reservation, ambiguous-outcome handling, privacy evidence, breaker behaviour and direct-path parity each have measurable acceptance criteria.
- No unresolved founder choice changes the WHAT or WHY of V1. Candidate selection, storage layout, policy representation, client adapters and operational dashboards are planning decisions.

## Notes

- Items marked incomplete require specification updates before planning.
- This checklist validates requirement quality only. It is not implementation or vendor-adoption evidence.
