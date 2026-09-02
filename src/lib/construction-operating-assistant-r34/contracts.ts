import { z } from "zod";
import {
  COMMERCIAL_FEATURE_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_USAGE_METRIC_KEYS,
} from "@/lib/construction-operating-assistant-r34/registry";

export const COMMERCIAL_SCHEMA_VERSION = 1 as const;
const id = z.string().min(1).max(200);
const instant = z.string().datetime();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);

export const commercialPlanKeySchema = z.enum(COMMERCIAL_PLAN_KEYS);
export const commercialFeatureKeySchema = z.enum(COMMERCIAL_FEATURE_KEYS);
export const commercialUsageMetricKeySchema = z.enum(COMMERCIAL_USAGE_METRIC_KEYS);
export const commercialAccountStateSchema = z.enum([
  "PREPARED",
  "INTERNAL_TRIAL",
  "SUSPENDED",
  "CANCELLED",
]);
export const commercialDecisionKindSchema = z.enum([
  "ASSIGN_PLAN",
  "CHANGE_PLAN",
  "CHANGE_STATE",
]);

export const commercialAccountSnapshotSchema = z.object({
  accountId: id,
  workspaceId: id,
  planKey: commercialPlanKeySchema,
  planVersion: z.number().int().positive(),
  planHash: hash,
  state: commercialAccountStateSchema,
  periodStartsAt: instant,
  periodEndsAt: instant,
  accountVersion: z.number().int().positive(),
  includedFeatures: z.array(commercialFeatureKeySchema),
  usageMetricKeys: z.array(commercialUsageMetricKeySchema),
  priceState: z.literal("PRICE_NOT_SET"),
  monthlyPriceMinor: z.null(),
  currency: z.literal("CAD"),
  billingProvider: z.literal("DISABLED_LOCAL"),
}).strict();

export const commercialUsageReadingSchema = z.object({
  metric: commercialUsageMetricKeySchema,
  quantity: z.number().int().nonnegative(),
  sourceClass: z.enum(["CURRENT_CANONICAL_STATE", "CANONICAL_PERIOD_EVENTS"]),
  periodStartsAt: instant,
  periodEndsAt: instant,
}).strict();

export const commercialUsageProjectionSchema = z.object({
  schemaVersion: z.literal(COMMERCIAL_SCHEMA_VERSION),
  workspaceId: id,
  periodStartsAt: instant,
  periodEndsAt: instant,
  readings: z.array(commercialUsageReadingSchema).length(7),
  aggregateFingerprint: hash,
  informationalOnly: z.literal(true),
  amountDueMinor: z.null(),
  currency: z.literal("CAD"),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

export const commercialSupportSummarySchema = z.object({
  prepared: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  attentionRequired: z.number().int().nonnegative(),
  nextOwner: z.enum(["OWNER", "WORKER", "REVIEWER", "OPERATOR", "SYSTEM", "NONE"]),
}).strict();

export const ownerCommercialProjectionSchema = z.object({
  schemaVersion: z.literal(COMMERCIAL_SCHEMA_VERSION),
  generatedAt: instant,
  workspace: z.object({ id, name: z.string().min(1).max(200) }).strict(),
  role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  account: commercialAccountSnapshotSchema.nullable(),
  planAvailable: z.literal(true),
  plan: z.object({
    planKey: commercialPlanKeySchema,
    version: z.number().int().positive(),
    nameKey: z.string().min(1).max(120),
    descriptionKey: z.string().min(1).max(120),
    includedFeatures: z.array(commercialFeatureKeySchema),
    priceState: z.literal("PRICE_NOT_SET"),
    monthlyPriceMinor: z.null(),
    currency: z.literal("CAD"),
    billingProvider: z.literal("DISABLED_LOCAL"),
  }).strict(),
  usage: commercialUsageProjectionSchema,
  support: commercialSupportSummarySchema,
  unavailableCapabilities: z.array(z.enum(["LIVE_BILLING", "LIVE_SMS", "LIVE_CALLS", "LIVE_CALENDAR", "LIVE_ACCOUNTING"])).length(5),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

export const commercialCommandSchema = z.object({
  commandId: z.string().uuid(),
  workspaceId: id,
  kind: commercialDecisionKindSchema,
  expectedAccountVersion: z.number().int().nonnegative(),
  planKey: commercialPlanKeySchema.optional(),
  planVersion: z.number().int().positive().optional(),
  nextState: commercialAccountStateSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.kind === "ASSIGN_PLAN" || value.kind === "CHANGE_PLAN") {
    if (!value.planKey) context.addIssue({ code: "custom", path: ["planKey"], message: "Plan is required." });
    if (!value.planVersion) context.addIssue({ code: "custom", path: ["planVersion"], message: "Plan version is required." });
  }
  if (value.kind === "CHANGE_STATE" && !value.nextState) {
    context.addIssue({ code: "custom", path: ["nextState"], message: "Next state is required." });
  }
  if (value.kind !== "CHANGE_STATE" && value.nextState) {
    context.addIssue({ code: "custom", path: ["nextState"], message: "Unexpected next state." });
  }
});

export const commercialCommandResultSchema = z.object({
  schemaVersion: z.literal(COMMERCIAL_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  workspaceId: id,
  decisionKind: commercialDecisionKindSchema,
  account: commercialAccountSnapshotSchema,
  replayed: z.boolean(),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

export const commercialAttentionReasonSchema = z.enum([
  "MISSING_PLAN",
  "SUPPORT_EXCEPTION",
  "USAGE_REVIEW",
  "HEALTHY",
]);

export const adminCommercialPortfolioSchema = z.object({
  schemaVersion: z.literal(COMMERCIAL_SCHEMA_VERSION),
  generatedAt: instant,
  workspaces: z.array(z.object({
    workspaceId: id,
    workspaceName: z.string().min(1).max(200),
    account: commercialAccountSnapshotSchema.nullable(),
    usage: commercialUsageProjectionSchema,
    openSupportCount: z.number().int().nonnegative(),
    attentionReason: commercialAttentionReasonSchema,
    safeNextAction: z.enum(["ASSIGN_LOCAL_PLAN", "REVIEW_SUPPORT", "REVIEW_USAGE", "NO_ACTION"]),
    lastDecisionAt: instant.nullable(),
  }).strict()),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

export type CommercialCommand = z.infer<typeof commercialCommandSchema>;
export type CommercialCommandResult = z.infer<typeof commercialCommandResultSchema>;
export type CommercialAccountSnapshot = z.infer<typeof commercialAccountSnapshotSchema>;
export type CommercialUsageProjection = z.infer<typeof commercialUsageProjectionSchema>;
export type OwnerCommercialProjection = z.infer<typeof ownerCommercialProjectionSchema>;
export type AdminCommercialPortfolio = z.infer<typeof adminCommercialPortfolioSchema>;
