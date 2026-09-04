# Feature Specification: Project Brain Intake

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Accepted for autonomous local implementation

**Input**: Olivier wants a serious construction assistant where an owner can empty the useful material and context for a job into one place, explain the job naturally, and later rely on ENDVERA's persistent project memory. This first release establishes the truthful local foundation without pretending that unavailable AI providers have transcribed or interpreted binary content.

## Problem Statement and Evidence

Small construction owners often hold the working context for a job across their head, phone, photos, plans, estimates and conversations. The target denominator is owner-operated and small construction businesses managing active jobs with this fragmented context. The exact prevalence, willingness to pay and reachable market size remain **UNKNOWN**; no client or market validation is claimed by this release. The feature is selected from Olivier's direct founder workflow description on 2026-09-03 and from a code audit showing that ENDVERA already admits individual evidence and voice files but does not yet offer one durable project-intake packet or an owner-confirmed project understanding.

## User Scenarios & Testing

### User Story 1 - Empty a job into one intake (Priority: P1)

As a construction owner, I choose one job, add several documents or photos, attach one voice note, and write the context I want ENDVERA to remember without having to classify every source before adding it.

**Why this priority**: This is the shortest path from fragmented job material to a usable project brain and removes the current one-file, one-open-loop burden.

**Independent Test**: On a synthetic local job, select at least three allowed files plus one voice note, provide an owner brief, submit the packet, close and reopen the client, and recover the same packet with the same source inventory and hashes.

**Acceptance Scenarios**:

1. **Given** an authorized owner and a project in that owner's workspace, **When** the owner creates an intake and adds multiple allowed sources, **Then** every admitted source is associated only with that project and retains its type, size, immutable content hash and position.
2. **Given** the local-only authority boundary, **When** a voice note or document is admitted, **Then** the surface explicitly says that the voice was not transcribed and the document content was not interpreted.
3. **Given** an interrupted or retried source admission, **When** the exact command is replayed, **Then** ENDVERA returns the original canonical effect without adding a duplicate.
4. **Given** a mismatched workspace, project, role, content type, size, command body or stale version, **When** admission is attempted, **Then** ENDVERA refuses it without changing the intake.
5. **Given** two distinct selections whose bytes are identical, **When** each is admitted with its own command identity, **Then** ENDVERA retains two ordered source/provenance records and two body-bound decisions while reusing one canonical file/blob; replaying either command creates nothing new.
6. **Given** an M4A voice note, **When** it is admitted, **Then** the server verifies a structurally coherent AAC track, codec configuration, sample-to-chunk map and sample-timeline duration, rejects malformed, over-120-second or materially mismatched declarations, and persists that derived duration rather than trusting the caller. This release does not claim perceptual AAC decoding.

---

### User Story 2 - Review and confirm exact project memory (Priority: P1)

As the owner, I review the material inventory and my own written briefing, see the limitations, then confirm the exact version that ENDVERA may use as project memory.

**Why this priority**: A project brain is only trustworthy if uncertain or unavailable interpretation cannot silently become a canonical fact.

**Independent Test**: Submit a complete intake, capture its review fingerprint, confirm that exact fingerprint at the exact state version, and verify an immutable confirmed snapshot plus decision record created atomically.

**Acceptance Scenarios**:

1. **Given** a packet with admitted sources and a non-empty owner brief, **When** the owner submits it for review, **Then** ENDVERA creates a deterministic proposed understanding with explicit source limitations and no binary-content facts.
2. **Given** a current proposed understanding, **When** the authorized owner confirms its exact fingerprint, **Then** ENDVERA creates one immutable confirmed snapshot and one decision in the same atomic transition.
3. **Given** a stale version, changed source inventory, wrong fingerprint or unauthorized role, **When** confirmation is attempted, **Then** no snapshot is confirmed and the user receives a safe conflict or refusal.
4. **Given** a previously confirmed packet, **When** the exact confirmation command is replayed, **Then** no second snapshot, decision or canonical effect is created.

---

### User Story 3 - Ask ENDVERA what the owner confirmed (Priority: P2)

As the owner, I later ask a narrow question about the job and receive an answer from the latest confirmed project memory, with clear provenance and limitations.

