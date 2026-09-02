# Feature Specification: R34 Commercial Account, Operator and Public Site Alignment

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R34 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA has one honest commercial control plane for the Construction Operating
Assistant. A contractor can see the plan attached to the company, what local
usage ENDVERA can currently measure, what remains unavailable and how to ask
for human help. An operator can see every synthetic/local Construction account,
its current plan decision, usage, exceptions and support state without opening
the legacy one-off task marketplace. The public site describes the same
assistant and never claims that disabled connectors or billing are live.

R34 does not charge a card, create a Stripe subscription, publish prices that
have not been approved, contact a customer or turn observed counts into an
invoice. It creates the canonical local structures and role-safe surfaces that
R35 can package and R36 can exercise end to end.

## User scenarios and acceptance

### US1 — Understand the company plan and usage (P1)

An owner or office manager opens the commercial account surface and sees one
versioned plan, its commercial state, included capabilities, the current
period, canonical usage readings and any exact unavailable capability. A field
worker receives no plan, price, usage or billing projection.

### US2 — Make an exact local plan decision (P1)

An authorized operator can prepare and apply one exact plan assignment or
state change to a synthetic workspace. The decision binds workspace, plan
version, prior account version and command identifier. Duplicate commands have
one effect; altered replay, stale version, unknown plan and cross-workspace
input fail without partial state.

### US3 — Inspect commercial operations without legacy task noise (P1)

An operator sees a Construction-specific queue of workspaces ordered by
attention: missing plan, support/exception, usage warning, then healthy. Each
row shows plan state, measured usage, last decision and one safe next action.
Opening or refreshing the queue changes nothing.

### US4 — Request and manage human support (P1)

An owner can prepare a bounded support request using the existing human
escalation engine. The client sees its state and next owner; the operator sees
the support queue and exact originating context. A field worker sees only a
support unit explicitly assigned to them. No outbound message or Human Work
Unit execution is fabricated.

### US5 — Read one accurate public proposition (P1)

A signed-out visitor can open a bilingual Construction page and understand:
ENDVERA remembers projects, schedules work, gathers evidence, follows up,
prepares invoice-ready files and can route exceptions to humans. The page
labels the product stage and disabled real-world connectors plainly. It does
not present local tests as customer proof or provider readiness.

### US6 — Preserve billing and role safety (P1)

Every commercial read/write rechecks membership or admin role, all financial
values use minor units and CAD, provider state is closed, audit decisions are
immutable, raw provider credentials never enter the schema, and field/cross-
workspace projections fail closed.

## Functional requirements

- **FR-001**: Define a closed versioned Construction commercial-plan registry independent from legacy one-off task pricing.
- **FR-002**: Plan keys, feature keys, usage metric keys, account states and decision kinds are closed schemas.
- **FR-003**: Unapproved public price is represented as unavailable, never zero or a fabricated amount.
- **FR-004**: Persist at most one Construction commercial account per workspace with plan key/version, state, period, account version and exact snapshots.
- **FR-005**: Persist immutable commercial decisions with command ID, actor, prior/new version, exact payload and fingerprint.
- **FR-006**: Concurrent identical commands collapse to one canonical effect.
- **FR-007**: Altered replay, stale expected version, unknown plan/version and invalid transition fail atomically.
- **FR-008**: Plan assignment and state transitions are ADMIN-only and reload the target workspace at point of use.
- **FR-009**: Billing provider remains exactly `DISABLED_LOCAL`; R34 cannot create a checkout, subscription, invoice, payment or external write.
- **FR-010**: Derive usage inside one repeatable-read transaction from existing canonical Construction tables.
- **FR-011**: Usage metrics include active projects, active members, ingested messages, evidence references, prepared actions, open follow-ups and human escalations.
- **FR-012**: Every usage projection includes metric code, nonnegative quantity, period, source class and stable aggregate fingerprint.
- **FR-013**: Usage is informational until a later approved billing policy; R34 cannot calculate an amount due or overage charge.
- **FR-014**: Owner/office and field commercial projections are independent strict schemas.
- **FR-015**: Field projections exclude plan, price, usage, billing, support queue, workspace totals and operator decisions.
- **FR-016**: The client commercial surface displays plan state, price availability, included capabilities, usage and disabled billing honestly.
- **FR-017**: The operator surface orders workspaces by a closed attention reason and provides one safe local action.
- **FR-018**: The operator surface never mixes legacy freelancer/task pricing with Construction subscription planning.
- **FR-019**: Client support preparation reuses R22 human escalation contracts and preserves originating workspace/project/context.
- **FR-020**: Operator support inspection shows exact state, next owner and bounded context without hidden field leakage.
- **FR-021**: Support inspection or refresh performs zero execution and zero outbound transport.
- **FR-022**: Public Construction copy is complete in `fr-CA` and `en-CA` and uses one canonical capability/status catalog.
- **FR-023**: Public copy distinguishes available local product behavior, prepared connector capability and not-yet-observed provider behavior.
- **FR-024**: Public copy makes no claim of customer value, product-market fit, live billing, live SMS/calls/calendar/accounting or mobile-store availability.
- **FR-025**: Client, admin and public surfaces meet semantic heading, keyboard, focus, label, narrow-layout and non-colour meaning requirements.
- **FR-026**: Private APIs are authenticated, rate-limited, private/no-store and accept no caller-supplied actor or role.
- **FR-027**: All amounts use integer minor units and canonical `CAD`; localized copy is never persisted as business state.
- **FR-028**: Account/decision/audit writes are workspace-scoped, append-only where historical and forward-only in migration.
- **FR-029**: Contract and PostgreSQL tests cover tenancy, role, replay, concurrency, restart, usage exactness and zero external effect.
- **FR-030**: No provider, credential, customer data, external transport/write, push, Preview, Production, deployment or store action is permitted.

## Failure and exception states

Missing account, unknown plan/version, unpublished plan, invalid transition,
stale expected version, duplicate/altered replay, inactive workspace, cross-
workspace target, field access, count overflow, inconsistent period, missing
translation, unavailable support context or provider attempt returns a closed
reason. No failure can silently create a paid/active claim.

## Success criteria

- Exactly one canonical commercial account exists per synthetic workspace.
- One exact plan decision remains identical after restart.
- Concurrent duplicate decisions create one account version and one immutable decision.
- Seven usage metrics match direct canonical PostgreSQL counts in one period.
- Owner/office sees the commercial projection; field output contains zero commercial or financial field.
- Admin attention ordering is deterministic and refresh has zero write.
- One prepared human-support request appears consistently to the owner and operator with zero execution.
- French and English public capability/status catalogs are complete and unmixed.
- Public copy contains zero unsupported live-provider, customer-value, PMF, price or store claim.
- Client/admin/public primary actions remain usable by keyboard and on narrow layouts.
- Provider-observed and external-effect counts remain zero.
- R33 parity and R21/R22/R28/R30/R31/R32 regression gates remain green.

## Assumptions and dependencies

- R21 is authoritative for project invoice-readiness/receivables, not subscription billing.
- R22 is authoritative for human escalation lifecycle and exact resume.
- R28 authority and R30 privacy boundaries remain authoritative.
- R33 provides the shared operational entry point and role-safe client patterns.
- Public price, checkout and paid status require a later founder-approved commercial policy and are deliberately absent here.

## Out of scope

Stripe or app-store billing, payment collection, refunds, tax, overage charges,
published pricing, provider credentials, customer/prospect records, live support
dispatch, new worker marketplace economics, email/SMS/call sends, deployment,
Preview, Production, app stores, willingness-to-pay claims and Verified-E2E.
