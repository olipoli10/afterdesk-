# Feature Specification: Project Brain Assistant Memory

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Draft ready for implementation

**Input**: `unified assistant recalls only confirmed project memory and prepares narrow project actions with provenance, authority and approval boundaries intact.`

## Problem Statement and Evidence

R36V retains confirmed owner intake, R36W creates unconfirmed provenance-bound candidates, and R36X lets an authorized human preserve contradictions, resolve them explicitly and seal one exact immutable understanding. The existing unified assistant does not yet consume that exact understanding as its only Project Brain memory source. R36Y must add narrow deterministic recall and action preparation without allowing unconfirmed candidates, unresolved contradictions, binary assumptions or model output to become truth. The target denominator is projects with a latest genuinely `CONFIRMED` R36X understanding. Customer usefulness, provider behavior, willingness to pay and production value remain **UNKNOWN**.

## User Scenarios & Testing

### User Story 1 - Recall only sealed project memory (Priority: P1)

As an authorized owner, I ask the unified mobile assistant a supported memory question and receive a deterministic answer only from the exact R36X project current pointer, with citations back to the exact decisions and sources.

**Why this priority**: Persistent trustworthy recall is the central value of Project Brain and the prerequisite for safe action preparation.

**Independent Test**: Create historical draft, proposed and confirmed understandings, ask every supported question, and verify answers use only the unique current `(confirmedUnderstandingSequence, confirmed snapshot id)` with complete provenance and no candidate or unresolved conflict represented as truth.

**Acceptance Scenarios**:

1. **Given** multiple R36X review versions, **When** the owner asks for project summary, scope, people, dates, blockers, next decision, reviewed sources or resolved contradictions, **Then** the answer is derived only from the latest exact `CONFIRMED` understanding.
2. **Given** an accepted reviewed candidate, **When** it appears in an answer, **Then** its citation resolves through the R36X disposition/confirmation, R36W candidate/batch and R36V confirmed snapshot or source.
3. **Given** an owner-authored contradiction resolution, **When** it appears in an answer, **Then** its citation identifies the exact R36X resolution and confirming decision without claiming external corroboration.
4. **Given** only draft/proposed R36X state, an undispositioned R36W candidate or an unresolved contradiction, **When** a memory question is asked, **Then** none is returned as canonical truth.
5. **Given** a question requiring binary interpretation or unsupported semantic reasoning, **When** no authorized result exists, **Then** the assistant states the exact local limitation and performs no provider or binary work.

---

### User Story 2 - Prepare a narrow cited project action (Priority: P1)

As an authorized owner, I ask the unified assistant to prepare a project communication using explicit recipient and message content, then inspect recipient, channel, body, memory citations and approval requirement before any separate approval.

**Why this priority**: Memory creates operational value only when it can safely reduce context reconstruction without silently acting outside authority.

**Independent Test**: From one confirmed understanding, prepare each allowlisted action family and verify one `PREPARED_UNSENT` artifact with visible recipient/channel/body/citations, no approval and zero external effect.

**Acceptance Scenarios**:

1. **Given** an authorized project contact and explicit user-authored content, **When** the owner prepares a project evidence request, SMS/MMS, voice-call script or email, **Then** R36Y delegates to the existing family contract and returns `PREPARED_UNSENT`.
2. **Given** a prepared action, **When** it is inspected, **Then** recipient identity, channel, complete frozen body/script/subject where applicable, source-memory citations, authority requirement, version and payload fingerprint are visible.
3. **Given** preparation succeeds, **When** the result returns, **Then** approval remains false and separate, delivery remains false and no provider, credential or external transport is reached.
4. **Given** an ambiguous/missing recipient, unsupported action family, unavailable fact, unresolved contradiction or binary-dependent request, **When** preparation is attempted, **Then** the assistant clarifies or refuses without preparing a misleading action.
5. **Given** a FIELD_WORKER or other insufficient role, **When** an outbound action is requested, **Then** preparation is refused according to the existing family policy without revealing protected memory.

---

### User Story 3 - Recover stable assistant state safely (Priority: P2)

As an authorized user, I can retry after response loss or restart the app and recover the same answer/prepared action without duplicate effects or technical identifier copying.

**Why this priority**: Mobile networks and process restarts are routine; safe memory must not duplicate actions or drift between attempts.

**Independent Test**: Replay/race exact commands, restart server/mobile state and compare canonical results; reuse an ID with changed body and attempt cross-workspace/project access.

**Acceptance Scenarios**:

1. **Given** an exact body-bound recall or preparation command, **When** it is replayed or raced, **Then** it returns one stable canonical result and creates no duplicate prepared action, decision or audit.
2. **Given** a command ID reused with a changed question, recipient, body, project, memory hash or action family, **When** submitted, **Then** it conflicts with zero new effect.
3. **Given** a process/mobile restart, **When** the same project assistant opens, **Then** the exact current sequence/hash, memory citations and prepared-action status remain byte-equivalent.
4. **Given** a different workspace/project, inactive membership or unauthorized role, **When** recall or preparation is requested, **Then** no memory, contact, citation or action existence is disclosed.
5. **Given** normal mobile project navigation, **When** the assistant is opened, **Then** server-side context resolution supplies the project/memory binding without copied technical IDs.

