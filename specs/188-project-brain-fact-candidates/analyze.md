# Spec Kit Analyze: Project Brain Fact Candidates R36W

## Scope consistency

- `spec.md`, `plan.md`, `data-model.md`, the contract, quickstart and tasks all implement the exact backlog outcome: deterministic local candidates from explicitly supported text and metadata.
- The two initial adapters and their allowlisted fields are identical across artifacts.
- Every artifact keeps binary understanding unavailable and excludes provider, OCR, transcription, vision and document parsing.
- R36W ends at `CANDIDATE_UNCONFIRMED`; inspection, contradiction resolution and confirmation remain assigned to R36X.

## Requirement coverage

- US1 / FR-001–FR-013 are covered by T009–T013 and exact-copy/provider-boundary tests.
- US2 / FR-014–FR-16 and FR-19 are covered by T014–T016 plus concurrent/raw-SQL integration tests.
- US3 / FR-017–FR-021 is covered by T017–T020 plus authorization/corruption/restart tests.
- FR-022 and all success criteria are covered by T021–T025 and the quickstart mutations.

## Ambiguity and boundary review

- Text offsets are explicitly UTF-16 code-unit half-open ranges.
- Confidence describes copy provenance, not semantic probability.
- Metadata values describe sources, not the construction job.
- Candidate fingerprints include complete provenance, so equal values from different fields/sources do not collapse.
- No client-supplied candidate value or metadata can enter canonical state.
- No unresolved `NEEDS CLARIFICATION` marker remains.

## Design verdict

`SPEC_KIT_DESIGN_CONSISTENT`

This is a documentation/design consistency result only. It does not claim implementation, passing tests, a migration, provider behavior, customer evidence or release completion.
