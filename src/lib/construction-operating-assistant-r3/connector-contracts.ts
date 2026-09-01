import { z } from "zod";

export const GOOGLE_CALENDAR_PROVIDER = "google_calendar" as const;
export const GOOGLE_CALENDAR_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly" as const;
export const GOOGLE_CALENDAR_WRITE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events" as const;

export const calendarConnectionModeSchema = z.enum(["READ_ONLY", "READ_WRITE"]);
export type CalendarConnectionMode = z.infer<typeof calendarConnectionModeSchema>;

export const connectorAccountStatusSchema = z.enum([
  "NOT_CONFIGURED",
  "PREPARED",
  "CONNECTED",
  "REVOKED",
  "ERROR",
]);

export const prepareCalendarConnectorSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("PREPARE_CONNECTION"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    mode: calendarConnectionModeSchema,
  })
  .strict();

export const revokeCalendarConnectorSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("REVOKE_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
  })
  .strict();

export const manageCalendarConnectorSchema = z.discriminatedUnion("action", [
  prepareCalendarConnectorSchema,
  revokeCalendarConnectorSchema,
]);

export const calendarConnectorStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: z.string().min(1),
    provider: z.literal(GOOGLE_CALENDAR_PROVIDER),
    status: connectorAccountStatusSchema,
    requestedScopes: z.array(z.string().min(1)),
    grantedScopes: z.array(z.string().min(1)),
    readEnabled: z.boolean(),
    writeEnabled: z.boolean(),
    credentialStored: z.boolean(),
    calendarRef: z.literal("primary"),
    stateVersion: z.number().int().nonnegative(),
    revokedAt: z.string().datetime().nullable(),
    externalTransportEnabled: z.literal(false),
    externalActivationReady: z.literal(false),
    nextStep: z.string().min(1),
  })
  .strict();

export type CalendarConnectorStatus = z.infer<typeof calendarConnectorStatusSchema>;

export const prepareCalendarConnectorResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    status: z.literal("PREPARED"),
    mode: calendarConnectionModeSchema,
    requestedScopes: z.array(z.string().min(1)).min(1),
    authorizationUrl: z.null(),
    missingConfiguration: z.tuple([
      z.literal("GOOGLE_CLIENT_ID"),
      z.literal("GOOGLE_REDIRECT_URI"),
      z.literal("ENCRYPTED_TOKEN_STORE"),
    ]),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type PrepareCalendarConnectorResult = z.infer<
  typeof prepareCalendarConnectorResultSchema
>;

export const revokeCalendarConnectorResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    accountId: z.string().min(1),
    operationId: z.string().min(1),
    status: z.literal("REVOKED"),
    localAccessDisabled: z.literal(true),
    providerRevocationRequired: z.boolean(),
    providerRevocationPerformed: z.literal(false),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type RevokeCalendarConnectorResult = z.infer<
  typeof revokeCalendarConnectorResultSchema
>;
