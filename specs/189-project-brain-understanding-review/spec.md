# Feature Specification: Project Brain Understanding Review

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Draft ready for implementation

**Input**: The owner inspects sources, contradictions and candidate facts, resolves conflicts, and seals an exact immutable understanding without invented claims.

## Problem Statement and Evidence

R36V retains one exact owner-confirmed intake and immutable source inventory. R36W turns only supported text and canonical metadata into provenance-bound unconfirmed candidates. Neither release lets an owner review candidate meaning, preserve conflicts, record explicit dispositions or seal the exact understanding that a later assistant may use. R36X must provide that human authority boundary without silently resolving contradictions or interpreting binary content. The target denominator is authorized owners and office managers reviewing synthetic R36W candidate batches. Customer demand, usability, willingness to pay and production value remain **UNKNOWN**.

## User Scenarios & Testing

### User Story 1 - Inspect one complete review packet (Priority: P1)

As an authorized owner, I open one clear mobile surface and inspect the exact source inventory, all unconfirmed candidates, their provenance, limitations and any declared contradictions without copying technical identifiers.

**Why this priority**: A trustworthy decision requires seeing the complete evidence and uncertainty before accepting any fact.

**Independent Test**: Open a synthetic R36W batch from its project, verify every candidate and source is present with human-readable provenance, and verify a field worker or another workspace receives no protected projection.

**Acceptance Scenarios**:

1. **Given** an authorized OWNER or OFFICE_MANAGER and one current R36W batch, **When** the review surface opens from the project, **Then** it resolves project, intake, snapshot, batch, sources and candidates server-side without requiring an identifier to be copied.
2. **Given** an owner-text or source-metadata candidate, **When** it is inspected, **Then** the exact candidate value, confidence class, source field/range and originating snapshot/source provenance are accessible.
3. **Given** a binary source, **When** it is inspected, **Then** its admitted metadata and existing authorized local download are available while content remains explicitly not interpreted or transcribed.
4. **Given** an unauthorized role, inactive membership, wrong workspace/project or nonexistent review, **When** the projection is requested, **Then** no candidate, source, contradiction or existence detail is disclosed.

---

### User Story 2 - Preserve and resolve contradictions explicitly (Priority: P1)

As an authorized owner, I can declare that two or more candidates conflict, keep all original claims visible, and record an explicit resolution without deleting or rewriting either side.

**Why this priority**: Silent conflict collapse would make the project brain confidently wrong.

**Independent Test**: Declare a contradiction between two synthetic candidates, resolve it, reload the review, and verify the contradiction, all members, all prior dispositions and the appended resolution remain reconstructible.

**Acceptance Scenarios**:

1. **Given** two or more candidates in the same review, **When** the authorized owner declares a contradiction, **Then** ENDVERA creates an immutable contradiction group containing every selected candidate and no candidate is modified.
2. **Given** an unresolved contradiction, **When** the owner resolves it, **Then** the owner explicitly chooses one or more supported candidates, rejects all as unsupported, or supplies a bounded owner-authored resolution statement with provenance labelled `OWNER_RESOLUTION`.
3. **Given** a resolution, **When** the review is reopened, **Then** the original contradiction and every member remain visible beside the append-only resolution.
4. **Given** an attempted automatic, model-generated or request-implicit resolution, **When** it reaches the boundary, **Then** it is refused with zero state change.
5. **Given** a candidate outside the review or another workspace, **When** it is included in a contradiction/resolution, **Then** the command is refused without revealing protected content.

---

### User Story 3 - Seal the exact reviewed understanding (Priority: P1)

As an authorized owner, I review every candidate and contradiction, preview the exact canonical understanding and confirm that exact version/fingerprint once.

**Why this priority**: R36Y may later recall only an immutable understanding whose complete content the owner explicitly approved.

**Independent Test**: Disposition every candidate, resolve every contradiction, prepare the review, capture its fingerprint, confirm the exact current version/fingerprint, then replay and restart to verify one immutable byte-equivalent confirmed snapshot.

**Acceptance Scenarios**:

