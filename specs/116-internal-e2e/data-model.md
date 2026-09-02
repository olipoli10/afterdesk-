# R36 Internal E2E Data Model

R36 adds no PostgreSQL table. It uses existing canonical records and emits one
local report.

## ScenarioDefinition

- schemaVersion, scenarioKey and scenarioVersion
- synthetic workspace, users, project, contact and extra
- ordered input commands
- expected checkpoint codes
- expected final boundary

## Checkpoint

- sequence
- code
- state: PASS or FAIL
- canonicalEntityType and sanitized identifier
- expected and observed scalar result
- canonicalFingerprint
- refusalCode when applicable
- externalEffectCount

## InternalE2EReport

- schemaVersion
- scenario key/version/hash
- source head/tree
- database mode: DISPOSABLE_POSTGRESQL
- checkpoint array
- canonical counts
- preRestartFingerprint and postRestartFingerprint
- owner/office/field/platform parity summaries
- providerObserved and externalEffectCount
- verdict: INTERNAL_SYNTHETIC_E2E_PASS or INTERNAL_SYNTHETIC_E2E_FAIL
- reportHash

## Invariants

- Scenario inputs are closed and synthetic.
- Checkpoint order and codes are complete and unique.
- No raw phone, email, credential or environment value enters the report.
- PASS requires every checkpoint PASS and identical restart fingerprints.
- PASS requires zero delivery, provider observation, role leak and duplicate effect.
- Report hashes never replace canonical database provenance.
