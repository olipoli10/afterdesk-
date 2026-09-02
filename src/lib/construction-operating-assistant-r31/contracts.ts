import { z } from "zod";

export const RELIABILITY_SCHEMA_VERSION = 1 as const;
export const RELIABILITY_REGISTRY_VERSION = 1 as const;

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.string().datetime();

export const reliabilitySignalKindSchema = z.enum([
  "QUEUE_STALE",
  "RECOVERY_PREPARED",
  "RECOVERY_APPLIED",
  "RECOVERY_QUARANTINED",
  "CHECKPOINT_CREATED",
  "RESTORE_DRILL_COMPLETED",
  "LOAD_GATE_COMPLETED",
  "STATE_TRANSITION",
  "COMMAND_REFUSED",
]);
export const reliabilitySeveritySchema = z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]);
export const reliabilityOutcomeCodeSchema = z.enum([
  "FOLLOW_UP_DUE_STALE",
  "CONNECTOR_PREPARED_STALE",
  "RECOVERY_LOCAL_APPLIED",
  "RECOVERY_EXTERNAL_UNCERTAIN",
  "RECOVERY_VERSION_REFUSED",
  "RECOVERY_UNSUPPORTED_QUEUE",
  "CHECKPOINT_MANIFEST_CREATED",
  "RESTORE_MATCHED",
  "RESTORE_MISMATCH",
  "RESTORE_DATABASE_REFUSED",
  "LOAD_GATE_PASSED",
  "LOAD_GATE_FAILED",
  "ALERT_ACKNOWLEDGED",
  "ALERT_RESOLVED",
]);
export const reliabilityQueueKindSchema = z.enum(["FOLLOW_UP_DUE", "CONNECTOR_PREPARED"]);
export const reliabilityReplayClassSchema = z.enum(["LOCAL_REPLAY_SAFE", "EXTERNAL_EFFECT_UNCERTAIN"]);
export const recoveryActionSchema = z.enum(["REQUEUE_LOCAL", "QUARANTINE"]);
export const recoveryStatusSchema = z.enum(["PREPARED", "APPLIED", "QUARANTINED", "REFUSED", "REVOKED"]);
export const reliabilityAlertStatusSchema = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);
export const reliabilityHealthSchema = z.enum(["HEALTHY", "ATTENTION", "BLOCKED", "UNKNOWN"]);

export const safeReliabilityDimensionsSchema = z.object({
  queueKind: reliabilityQueueKindSchema.optional(),
  replayClass: reliabilityReplayClassSchema.optional(),
  operationKind: z.enum(["SCAN", "SIGNAL", "RECOVERY", "CHECKPOINT", "RESTORE_DRILL", "LOAD_GATE"]).optional(),
  itemVersion: z.number().int().positive().optional(),
  attemptNumber: z.number().int().nonnegative().optional(),
  occurrenceCount: z.number().int().positive().optional(),
  canonicalEffectCount: z.number().int().nonnegative().optional(),
  duplicateCount: z.number().int().nonnegative().optional(),
  statusCode: z.enum(["PREPARED", "APPLIED", "QUARANTINED", "PASSED", "FAILED"]).optional(),
}).strict();

export const reliabilitySignalInputSchema = z.object({
  schemaVersion: z.literal(RELIABILITY_SCHEMA_VERSION),
  workspaceId: id,
  signalKey: z.string().min(1).max(240),
  kind: reliabilitySignalKindSchema,
  severity: reliabilitySeveritySchema,
  outcomeCode: reliabilityOutcomeCodeSchema,
  traceId: id.nullable(),
  spanId: id.nullable(),
  parentSpanId: id.nullable(),
  sourceModule: z.enum([
    "construction-r20",
    "construction-r23",
    "construction-r31",
    "restore-drill-r31",
    "load-gate-r31",
  ]),
  resourceType: z.enum(["WORKSPACE", "FOLLOW_UP", "CONNECTOR_OPERATION", "RECOVERY_OPERATION", "CHECKPOINT", "RESTORE_DRILL", "GATE_RUN"]),
  resourceId: id,
  resourceVersion: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  dimensions: safeReliabilityDimensionsSchema,
  observedAt: instant,
}).strict().superRefine((value, context) => {
  if ((value.spanId === null) !== (value.traceId === null)) {
    context.addIssue({ code: "custom", path: ["spanId"], message: "Trace and span IDs must be supplied together." });
  }
  if (value.parentSpanId && !value.traceId) {
    context.addIssue({ code: "custom", path: ["parentSpanId"], message: "A parent span requires a trace." });
  }
});

