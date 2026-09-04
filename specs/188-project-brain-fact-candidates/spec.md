# Feature Specification: Project Brain Fact Candidates

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Draft ready for implementation

**Input**: `Deterministic local adapters create provenance-bound fact candidates only from explicitly supported text and metadata while binary understanding remains unavailable.`

## Problem Statement and Evidence

R36V can retain an owner-confirmed project intake, exact source inventory and truthful binary limitations, but it intentionally does not produce reviewable fact candidates. R36W must add that intermediate layer without pretending that a filename, photo, document or voice note has been understood. The target denominator is confirmed R36V project-brain intakes containing explicitly supported owner text or admitted-source metadata. Demand, customer value and willingness to pay remain **UNKNOWN**. This release is selected from the canonical backlog contract and local implementation evidence only; it is not customer validation.

## User Scenarios & Testing

### User Story 1 - Generate explicit local candidates (Priority: P1)

As an authorized construction owner, I ask ENDVERA to prepare review candidates from one exact confirmed project-brain intake, and receive only verbatim supported owner-text fields and canonical admitted-source metadata.

**Why this priority**: It creates the narrow bridge between confirmed intake and later owner review while preserving the truth boundary.

**Independent Test**: From one synthetic confirmed R36V intake, generate candidates and verify that every emitted value is an exact copy of an allowlisted field, every text candidate carries a half-open source range, every metadata candidate names its canonical field, and no binary byte is opened or interpreted.

**Acceptance Scenarios**:

1. **Given** the latest confirmed intake and an authorized OWNER or OFFICE_MANAGER, **When** the exact generation command runs, **Then** deterministic registered adapters create only allowlisted `OWNER_TEXT` and `SOURCE_METADATA` candidates.
2. **Given** an owner-text candidate, **When** its provenance is inspected, **Then** its value equals the exact UTF-16 code-unit range `[start, end)` in the named confirmed owner-brief field.
3. **Given** a source-metadata candidate, **When** its provenance is inspected, **Then** its value equals the named immutable field on the same admitted source and includes that source's identity, ordinal and content hash.
4. **Given** a photo, PDF, DOCX or voice note, **When** candidates are generated, **Then** no OCR, transcription, image classification, document parsing or binary-content fact is produced.
5. **Given** an unsupported adapter, field, candidate kind, confidence class or unknown command member, **When** generation is requested, **Then** the request is refused before a canonical effect.

---

### User Story 2 - Retry safely without duplicate meaning (Priority: P1)

As the owner, I can retry a lost or concurrent request and still get one stable candidate set tied to the same confirmed intake.

**Why this priority**: Candidate duplication or drift would make later conflict review unreliable.

**Independent Test**: Replay and concurrently submit the exact body-bound command, then verify one batch, one candidate per deterministic fingerprint and byte-equivalent results; reuse the command ID with changed content and verify refusal.

**Acceptance Scenarios**:

1. **Given** an exact completed command, **When** it is replayed, **Then** ENDVERA returns the retained result and creates zero additional candidates or audits.
2. **Given** concurrent exact requests, **When** they race, **Then** they converge on one canonical batch and candidate set.
3. **Given** a reused command ID with a different intake, fingerprint, adapter version or body, **When** it is submitted, **Then** ENDVERA returns a conflict without changing retained state.
4. **Given** the confirmed intake changes by creation of a later version, **When** the older command is replayed, **Then** its historical result retains its original meaning; a new generation requires a new command bound to the new confirmed snapshot.

---

### User Story 3 - Inspect unconfirmed provenance safely (Priority: P2)

As an authorized owner, I can retrieve the generated candidates and see exactly why each exists, while ENDVERA makes clear that none is confirmed project knowledge yet.

**Why this priority**: R36X can only provide a trustworthy review if R36W exposes complete provenance and never upgrades candidates silently.

**Independent Test**: Retrieve candidates as an authorized owner, then as a field worker and another workspace. Verify complete provenance for the owner, a non-enumerating refusal for unauthorized contexts, and `CANDIDATE_UNCONFIRMED` for every candidate.

**Acceptance Scenarios**:

1. **Given** a generated batch, **When** an authorized OWNER or OFFICE_MANAGER reads it, **Then** every candidate exposes kind, exact value, non-probabilistic confidence class, provenance and immutable source binding.
2. **Given** any candidate in R36W, **When** its status is read, **Then** it is exactly `CANDIDATE_UNCONFIRMED`; R36W exposes no confirm, resolve or promote operation.
3. **Given** a FIELD_WORKER, inactive membership, wrong workspace or wrong project, **When** the batch is requested, **Then** no candidate, source metadata or resource existence is disclosed.
4. **Given** a question requiring binary understanding, **When** the projection is read, **Then** the existing not-transcribed/not-interpreted limitations remain visible and unchanged.