### Edge Cases

- A newer DRAFT or READY_FOR_CONFIRMATION review never eclipses the latest CONFIRMED understanding.
- A newer confirmed understanding invalidates new commands bound to the old memory hash; exact historical replay still returns its original effect.
- Rejected candidates remain visible only when a supported audit-style question explicitly asks for review history; they are never stated as project truth.
- Resolved contradictions are answered with the retained resolution and an explicit conflict-history citation, not by hiding the original members.
- Equal values from different provenance retain separate citations.
- A deleted/inactive contact blocks new preparation but does not rewrite a historical prepared action.
- Recipient, channel or body changes require a new action version and approval; they cannot mutate an approved payload.
- Unsupported natural-language phrasing results in clarification, not best-effort semantic inference.
- Corrupt hash/provenance chains fail closed for the entire answer/action.

## Requirements

### Functional Requirements

- **FR-001**: Project Brain recall MUST use exactly the R36X project current pointer selected by total order `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`; its unique project-monotone sequence, canonical hash and relational completeness MUST revalidate successfully.
- **FR-002**: Draft/proposed understandings, R36W `CANDIDATE_UNCONFIRMED` rows outside a confirmed R36X snapshot, rejected candidates and unresolved contradictions MUST NOT be presented as project truth.
- **FR-003**: Recall MUST support a closed deterministic question registry for summary, scope, important people, important dates, blockers, next decision, reviewed source inventory and resolved contradiction history.
- **FR-004**: Unknown, ambiguous, semantic, binary-dependent or provider-dependent questions MUST return a truthful clarification/limitation rather than an invented answer.
- **FR-005**: Every recalled assertion MUST include a citation chain through the R36X confirmed snapshot and disposition/resolution/confirmation decision to its R36W candidate and R36V snapshot/source where applicable.
- **FR-006**: Owner-authored resolution text MUST be labelled `OWNER_RESOLUTION`; source metadata MUST remain labelled metadata and MUST NOT become a job fact.
- **FR-007**: Every recall/preparation/read MUST recheck authenticated identity, active membership, role, workspace, project and memory/contact/action ownership at the point of use.
- **FR-008**: The mobile unified assistant MUST resolve project and exact current sequence/pointer from navigation/session context without asking the user to copy technical identifiers.
- **FR-009**: R36Y MAY prepare only existing local families: `OPEN_LOOP_EVIDENCE_REQUEST`, `SMS_MMS`, `VOICE_CALL` and `EMAIL`; it MUST NOT introduce a new executor or capability family.
- **FR-010**: Action preparation MUST require an explicit same-project authorized recipient/contact, explicit user-authored body/script and subject where required, plus the exact current `confirmedUnderstandingSequence` and confirmed-memory hash.
- **FR-011**: Preparation MUST delegate to the existing family policy/contract and produce exactly `PREPARED_UNSENT`; it MUST NOT approve, send, schedule delivery, choose a provider or broaden the recipient.
- **FR-012**: The prepared projection MUST expose recipient, channel, complete frozen body/script/subject, family, version, payload fingerprint, memory citations, required approving role and `approvalRequired: true`.
- **FR-013**: Approval MUST remain a separate existing family-specific command against the exact prepared version/fingerprint; R36Y preparation itself MUST return `approvalPerformed: false`.
- **FR-014**: Missing/ambiguous recipient or memory, insufficient role, unsupported family, unavailable cited fact and unresolved/binary-dependent content MUST clarify/refuse with zero prepared action.
- **FR-015**: Commands/results MUST use strict versioned schemas, stable command IDs and body-bound hashes; unknown fields and command-ID body drift MUST refuse.
- **FR-016**: Exact replay and concurrent exact requests MUST converge on one answer receipt or prepared action/decision/audit effect.
- **FR-017**: A new confirmed understanding advances the project current pointer/sequence and requires a new command/version bound to its exact sequence and hash for new answers/actions; historical exact replay retains original meaning.
- **FR-018**: Recall receipts, action-memory citations and preparation decisions MUST be immutable, append-only and recoverable after restart.
- **FR-019**: Database/service guards MUST enforce reciprocal tenant/project/memory/candidate/source/decision/contact/action binding and prohibit citation chains to unconfirmed or mismatched state.
- **FR-020**: Read paths MUST recompute/validate canonical memory and payload hashes plus citation completeness; corrupt state MUST fail closed without partial truth or action.
- **FR-021**: Cross-workspace, cross-project, unauthorized-role, inactive, nonexistent, stale-memory, replay-conflict and raw-SQL bypass attempts MUST expose zero protected fields and create zero canonical effects.
- **FR-022**: Audit MUST retain redacted command/memory/action fingerprints, versions and outcome without question text, answer content, message body, recipient details, source metadata, bytes or secrets.
- **FR-023**: R36Y MUST NOT read binary bytes, perform OCR/transcription/vision/document parsing, call an AI/provider, access credentials or create external transport/write/spend.
- **FR-024**: Every result MUST state `providerExecutionPerformed: false`, `binaryUnderstandingPerformed: false`, `externalTransportPerformed: false`, `externalWritePerformed: false`, `approvalPerformed: false` and `automaticResolutionPerformed: false`.
- **FR-025**: Validation MUST use synthetic data only and preserve existing family approval/provider boundaries unchanged.