1. **Given** undispositioned candidates or unresolved contradictions, **When** sealing is requested, **Then** ENDVERA refuses and identifies the remaining review work without inventing a resolution.
2. **Given** a complete review, **When** it is prepared, **Then** ENDVERA builds a deterministic canonical snapshot containing accepted/rejected candidates, every contradiction and resolution, source inventory, provenance and limitations.
3. **Given** the exact current review version and fingerprint, **When** OWNER or OFFICE_MANAGER confirms, **Then** one immutable `CONFIRMED` understanding and one decision are created atomically.
4. **Given** a stale version, changed fingerprint, incomplete review or body-drifted command, **When** confirmation is attempted, **Then** no confirmed understanding is created.
5. **Given** an exact confirmation replay or concurrent retry, **When** it completes, **Then** it returns the original effect and creates no duplicate snapshot, decision or audit.

### Edge Cases

- Equal candidate values with different provenance remain independently reviewable.
- One candidate may belong to more than one preserved contradiction group. Every group must be resolved and every derived member outcome must agree; conflicting resolutions block preparation.
- A resolution never deletes a contradiction member, prior disposition or earlier resolution attempt.
- A candidate disposition change creates a new append-only decision and review version; it does not mutate history.
- Owner-authored resolution text is retained verbatim and labelled as owner input, never as extracted evidence.
- A candidate/source added outside the review's exact R36W batch cannot enter the snapshot.
- A race between preparation and a disposition/resolution cannot seal a mixed version.
- A database/process restart returns the same canonical projection and fingerprint.
- Corrupt provenance, missing decision coverage, duplicate canonical membership or a snapshot/hash mismatch fails closed.

## Requirements

### Functional Requirements

