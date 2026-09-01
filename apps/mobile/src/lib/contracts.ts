import { z } from "zod";

export const mobileRoleSchema = z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]);
export type MobileRole = z.infer<typeof mobileRoleSchema>;

const permissionsSchema = z
  .object({
    financialsVisible: z.boolean(),
    canManageReceivables: z.boolean(),
    canScheduleFollowUps: z.boolean(),
    canApprovePreparedActions: z.boolean(),
    externalTransportAuthorized: z.literal(false),
  })
  .strict();

const workspaceSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    defaultTimezone: z.string().min(1),
    defaultLocale: z.string().min(1),
    role: mobileRoleSchema,
    permissions: permissionsSchema,
  })
  .strict();

export const mobileBootstrapSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    user: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
      })
      .strict(),
    workspaces: z.array(workspaceSummarySchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    value.workspaces.forEach((workspace, index) => {
      const expected = workspace.role !== "FIELD_WORKER";
      if (
        workspace.permissions.financialsVisible !== expected ||
        workspace.permissions.canManageReceivables !== expected ||
        workspace.permissions.canScheduleFollowUps !== expected ||
        workspace.permissions.canApprovePreparedActions !== expected
      ) {
        context.addIssue({
          code: "custom",
          message: "MOBILE_ROLE_PERMISSIONS_REFUSED",
          path: ["workspaces", index, "permissions"],
        });
      }
    });
  });

const projectIdentitySchema = z
  .object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) })
  .strict();
const contactIdentitySchema = z
  .object({ id: z.string().min(1), displayName: z.string().min(1) })
  .strict();
const contactFieldSchema = contactIdentitySchema
  .extend({
    companyName: z.string().min(1).nullable(),
    role: z.string().min(1).nullable(),
    preferredLanguage: z.string().min(1),
    project: projectIdentitySchema.nullable(),
  })
  .strict();
const contactOwnerSchema = contactFieldSchema
  .extend({
    normalizedPhone: z.string().min(3).nullable(),
    normalizedEmail: z.string().email().nullable(),
  })
  .strict();
const projectSummarySchema = projectIdentitySchema
  .extend({
    status: z.string().min(1),
    _count: z
      .object({
        contacts: z.number().int().nonnegative(),
        calendarItems: z.number().int().nonnegative(),
        openLoops: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const workspaceCockpitSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    defaultTimezone: z.string().min(1),
    defaultLocale: z.string().min(1),
    projects: z.array(projectSummarySchema),
    role: mobileRoleSchema,
  })
  .strict();

const calendarFieldSchema = z
  .object({
    id: z.string().min(1),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable(),
    timezone: z.string().min(1),
    verificationState: z.string().min(1),
    project: projectIdentitySchema.nullable(),
    contact: contactIdentitySchema.nullable(),
  })
  .strict();
const calendarOwnerSchema = calendarFieldSchema.extend({ title: z.string().min(1) }).strict();

const loopFieldSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    dueAt: z.string().datetime().nullable(),
    nextResponsibleRole: z.string().min(1),
    stateVersion: z.number().int().positive(),
    project: projectIdentitySchema.nullable(),
  })
  .strict();
const loopOwnerSchema = loopFieldSchema.extend({ nextAction: z.string().min(1) }).strict();

const actionFieldSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    status: z.string().min(1),
    dueAt: z.string().datetime().nullable(),
    version: z.number().int().positive(),
    project: projectIdentitySchema.nullable(),
    contact: contactIdentitySchema.nullable(),
  })
  .strict();
const actionOwnerSchema = actionFieldSchema
  .extend({ payloadHash: z.string().min(1), payload: z.unknown() })
  .strict();

const fieldReceivableSchema = z
  .object({
    id: z.string().min(1),
    project: z.object({ code: z.string().min(1), name: z.string().min(1) }).strict(),
    status: z.string().min(1),
    dueAt: z.string().datetime(),
    followUps: z.array(
      z
        .object({
          kind: z.string().min(1),
          status: z.string().min(1),
          dueAt: z.string().datetime(),
        })
        .strict(),
    ),
  })
  .strict();

