# Data Model: Project Brain Fact Candidates

## `ConstructionProjectBrainFactCandidateBatch`

Represents one immutable deterministic generation run against one exact confirmed R36V intake.

Fields:

- `id`: immutable primary identity.
- `workspaceId`, `projectId`, `intakeId`: reciprocal tenant/project/intake binding.
- `confirmedSnapshotId`, `confirmedSnapshotHash`: exact immutable input.
- `schemaVersion`, `adapterSetVersion`: closed contract versions.
- `commandId`, `commandHash`: workspace-scoped body-bound idempotency identity.
- `status`: `COMPLETED_LOCAL` only for a committed batch.
- `candidateCount`: exact bounded count.
- `createdByUserId`, `createdAt`.

Rules:

- unique `(workspaceId, commandId)`;
- unique `(intakeId, confirmedSnapshotId, adapterSetVersion)` so equivalent generation converges even under distinct concurrent command IDs;
- created atomically with all candidates and the accepted decision receipt;
- immutable and append-only;
- references only a `CONFIRMED` snapshot belonging to the same intake/workspace/project.

## `ConstructionProjectBrainFactCandidate`

Represents one exact-copy, unconfirmed value.

Common fields:

- `id`, `batchId`, `workspaceId`, `projectId`, `intakeId`, `confirmedSnapshotId`;
- `candidateFingerprint`: deterministic lowercase SHA-256 over canonical schema/adapter version, tenant/input identity, kind, exact value and provenance;
- `kind`: `OWNER_TEXT` or `SOURCE_METADATA`;
- `status`: `CANDIDATE_UNCONFIRMED`;
- `confidenceClass`: `EXACT_OWNER_TEXT` or `EXACT_CANONICAL_METADATA`;
- `value`: strict scalar JSON/string representation copied from canonical input;
- `createdAt`.

Owner-text provenance fields:

- `ownerBriefField`: `summary`, `scope`, `importantPeople`, `importantDates`, `blockers` or `nextDecision`;
- `rangeUnit`: `UTF16_CODE_UNIT`;
- `rangeStart`, `rangeEnd`: zero-based half-open `[start, end)` range;
- source metadata fields are null.

Source-metadata provenance fields:

- `sourceId`, `sourceOrdinal`, `sourceContentHash`;
- `metadataField`: `kind`, `displayName`, `mimeType`, `sizeBytes`, `durationMs`, `ordinal` or `contentHash`;
- owner-text range fields are null.

Rules:

- unique `(batchId, candidateFingerprint)`;
- `OWNER_TEXT` pairs only with `EXACT_OWNER_TEXT`, non-null valid text provenance and null source provenance;
- `SOURCE_METADATA` pairs only with `EXACT_CANONICAL_METADATA`, non-null source provenance and null text provenance;
- owner range reconstructs the exact stored value from the confirmed snapshot field;
- metadata value equals the canonical retained source field and the source belongs to the same intake/workspace/project;
- repeated equal values from different fields or sources remain distinct because provenance participates in the fingerprint;
- rows cannot be updated, deleted or truncated by product roles.

## `ConstructionProjectBrainFactCandidateDecision`

Append-only outcome receipt for generation.

Fields:

- tenant/project/intake/batch identity;
- `commandId`, `commandHash`;
- `decision`: `GENERATE_FACT_CANDIDATES`;
- `outcome`: `ACCEPTED`, `REPLAYED` or eligible redacted `REFUSED` audit form;
- `confirmedSnapshotHash`, `adapterSetVersion`, `candidateSetHash`;
- actor and creation time.

Rules:

- exact retry returns the retained accepted result and does not append a second decision/audit effect;
- command-ID body drift conflicts;
- malformed, unauthenticated, unauthorized, cross-workspace and nonexistent-target attempts do not create a target decision;
- raw candidate values and source names are absent from audit payloads.

## Deterministic candidate construction

### Owner text

For each allowlisted field in fixed order:

1. read the field from the exact confirmed snapshot;
2. if empty, emit nothing;
3. emit the entire field unchanged;
4. set `rangeStart = 0`, `rangeEnd = field.length` in UTF-16 code units;
5. canonicalize identity/provenance/value and hash it.

### Source metadata

For each confirmed source inventory entry in ordinal order, emit allowlisted present fields in fixed field order. Optional `durationMs` emits nothing when absent. Values come from canonical relational source rows after equality with the confirmed snapshot inventory is verified.

### Candidate set

Sort by adapter order, source ordinal, field order and fingerprint. Hash the canonical ordered list into `candidateSetHash`. No locale, current time, random value, model response or binary byte participates.

## State relationship

```text
R36V CONFIRMED intake + exact CONFIRMED snapshot
  -> R36W COMPLETED_LOCAL batch
  -> zero or more CANDIDATE_UNCONFIRMED rows
  -> future R36X owner review (out of scope)
```

R36W never transitions the intake, snapshot or candidate to a confirmed-fact state.