- **FR-001**: R36X MUST create a review only from the deterministic current completed R36W batch: greatest confirmed R36V intake sequence for the project, then the exact supported adapter-set version, with total tie-break order `(batch sequence, batch id)`. Creation MUST serialize on the project and converge on one review for that batch.
- **FR-002**: Every create, read, disposition, contradiction, resolution, prepare and confirm operation MUST recheck authenticated identity, active membership, OWNER or OFFICE_MANAGER role, workspace and project at the point of use.
- **FR-003**: The mobile review MUST be reachable from the project as one coherent surface and MUST NOT require copying workspace, project, intake, snapshot, batch, candidate or contradiction identifiers.
- **FR-004**: The projection MUST include the complete review-bound source inventory, candidate set, confidence/status, exact provenance, limitations, dispositions, contradictions, resolutions, state version and current fingerprint.
- **FR-005**: Source and candidate provenance MUST remain accessible through authorized local boundaries; binary content MUST remain not interpreted/not transcribed.
- **FR-006**: All commands MUST use strict versioned schemas, a command ID, exact expected review version and body-bound command hash; unknown fields or command-ID body drift MUST refuse.
- **FR-007**: Candidate disposition MUST be an explicit OWNER/OFFICE_MANAGER decision: `ACCEPT_AS_REVIEWED`, `REJECT_AS_UNSUPPORTED` or `RETAIN_FOR_CONTRADICTION`.
- **FR-008**: Declaring a contradiction MUST require at least two distinct candidates from the same exact review and MUST create an immutable group without changing member candidates or dispositions.
- **FR-009**: Contradictions MUST remain visible and append-only after resolution and confirmation; no operation may overwrite, collapse or delete them.
- **FR-010**: Resolving a contradiction MUST be explicit and use exactly one mode: `SELECT_SUPPORTED_CANDIDATES`, `REJECT_ALL_UNSUPPORTED` or bounded verbatim `OWNER_RESOLUTION` text.
- **FR-011**: Every resolution MUST retain actor, command/body hash, prior/next review version, contradiction identity, selected candidate identities or exact owner text, provenance label and timestamp.
- **FR-012**: R36X MUST NOT automatically resolve, rank or infer a winner, and MUST NOT use a model/provider, binary interpretation, filename heuristic or confidence score to decide a conflict.
- **FR-013**: Preparing for confirmation MUST require one current disposition for every candidate, one current explicit resolution for every contradiction and this canonical coherence matrix: `SELECT_SUPPORTED_CANDIDATES` derives `ACCEPT_AS_REVIEWED` for selected members and `REJECT_AS_UNSUPPORTED` for every unselected member; `REJECT_ALL_UNSUPPORTED` derives `REJECT_AS_UNSUPPORTED` for every member; `OWNER_RESOLUTION` derives `REJECT_AS_UNSUPPORTED` for every member and introduces only the exact `OWNER_RESOLUTION` assertion as accepted review content. `RETAIN_FOR_CONTRADICTION` is a draft-only disposition and MUST NOT survive preparation. If a candidate belongs to several contradiction groups, all derived outcomes MUST agree with each other and with its current disposition or preparation MUST refuse `CONFLICTING_RESOLUTIONS`.
- **FR-014**: The prepared snapshot MUST deterministically bind schema version, workspace/project, R36V intake/snapshot, R36W batch/candidate-set hash, complete ordered source inventory, every candidate/disposition, every contradiction/resolution and all limitations.
- **FR-015**: `reviewFingerprint` and `canonicalHash` MUST be lowercase SHA-256 values computed from the exact canonical snapshot; no client-supplied snapshot/hash may be trusted.
- **FR-016**: Exact confirmation MUST require the current review version, exact fingerprint and OWNER/OFFICE_MANAGER authority, serialize on the project, allocate the next positive monotonic `confirmedUnderstandingSequence`, then atomically create one immutable `CONFIRMED` snapshot and decision. `(projectId, confirmedUnderstandingSequence)` MUST be unique and current selection MUST use total order `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`.
- **FR-017**: Draft or prepared reviews and unconfirmed candidates MUST NOT become canonical assistant memory or support consequential actions.
- **FR-018**: Review, contradiction, resolution, snapshot and decision history MUST be immutable, append-only and reconstructible after restart.
- **FR-019**: Exact replay/concurrent retries MUST converge on one canonical effect; stale version, changed fingerprint or body drift MUST create no partial state.
- **FR-020**: Database constraints/deferred guards MUST enforce reciprocal tenant/project/intake/snapshot/batch/candidate bindings, complete candidate coverage, the FR-013 disposition/resolution matrix including multi-group agreement, valid contradiction membership, resolution mode exclusivity, unique monotonic confirmation sequence, exact snapshot reciprocity/hash and append-only history.
- **FR-021**: Read projections MUST revalidate canonical hash, fingerprint, provenance and relational completeness; corrupt state MUST fail closed rather than return a partial or trusted understanding.
- **FR-022**: Cross-workspace, cross-project, unauthorized, nonexistent, replay-conflict and raw-SQL bypass attempts MUST expose zero protected fields and create zero canonical effects.
- **FR-023**: Eligible accepted/refused/replayed decisions MUST retain redacted idempotent audit evidence without candidate values, source metadata, owner resolution text, binary bytes or secrets.
- **FR-024**: Every result MUST report `providerExecutionPerformed: false`, `binaryUnderstandingPerformed: false`, `externalTransportPerformed: false`, `externalWritePerformed: false`, `automaticResolutionPerformed: false` and `automaticConfirmationPerformed: false`.
- **FR-025**: Only synthetic validation material is permitted; R36X MUST NOT claim customer value, provider readiness, assistant recall or production readiness.

### Authorization and Tenancy

- Active OWNER and OFFICE_MANAGER members may perform the complete review and exact confirmation for their workspace project.
- FIELD_WORKER and other roles receive non-enumerating refusal and no candidate/source/contradiction projection.
- UI state and client-supplied identifiers are navigation hints only; server-side authorization and relational resolution are authoritative.

### Data Classification and Retention

- Candidate values, dispositions, contradictions and owner resolution text are project operational data and remain local in R36X.
- Confirmed understanding snapshots and all decision history are immutable and append-only.
- Audit contains identifiers, hashes, versions, action and result only; no raw project content.
- Synthetic fixtures are the only permitted validation data.

