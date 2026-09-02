import { z } from "zod";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.string().datetime();
const queueKind = z.enum(["FOLLOW_UP_DUE", "CONNECTOR_PREPARED"]);
const replayClass = z.enum(["LOCAL_REPLAY_SAFE", "EXTERNAL_EFFECT_UNCERTAIN"]);
const alertStatus = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);
const recoveryStatus = z.enum(["PREPARED", "APPLIED", "QUARANTINED", "REFUSED", "REVOKED"]);
const commandBase = { schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id };

export const mobileReliabilityCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("SCAN_WORKSPACE") }).strict(),
  z.object({ ...commandBase, action: z.literal("ACKNOWLEDGE_ALERT"), alertId: id, expectedAlertVersion: z.number().int().positive(), reasonCode: z.enum(["OWNER_REVIEWED", "RECOVERY_PREPARED"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("RESOLVE_ALERT"), alertId: id, expectedAlertVersion: z.number().int().positive(), reasonCode: z.enum(["ITEM_RECOVERED", "ITEM_CANCELLED", "FALSE_POSITIVE"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("PREPARE_RECOVERY"), alertId: id, expectedAlertVersion: z.number().int().positive(), queueKind, itemId: id, expectedItemVersion: z.number().int().positive(), recoveryAction: z.enum(["REQUEUE_LOCAL", "QUARANTINE"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("APPLY_RECOVERY"), recoveryOperationId: id, expectedRecoveryVersion: z.number().int().positive() }).strict(),
  z.object({ ...commandBase, action: z.literal("REVOKE_RECOVERY"), recoveryOperationId: id, expectedRecoveryVersion: z.number().int().positive() }).strict(),
]);

const metric = z.object({ key: z.enum(["OPEN_ALERTS", "STALE_QUEUE_ITEMS", "RECOVERIES", "RESTORE_DRILLS", "LOAD_GATES"]), numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), windowStartedAt: instant, windowEndedAt: instant, evidenceLabel: z.literal("TEST") }).strict();
const alert = z.object({ id, alertType: z.enum(["FOLLOW_UP_STALE", "CONNECTOR_PREPARED_STALE"]), severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]), status: alertStatus, stateVersion: z.number().int().positive(), resourceType: z.enum(["FOLLOW_UP", "CONNECTOR_OPERATION"]), resourceId: id, resourceVersion: z.number().int().positive(), occurrenceCount: z.number().int().positive(), firstObservedAt: instant, lastObservedAt: instant, nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]), reasonCode: z.string().min(1) }).strict();
const recovery = z.object({ id, alertId: id, queueKind, itemId: id, status: recoveryStatus, stateVersion: z.number().int().positive(), replayClass, nextResponsibleRole: z.enum(["OWNER", "OFFICE_MANAGER"]), createdAt: instant }).strict();
const owner = z.object({
  schemaVersion: z.literal(1), generatedAt: instant, workspace: z.object({ id, name: z.string().min(1) }).strict(), role: z.enum(["OWNER", "OFFICE_MANAGER"]), health: z.enum(["HEALTHY", "ATTENTION", "BLOCKED", "UNKNOWN"]),
  metrics: z.array(metric).length(5), alerts: z.array(alert), recoveries: z.array(recovery),
  traces: z.array(z.object({ traceId: id, spans: z.array(z.object({ spanId: id, parentSpanId: id.nullable(), kind: z.string().min(1), outcomeCode: z.string().min(1), resourceType: z.string().min(1), resourceId: id, durationMs: z.number().int().nonnegative().nullable(), observedAt: instant }).strict()) }).strict()),
  latestCheckpoint: z.object({ id, manifestFingerprint: hash, totalRows: z.number().int().nonnegative(), tableCount: z.number().int().positive(), createdAt: instant }).strict().nullable(),
  latestRestoreDrill: z.object({ id, status: z.enum(["PASSED", "FAILED", "REFUSED"]), schemaMatch: z.boolean(), countsMatch: z.boolean(), completedAt: instant }).strict().nullable(),
  latestGate: z.object({ id, status: z.enum(["PASSED", "FAILED"]), operationCount: z.number().int().positive(), p95LatencyMs: z.number().int().nonnegative(), thresholdMs: z.number().int().positive(), evidenceLabel: z.literal("SYNTHETIC"), createdAt: instant }).strict().nullable(),
  providerObserved: z.literal(false), externalEffectCount: z.literal(0),
}).strict();
const field = z.object({ schemaVersion: z.literal(1), generatedAt: instant, workspace: z.object({ id, name: z.string().min(1) }).strict(), role: z.literal("FIELD_WORKER"), interruptions: z.array(z.object({ id, status: alertStatus, nextAction: z.string().min(1).max(240) }).strict()), providerObserved: z.literal(false), externalEffectCount: z.literal(0) }).strict();
export const mobileReliabilityCockpitSchema = z.union([owner, field]);

const FIELD_FORBIDDEN = new Set(["metrics", "traceId", "resourceId", "resourceVersion", "queueKind", "recoveries", "manifestFingerprint", "credentialRef", "amountMinor"]);
function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN.has(key)) throw new Error("MOBILE_RELIABILITY_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}
export function parseMobileReliabilityCockpit(value: unknown) {
  const parsed = mobileReliabilityCockpitSchema.parse(value);
  if (parsed.role === "FIELD_WORKER") rejectFieldLeaks(parsed);
  return parsed;
}

export const mobileReliabilityResultSchema = z.object({ schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id, replayed: z.boolean(), providerObserved: z.literal(false), externalEffectCount: z.literal(0), resultType: z.enum(["SCAN", "ALERT", "RECOVERY", "CHECKPOINT", "RESTORE_DRILL", "GATE_RUN"]) }).passthrough();
export type MobileReliabilityCockpit = ReturnType<typeof parseMobileReliabilityCockpit>;
export type MobileReliabilityCommand = z.infer<typeof mobileReliabilityCommandSchema>;
