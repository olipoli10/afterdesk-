# Data Model: Project Brain Local Gate

R36Z adds no production-domain entity. Its model is a strict bounded evidence report generated from disposable synthetic state.

Tests write only isolated fragments under a unique run-owned directory (or JSON stdout). A fragment cannot set terminal status or write the final evidence path. The unique validator enforces the exact fragment-ID allowlist, aggregates once, verifies cleanup, then atomically renames a same-directory temporary report to `evidence/local-gate-report.json`.

## Exact contradiction fixture

- candidate A: `OWNER_TEXT`, value `L’unique inspection finale est vendredi à 09 h.`, provenance `ownerBrief.summary[0,length)`;
- candidate B: `OWNER_TEXT`, value `L’unique inspection finale est lundi à 09 h.`, provenance `ownerBrief.importantDates[0,length)`;
- declaration: explicit harness command only; no adapter auto-detection;
- retained proof: both exact values, candidate identities and field/range provenances remain in contradiction history after resolution and seal.

## `LocalGateRun`

- `schemaVersion`: 1.
- `release`: `R36Z-PROJECT-BRAIN-LOCAL-GATE`.
- `runId`: unique local identifier.
- `startedAtUtc`, `completedAtUtc`.
- `database`: redacted name/hash, ownership marker verified, disposable true, cleanup status.
- `status`: `PASS`, `FAIL` or `INVALID`.
- `evidenceLabels`: includes `TEST`, `SYNTHETIC`; observed founder/customer/provider all false.
- `assertions`, `mutations`, `commands`, `effectCounters`, `cleanup`.

## `GateAssertion`

- `id`: stable release-scoped identifier.
- `chapter`: `R36V`, `R36W`, `R36X`, `R36Y`, `RESTART`, `SECURITY`, `MOBILE`, `ZERO_EFFECT` or `GATES`.
- `expected`, `actual`: strict bounded scalar/object hashes/counts, never raw content.
- `status`: `PASS`, `FAIL`, `MISSING` or `SKIPPED`.
- `evidence`: command/test name and repository evidence path.
- `label`: `TEST` or `SYNTHETIC`.

Any `FAIL`, `MISSING` or `SKIPPED` assertion makes the run non-PASS.

## `CanonicalEffectCounts`

Required positive-scenario counts include:

- intake and confirmed intake snapshot;
- source/provenance/file effects according to R36V identical-byte rules;
- candidate batch/candidates;
- understanding review, contradiction/members/resolution and confirmed snapshot;
- recall receipt/citations;
- prepared action, memory binding and decision/audit effects.

The report stores before-replay, after-replay, before-restart and after-restart counts/hashes.

## `ExternalEffectCounterSet`

All mandatory and exactly zero:

- `providerModuleImportCount`;
- `providerCallCount`;
- `credentialReadCount`;
- `semanticBinaryUnderstandingCount`;
- `ocrCount`, `transcriptionCount`, `visionCount`, `documentParsingCount`;
- `networkCallCount`;
- `externalTransportCount`, `externalWriteCount`;
- `approvalPerformedCount`, `deliveryCount`;
- `externalSpendMinorUnits`.

R36V structural binary admission count is reported separately and does not weaken semantic counters.

## `GateMutationResult`

- stable mutation ID;
- targeted invariant/guard;
- expected refusal;
- observed refusal and non-vacuous setup proof;
- before/after SHA-256;
- targeted rerun result;
- `restoredByteExact`.

Every required mutation must pass and restore exactly.

## `CleanupResult`

- owned server/mobile process IDs or redacted handles;
- disposable DB ownership reverified before removal;
- database stopped/removed;
- temporary synthetic files removed;
- unrelated process/database/path untouched assertions;
- post-cleanup probe result.

## Terminal rules

```text
PASS = every assertion PASS
    AND every mutation PASS/restoredByteExact
    AND every forbidden counter == 0
    AND report schema valid
    AND cleanup verified

INVALID = missing/skipped/unknown/schema-invalid/ambiguous ownership
FAIL = a measured command/assertion/mutation/build/cleanup failure
```