**Why this priority**: The value is not storing files; it is recovering useful context without rebuilding it manually.

**Independent Test**: After restarting the process, ask for the job summary, blockers, next decision and source inventory; verify exact answers from the confirmed snapshot and refusal to claim knowledge of unexamined binary content.

**Acceptance Scenarios**:

1. **Given** a confirmed snapshot, **When** the owner asks for the summary, blockers or next decision, **Then** the answer uses only owner-confirmed text and identifies that provenance.
2. **Given** only a draft packet, **When** the same questions are asked, **Then** the draft is not used as canonical project memory.
3. **Given** a question whose answer would require reading a file or transcribing audio, **When** no authorized provider result exists, **Then** ENDVERA states that the source is linked but its content has not been analyzed.
4. **Given** a user from another workspace, **When** project memory is requested, **Then** no existence, content or metadata is disclosed.

### Edge Cases

- Two independent selections with identical bytes remain two ordered source/provenance records and two body-bound admission decisions, but share one canonical `File` row and one local blob; an exact retry of either command remains one effect.
- A source upload and review submission racing each other cannot produce a snapshot with a partially observed source set.
- A storage write followed by a failed database transaction is compensated when the outcome is known; stale temporary or unreferenced local objects left by a crash are reconciled only after a 24-hour grace period.
- A process restart during a ready, review or confirmed state preserves the exact latest committed version and decision history.
- A filename, file extension or audio duration is never interpreted as evidence about the job.
- An admitted source is immutable. Correcting accepted input requires rejecting or closing that packet and creating a new intake version; no command in this release removes, replaces or mutates a confirmed historical source.
- Unknown command fields, unsupported media, malformed M4A containers and oversized content fail closed; a JSON command is capped at 64 KiB even when `Content-Length` is absent.
- Opening project A after a crash cannot delete or refuse the durable pending source queued for project B; cleanup reasons about the complete durable mobile queue before projecting the active project.

## Requirements

### Functional Requirements

