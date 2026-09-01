# Specification Quality Checklist: HumanWorkUnit and Safe Resume v1

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Constitution Alignment (AfterDesk Constitution v1.0.0)

- [x] Problem statement names its denominator, with evidence source and label
- [x] Unmeasured quantities are labelled `UNKNOWN` rather than estimated favourably
- [x] Explicit exclusions stated (Out of Scope)
- [x] Authorization and tenancy model stated
- [x] Data classification stated
- [x] Failure modes and exception states enumerated with resolution owners
- [x] Economics stated: cost ceiling, price, payout, expected margin
- [x] Verification method and delivery conditions stated
- [x] Observability stated
- [x] Rollout and rollback stated
- [x] Constitution compliance recorded, including principles put at risk
- [x] Every claim carries an evidence label; aggregate claims carry the weakest label
- [x] Human work is not counted as machine coverage (FR-047, SC-012)
- [x] Fail-closed behaviour specified for every refusal path
- [x] No money value is inferred; unmappable economics pause rather than guess (FR-035, FR-037)

## Clarification Integration (Session 2026-08-14)

- [x] Worker access requires no client-tenant membership, and none is implied anywhere (FR-010)
- [x] Worker access rechecks approved status, task/category/tier eligibility, unit-to-task binding, claim holder, claim generation and classification projection at every use (FR-009)
- [x] Cross-client isolation is stated as unit-to-task binding plus minimum-necessary projection (FR-008)
- [x] Exactly one payable worker per task; no second engagement, per-unit payout or partial payout (FR-033)
- [x] Accepted fixed task payout is shown before the claim and never moves afterwards (FR-034, SC-004)
- [x] Unit claim atomically establishes or matches the task's sole worker assignment, and is refused if another claimant holds the task (FR-011)
- [x] Review authority is an admin who is not the submitting worker; no new reviewer role or membership model (FR-019)
- [x] Resume creates no second claim, assignment or economic relationship (FR-030)
- [x] Downstream failure after resume routes to the same claimant where eligible, otherwise pauses for an admin (FR-045)
- [x] Narrow one-unit topology and all fail-closed / replay / exactly-once protections preserved (FR-003, FR-026 to FR-029)

## Validation Notes

**Iteration 2 — 2026-08-14, after clarification. Result: all items pass. 31/31 → 41/41.**

Four maintainer-supplied repository facts were applied as authoritative and normalized through the user stories, functional requirements, key entities, authorization section, economics section, failure table, out-of-scope list and assumptions. Each was verified against the implementation before being written in:

- *Worker tenancy removed.* Every "within the mandate's tenant" requirement was replaced with the real gate set — approved-worker status, task category/tier/prior-delivery eligibility, unit-to-task binding, active claim holder at the current claim generation, and the data classification projection. Isolation is now stated as binding plus minimum-necessary projection. Client and admin paths keep ownership and role checks. `CODE`-verified: the worker entry point gates on approved status and task eligibility, with no tenant concept anywhere in it.
- *One payable worker.* The earlier "no new payable engagement" assumption was too weak — it left open who works the unit. Now stated as a requirement: claiming the unit atomically establishes or matches the task's sole worker assignment, that worker stays claimant and payee through resume and completion, and a claim is refused when another claimant already holds the task. `CODE`-verified: a task carries one claimant, taken under a null-claimant guard, with its payout frozen at claim.
- *Payout stability.* This clarification closed the one real gap flagged after `/speckit-specify`: the claim now happens mid-run, before downstream machine work finishes, so the figure the worker saw must not be recomputed at the later handover. FR-034 and SC-004 make that explicit and testable, and the risk is named in the Constitution Compliance section under Principle III.
- *Reviewer is an admin.* Assumption 6 became a requirement (FR-019). The enforced separation is submitter vs decider, not two named roles. `CODE`-verified: delivery quality review is already admin-side.
- *Resume is not a second relationship.* FR-030 and FR-045 now state that acceptance resumes the run only, and that downstream failure routes remaining work to the same claimant where still eligible, or pauses for an admin.

Requirements were renumbered from FR-001..FR-047 to FR-001..FR-054 and success criteria from SC-001..SC-010 to SC-001..SC-012 to keep each group contiguous. No plan, tasks or code reference the old numbers. The two FR/SC pointers inside this checklist were updated to match.

**Ambiguity scan result: no further blocking ambiguity.** Categories re-scanned and found Clear: functional scope, roles and personas, entities and lifecycle, identity and uniqueness, critical journeys, security and privacy, observability, edge cases and concurrency, completion signals, terminology. Categories intentionally left to planning: state-machine placement of the waiting task, storage shape of the unit and its generations, notification wiring, and whether the existing quality-review path needs a bounded extension — all implementation choices, none of which change acceptance. The deferred commercial questions remain `UNKNOWN` by explicit founder decision and were not raised.

**Iteration 1 — 2026-08-14, at specification. Result: all items pass.**

Findings resolved during drafting rather than left open:

- *Success criteria wording*: an early draft spoke of "no budget hold rows", which named a storage mechanism. Restated as "provider spend attributable to a run … is zero", which is verifiable without knowing how spend is recorded.
- *Ambiguous topology rule*: "no parallel branches across the boundary" admits two readings — forbid only branches that cross the human unit, or require every step to be an ancestor or descendant of it. The stricter reading was chosen and recorded as Assumption 1.
- *Economics honesty*: expected margin could not be stated as a number without inventing one. It is recorded as `UNKNOWN` with the reason.

No `[NEEDS CLARIFICATION]` markers were required in either iteration.

## Notes

- Items marked incomplete require spec updates before `/speckit-plan`
- This checklist validates the specification only. Plan, tasks, code, migrations, tests and workflows were explicitly not produced by these commands.