const commandBase = {
  schemaVersion: z.literal(RELIABILITY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: id,
};

export const reliabilityCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("SCAN_WORKSPACE") }).strict(),
  z.object({ ...commandBase, action: z.literal("ACKNOWLEDGE_ALERT"), alertId: id, expectedAlertVersion: z.number().int().positive(), reasonCode: z.enum(["OWNER_REVIEWED", "RECOVERY_PREPARED"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("RESOLVE_ALERT"), alertId: id, expectedAlertVersion: z.number().int().positive(), reasonCode: z.enum(["ITEM_RECOVERED", "ITEM_CANCELLED", "FALSE_POSITIVE"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("PREPARE_RECOVERY"), alertId: id, expectedAlertVersion: z.number().int().positive(), queueKind: reliabilityQueueKindSchema, itemId: id, expectedItemVersion: z.number().int().positive(), recoveryAction: recoveryActionSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("APPLY_RECOVERY"), recoveryOperationId: id, expectedRecoveryVersion: z.number().int().positive() }).strict(),
  z.object({ ...commandBase, action: z.literal("REVOKE_RECOVERY"), recoveryOperationId: id, expectedRecoveryVersion: z.number().int().positive() }).strict(),
  z.object({ ...commandBase, action: z.literal("CREATE_CHECKPOINT"), checkpointKey: z.string().min(1).max(240) }).strict(),
  z.object({ ...commandBase, action: z.literal("RECORD_RESTORE_DRILL"), checkpointId: id, drillKey: z.string().min(1).max(240), sourceDatabaseLabel: z.string().min(1).max(120), targetDatabaseLabel: z.string().min(1).max(120), sourceFingerprint: hash, restoredFingerprint: hash, schemaMatch: z.boolean(), countsMatch: z.boolean(), reasonCodes: z.array(z.enum(["RECOVERY_SCHEMA_MISMATCH", "RECOVERY_COUNTS_MISMATCH", "RECOVERY_FINGERPRINT_MISMATCH", "RECOVERY_TOTAL_ROWS_MISMATCH"])).max(4), startedAt: instant, completedAt: instant }).strict(),
  z.object({ ...commandBase, action: z.literal("RECORD_GATE_RUN"), gateKey: z.string().min(1).max(240), gateKind: z.enum(["SIGNAL_CONCURRENCY", "QUEUE_RECOVERY_CONCURRENCY"]), operationCount: z.number().int().min(1).max(10_000), concurrency: z.number().int().min(1).max(200), canonicalEffectCount: z.number().int().nonnegative(), duplicateCount: z.number().int().nonnegative(), durationMs: z.number().int().positive(), p50LatencyMs: z.number().int().nonnegative(), p95LatencyMs: z.number().int().nonnegative(), thresholdMs: z.number().int().positive(), status: z.enum(["PASSED", "FAILED"]), resultFingerprint: hash }).strict(),
]);

export type ReliabilityCommand = z.infer<typeof reliabilityCommandSchema>;
export type ReliabilitySignalInput = z.infer<typeof reliabilitySignalInputSchema>;
export type ReliabilityQueueKind = z.infer<typeof reliabilityQueueKindSchema>;
export type ReliabilityReplayClass = z.infer<typeof reliabilityReplayClassSchema>;

const resultBase = {
  schemaVersion: z.literal(RELIABILITY_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: id,
  replayed: z.boolean(),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
};

const alertResultSchema = z.object({ ...resultBase, resultType: z.literal("ALERT"), alertId: id, status: reliabilityAlertStatusSchema, stateVersion: z.number().int().positive(), alertType: z.enum(["FOLLOW_UP_STALE", "CONNECTOR_PREPARED_STALE"]), resourceType: z.enum(["FOLLOW_UP", "CONNECTOR_OPERATION"]), resourceId: id, occurrenceCount: z.number().int().positive(), nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]), reasonCode: z.string().min(1) }).strict();
const scanResultSchema = z.object({ ...resultBase, resultType: z.literal("SCAN"), findingCount: z.number().int().nonnegative(), openedAlertCount: z.number().int().nonnegative(), updatedAlertCount: z.number().int().nonnegative(), scanFingerprint: hash }).strict();
const recoveryResultSchema = z.object({ ...resultBase, resultType: z.literal("RECOVERY"), recoveryOperationId: id, alertId: id, queueKind: reliabilityQueueKindSchema, itemId: id, status: recoveryStatusSchema, stateVersion: z.number().int().positive(), replayClass: reliabilityReplayClassSchema, beforeFingerprint: hash, afterFingerprint: hash.nullable(), nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER"]), reasonCodes: z.array(z.string()) }).strict();
const checkpointResultSchema = z.object({ ...resultBase, resultType: z.literal("CHECKPOINT"), checkpointId: id, registryVersion: z.literal(RELIABILITY_REGISTRY_VERSION), manifestFingerprint: hash, totalRows: z.number().int().nonnegative(), tableCount: z.number().int().positive() }).strict();
const drillResultSchema = z.object({ ...resultBase, resultType: z.literal("RESTORE_DRILL"), drillId: id, status: z.enum(["PASSED", "FAILED", "REFUSED"]), sourceFingerprint: hash, restoredFingerprint: hash, schemaMatch: z.boolean(), countsMatch: z.boolean(), reasonCodes: z.array(z.string()) }).strict();
const gateResultSchema = z.object({ ...resultBase, resultType: z.literal("GATE_RUN"), gateRunId: id, status: z.enum(["PASSED", "FAILED"]), operationCount: z.number().int().positive(), concurrency: z.number().int().positive(), canonicalEffectCount: z.number().int().nonnegative(), duplicateCount: z.number().int().nonnegative(), p95LatencyMs: z.number().int().nonnegative(), thresholdMs: z.number().int().positive(), evidenceLabel: z.literal("SYNTHETIC") }).strict();

export const reliabilityCommandResultSchema = z.discriminatedUnion("resultType", [scanResultSchema, alertResultSchema, recoveryResultSchema, checkpointResultSchema, drillResultSchema, gateResultSchema]);
export type ReliabilityCommandResult = z.infer<typeof reliabilityCommandResultSchema>;

const metricSchema = z.object({
  key: z.enum(["OPEN_ALERTS", "STALE_QUEUE_ITEMS", "RECOVERIES", "RESTORE_DRILLS", "LOAD_GATES"]),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  windowStartedAt: instant,
  windowEndedAt: instant,
  evidenceLabel: z.literal("TEST"),
}).strict();

const ownerCockpitSchema = z.object({
  schemaVersion: z.literal(RELIABILITY_SCHEMA_VERSION),
  generatedAt: instant,
  workspace: z.object({ id, name: z.string().min(1) }).strict(),
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  health: reliabilityHealthSchema,
  metrics: z.array(metricSchema),
  alerts: z.array(z.object({ id, alertType: z.enum(["FOLLOW_UP_STALE", "CONNECTOR_PREPARED_STALE"]), severity: reliabilitySeveritySchema, status: reliabilityAlertStatusSchema, stateVersion: z.number().int().positive(), resourceType: z.enum(["FOLLOW_UP", "CONNECTOR_OPERATION"]), resourceId: id, resourceVersion: z.number().int().positive(), occurrenceCount: z.number().int().positive(), firstObservedAt: instant, lastObservedAt: instant, nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]), reasonCode: z.string().min(1) }).strict()),
  recoveries: z.array(z.object({ id, alertId: id, queueKind: reliabilityQueueKindSchema, itemId: id, status: recoveryStatusSchema, stateVersion: z.number().int().positive(), replayClass: reliabilityReplayClassSchema, nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER"]), createdAt: instant }).strict()),
  traces: z.array(z.object({ traceId: id, spans: z.array(z.object({ spanId: id, parentSpanId: id.nullable(), kind: reliabilitySignalKindSchema, outcomeCode: reliabilityOutcomeCodeSchema, resourceType: z.string().min(1), resourceId: id, durationMs: z.number().int().nonnegative().nullable(), observedAt: instant }).strict()) }).strict()),
  latestCheckpoint: z.object({ id, manifestFingerprint: hash, totalRows: z.number().int().nonnegative(), tableCount: z.number().int().positive(), createdAt: instant }).strict().nullable(),
  latestRestoreDrill: z.object({ id, status: z.enum(["PASSED", "FAILED", "REFUSED"]), schemaMatch: z.boolean(), countsMatch: z.boolean(), completedAt: instant }).strict().nullable(),
  latestGate: z.object({ id, status: z.enum(["PASSED", "FAILED"]), operationCount: z.number().int().positive(), p95LatencyMs: z.number().int().nonnegative(), thresholdMs: z.number().int().positive(), evidenceLabel: z.literal("SYNTHETIC"), createdAt: instant }).strict().nullable(),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

const fieldCockpitSchema = z.object({
  schemaVersion: z.literal(RELIABILITY_SCHEMA_VERSION),
  generatedAt: instant,
  workspace: z.object({ id, name: z.string().min(1) }).strict(),
  role: z.literal("FIELD_WORKER"),
  interruptions: z.array(z.object({ id, status: reliabilityAlertStatusSchema, nextAction: z.string().min(1).max(240) }).strict()),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

export const reliabilityCockpitSchema = z.discriminatedUnion("role", [ownerCockpitSchema, fieldCockpitSchema]);
export type ReliabilityCockpit = z.infer<typeof reliabilityCockpitSchema>;
