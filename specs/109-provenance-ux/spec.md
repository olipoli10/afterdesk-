# Feature Specification: R29 Plain-Language Provenance UX

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: In progress
**Input**: R29 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA explains, in one project-scoped view, what it received, what it inferred,
what deterministic policy decided, what action was prepared or performed, what a
human returned and which operational state is currently verified. Every sentence
is linked to an immutable canonical record and timestamp. The user can understand
why ENDVERA believes the current state without reading raw audit JSON or trusting
the language model as the database.

R29 is a read/projection release. It does not add an external action path, invent
missing provenance, rewrite history or expose protected payloads.

## User scenarios and acceptance

### US1 — Understand one operational fact (P1)

An owner or office manager opens a project and sees a plain-language fact with
its source type, supplier, observed/recorded time and verification state. If the
fact is proposed or contradicted, the UI says so explicitly and does not present
it as verified.

### US2 — Follow the complete trust chain (P1)

The user can follow entries classified exactly as `FACT`, `INFERENCE`,
`DECISION`, `ACTION`, `HUMAN_RESULT` and `VERIFIED_STATE`. Entries identify their
canonical entity and causal predecessor when one exists. Contradictions remain
visible after resolution; superseded facts are not silently removed.

### US3 — Ask why ENDVERA reached the current state (P1)

For every open loop, ENDVERA shows the current status, state version, next
responsible role, bounded next action and the exact transition/snapshot basis.
The answer is reconstructed from PostgreSQL, not a chat transcript or generated
summary.

### US4 — See only role-appropriate provenance (P2)

Owners and office managers see operational and financial provenance they are
authorized to inspect. Field workers see only project work facts and actions
needed for their role. They never receive amounts, receivable identifiers, raw
message bodies, payload hashes, internal policy rules, human-work internals or
other-user identities.

### US5 — Use the same trust model on web, iOS and Android (P2)

The protected project provenance API feeds a shared native screen and the web
project cockpit. Unknown response fields, unknown provenance kinds, cross-project
records and malformed causal links fail closed.

## Functional requirements

- **FR-001**: Reuse canonical Construction records from R0, R10, R15, R18, R21, R22 and R28; do not create a second audit or event store.
- **FR-002**: Support exactly `FACT`, `INFERENCE`, `DECISION`, `ACTION`, `HUMAN_RESULT` and `VERIFIED_STATE` as user-visible provenance kinds.
- **FR-003**: Every entry must include a stable ID, project/workspace scope, recorded time, plain-language statement, canonical entity type and canonical entity ID.
- **FR-004**: A fact must expose its source type, safe source label, supplied/observed time and one of `PROPOSED`, `CONTRADICTED`, `VERIFIED` or `SUPERSEDED`.
- **FR-005**: An inference must remain labeled as an inference and expose interpreter version, confidence band and source message reference without presenting model output as verified state.
- **FR-006**: A decision must expose the deterministic reason, prior/next state or authority outcome and exact policy/state version where applicable.
- **FR-007**: An action must expose its type, current state and whether an external effect occurred; R29 must always observe zero new external effect.
- **FR-008**: A human result must expose request purpose, lifecycle state, acceptance/application time and result hash only when role-authorized; raw worker payload and hidden economics remain excluded.
- **FR-009**: A verified-state entry must bind the current open-loop state version to its immutable snapshot hash and bounded next responsibility.
- **FR-010**: Preserve contradictions, superseded claims and prior decisions in chronological history; current-state emphasis must never delete history.
- **FR-011**: Order entries deterministically by recorded time, kind priority and stable ID.
- **FR-012**: Build statements from closed templates and canonical enums; no LLM call or free-form model summary may generate the provenance UX.
- **FR-013**: Reload active membership and project ownership at point of read; cross-workspace and cross-project access must be indistinguishable from not found.
- **FR-014**: Expose owner/office and field-worker schemas separately and recursively reject forbidden field keys in the field projection.
- **FR-015**: Never expose raw phone/email, message body, evidence source reference, payload/body hash, financial amount, receivable reference, policy rule, credential reference or human-work economics to a field worker.
- **FR-016**: Expose a private/no-store protected API plus web and shared Expo iOS/Android project provenance surfaces.
- **FR-017**: Provide summary counts for verified, proposed, contradicted and human-assisted entries without using those counts as product proof.
- **FR-018**: Keep provider calls, network transports, external writes, provider effects and spend at zero.

## Failure and exception states

Missing membership, project mismatch, unsupported canonical enum, malformed JSON,
unknown provenance kind, missing required source, currency/financial leakage or
unsafe human payload causes refusal. A missing optional causal link remains
`null`; it is never guessed.

## Success criteria

- All returned entries bind to one existing canonical project/workspace record.
- Six closed provenance kinds are represented and schema-validated.
- Facts, inferences and verified states are never blended.
- Unresolved and resolved contradictions remain reconstructible.
- One deterministic result survives process restart.
- Field projection contains zero financial, raw-message, hash, policy or human-work leakage.
- Web and shared iOS/Android clients parse the same protected contract.
- Zero provider, external transport, external write or spend effect.

## Out of scope

- new truth, model-generated explanations, customer data, provider calls,
  external transport/write, OAuth, credentials, push, Preview, Production,
  deployment, publishing or redesign of historical data models.