### Authorization and Tenancy

- OWNER and OFFICE_MANAGER may recall confirmed project memory and prepare only families permitted by their existing policy.
- FIELD_WORKER may receive only already-authorized non-sensitive assistant projections; Project Brain truth/citations and outbound preparation are denied unless an existing stricter policy explicitly permits the exact operation. R36Y grants no new role authority.
- All context/contact/memory resolution is server authoritative; mobile routing is not authorization.

### Data Classification and Retention

- Recalled assertions and prepared bodies are project operational data and remain local.
- Prepared payload and citations are frozen for that action version; changing either creates a new version and separate approval.
- Audit excludes raw content and identities; immutable domain records retain complete provenance.
- Only synthetic fixtures are permitted during R36Y validation.

### Failure and Exception States

- `ANSWERED_FROM_CONFIRMED_MEMORY`: deterministic supported answer with citations.
- `PREPARED_UNSENT`: inspectable action with separate approval required and zero delivery.
- `CLARIFICATION_REQUIRED`: ambiguous project, recipient, question or requested content.
- `LIMITATION`: binary/provider/unsupported reasoning is unavailable.
- `REFUSED`: authorization, policy, provenance or strict-contract failure.
- `CONFLICT`: command-body drift, stale memory/action version or concurrency mismatch.
- `CORRUPT_SOURCE`: memory/hash/citation chain cannot be proven; no partial truth/action returned.

### Economics

- Provider and external-transport spend ceilings are zero.
- Customer price, willingness to pay, production inference cost and contribution margin remain **UNKNOWN**.
- Local deterministic responses are development evidence only.

### Verification, Delivery, Observability, Rollout and Rollback

- Verification uses strict registry/contract tests, existing-family delegation tests, mobile tests, real disposable PostgreSQL replay/concurrency/restart/raw-SQL tests and binary/provider/external-effect sentinels.
- Delivery is local code only; no provider, founder, customer, Preview, Production, deployment or store action.
- Observability reconstructs selected confirmed memory, citations, policy and preparation outcome without logging content.
- R36Z owns the later credential-free local whole-chain gate; provider and observed releases remain separately authorized.
- Rollback is code rollback plus disposal of the test database; existing R36V–R36X and prepared-action meanings remain unchanged.

### Key Entities

- **Project Memory Recall Receipt**: Immutable body-bound result for one supported question against one exact confirmed understanding.
- **Project Memory Citation**: Immutable ordered link from an answer/prepared action to R36X decision/snapshot and underlying R36W/R36V provenance.
- **Project-Memory Prepared Action Binding**: Immutable association between one existing prepared-action version and the exact confirmed understanding/citations used.
- **Assistant Memory Decision**: Append-only accepted, replayed, clarified or eligible refused command outcome.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of supported answers are reproducible from the exact valid R36X project current sequence/pointer and include complete citation chains.
- **SC-002**: Zero draft/proposed understanding, free R36W candidate, rejected candidate or unresolved contradiction is represented as project truth.
- **SC-003**: Every prepared action belongs to one of four existing families and is exactly `PREPARED_UNSENT` with visible recipient, channel, frozen content, citations and approval requirement.
- **SC-004**: Approval, delivery, provider execution, binary understanding, external transport/write, credential access and spend remain exactly zero during recall/preparation.
- **SC-005**: Exact/concurrent replay creates zero duplicate receipts, prepared actions, decisions, bindings, citations or audits.
- **SC-006**: Stale/body-drifted/cross-workspace/project/role attempts reveal zero protected fields and create zero canonical effects.
- **SC-007**: Recall and prepared-action projections, including the exact current sequence/pointer, are byte-equivalent after a clean server/mobile restart; concurrent confirmations cannot produce duplicate sequence or an ambiguous current understanding.
- **SC-008**: Raw-SQL attempts to cite unconfirmed/mismatched memory, candidate, source, contact or prepared action are refused at commit.
- **SC-009**: A user can open the unified assistant from a project, recall memory and prepare an action without copying any technical identifier.
- **SC-010**: Binary/provider-dependent questions always expose a truthful limitation and create zero fabricated assertion or prepared action.

## Assumptions

- R36X exact confirmed snapshots and R36W/R36V provenance chains are complete before implementation.
- Existing evidence-request, SMS/MMS, voice-call and email preparation/approval contracts remain authoritative.
- R36Y uses deterministic closed question/action routing; broad natural-language model interpretation remains unavailable.
- R36Z, not R36Y, proves the complete local intake-to-assistant chain.
