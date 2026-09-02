import { z } from "zod";
import {
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_CALENDAR_WRITE_SCOPE,
  calendarConnectionModeSchema,
} from "@/lib/construction-operating-assistant-r3/connector-contracts";

export const MICROSOFT_CALENDAR_READ_SCOPE = "Calendars.Read" as const;
export const MICROSOFT_CALENDAR_WRITE_SCOPE = "Calendars.ReadWrite" as const;

export const calendarConnectorProviderSchema = z.enum([
  "google_calendar",
  "microsoft_calendar",
]);
export type CalendarConnectorProvider = z.infer<typeof calendarConnectorProviderSchema>;

export const calendarConnectorRoleSchema = z.enum(["owner", "admin", "member", "field_worker"]);
export type CalendarConnectorRole = z.infer<typeof calendarConnectorRoleSchema>;

export const calendarConnectorAccountStatusSchema = z.enum([
  "NOT_CONFIGURED",
  "PREPARED",
  "CONNECTED",
  "REVOKED",
  "ERROR",
]);

export function calendarProviderScopes(
  provider: CalendarConnectorProvider,
  mode: z.infer<typeof calendarConnectionModeSchema>,
): string[] {
  if (provider === "google_calendar") {
    return mode === "READ_ONLY" ? [GOOGLE_CALENDAR_READ_SCOPE] : [GOOGLE_CALENDAR_WRITE_SCOPE];
  }
  return mode === "READ_ONLY"
    ? [MICROSOFT_CALENDAR_READ_SCOPE]
    : [MICROSOFT_CALENDAR_WRITE_SCOPE];
}

export const calendarProviderStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    provider: calendarConnectorProviderSchema,
    label: z.string().min(1).max(80),
    status: calendarConnectorAccountStatusSchema,
    requestedScopes: z.array(z.string().min(1).max(240)),
    grantedScopes: z.array(z.string().min(1).max(240)),
    readEnabled: z.boolean(),
    writeEnabled: z.boolean(),
    credentialStored: z.boolean(),
    stateVersion: z.number().int().nonnegative(),
    revokedAt: z.string().datetime().nullable(),
    missingConfiguration: z.array(z.string().min(1).max(80)),
    nextAction: z.string().min(1).max(360),
    externalTransportEnabled: z.literal(false),
  })
  .strict();
export type CalendarProviderStatus = z.infer<typeof calendarProviderStatusSchema>;

export const calendarConnectorCockpitSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: z.string().min(1).max(160),
    role: calendarConnectorRoleSchema,
    providers: z.array(calendarProviderStatusSchema).max(2),
    externalTransportEnabled: z.literal(false),
    secretValuesVisible: z.literal(false),
  })
  .strict();
export type CalendarConnectorCockpit = z.infer<typeof calendarConnectorCockpitSchema>;

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  requestId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(1).max(200),
  workspaceId: z.string().min(1).max(160),
  provider: calendarConnectorProviderSchema,
  expectedStateVersion: z.number().int().nonnegative(),
};

export const prepareCalendarConnectionCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("PREPARE_CONNECTION"),
    mode: calendarConnectionModeSchema,
  })
  .strict();

export const revokeCalendarConnectionCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("REVOKE_LOCAL"),
  })
  .strict();

export const calendarConnectorCommandSchema = z.discriminatedUnion("action", [
  prepareCalendarConnectionCommandSchema,
  revokeCalendarConnectionCommandSchema,
]);
export type CalendarConnectorCommand = z.infer<typeof calendarConnectorCommandSchema>;

export const prepareCalendarSyncCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("PREPARE_SYNC"),
    accountId: z.string().min(1).max(160),
    rangeStartsAt: z.string().datetime(),
    rangeEndsAt: z.string().datetime(),
    timezone: z.string().min(1).max(120),
  })
  .strict();

export const prepareCalendarWriteCommandSchema = z
  .object({
    ...commandBase,
    action: z.literal("PREPARE_WRITE"),
    accountId: z.string().min(1).max(160),
    operation: z.enum(["CREATE", "UPDATE"]),
    calendarItemId: z.string().min(1).max(160),
    canonicalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    remoteEventRefHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    remotePreconditionHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.operation === "CREATE" &&
      (value.remoteEventRefHash !== null || value.remotePreconditionHash !== null)
    ) {
      context.addIssue({ code: "custom", message: "CREATE_REMOTE_BINDING_REFUSED" });
    }
    if (
      value.operation === "UPDATE" &&
      (value.remoteEventRefHash === null || value.remotePreconditionHash === null)
    ) {
      context.addIssue({ code: "custom", message: "UPDATE_REMOTE_BINDING_REQUIRED" });
    }
  });

export const calendarConnectorWorkCommandSchema = z.union([
  prepareCalendarSyncCommandSchema,
  prepareCalendarWriteCommandSchema,
]);
export type CalendarConnectorWorkCommand = z.infer<typeof calendarConnectorWorkCommandSchema>;

export const calendarConnectorApiCommandSchema = z.union([
  calendarConnectorCommandSchema,
  calendarConnectorWorkCommandSchema,
]);

export const calendarConnectorCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    workspaceId: z.string().min(1),
    provider: calendarConnectorProviderSchema,
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    status: z.enum(["PREPARED", "REVOKED"]),
    stateVersion: z.number().int().positive(),
    requestedScopes: z.array(z.string().min(1)),
    missingConfiguration: z.array(z.string().min(1)),
    localAccessDisabled: z.boolean(),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();
export type CalendarConnectorCommandResult = z.infer<
  typeof calendarConnectorCommandResultSchema
>;

export const calendarConnectorWorkResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    requestId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    workspaceId: z.string().min(1),
    provider: calendarConnectorProviderSchema,
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    kind: z.enum(["SYNC_READ", "CREATE_EVENT", "UPDATE_EVENT"]),
    requiredScope: z.string().min(1),
    canonicalFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    remotePreconditionRequired: z.boolean(),
    cursorReferencePresent: z.boolean(),
    providerExecutionAvailable: z.literal(false),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();
export type CalendarConnectorWorkResult = z.infer<typeof calendarConnectorWorkResultSchema>;

export const googleCalendarAuthoritySchema = z
  .object({
    accountStatus: z.literal("connected"),
    grantedScopes: z.array(z.string().min(1)),
    revokedAt: z.null(),
  })
  .strict();

export const microsoftCalendarAuthoritySchema = z
  .object({
    accountStatus: z.literal("connected"),
    grantedScopes: z.array(z.string().min(1)),
    revokedAt: z.null(),
  })
  .strict();
export type MicrosoftCalendarAuthority = z.infer<typeof microsoftCalendarAuthoritySchema>;

export const calendarProviderDispositionSchema = z.enum([
  "APPLY_PAGE",
  "FULL_RESYNC_REQUIRED",
  "REAUTHORIZATION_REQUIRED",
  "CONFLICT_REQUIRES_REVIEW",
  "RETRY_LATER",
  "REFUSED",
]);
export type CalendarProviderDisposition = z.infer<typeof calendarProviderDispositionSchema>;