- **FR-001**: ENDVERA MUST let an authorized OWNER or OFFICE_MANAGER create one versioned project-intake packet for a project in the same workspace.
- **FR-002**: ENDVERA MUST support several JPEG, PNG, PDF or DOCX sources and one M4A-compatible voice-note source in the same intake through individually retryable admissions.
- **FR-003**: Every accepted source MUST retain immutable bytes through the existing secure file boundary, a content hash, source kind, display metadata, ordinal, actor and project/workspace association. The source-to-`File` relation MUST be restrictive so a relational delete or generic orphan sweep cannot detach retained provenance from its bytes.
- **FR-004**: Source admission MUST recheck identity, active membership, role, workspace, project ownership, current intake state and current version at the point of use.
- **FR-005**: Commands MUST be strict, typed, versioned, idempotent and body-bound; unknown fields or reuse of an identifier with different content MUST be refused.
- **FR-006**: The owner brief MUST separately capture a summary, scope, important people, important dates, blockers and next decision as explicit owner-provided assertions.
- **FR-007**: This release MUST NOT create a transcript, OCR result, image interpretation, document fact, inferred date, inferred amount or inferred contact from binary content.
- **FR-008**: Every surface and projection MUST label voice notes as not transcribed and documents/photos as not interpreted under the local-only boundary.
- **FR-009**: Submitting for review MUST require at least one admitted source and a non-empty owner brief, use the complete current source set, and produce a deterministic fingerprint.
- **FR-010**: Exact confirmation MUST require the current version, exact fingerprint and an authorized OWNER or OFFICE_MANAGER.
- **FR-011**: A confirmed understanding snapshot and its decision record MUST be immutable, append-only and created atomically with the intake transition.
- **FR-012**: Confirmed snapshots MUST distinguish `OWNER_CONFIRMED` assertions from mere source-presence observations and list all unperformed interpretation capabilities. `OWNER_CONFIRMED` labels the owner-authored assertion; only a snapshot whose independent status is `CONFIRMED` may become canonical memory.
- **FR-013**: ENDVERA MUST recover the same intake, source inventory, latest state, snapshots and decisions after process restart.
- **FR-014**: Narrow project-memory questions MUST use only the latest confirmed snapshot and MUST expose provenance and limitations.
- **FR-015**: Draft or review-only content MUST NOT be presented as canonical memory or used to support consequential actions.
- **FR-016**: All cross-workspace, cross-project, unauthorized-role, replay-conflict and stale-version operations MUST fail without revealing protected content.
- **FR-017**: No command in this release may call an AI provider, transcription provider, OCR service, messaging provider or external transport, and all results MUST report those effects as false.
- **FR-018**: The mobile experience MUST present project selection, multiple-source queue, voice note, owner brief, review, limitations and confirmation as one coherent surface reachable from the project.
- **FR-019**: Partial upload failures MUST remain individually retryable with the same command identity and MUST NOT discard successfully admitted sources.
- **FR-020**: Audit evidence MUST make creation, admissions, review, confirmation, stable replay and eligible refusal history reconstructible without logging source bytes, owner text or secrets. A refusal audit is eligible only after the command envelope is valid and the actor is re-authorized for the referenced workspace/project; malformed, unauthenticated, unauthorized, cross-workspace or nonexistent-target requests MUST NOT create a target audit or change their original non-enumerating outcome.
- **FR-021**: An authorized OWNER or OFFICE_MANAGER MUST be able to retrieve an admitted source only through a project-scoped local read boundary that rechecks authorization, validates actual bytes against both source and `File` size/hash/MIME metadata, returns private no-store content with its SHA-256, and appends a download access-log row.
- **FR-022**: Generic file cleanup MUST exclude every `File` referenced by a project-brain source. Local crash reconciliation MAY delete only stale temporary, unreferenced object or unreferenced `File` material older than 24 hours and MUST never delete a referenced source blob.
- **FR-023**: The JSON command route MUST stream-enforce a 64 KiB body limit regardless of whether `Content-Length` is present; invalid length declarations, malformed JSON and unknown fields MUST fail before a domain command is invoked.
- **FR-024**: M4A admission MUST verify a supported, structurally coherent AAC track and duration from bounded server-side codec/container/sample-table metadata, reject duration above 120 seconds or a material declared/derived mismatch, and persist the derived duration. It MUST NOT label this structural validation as perceptual decoding of the AAC access units.
- **FR-025**: The mobile intent queue MUST durably retain pending commands and their copied source files across process interruption. Reconciliation MUST inspect the global queue across all workspace/project contexts, preserve every globally retained source, and treat a missing source as actionable only when its project context is opened.
- **FR-026**: Two independently selected sources with identical bytes MUST remain two source identities and two body-bound admission decisions in ordinal order while sharing one canonical `File` row and one local object. Exact replay of either command MUST return its original effect and MUST NOT create another source, decision, `File`, object or audit effect.
- **FR-027**: Multipart source admission MUST cap concurrent in-memory admissions per authenticated user before consuming an excess request body and MUST release capacity on every success or failure path.

### Authorization and Tenancy

- OWNER and OFFICE_MANAGER may create, edit, submit and confirm an intake for their own workspace project.
- FIELD_WORKER cannot create or confirm canonical project memory in this release and receives no financial or cross-workspace fields through this feature.
- Server-side data access is authoritative; client routing and hidden controls are never treated as authorization.

### Data Classification and Retention

- Source bytes are classified as project evidence and use the local signature/sanitization, access-log and retention boundary. A restrictive `File` relationship and explicit generic-sweep exclusion retain referenced bytes; local crash reconciliation removes only stale unreferenced material after the 24-hour grace period.
- Owner brief and snapshots are project operational data. They never enter provider prompts in this release.
- Synthetic fixtures are the only permitted validation material for this release.

### Failure and Exception States

- `REFUSED`: authorization, media, body, workspace or policy precondition failed; no canonical effect.
- `CONFLICT`: current version or fingerprint differs from the command; caller must refresh.
- `OUTCOME_UNKNOWN`: caller lost the local response and may retry only the exact same command.
- `PARTIAL`: one or more independently submitted sources failed while prior admitted sources remain durable.
- Provider or interpretation unavailability is a declared limitation, not an error and not a fabricated result.
- Malformed or unauthorized requests fail before refusal-audit creation; authenticated, authorized and in-scope state/media refusals may create one redacted, idempotent audit event without changing the refusal.

