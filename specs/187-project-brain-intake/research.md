# Research: Project Brain Intake

## Decision 1 — Build the durable container before provider interpretation

**Decision**: R36V stores source presence and owner-confirmed written context, while transcription, OCR, vision and document understanding remain unperformed and visibly labelled.

**Rationale**: The current authority forbids provider use and the existing code cannot truthfully derive content from binary files. Building the versioned packet, provenance and confirmation layer is required regardless of the future model provider and creates immediate persistent-memory value without a fake demo.

**Alternatives considered**:

- Pretend to analyze synthetic filenames or fixtures: rejected as invented capability.
- Wait for provider credentials before building anything: rejected because it leaves substantial authorized foundational work undone.
- Store only an unstructured chat message: rejected because it cannot freeze source bytes, provenance, version or exact confirmation.

## Decision 2 — Upload sources independently inside one user-visible packet

**Decision**: The mobile picker may select several files, but the client uploads each source through a separate command and maintains one visible queue.

**Rationale**: Each source gets stable idempotency, retry and scan evidence. One failed file does not discard successful admissions, and server memory use stays bounded.

**Alternatives considered**:

- One giant multipart request: rejected because retry would replay every file and partial failure would be ambiguous.
- Existing evidence route: rejected as the public contract because it requires an open invoice-readiness loop and manual evidence kind.
- A second scanner or storage engine: rejected; the existing security and object-storage primitives remain authoritative.

## Decision 3 — Separate source, snapshot and decision history

**Decision**: Use an intake aggregate plus immutable source rows, immutable snapshots and immutable decision rows.

**Rationale**: These records have different identity and mutation rules. A confirmed snapshot must retain its original meaning even when a later intake version is created.

**Alternatives considered**:

- Store everything in one mutable JSON field: rejected because concurrent changes and historical reconstruction become unsafe.
- Event-source the entire construction domain: rejected as a speculative rewrite.

## Decision 4 — Owner assertions are not extracted facts

**Decision**: Every field in the initial project understanding is labelled `OWNER_CONFIRMED`; source files contribute inventory and provenance only.

**Rationale**: This prevents a filename, audio length or unexamined document from becoming a business fact. Future extraction candidates can later introduce `OBSERVED` and `INFERRED` classes beside, not inside, the R36V meaning.

**Alternatives considered**:

- Infer dates and people with regex from filenames: rejected as unreliable and misleading.
- Treat written briefing as model output: rejected because its provenance is the owner.

## Decision 5 — Narrow deterministic assistant access

**Decision**: The assistant may answer only summary, blockers, next-decision and source-inventory questions from the latest confirmed snapshot.

**Rationale**: These answers are valuable, testable and require no model provider. Questions about binary content get an explicit not-analyzed response.

**Alternatives considered**:

- Send the snapshot to the existing model gateway: rejected because provider execution is unauthorized.
- Make every assistant question parse deterministically: rejected as another brittle intent engine.

## Decision 6 — Forward-only additive persistence

**Decision**: Add new tables and constraints through one migration; no historical table is reinterpreted or destructively changed.

**Rationale**: The constitution requires preserved historical meaning and real PostgreSQL validation for persistence boundaries.

**Alternatives considered**:

- Reuse voice-note or open-loop tables as the aggregate: rejected because their lifecycle semantics differ.
- Prisma db push: prohibited.