const ownerReceivableSchema = z
  .object({
    id: z.string().min(1),
    project: z.object({ code: z.string().min(1), name: z.string().min(1) }).strict(),
    contact: contactIdentitySchema.nullable(),
    invoiceReference: z.string().min(1),
    originalAmountMinor: z.number().int().nonnegative(),
    outstandingAmountMinor: z.number().int().nonnegative(),
    currency: z.literal("CAD"),
    issuedAt: z.string().datetime(),
    dueAt: z.string().datetime(),
    status: z.string().min(1),
    version: z.number().int().positive(),
    events: z.array(
      z
        .object({
          kind: z.string().min(1),
          amountMinor: z.number().int().nonnegative(),
          resultingOutstandingMinor: z.number().int().nonnegative(),
          occurredAt: z.string().datetime(),
          sourceRef: z.string().min(1),
        })
        .strict(),
    ),
    followUps: z.array(
      z
        .object({
          kind: z.string().min(1),
          status: z.string().min(1),
          dueAt: z.string().datetime(),
          channel: z.string().min(1),
          actionId: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

function cockpitSchemaForRole(role: MobileRole) {
  const fieldWorker = role === "FIELD_WORKER";
  return z
    .object({
      schemaVersion: z.literal(1),
      generatedAt: z.string().datetime(),
      workspace: workspaceCockpitSchema.extend({ role: z.literal(role) }).strict(),
      permissions: permissionsSchema,
      projects: z.array(projectSummarySchema),
      contacts: z.array(fieldWorker ? contactFieldSchema : contactOwnerSchema).default([]),
      calendar: z.array(fieldWorker ? calendarFieldSchema : calendarOwnerSchema),
      openLoops: z.array(fieldWorker ? loopFieldSchema : loopOwnerSchema),
      actions: z.array(fieldWorker ? actionFieldSchema : actionOwnerSchema),
      receivables: z.array(fieldWorker ? fieldReceivableSchema : ownerReceivableSchema),
    })
    .strict();
}

const FORBIDDEN_FIELD_KEYS = new Set([
  "invoiceReference",
  "originalAmountMinor",
  "outstandingAmountMinor",
  "amountMinor",
  "sourceRef",
  "payload",
  "payloadHash",
  "nextAction",
  "title",
  "normalizedPhone",
  "normalizedEmail",
]);

function rejectForbiddenFieldWorkerKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenFieldWorkerKeys);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_FIELD_PROJECTION_REFUSED");
    rejectForbiddenFieldWorkerKeys(child);
  }
}

export function parseMobileCockpit(value: unknown) {
  const header = z
    .object({ workspace: z.object({ role: mobileRoleSchema }).passthrough() })
    .passthrough()
    .parse(value);
  if (header.workspace.role === "FIELD_WORKER") rejectForbiddenFieldWorkerKeys(value);
  const parsed = cockpitSchemaForRole(header.workspace.role).parse(value);
  const expected = header.workspace.role !== "FIELD_WORKER";
  if (
    parsed.permissions.financialsVisible !== expected ||
    parsed.permissions.canManageReceivables !== expected ||
    parsed.permissions.canScheduleFollowUps !== expected ||
    parsed.permissions.canApprovePreparedActions !== expected
  ) {
    throw new Error("MOBILE_ROLE_PERMISSIONS_REFUSED");
  }
  return parsed;
}

export const commandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    resultType: z.enum([
      "RECEIVABLE_RECORDED",
      "PAYMENT_RECORDED",
      "FOLLOW_UP_SCHEDULED",
    ]),
    replayed: z.boolean(),
    data: z.unknown(),
  })
  .strict();

export type MobileBootstrap = z.infer<typeof mobileBootstrapSchema>;
export type MobileWorkspace = MobileBootstrap["workspaces"][number];
export type MobileCockpit = ReturnType<typeof parseMobileCockpit>;
