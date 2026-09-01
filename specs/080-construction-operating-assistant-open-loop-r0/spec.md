# Feature Specification: ENDVERA Construction Operating Assistant — Open-Loop R0

**Feature Branch**: `codex/endvera-construction-operating-assistant-r0`  
**Created**: 2026-08-31  
**Status**: Accepted for bounded local implementation  
**First measurable outcome**: `WORK_FINISHED_TO_INVOICE_READY_LOCAL_R0`

## Product decision

ENDVERA becomes a construction operating assistant, not a generic chatbot, marketplace, CRM or project-management tool. The contractor can text, call or use the portal to tell ENDVERA what happened or what must happen. ENDVERA preserves the operational truth, identifies what remains open, proposes or performs authorized actions, follows up and shows proof of closure.

The first sellable wedge is deliberately narrower than the long-term vision:

> When field work or an extra is reported complete, ENDVERA assembles the evidence, exposes what is missing, assigns the next responsible human and moves the item to invoice-ready without the owner rebuilding the context.

This feature establishes the durable `OpenLoop` contract and demonstrates that wedge locally. It does not activate any provider or customer workflow.

## User Stories & Testing

### US1 — Turn a field update into an owned open loop (P1)

As a contractor, I can report that work or an extra is complete. ENDVERA associates the update with the correct workspace and project, creates one durable open loop, preserves the source and identifies the desired outcome.

**Independent test**: the same authorized event creates exactly one loop; an ambiguous, unauthorized, replayed or cross-project event creates none.

### US2 — Know exactly what prevents invoicing (P1)

As an owner or office manager, I see the required evidence, the evidence received, contradictions, missing fields, next responsible human and due state for every invoice-readiness loop.

**Independent test**: a frozen synthetic dossier with missing approval and photos remains `WAITING_FOR_EVIDENCE`; adding only one item does not falsely close the loop.

### US3 — Reach invoice-ready with proof, not a summary (P1)

As an authorized office user, I can verify uncertain facts and supply the last required evidence. ENDVERA moves the loop to `READY_TO_INVOICE` only when the rule set is satisfied and records a recomputable closure snapshot.

**Independent test**: the same normalized inputs always produce the same readiness result; missing, contradictory, stale or revoked evidence prevents readiness.

### US4 — Ask what needs attention now (P1)

As the owner, I see a short Today/Tomorrow projection ordered by urgency and value, including who must act next and why.

**Independent test**: the projection is derived from PostgreSQL state, respects permissions and never invents a deadline or amount.

### US5 — Prepare a follow-up without silently contacting anyone (P2)

As an authorized manager, I can ask ENDVERA to prepare a bounded evidence request. The exact recipient, channel, body, project, reason and authorization requirement are visible before approval.

**Independent test**: R0 creates only `PREPARED_UNSENT`; it cannot deliver, retry, choose a substitute provider or broaden the recipient.

## Functional Requirements

