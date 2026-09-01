import { z } from "zod";

const provenanceSchema = z
  .object({
    source: z.literal("CANONICAL_DATABASE"),
    entityType: z.enum([
      "ConstructionCalendarItem",
      "ConstructionOpenLoop",
      "ConstructionOpenLoopEvidence",
      "ConstructionAction",
      "ConstructionReceivable",
    ]),
    entityId: z.string().min(1),
  })
  .strict();

const commonEventSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["CALENDAR", "OPEN_LOOP", "EVIDENCE", "ACTION", "RECEIVABLE"]),
    occurredAt: z.string().datetime(),
    status: z.string().min(1),
    summary: z.string().min(1),
    detail: z.string().min(1).nullable(),
    provenance: provenanceSchema,
  })
  .strict();

const ownerEventSchema = commonEventSchema
  .extend({
    financial: z
      .object({
        invoiceReference: z.string().min(1),
        outstandingAmountMinor: z.number().int().nonnegative(),
        currency: z.literal("CAD"),
      })
      .strict()
      .nullable(),
  })
  .strict();

const common = {
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  project: z
    .object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) })
    .strict(),
  timezone: z.string().min(1),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
};

const commonBrief = {
  appointmentsToday: z.number().int().nonnegative(),
  openLoops: z.number().int().nonnegative(),
  evidencePendingVerification: z.number().int().nonnegative(),
  preparedActions: z.number().int().nonnegative(),
  nextResponsibleRoles: z.array(z.string().min(1)).max(20),
};

const ownerSchema = z
  .object({
    ...common,
    role: z.enum(["OWNER", "OFFICE_MANAGER"]),
    brief: z
      .object({
        ...commonBrief,
        openReceivables: z.number().int().nonnegative(),
        outstandingAmountMinor: z.number().int().nonnegative(),
        currency: z.literal("CAD"),
        nextDecision: z.enum([
          "OPEN_LOOP_ACTION",
          "REVIEW_PREPARED_ACTION",
          "FOLLOW_UP_RECEIVABLE",
          "ATTEND_APPOINTMENT",
          "NO_ACTION",
        ]),
      })
      .strict(),
    events: z.array(ownerEventSchema),
  })
  .strict();

const fieldSchema = z
  .object({
    ...common,
    role: z.literal("FIELD_WORKER"),
    brief: z
      .object({
        ...commonBrief,
        nextDecision: z.enum(["CHECK_ASSIGNED_WORK", "ATTEND_APPOINTMENT", "NO_ACTION"]),
      })
      .strict(),
    events: z.array(commonEventSchema),
  })
  .strict();

const FORBIDDEN_FIELD_KEYS = new Set([
  "financial",
  "invoiceReference",
  "outstandingAmountMinor",
  "amountMinor",
  "nextAction",
  "sourceRef",
  "payload",
]);

function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_TIMELINE_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileProjectTimeline(value: unknown) {
  const role = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value).role;
  if (role === "FIELD_WORKER") {
    rejectFieldLeaks(value);
    return fieldSchema.parse(value);
  }
  return ownerSchema.parse(value);
}

export type MobileProjectTimeline = ReturnType<typeof parseMobileProjectTimeline>;
