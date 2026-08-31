# Feature Specification: Construction Assistant V1 R3 Corrected Founder Retest

**Feature Branch**: `codex/endvera-construction-assistant-v1-r3-corrected-founder-retest`  
**Created**: 2026-08-31  
**Status**: Accepted for execution

## Product outcome

Olivier completes one short, real, local retest of the corrected Construction Assistant loop from one guided authenticated screen. The screen drives the existing local product boundaries, derives every technical result from disposable PostgreSQL state, and records an honest PASS, REWORK or REJECT without a provider, real transport, customer data or a fabricated comparison.

## User Stories & Testing

### US1 — Complete the corrected loop without technical choreography (P1)

As founder, Olivier sees one action at a time at `/client/construction-retest`, uses prefilled business-language messages, and never copies an identifier, changes URL, opens another tab or manually marks a technical success.

**Independent test**: the console owns sequence and provider-message identity server-side, refuses out-of-order/unknown input, starts its timer on the first founder action, and computes success from PostgreSQL.

### US2 — See the safety and replay boundaries work (P1)

As founder, Olivier sees the exact recipient, simulated channel and body before approval, then observes one local delivery and a visible refusal of the second approval.

**Independent test**: the first inbound event creates one canonical effect, the duplicate creates none, the first approval creates one simulated delivery, the second creates none, and external transport remains zero.

### US3 — Receive one honest human verdict (P1)

As founder, Olivier submits only seven non-technical observations after the nine steps. The campaign seals his answers with automatically measured technical facts and adjudicates the frozen thresholds.

**Independent test**: fixtures cannot set founder completion; failed technical or human thresholds cannot be overwritten; an incomplete session cannot pass.

## Functional Requirements

- **FR-001** Source HEAD `682eddc528eb564fb4c13e56ef18328e42ad0ba7` and tree `8a89ef281e3c8df81f5a60ccc25c08f610d57da2` MUST remain the immutable baseline.
- **FR-002** The console MUST be available only in an explicit local R3 test mode and MUST be inaccessible in production.
- **FR-003** Authentication and CLIENT workspace ownership MUST be rechecked by every server action.
- **FR-004** The console MUST initialize only the exact synthetic Laval dossier and synthetic Marc contact.
- **FR-005** The console MUST show one ordered action at a time and prefill every exact message.
- **FR-006** Provider message identity MUST be generated, persisted and reused server-side; Olivier MUST NOT see or copy it as a task.
- **FR-007** Step completion MUST be derived from persisted records and closed action results, never a founder checkbox.
- **FR-008** The clear appointment MUST create exactly one canonical Laval appointment for Marc at Tuesday 14:00 with provenance.
- **FR-009** The ambiguous appointment MUST return understandable clarification and create zero consequential write.
- **FR-010** The tomorrow answer MUST be computed from canonical PostgreSQL state and contain no invented fact.
- **FR-011** The first simulated inbound SMS MUST create one canonical effect and its duplicate MUST create zero.
- **FR-012** The outbound request MUST create one `PREPARED_UNSENT` action and no transport.
- **FR-013** Recipient, simulated SMS channel, exact body, project and status MUST be visible before approval.
- **FR-014** The first approval MUST create exactly one local simulated delivery; the second MUST create zero and show a closed replay-refusal reason.
- **FR-015** Final Projects, Calendar and Inbox projections MUST be displayed together and agree with PostgreSQL counters.
- **FR-016** The founder timer MUST begin on the first real founder action, not page load or dry run.
- **FR-017** The final form MUST accept only the seven specified fields and MUST reject unknown fields.
- **FR-018** Automated fixtures and dry runs MUST NOT set the human-observation completion flag.
- **FR-019** No stateless or live ChatGPT comparison, advantage rating or comparative conclusion is permitted.
- **FR-020** No provider, external transport, real phone/email, customer data, OAuth, Prisma change, migration, dependency, lockfile change, push, Preview or Production is permitted.
- **FR-021** A complete founder observation is single-use; no second human retest is permitted in this campaign.
- **FR-022** Temporary product surfaces MUST be disabled outside local test mode and removed or restored before final product commit.
- **FR-023** Dashboard metrics MUST change only when ADR-047's canonical rubric is actually crossed.

## Edge Cases

- The page is opened without local test mode or without a CLIENT session.
- A stale session evidence file exists before the founder starts.
- The founder refreshes or navigates back during a step.
- A duplicate request is submitted by double-clicking.
- The same provider event arrives with changed content.
- An outbound draft changes between inspection and approval.
- The first or second approval returns a closed failure.
- The server stops before the founder submits the final form.

## Key Entities

Founder Retest Session, Guided Step, Technical Observation, Founder Rating, Synthetic Project Projection, Replay Observation, Adjudication and Dashboard Snapshot.

## Success Criteria

- **SC-001** Olivier completes all nine steps from one authenticated screen without copying a technical identifier or manually changing URL.
- **SC-002** One clear appointment exists; ambiguity creates zero write; tomorrow response matches PostgreSQL.
- **SC-003** Inbound canonical effects equal one, duplicate effects equal zero, local simulated deliveries equal one and second-approval deliveries equal zero.
- **SC-004** Projects, Calendar and Inbox projections agree, invented facts and external transports are zero.
- **SC-005** Clarification, approval and actionability ratings are each at least 4/5; next decision is identified; context restatements equal zero.
- **SC-006** Evidence distinguishes R2 human REWORK, post-correction synthetic proof and the single R3 human result.

## Assumptions

- Olivier's authenticated local browser can use `localhost:3000`.
- A named disposable PostgreSQL instance is available locally.
- The corrected R2 business rules are reused rather than reimplemented.
- Human waiting time is separate from engineering time.

## Explicit exclusions

No ChatGPT comparison, provider, real SMS/email, customer/prospect data, OAuth, Twilio, schema or migration change, dependency, lockfile change, external action, push, Preview, Production or deployment.
