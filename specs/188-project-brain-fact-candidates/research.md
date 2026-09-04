# Research: Project Brain Fact Candidates

## Decision 1 — Exact-copy candidates, not deterministic NLP

**Decision**: The first text adapter emits each non-empty allowlisted owner-brief field as one verbatim candidate with an exact range covering that value.

**Rationale**: Regex extraction of names, dates, amounts or obligations would introduce semantic interpretation and silent false confidence. Exact field copies are useful inputs to R36X review and are provably supported by the confirmed intake.

**Alternatives considered**:

- Regex entity extraction: rejected because pattern matches are not proof of meaning.
- Sentence splitting: rejected because boundaries and implied subjects create interpretation without review.
- Model extraction: forbidden by authority and dependent on an external provider.

## Decision 2 — Metadata remains metadata

**Decision**: The metadata adapter copies only retained allowlisted source fields and labels them as source metadata, never job facts.

**Rationale**: Source kind, name, MIME, size, duration, ordinal and hash can be proven locally. None proves what work occurred or what a binary contains.

**Alternatives considered**:

- Infer content from filename or MIME: rejected as invented understanding.
- Open PDF/DOCX containers locally: rejected because binary document understanding remains explicitly unavailable.
- Parse audio or image payload: rejected; R36V structural admission is not transcription or vision.

## Decision 3 — Non-probabilistic confidence

**Decision**: Confidence is an enum describing the copy mechanism: `EXACT_OWNER_TEXT` or `EXACT_CANONICAL_METADATA`.

**Rationale**: A numeric probability would imply semantic correctness that no adapter measured. The enum says only why the value is reproducible.

## Decision 4 — Immutable batch plus candidate rows

**Decision**: Persist one body-bound batch and separate immutable candidate rows, plus an append-only decision receipt.

**Rationale**: Batch identity provides retry/concurrency semantics; candidate identity provides provenance-granular deduplication; the receipt makes the action reconstructible without logging values.

**Alternatives considered**:

- Mutable JSON on the intake: rejected because it changes R36V meaning and weakens provenance.
- One opaque JSON candidate list: rejected because database guards cannot enforce per-candidate tenant/range/source invariants.
- Recompute on every read: rejected because adapter-version drift would rewrite historical meaning.

## Decision 5 — Bind to one exact confirmed snapshot

**Decision**: The command includes the intake and exact confirmed snapshot hash; the server derives all project, text and source state from retained rows inside the final transaction.

**Rationale**: This prevents stale generation and request-supplied metadata. A later intake version creates a new historical batch rather than mutating the old one.

## Decision 6 — Defense in depth on write and read

**Decision**: Service validation and deferred PostgreSQL guards enforce reciprocal tenancy, status/confidence pairing, range validity and metadata equality. Reads revalidate copied values against canonical rows and fail closed on corruption.

**Rationale**: A raw-SQL bypass could otherwise create an unrecoverable false provenance record; query-side validation prevents display if historical state is damaged outside normal paths.

## Decision 7 — No mobile review surface in R36W

**Decision**: R36W exposes a narrow authenticated server contract and projection. R36X owns the human inspection, contradiction and resolution surface.

**Rationale**: Adding review controls here would blur `CANDIDATE_UNCONFIRMED` into confirmation and duplicate the next accepted release.