### Failure and Exception States

- `DRAFT`: review accepts dispositions and contradiction/resolution decisions.
- `READY_FOR_CONFIRMATION`: exact canonical snapshot/fingerprint prepared; any further review decision requires an explicit new version and returns to `DRAFT`.
- `CONFIRMED`: immutable terminal review snapshot; no further mutation.
- `REFUSED`: authorization, provenance, policy or strict-contract failure; no canonical effect.
- `CONFLICT`: stale review version/fingerprint or command-body drift.
- `INCOMPLETE_REVIEW`: candidates lack dispositions or contradictions lack explicit resolutions.
- `CORRUPT_SOURCE`: relational/provenance/hash completeness cannot be proven; no trusted projection or seal.

### Economics

- Provider, binary-understanding and external-transport cost ceilings are zero.
- Customer price, willingness to pay, production review time and contribution margin remain **UNKNOWN**.
- Local synthetic review timing is development evidence, not demonstrated customer economics.

### Verification, Delivery, Observability, Rollout and Rollback

- Verification uses strict contract/mobile tests, real disposable PostgreSQL integration, replay/concurrency/restart, cross-tenant and raw-SQL bypass tests, plus provider/binary/external-effect sentinels.
- Delivery is local code only; no provider, founder, customer, Preview, Production, deployment or store action is authorized.
- Observability makes every version, decision, contradiction, resolution and hash reconstructible without logging content.
- R36Y may consume only the latest exact `CONFIRMED` R36X understanding through a separately specified boundary.
- Rollback is code rollback plus disposal of the test database; forward schema work is additive and historical R36V/R36W/R36X meanings remain unchanged.

### Key Entities

- **Understanding Review**: Versioned review aggregate bound to one exact R36W candidate batch.
- **Candidate Disposition**: Append-only explicit owner decision about one candidate at one review version.
- **Contradiction Group**: Immutable membership record preserving two or more conflicting candidates.
- **Contradiction Resolution**: Append-only explicit owner resolution that never replaces the contradiction.
- **Reviewed Understanding Snapshot**: Deterministic proposed or confirmed immutable representation of the entire reviewed state.
- **Understanding Review Decision**: Body-bound append-only transition receipt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One authorized user can reach the complete review from a project and finish it without copying a technical identifier.
- **SC-002**: 100% of review-bound sources and candidates expose their exact authorized provenance; zero binary-content interpretation is displayed.
- **SC-003**: Every contradiction retains all original members before and after resolution and confirmation; zero member, disposition or resolution history is overwritten.
- **SC-004**: A confirmed snapshot is impossible until 100% of candidates have a current explicit disposition and 100% of contradictions have an explicit resolution.
- **SC-005**: Exact/concurrent replay creates zero duplicate reviews, dispositions, contradictions, resolutions, snapshots, decisions or audits.
- **SC-006**: Stale, body-drifted, cross-workspace, cross-project and unauthorized attempts expose zero protected fields and create zero canonical effects.
- **SC-007**: The prepared fingerprint and confirmed canonical hash reproduce exactly from the complete ordered relational review state.
- **SC-008**: The confirmed projection is byte-equivalent before and after a clean process/database-client restart.
- **SC-009**: Raw-SQL attempts to omit candidates, erase contradictions, forge a resolution, mix tenants or attach a mismatched hash/snapshot are refused at commit.
- **SC-010**: Provider calls, binary reads/understanding, credentials, external transport/write, spend, automatic resolution and automatic confirmation remain exactly zero.
- **SC-011**: Concurrent confirmations allocate unique monotonic project sequences, and every current-understanding read returns the same row under total order `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)` before and after restart.

## Assumptions

- R36V confirmed intake integrity and R36W immutable candidate generation are complete dependencies before implementation.
- Contradictions are explicitly declared by an authorized human in R36X; this release does not claim semantic automatic conflict detection.
- A complete-field owner candidate may be accepted/rejected as a unit; semantic splitting belongs to a separately specified future adapter version.
- R36Y, not R36X, exposes confirmed understanding to assistant recall.