- **FR-001** The implementation MUST extend the existing Construction Assistant V1 workspace, project, contact, message, action and audit boundaries rather than create a second construction or messaging engine.
- **FR-002** An `OpenLoop` MUST have a stable identity, workspace, project, type, desired outcome, status, priority, next responsible party, due state, source provenance and version.
- **FR-003** R0 MUST support the loop type `INVOICE_READY` and MUST keep future types closed until separately specified.
- **FR-004** The canonical statuses MUST be `OPEN`, `WAITING_FOR_EVIDENCE`, `WAITING_FOR_VERIFICATION`, `READY_TO_INVOICE`, `CLOSED`, `REVOKED`.
- **FR-005** Each state transition MUST be deterministic, versioned, auditable and idempotent.
- **FR-006** Every material fact MUST retain its source message or evidence reference, supplier, timestamp, verification state and confidence classification.
- **FR-007** Required invoice-readiness evidence MUST be policy-driven and include at minimum work description, project association, amount or explicit unknown amount, completion assertion, approval state and supporting evidence requirement.
- **FR-008** Unknown amount, missing written approval, missing required evidence or an unresolved contradiction MUST prevent `READY_TO_INVOICE`.
- **FR-009** A human verification MUST identify verifier, field, prior value, accepted value, reason and time; it MUST NOT erase the original claim.
- **FR-010** The current projection MUST identify the next responsible role and one bounded next action.
- **FR-011** The owner and office roles MAY see financial amounts; a field worker MUST NOT receive financial projections unless separately authorized.
- **FR-012** Cross-workspace and cross-project reads, writes, evidence links and projections MUST fail closed.
- **FR-013** R0 MUST prepare but MUST NOT send any SMS, email, calendar invitation, invoice or external request.
- **FR-014** Any prepared outbound action MUST bind exact recipient, channel, body, project, action version and payload hash before approval.
- **FR-015** Replay, duplicate input, stale approval, changed payload and revoked authority MUST be refused visibly.
- **FR-016** The Today/Tomorrow projection MUST be derived from canonical PostgreSQL state and MUST distinguish fact, inference, missing evidence, contradiction and prepared action.
- **FR-017** R0 MUST provide a local synthetic scenario proving one incomplete loop, one corrected loop and one ready-to-invoice loop.
- **FR-018** The system MUST preserve the original R3 corrected Construction Assistant behavior and treat the absent R3 founder observation as unresolved, not as PASS.
- **FR-019** No provider, real phone number, customer/prospect data, OAuth, live calendar, live accounting, external transport, push, Preview or Production is permitted.
- **FR-020** No package dependency or lockfile change is permitted.
- **FR-021** Schema changes, if used, MUST be forward-only, additive, workspace-scoped and proven against a disposable PostgreSQL database; `prisma db push` is forbidden.
- **FR-022** No model output may directly mutate canonical state. Interpretation proposes a typed command; validated services decide and persist.
- **FR-023** Dashboard metrics MUST change only when their canonical ADR-047 rubric is demonstrably crossed.
- **FR-024** The frozen R0 scenario MUST use `billingBasis=CHANGE_ORDER` and MUST require: verified Laval project association, non-empty work description, positive CAD amount, explicit completion assertion, written approval evidence and at least one accepted selected photo/document evidence item.
- **FR-025** The R0 next-actor policy MUST assign missing written approval to the owner/office manager, missing field evidence to the assigned project/field role, unresolved contradiction to an authorized verifier and a complete package to the office/accounting role.

## Non-goals

- A generic ERP, CRM or drag-and-drop workflow builder.
- Native iOS or Android applications in R0.
- General mailbox, personal SMS history or whole-phone access.
- Live AI, telephony, calendar, accounting or payment provider activation.
- Sending an invoice or collecting a payment.
- Automatic legal, spending or compliance decisions.
- Claiming product-market fit, customer E2E, provider readiness or live ChatGPT superiority.

## Edge Cases

- The same completion report arrives twice through different normalized envelopes.
- The project name is ambiguous or absent.
- An employee reports completion but cannot see the amount.
- A verbal approval conflicts with a written rejection.
- A photo exists but is not linked to the project or required evidence category.
- The amount changes after a draft is prepared.
- A verifier revokes a fact after readiness was reached.
- A loop is closed, then a valid contradictory fact arrives.
- A prepared follow-up is approved after its loop version changes.

## Success Criteria

- **SC-001** One authorized synthetic completion report creates exactly one workspace/project-scoped invoice-readiness loop.
- **SC-002** All missing evidence and contradictions in the frozen scenario are detected; invented facts equal zero.
- **SC-003** Readiness remains false until every frozen policy requirement is satisfied and verified.
- **SC-004** The next responsible party and bounded next action are correct for every scenario state.
- **SC-005** Owner/office and field-worker projections differ correctly; financial leakage equals zero.
- **SC-006** Duplicate canonical effects, replayed action effects and external transports all equal zero.
- **SC-007** Before/after restart projections are identical and history is reconstructible.
- **SC-008** A founder can understand from one screen: what is done, what is missing, who must act, and whether it is ready to invoice.
- **SC-009** The implementation passes targeted unit and disposable-PostgreSQL tests, lint, typecheck and proportional existing Construction Assistant regression gates.
- **SC-010** The frozen change-order scenario cannot reach readiness by substituting a verbal claim for written approval, an unrelated file for project evidence or an explicit unknown for the amount.

## Commercial validation gate

This local feature is not commercial proof. No broader platform build is unlocked until research observes:

- ten qualified problem interviews;
- at least five independent contractors describing the same lost-delay/rework failure;
- at least three walkthroughs of recent real dossiers for that failure;
- a five-company, 30-day design-partner pilot where at least 80% of eligible items reach an accepted invoice-ready dossier, owner intervention is below three active minutes per dossier and at least three of five companies state a concrete willingness to pay.
