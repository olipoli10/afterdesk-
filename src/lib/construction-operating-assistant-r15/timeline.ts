import { z } from "zod";

export const projectTimelineQuerySchema = z
  .object({
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
  })
  .strict();

export const timelineEventKindSchema = z.enum([
  "CALENDAR",
  "OPEN_LOOP",
  "EVIDENCE",
  "ACTION",
  "RECEIVABLE",
]);

const projectSchema = z
  .object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) })
  .strict();

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
    kind: timelineEventKindSchema,
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

const commonBriefSchema = z
  .object({
    appointmentsToday: z.number().int().nonnegative(),
    openLoops: z.number().int().nonnegative(),
    evidencePendingVerification: z.number().int().nonnegative(),
    preparedActions: z.number().int().nonnegative(),
    nextResponsibleRoles: z.array(z.string().min(1)).max(20),
  })
  .strict();

const ownerBriefSchema = commonBriefSchema
  .extend({
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
  .strict();

const fieldBriefSchema = commonBriefSchema
  .extend({
    nextDecision: z.enum(["CHECK_ASSIGNED_WORK", "ATTEND_APPOINTMENT", "NO_ACTION"]),
  })
  .strict();

const responseBase = {
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  project: projectSchema,
  timezone: z.string().min(1),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
};

export const ownerProjectTimelineSchema = z
  .object({
    ...responseBase,
    role: z.enum(["OWNER", "OFFICE_MANAGER"]),
    brief: ownerBriefSchema,
    events: z.array(ownerEventSchema).max(300),
  })
  .strict();

export const fieldProjectTimelineSchema = z
  .object({
    ...responseBase,
    role: z.literal("FIELD_WORKER"),
    brief: fieldBriefSchema,
    events: z.array(commonEventSchema).max(300),
  })
  .strict();

export type TimelineEvent = z.infer<typeof commonEventSchema>;
export type OwnerTimelineEvent = z.infer<typeof ownerEventSchema>;

export function localDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("TIMELINE_LOCAL_DATE_UNAVAILABLE");
  return `${year}-${month}-${day}`;
}

export function orderTimelineEvents<T extends { id: string; kind: string; occurredAt: string }>(
  events: readonly T[],
) {
  return [...events].sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  );
}