### Edge Cases

- Empty allowlisted text fields emit no candidate and do not shift ranges in another field.
- Unicode, combining marks and emoji use explicit JavaScript/TypeScript UTF-16 code-unit half-open ranges; reconstruction must remain exact.
- Repeated identical text in two owner fields yields two candidates because provenance fields differ.
- Two admitted sources with identical bytes retain distinct source provenance and ordinals even when they share one canonical `File`.
- Metadata is copied from retained source rows, never from a request, filename heuristic or client-provided replacement.
- A confirmed snapshot whose relational/hash guard fails is treated as corrupt and produces no candidate.
- A batch either persists completely with its candidate set and decision receipt or has no canonical effect.
- Unknown persisted candidate values, missing provenance, out-of-range spans or metadata mismatch fail closed on read.

## Requirements

### Functional Requirements

- **FR-001**: R36W MUST operate only on an existing `CONFIRMED` R36V intake and its exact immutable confirmed snapshot.
- **FR-002**: Creation and reads MUST recheck authenticated identity, active membership, OWNER or OFFICE_MANAGER role, workspace and project at the point of use.
- **FR-003**: Generation commands MUST be strict, versioned, body-bound and idempotent; unknown fields and command-ID body drift MUST be refused.
- **FR-004**: The initial closed adapter registry MUST contain only `OWNER_BRIEF_FIELDS_V1` and `ADMITTED_SOURCE_METADATA_V1`; an unregistered adapter MUST NOT execute.
- **FR-005**: `OWNER_BRIEF_FIELDS_V1` MUST emit only non-empty values copied verbatim from the allowlisted fields `summary`, `scope`, `importantPeople`, `importantDates`, `blockers` and `nextDecision` in the confirmed snapshot.
- **FR-006**: Every owner-text candidate MUST retain confirmed snapshot identity/hash, JSON field path, exact UTF-16 half-open range, exact copied value and deterministic candidate fingerprint.
- **FR-007**: `ADMITTED_SOURCE_METADATA_V1` MUST emit only allowlisted canonical source fields: `kind`, `displayName`, `mimeType`, `sizeBytes`, optional `durationMs`, `ordinal` and `contentHash`.
- **FR-008**: Every metadata candidate MUST retain intake/source identity, source ordinal, content hash, metadata field name, exact copied value and deterministic candidate fingerprint.
- **FR-009**: Confidence MUST be an explicit non-probabilistic enum: `EXACT_OWNER_TEXT` for verbatim ranges or `EXACT_CANONICAL_METADATA` for retained metadata. R36W MUST NOT generate a score, likelihood or semantic certainty claim.
- **FR-010**: Every candidate MUST remain `CANDIDATE_UNCONFIRMED`; this release MUST NOT confirm, resolve, merge, rank, promote or use a candidate as canonical assistant memory.
- **FR-011**: R36W MUST NOT read binary source bytes or invoke OCR, transcription, vision, document parsing, an AI/model provider, messaging, external transport or external write.
- **FR-012**: Filenames, extensions, MIME types, sizes, durations and ordinals MAY be represented only as metadata about a source and MUST NOT be interpreted as facts about the job.
- **FR-013**: A candidate fingerprint MUST bind schema/adapter version, workspace, project, intake, confirmed snapshot hash, kind, exact value and complete provenance so equal values with different provenance remain distinct.
- **FR-014**: Exact replay and concurrent exact requests MUST converge on one batch and one instance of each candidate fingerprint; command-ID reuse with any body change MUST conflict.
- **FR-015**: Batch, candidate and decision records MUST be immutable, append-only, tenant-bound and created atomically.
- **FR-016**: Database constraints or deferred guards MUST back workspace/project/intake/snapshot/source reciprocity, source-metadata equality, range validity, candidate status/confidence pairing and append-only history.
- **FR-017**: Read projections MUST reconstruct and validate text ranges and metadata against canonical retained rows; corrupt or mismatched candidate state MUST fail closed rather than be displayed.
- **FR-018**: Cross-workspace, cross-project, inactive-role, nonexistent-target, stale-snapshot and replay-conflict requests MUST create zero candidate effects and reveal zero protected fields.
- **FR-019**: Eligible accepted/refused/replayed commands MUST retain redacted, idempotent audit evidence without owner text, candidate values, source names, raw metadata, bytes or secrets.
- **FR-020**: All results MUST state `providerExecutionPerformed: false`, `binaryUnderstandingPerformed: false`, `externalTransportPerformed: false`, `externalWritePerformed: false` and `automaticConfirmationPerformed: false`.
- **FR-021**: R36W MUST preserve the R36V limitation states and historical meaning; no R36V row may be reinterpreted or mutated.
- **FR-022**: Validation MUST use synthetic data only and include strict contract, authorization, replay/concurrency, corruption, migration, restart and zero-provider/binary-read tests.

