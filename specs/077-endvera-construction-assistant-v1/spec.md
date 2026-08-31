# Feature Specification: ENDVERA Construction Assistant V1

**Feature Branch**: `codex/endvera-construction-assistant-v1`  
**Created**: 2026-08-31  
**Status**: Accepted for implementation  
**Founder decision**: ENDVERA Construction Assistant is the first vertical.

## Product outcome

One authenticated construction-company owner can tell ENDVERA about a meeting, see the resulting project calendar state, ask what is scheduled tomorrow, simulate the same intake through SMS or email without duplication, and approve exactly one simulated outbound message. The database—not chat history—is canonical.

## User Stories & Testing

### US1 — Establish a private construction workspace (P1)

As a client, I can initialize a workspace, create the Laval project and add Marc as a contact so future messages resolve only inside my company.

**Independent test**: a second client cannot list, read, mutate or resolve the first client's workspace, project or contact by code, name or guessed identifier.

### US2 — Turn a clear conversation into a sourced calendar item (P1)

As a client, I can write “Rendez-vous avec Marc mardi à 14 h pour Laval.” and receive one calendar item linked to the source message, project, contact and timezone.

**Independent test**: ambiguous contact or time produces one precise clarification and no calendar item.

### US3 — Query canonical tomorrow state (P1)

As a client, I can ask “Qu’est-ce que j’ai demain?” and receive a deterministic answer from authorized calendar records, with proposed items visibly labeled.

**Independent test**: the answer remains identical after process restart and never includes another workspace.

### US4 — Admit provider-neutral simulated inbox events exactly once (P1)

As a client, I can submit the same normalized SMS or email event twice and receive one message, one interpretation and at most one calendar item.

**Independent test**: an unverified identity, forged envelope, unknown channel, malformed body or cross-workspace candidate is refused and audited without disclosure.

### US5 — Approve an exact outbound draft for simulated delivery (P1)

As a client, I can ask A2 to draft a message to Marc, inspect recipient and body, approve that exact version, and observe one local simulated delivery and audit history.

**Independent test**: changing recipient, channel, body or version invalidates approval; replay cannot create a second delivery.

## Functional Requirements

- **FR-001** The system MUST support multiple users per workspace without granting membership implicitly.
- **FR-002** Every project, contact, message, interpretation, calendar item, action and audit event MUST belong to one workspace.
- **FR-003** All reads and writes MUST re-check the authenticated actor's active membership at the data boundary.
- **FR-004** Project code and normalized contact identity MUST be unique only within a workspace.
- **FR-005** Raw inbound messages MUST be persisted before interpretation and remain recoverable when interpretation is unavailable.
- **FR-006** Interpretation MUST use a closed intent vocabulary and validated structured output; it MUST NOT write directly to canonical tables.
- **FR-007** Phase 1 MUST support calendar item creation, calendar query, outbound draft and clarification; unsupported requests MUST remain stored without fabricated success.
- **FR-008** Date interpretation MUST receive an explicit reference instant, locale and workspace timezone and preserve the original date phrase.
- **FR-009** Ambiguous project, contact, date or time MUST create a clarification and MUST NOT create the consequential object.
- **FR-010** Calendar answers MUST be produced from canonical authorized records in deterministic order.
- **FR-011** Simulated SMS/email intake MUST use a provider-neutral envelope with an authenticated local-simulator boundary.
- **FR-012** Provider plus provider-message identifier MUST be idempotent and transactionally stable.
- **FR-013** Unverified communication identities MUST receive no project, calendar, contact or financial disclosure.
- **FR-014** Outbound actions MUST follow PROPOSE → APPROVE EXACT VERSION → SIMULATED DELIVERY.
- **FR-015** Approval MUST bind exact workspace, contact, channel, normalized recipient, body hash and action version.
- **FR-016** Editing an approved draft MUST invalidate the prior approval.
- **FR-017** No live provider, network request, phone number, email delivery, customer data, external write, EXECUTE, push, Preview or Production is permitted.
- **FR-018** Every admitted mutation MUST append a content-minimized audit event in the same transaction.
- **FR-019** Existing Task economics, worker/QC state machines and public routes MUST remain unchanged.
- **FR-020** The portal MUST be French-first, mobile usable, keyboard accessible, reflow at 200%, and distinguish Proposed, Verified, Waiting and Needs clarification.

## Edge Cases

- Two contacts share the same display name.
- “Mardi à 2” has no safe AM/PM interpretation.
- The same event arrives concurrently from the simulator.
- A model-shaped result supplies arbitrary database identifiers or an unknown intent.
- An inbound body contains prompt-injection text.
- A draft is edited after approval or replayed after simulated delivery.
- A sender address normalizes to an existing identity in another workspace.
- The interpreter is unavailable after the raw message is stored.

## Key Entities

Workspace, Workspace Member, Communication Identity, Construction Project, Construction Contact, Message, Interpretation, Calendar Item, Operational Action and Audit Event.

## Success Criteria

- **SC-001** All 15 first-GO demonstration steps complete locally for one client without external traffic.
- **SC-002** 100% of tested cross-workspace and unverified-sender attempts are refused without data disclosure.
- **SC-003** Replaying or concurrently submitting the same provider event produces exactly one canonical effect.
- **SC-004** Clear French meeting intake produces the correct event; every unsafe ambiguity produces clarification and zero event.
- **SC-005** The tomorrow answer is fully reconstructible from persisted records after restart.
- **SC-006** An exact approved draft produces one simulated delivery; any altered or stale version produces zero.
- **SC-007** Existing serialized tests, lint, typecheck and production build show no new regression.

## Assumptions

- Phase 1 uses one owner-created workspace plus explicit membership records; employee onboarding remains later.
- Default reversible timezone is `America/Toronto` and locale is `fr-CA`.
- The bounded interpreter is deterministic in this lane. A future AI adapter may propose the same closed schema but cannot bypass validation.
- Phone and email values in tests are synthetic. Live providers remain absent.
- Human Work Unit continuation and financial objects are intentionally excluded from this first slice.

## Explicit exclusions

No ERP, accounting, payroll, payment, estimating, live SMS/email, autonomous outbound action, customer data, provider call, workflow builder, full human-work integration, push, Preview or Production.
