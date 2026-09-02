# Data Model: R31 Observability and Recovery

## ConstructionReliabilitySignal

Append-only tenant-safe signal and trace-span evidence.

- `workspaceId`, `signalKey`, `fingerprint` — unique canonical identity.
- `kind`, `severity`, `outcomeCode` — closed strings validated at service boundary.
- `traceId`, `spanId`, `parentSpanId` — opaque bounded correlation identifiers.
- `sourceModule`, `resourceType`, `resourceId`, `resourceVersion` — canonical references only.
- `durationMs`, `dimensions` — optional non-negative duration and allowlisted safe dimensions.
- `observedAt`, `createdAt` — immutable timing.

Unique `(workspaceId, signalKey)` collapses exact duplicate observation. Altered
reuse refuses because the fingerprint differs.

## ConstructionReliabilityAlert

Current incident projection derived from accepted signals and canonical queue state.

- `workspaceId`, `alertType`, `resourceType`, `resourceId`, `alertKey`.
- `severity`, `status`, `occurrenceCount`, `stateVersion`.
- `firstObservedAt`, `lastObservedAt`, `acknowledgedAt`, `resolvedAt`.
- `latestSignalId`, `nextResponsibleRole`, `reasonCode`.

Unique `(workspaceId, alertKey)` gives one durable alert. Status transitions are
`OPEN -> ACKNOWLEDGED -> RESOLVED`; recurrence after resolution creates a new
generation in the key rather than rewriting the prior incident.

## ConstructionRecoveryOperation

Immutable command identity plus current execution result for one recovery action.

- `workspaceId`, `commandId`, `commandHash`, `registryVersion`.
- `alertId`, `queueKind`, `itemId`, `expectedItemVersion`.
- `action`, `replayClass`, `status`, `stateVersion`.
- `beforeFingerprint`, `afterFingerprint`, `result`, `resultFingerprint`.
- `actorId`, `nextResponsibleRole`, timestamps.

States: `PREPARED`, `APPLIED`, `QUARANTINED`, `REFUSED`, `REVOKED`. Exact replay
returns the original result. Only `LOCAL_REPLAY_SAFE` can become `APPLIED`.

## ConstructionRecoveryCheckpoint

Minimized immutable workspace recovery manifest.

- `workspaceId`, `checkpointKey`, `registryVersion`, `schemaIdentity`.
- `tableCounts`, `highWaterMarks`, `manifestFingerprint`, `totalRows`.
- `createdByUserId`, `createdAt`.

No raw payload, message text, contact field, evidence source or credential is retained.

## ConstructionRecoveryDrill

One immutable disposable backup/restore comparison.

- `workspaceId`, `drillKey`, `checkpointId`, `status`.
- `sourceFingerprint`, `restoredFingerprint`, `schemaMatch`, `countsMatch`.
- `reasonCodes`, `sourceDatabaseLabel`, `targetDatabaseLabel`.
- `startedAt`, `completedAt`, `recordedByUserId`.

Statuses: `PASSED`, `FAILED`, `REFUSED`. Labels must match the disposable-local guard.

## ConstructionReliabilityGateRun

Immutable bounded synthetic correctness/performance evidence.

- `workspaceId`, `gateKey`, `gateKind`, `evidenceLabel` (`SYNTHETIC`).
- `operationCount`, `concurrency`, `canonicalEffectCount`, `duplicateCount`.
- `durationMs`, `p50LatencyMs`, `p95LatencyMs`, `thresholdMs`, `status`.
- `resultFingerprint`, `createdAt`.

Statuses: `PASSED`, `FAILED`. A failed gate cannot be presented as healthy.

## Relationships and deletion

- All records reference `ConstructionWorkspace` with restrictive deletion.
- Alerts may reference their latest signal; operations reference one alert.
- Drills reference one checkpoint.
- Actor relations are restrictive and retain audit identity.
- Reliability evidence is not physically deleted by R31; R30 retention governs future lifecycle.