### Authorization and Tenancy

- OWNER and OFFICE_MANAGER may generate and inspect candidates for a confirmed intake in their active workspace.
- FIELD_WORKER and all other roles receive a non-enumerating refusal and no candidate projection.
- The server-side transaction is authoritative; IDs, metadata and adapter selection supplied by a client are never trusted as authorization or provenance.

### Data Classification and Retention

- Candidate values are project operational data derived by exact copy from already retained text/metadata. They never enter a provider prompt in R36W.
- Candidate history is append-only and remains bound to the originating immutable confirmed snapshot.
- Audit records contain hashes, identifiers, adapter version and outcome only; they exclude copied values and sensitive source metadata.
- Only synthetic fixtures are allowed during implementation and validation.

### Failure and Exception States

- `REFUSED`: authorization, registry, provenance, corruption or policy precondition fails; no canonical effect.
- `CONFLICT`: command-body reuse, stale confirmed-snapshot identity or concurrent version mismatch.
- `OUTCOME_UNKNOWN`: caller may retry only the exact same command.
- `CORRUPT_SOURCE`: retained candidate cannot be proven against its confirmed text or canonical metadata; nothing is returned as trusted.
- Binary understanding remains `NOT_REQUESTED_LOCAL_ONLY`; it is an explicit limitation, not an extraction failure.

### Economics

- Provider and external-transport cost ceiling is exactly zero.
- Customer price, willingness to pay, production storage cost and contribution margin remain **UNKNOWN**.
- Local deterministic computation is development evidence, not demonstrated production economics.

### Verification, Delivery, Observability, Rollout and Rollback

- Verification requires pure adapter/contract tests, real disposable PostgreSQL tests, raw-SQL bypass tests, concurrency/replay, restart, authorization and provider/binary-read sentinels.
- Delivery is a local implementation only; it is not a provider, founder, customer, Preview, Production, deployment or store release.
- Observability records command/batch/candidate fingerprints and redacted outcomes without candidate values or source bytes.
- Rollout remains externally disabled. R36X owns inspection, contradiction resolution and exact owner sealing; R36Y owns confirmed assistant memory.
- Rollback is code rollback plus disposal of the test database. Any future schema work is additive and forward-only; historical R36V and R36W meaning must remain unchanged.

### Key Entities

- **Fact Candidate Batch**: One immutable, body-bound generation result for one exact confirmed intake and adapter-set version.
- **Project Brain Fact Candidate**: One immutable unconfirmed exact-copy value with candidate kind, confidence class and complete text-range or source-metadata provenance.
- **Fact Candidate Decision**: One append-only generation/replay/refusal receipt that makes command outcome reconstructible without retaining raw values in audit.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of emitted owner-text candidates reconstruct byte-for-byte as JavaScript strings from their named confirmed field and UTF-16 `[start, end)` range.
- **SC-002**: 100% of emitted metadata candidates equal the same named field on the bound admitted source; no request-supplied replacement is accepted.
- **SC-003**: Every candidate is `CANDIDATE_UNCONFIRMED` and uses exactly one permitted non-probabilistic confidence class.
- **SC-004**: Exact and concurrent replay creates zero duplicate batches, candidates, decisions or audit effects.
- **SC-005**: Cross-workspace, cross-project, unauthorized-role and stale-snapshot attempts expose zero protected candidate or source fields and create zero candidate effects.
- **SC-006**: Binary reads, OCR, transcription, vision, document parsing, provider calls, credential reads, external transport, external writes, spend and automatic confirmations remain exactly zero.
- **SC-007**: The retained candidate projection is byte-equivalent before and after a clean server/database-client restart.
- **SC-008**: Raw-SQL attempts to forge confirmed binding, ranges, metadata, status/confidence pairs or cross-tenant provenance are refused at transaction commit.
- **SC-009**: Every accepted batch is all-or-nothing and reconstructible from redacted local evidence without logging copied values or bytes.
- **SC-010**: R36V confirmed memory and binary limitation projections remain unchanged by R36W generation.

## Assumptions

- R36V's confirmed intake, relational provenance, canonical hashing and immutable-source guards are complete before R36W implementation begins.
- Initial text candidates represent complete allowlisted owner-brief field values; semantic segmentation and entity extraction are outside R36W.
- R36X, not R36W, will let an owner review contradictions and confirm or reject facts.
- No new dependency is necessary for deterministic exact-copy adapters.