### Economics

- Provider cost ceiling is zero because provider execution is forbidden.
- This release has no customer price or demonstrated margin. Willingness to pay and contribution margin are **UNKNOWN**.
- Local storage and engineering effort are development costs only and MUST NOT be reported as production unit economics.

### Verification, Delivery, Observability, Rollout and Rollback

- Verification uses strict contract tests, synthetic source fixtures, real disposable PostgreSQL integration tests, concurrency/replay/restart tests, canonical-blob reuse, authorized source retrieval/access logging, retention/sweep recovery, global cross-project mobile queue tests and provider-boundary assertions.
- Delivery is a local committed implementation only. It is not a client release, preview, production deployment, store build or provider-enabled capability.
- Observability records command hashes, state versions, source hashes, decisions and audit events; it excludes raw bytes, secrets and cross-tenant content.
- Rollout remains disabled externally. A later provider release must introduce separately authorized capability contracts rather than silently changing local-only meanings.
- Rollback is code rollback plus removal of the disposable local database. Forward-only migrations are additive, and confirmed historical snapshots retain their original meaning.

### Key Entities

- **Project Intake Packet**: Versioned container tying one project, owner brief, source inventory, current state and command history together.
- **Project Intake Source**: One securely admitted file or voice note with immutable identity, metadata, hash, ordinal and explicit interpretation limitations.
- **Project Understanding Snapshot**: Append-only deterministic representation of owner-confirmed assertions, source inventory, provenance and limitations at one version.
- **Project Brain Decision**: Append-only record of submit, confirm or reject decisions and the exact state/fingerprint transition authorized by an actor.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An authorized owner can assemble one packet containing at least four sources and an owner brief from a single project surface without copying a technical identifier.
- **SC-002**: 100% of admitted synthetic sources in the acceptance run are associated with the intended workspace and project; cross-workspace and cross-project attempts expose zero protected fields.
- **SC-003**: Exact replay creates zero duplicate intakes, sources, snapshots, decisions or audit effects, including under concurrent attempts.
- **SC-004**: The confirmed project memory is byte-equivalent before and after a clean process restart.
- **SC-005**: 100% of project-memory answers in the acceptance set come only from owner-confirmed fields, with zero invented facts from filenames, documents, photos or audio.
- **SC-006**: Every binary source visibly retains an unambiguous not-transcribed or not-interpreted limitation until a future separately authorized capability produces evidence.
- **SC-007**: Source admission, decision, snapshot and state transitions remain reconstructible from retained local audit evidence.
- **SC-008**: Provider calls, external transports, external writes, customer data, credential reads and external spend remain exactly zero.
- **SC-009**: Two distinct identical-byte selections yield exactly two ordered sources and two decisions but exactly one `File` row and one canonical local object; each exact replay adds zero effects.
- **SC-010**: 100% of accepted source downloads in the acceptance run match retained size, MIME and SHA-256, append one authorized access record, and expose zero bytes to a different workspace.
- **SC-011**: A crash-recovery run preserves every referenced server blob and every globally queued mobile source across projects while deleting eligible stale unreferenced or temporary material only after 24 hours.
- **SC-012**: Every admitted M4A fixture has a server-verified structurally coherent AAC track and derived sample-timeline duration at or below 120 seconds; malformed, oversized and materially drifted declarations produce zero canonical source effects, without a claim that the raw AAC signal was perceptually decoded.
- **SC-013**: A third concurrent source admission for one authenticated user is refused before its multipart body is consumed while the two bounded active admissions complete and release their slots.

## Assumptions

- Existing authentication, workspace membership, secure file admission, storage and audit primitives remain authoritative and are extended incrementally.
- A selected project already exists; general project creation remains outside this feature.
- Multi-select on mobile is implemented as a local queue of individually idempotent source uploads.
- The current voice recording duration may remain bounded by the existing safe local limit in the first vertical; a ten-minute/background recording increase requires its own measured storage and lifecycle gate.
- Real transcription, OCR, vision, plan reading and model routing are later releases with separate provider, cost, privacy, retention and verification authority.
