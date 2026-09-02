import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const INTERNAL_E2E_SCENARIO_KEY = "ENDVERA_CONSTRUCTION_INTERNAL_E2E" as const;
export const INTERNAL_E2E_SCENARIO_VERSION = 1 as const;

export const INTERNAL_E2E_CHECKPOINT_CODES = [
  "ONBOARDING_READY",
  "CLEAR_APPOINTMENT_STORED_ONCE",
  "AMBIGUITY_CLARIFIED_NO_WRITE",
  "INVOICE_EVIDENCE_GAPS_BLOCKED",
  "CONTRADICTION_PRESERVED",
  "AUTHORIZED_RESOLUTION_RECORDED",
  "READY_TO_INVOICE_EXACT",
  "PREPARED_ACTIONS_ZERO_DELIVERY",
  "HUMAN_ESCALATION_RESUMED_ONCE",
  "DUPLICATE_REPLAY_REFUSED",
  "RESTART_FINGERPRINT_IDENTICAL",
  "FIELD_FINANCIAL_LEAK_ZERO",
  "CROSS_WORKSPACE_REFUSED",
  "WEB_IOS_ANDROID_PARITY",
  "FINAL_NEXT_ACTION_DETERMINISTIC",
  "PACKAGE_STILL_VALID",
] as const;

export const internalE2ECheckpointCodeSchema = z.enum(INTERNAL_E2E_CHECKPOINT_CODES);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const gitObject = z.string().regex(/^[a-f0-9]{40}$/u);
const observedScalarSchema = z.union([
  z.string().min(1).max(160),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const observedSchema = z.union([
  observedScalarSchema,
  z.record(z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/u), observedScalarSchema).superRefine((value, context) => {
    if (Object.keys(value).length > 12) context.addIssue({ code: "custom", message: "INTERNAL_E2E_OBSERVED_TOO_LARGE" });
  }),
]);

export const internalE2ECheckpointSchema = z.object({
  sequence: z.number().int().min(1).max(INTERNAL_E2E_CHECKPOINT_CODES.length),
  code: internalE2ECheckpointCodeSchema,
  state: z.literal("PASS"),
  observed: observedSchema,
  canonicalFingerprint: hash,
  externalEffectCount: z.literal(0),
}).strict();

const reportWithoutHashSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioKey: z.literal(INTERNAL_E2E_SCENARIO_KEY),
  scenarioVersion: z.literal(INTERNAL_E2E_SCENARIO_VERSION),
  scenarioHash: hash,
  source: z.object({ head: gitObject, tree: gitObject }).strict(),
  databaseMode: z.literal("DISPOSABLE_POSTGRESQL"),
  checkpoints: z.array(internalE2ECheckpointSchema).length(INTERNAL_E2E_CHECKPOINT_CODES.length),
  preRestartFingerprint: hash,
  postRestartFingerprint: hash,
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
  verdict: z.literal("INTERNAL_SYNTHETIC_E2E_PASS"),
}).strict();

export const internalE2EReportSchema = reportWithoutHashSchema.extend({ reportHash: hash }).strict();

const FORBIDDEN_REPORT_KEYS = /(?:password|secret|token|credential|authorization|phone|email|address|recipient|body|message|transcript|raw|oauth)/iu;
const FORBIDDEN_REPORT_VALUES = /(?:bearer\s|@example\.|\+1\d{10}|BEGIN [A-Z ]*PRIVATE KEY)/iu;

export function assertInternalE2EReportSanitized(value: unknown, path = "report"): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertInternalE2EReportSanitized(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_REPORT_VALUES.test(value)) {
      throw new Error(`INTERNAL_E2E_REPORT_SECRET_REFUSED:${path}`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.test(key)) throw new Error(`INTERNAL_E2E_REPORT_FIELD_REFUSED:${path}.${key}`);
    assertInternalE2EReportSanitized(child, `${path}.${key}`);
  }
}

export function parseInternalE2EReport(value: unknown) {
  assertInternalE2EReportSanitized(value);
  const report = internalE2EReportSchema.parse(value);
  assertInternalE2ECheckpointOrder(report.checkpoints);
  if (report.preRestartFingerprint !== report.postRestartFingerprint) {
    throw new Error("INTERNAL_E2E_RESTART_FINGERPRINT_DRIFT");
  }
  const { reportHash, ...withoutHash } = report;
  if (reportHash !== sha256Canonical(withoutHash)) throw new Error("INTERNAL_E2E_REPORT_HASH_MISMATCH");
  return report;
}

export function assertInternalE2ECheckpointOrder(checkpoints: ReadonlyArray<{ sequence: number; code: string }>) {
  if (checkpoints.length !== INTERNAL_E2E_CHECKPOINT_CODES.length) throw new Error("INTERNAL_E2E_CHECKPOINT_COUNT_INVALID");
  for (const [index, expected] of INTERNAL_E2E_CHECKPOINT_CODES.entries()) {
    const checkpoint = checkpoints[index];
    if (!checkpoint || checkpoint.sequence !== index + 1 || checkpoint.code !== expected) {
      throw new Error(`INTERNAL_E2E_CHECKPOINT_ORDER_INVALID:${index + 1}:${expected}`);
    }
  }
}

export type InternalE2ECheckpointCode = z.infer<typeof internalE2ECheckpointCodeSchema>;
export type InternalE2ECheckpoint = z.infer<typeof internalE2ECheckpointSchema>;
export type InternalE2EReport = z.infer<typeof internalE2EReportSchema>;
export type InternalE2EObserved = z.infer<typeof observedSchema>;

