# Evidence data model

## TestSession

- schemaVersion, sessionId, subjectCommit, subjectTree
- participant: exact `Olivier`
- dossier classification: `SYNTHETIC` or `FOUNDER_OWNED`
- startedAtUtc, completedAtUtc, founderCompleted
- ordered action observations
- technical measurements, founder ratings and control result hashes
- final seal SHA-256

State: `PREPARED -> STARTED -> FOUNDER_COMPLETED -> SEALED -> ADJUDICATED`.

Automation may reach `PREPARED`; only the observation form may produce `FOUNDER_COMPLETED`.

## ActionObservation

- actionId from A01 through A08
- exact input, expected outcome, observed outcome
- startedAtUtc, completedAtUtc
- correctionRequired, correctionNote
- source evidence references

## FounderRatings

- clarificationUnderstandabilityRating: 1..5
- approvalComprehensionRating: 1..5
- actionabilityRating: 1..5
- observableAdvantageRating: -2..2
- nextDecisionIdentified and optional content-minimized note

## TechnicalMeasurements

Contains the exact required numeric and Boolean measurements from the accepted goal. Unknown keys are refused.

## StatelessControlResult

- sameInputsHash, sameOrderHash, sameReferenceTime
- answers and active minutes
- contextRestatementCount
- explicit limitations: no persistent state, audit, idempotency or approval

## Adjudication

- verdict from the three-value closed set
- failed guards, reason codes and dashboard snapshot
- computed only from a sealed founder observation and technical evidence
