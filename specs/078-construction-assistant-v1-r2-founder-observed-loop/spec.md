# Feature Specification: Construction Assistant V1 R2 Founder Observation

**Feature Branch**: `codex/endvera-construction-assistant-v1-r2-founder-observed-loop`
**Created**: 2026-08-31
**Status**: Accepted for execution

## Product outcome

Olivier completes one real local Construction Assistant conversation loop and records whether the persistent project state, exact approval and reconstructible history provide decision value beyond an equal-input stateless chat-style control. No founder judgment may be inferred from fixtures or automated tests.

## User Stories & Testing

### US1 — Trust a fair test before using it (P1)

As founder, Olivier can see the exact synthetic dossier, eight actions, equal-input control and data boundary before starting so the comparison is understandable and fair.

**Independent test**: the contract refuses unequal input order, hidden control omissions, unknown fields and any observation not explicitly completed by Olivier.

### US2 — Complete one observed workflow (P1)

As founder, Olivier can use the actual local Projects, Calendar and Inbox surfaces, complete the eight actions and submit ratings without answering another `GO` message.

**Independent test**: a sealed observation contains real start/finish timestamps, every required action result and Olivier's explicit ratings; a fixture cannot satisfy the founder-observed flag.

### US3 — Receive an honest verdict (P1)

As founder, Olivier receives PASS, REWORK or REJECT from the frozen rubric, with technical measurements separated from subjective usefulness and from the stateless control.

**Independent test**: changing a threshold, omitting a failed metric or calling the control live ChatGPT invalidates adjudication.

## Functional Requirements

- **FR-001** The campaign MUST use source commit `1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7` and tree `c0c9dbcb800e469775b9c4339da914cbc16da1dd` as its immutable baseline.
- **FR-002** The dossier MUST remain synthetic or explicitly founder-owned and contain no customer or prospect data.
- **FR-003** The stateless control MUST receive the same visible facts, messages, order, language and reference time as ENDVERA.
- **FR-004** The control MUST be labelled `STATELESS_CHAT_STYLE_CONTROL`, never a live ChatGPT test.
- **FR-005** Automated fixtures MUST NOT set or satisfy the founder-observed completion field.
- **FR-006** The founder session MUST record start, finish, active minutes, correction count and every required rating.
- **FR-007** The clear appointment MUST resolve to the Laval project and Marc with the expected time.
- **FR-008** The ambiguous time MUST produce clarification and zero consequential calendar write.
- **FR-009** The tomorrow answer MUST be checked against canonical persisted records, not transcript text.
- **FR-010** Reusing one provider message identifier MUST produce exactly one canonical effect.
- **FR-011** Re-approving or replaying the outbound action MUST produce zero second delivery.
- **FR-012** Recipient, channel and exact body MUST be visible before approval.
- **FR-013** The observation MUST record invented facts, context restatements, next-decision identification and actionability.
- **FR-014** The harness MUST use a named disposable local PostgreSQL instance and synthetic local account.
- **FR-015** No live provider, phone, email, OAuth, customer data or external transport is permitted.
- **FR-016** Product source MUST remain unchanged before observation.
- **FR-017** A product correction MUST require a durable exact reproduction and remain inside the bounded V1 paths.
- **FR-018** A schema, migration, dependency, lockfile or architecture change MUST produce REWORK rather than silent expansion.
- **FR-019** Dashboard metrics MUST be recalculated only under ADR-047 and remain distinct.
- **FR-020** The final evidence MUST distinguish automated local proof, Olivier's human observation, customer/provider absence and Verified-E2E absence.

## Edge Cases

- Olivier closes the browser before completing the form.
- A prior observation file exists from a dry run.
- The control receives the same words but a different reference time.
- Browser localhost remains unavailable in one surface but works in another local browser.
- An ambiguous message accidentally creates a calendar row before clarification.
- The simulator replaces its provider message ID after the first admission.
- The outbound draft is edited after approval.
- A product defect appears but requires a migration or broad redesign.

## Key Entities

Test Session, Action Observation, Founder Rating, Technical Measurement, Stateless Control Result, Adjudication and Dashboard Snapshot.

## Success Criteria

- **SC-001** Olivier completes all eight actions once through the actual local product surfaces.
- **SC-002** Project and appointment accuracy are 100%, invented facts are zero and ambiguity creates zero consequential writes.
- **SC-003** Duplicate admission and outbound replay each produce zero duplicate consequential effect.
- **SC-004** Approval comprehension and actionability are each rated at least 4/5.
- **SC-005** Olivier identifies the next decision and rates observable advantage at least +1 on the frozen -2 to +2 scale.
- **SC-006** At least two managed advantages are observed that the stateless control cannot retain.
- **SC-007** No provider, customer data, external delivery or false ChatGPT-live claim occurs.
- **SC-008** The verdict and five dashboard fields are reproducible from sealed evidence.

## Assumptions

- Olivier uses a normal local browser if the Codex in-app browser blocks localhost.
- One structured founder session is an experiment action, not a routine `GO` request.
- Human wait time is excluded from active engineering time but recorded separately.
- A successful founder-owned local observation does not enter the Verified-E2E customer/provider denominator.

## Explicit exclusions

No live provider, SMS, email, Twilio, OAuth, customer data, finance, Human Work Unit, external action, push, Preview, Production or deployment.
