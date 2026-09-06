import { z } from "zod";

export const DESIGN_PARTNER_PILOT_METRICS = [
  "ACTIVE_MINUTES",
  "CORRECTIONS_REQUESTED",
  "MANUAL_CONTEXT_REPETITIONS",
  "TASK_COMPLETION_RATE",
  "APPROVAL_CLARITY",
  "FAILURE_RECOVERY_CLARITY",
  "HUMAN_SUPPORT_MINUTES",
  "ESTIMATED_TIME_SAVED",
  "ESTIMATED_LOSS_AVOIDED_CAD",
  "WOULD_CONTINUE",
  "WOULD_PAY_CONCRETE",
] as const;

export const designPartnerPilotPreflightSchema = z.object({
  schemaVersion: z.literal(1),
  campaignId: z.string().regex(/^R39-[A-Z0-9-]+$/u),
  status: z.literal("LOCAL_PREFLIGHT_ONLY"),
  targetDesignPartners: z.literal(3),
  durationDays: z.number().int().min(7).max(30),
  workflow: z.literal("SECRETARY_COMMAND_TO_VERIFIED_OUTCOME"),
  participantSlots: z.array(z.object({
    slot: z.number().int().min(1).max(3),
    status: z.literal("NOT_ADMITTED"),
    participantRef: z.null(),
  }).strict()).length(3),
  requiredMetrics: z.tuple(DESIGN_PARTNER_PILOT_METRICS.map((metric) => z.literal(metric)) as [
    z.ZodLiteral<(typeof DESIGN_PARTNER_PILOT_METRICS)[0]>,
    ...z.ZodType[],
  ]),
  authority: z.object({
    designPartnerContactAuthorized: z.literal(false),
    customerDataAuthorized: z.literal(false),
    providerDispatchAuthorized: z.literal(false),
    externalTransportAuthorized: z.literal(false),
    productionAuthorized: z.literal(false),
  }).strict(),
  stopConditions: z.array(z.enum([
    "CONSENT_MISSING",
    "WORKSPACE_ISOLATION_FAILURE",
    "UNAPPROVED_EXTERNAL_WRITE",
    "CROSS_PARTNER_DATA_EXPOSURE",
    "BUDGET_OR_DURATION_EXCEEDED",
    "OUTCOME_CANNOT_BE_VERIFIED",
  ])).length(6),
  fabricatedResultsAllowed: z.literal(false),
}).strict().superRefine((value, context) => {
  const slots = value.participantSlots.map((slot) => slot.slot);
  if (new Set(slots).size !== 3 || slots.join(",") !== "1,2,3") {
    context.addIssue({ code: "custom", path: ["participantSlots"], message: "R39A_SLOT_SEQUENCE_INVALID" });
  }
  if (new Set(value.requiredMetrics).size !== DESIGN_PARTNER_PILOT_METRICS.length) {
    context.addIssue({ code: "custom", path: ["requiredMetrics"], message: "R39A_METRIC_SET_INVALID" });
  }
  if (new Set(value.stopConditions).size !== value.stopConditions.length) {
    context.addIssue({ code: "custom", path: ["stopConditions"], message: "R39A_STOP_CONDITION_DUPLICATE" });
  }
});

export const designPartnerPilotPreflightResultSchema = z.object({
  schemaVersion: z.literal(1),
  campaignId: z.string().min(1),
  verdict: z.literal("BLOCKED_EXTERNAL_AUTHORITY"),
  localPreflightComplete: z.literal(true),
  admittedDesignPartners: z.literal(0),
  recordedCustomerData: z.literal(false),
  providerCalls: z.literal(0),
  externalTransports: z.literal(0),
  missingAuthority: z.tuple([
    z.literal("DESIGN_PARTNER_CONTACT_AND_CONSENT"),
    z.literal("CUSTOMER_DATA_SCOPE"),
    z.literal("PROVIDER_AND_TRANSPORT_SCOPE"),
  ]),
}).strict();

export function evaluateDesignPartnerPilotPreflight(input: unknown) {
  const manifest = designPartnerPilotPreflightSchema.parse(input);
  return designPartnerPilotPreflightResultSchema.parse({
    schemaVersion: 1,
    campaignId: manifest.campaignId,
    verdict: "BLOCKED_EXTERNAL_AUTHORITY",
    localPreflightComplete: true,
    admittedDesignPartners: 0,
    recordedCustomerData: false,
    providerCalls: 0,
    externalTransports: 0,
    missingAuthority: [
      "DESIGN_PARTNER_CONTACT_AND_CONSENT",
      "CUSTOMER_DATA_SCOPE",
      "PROVIDER_AND_TRANSPORT_SCOPE",
    ],
  });
}
