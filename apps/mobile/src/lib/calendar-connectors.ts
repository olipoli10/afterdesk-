import { z } from "zod";

const identifier = z.string().min(1).max(200);
const providerSchema = z.enum(["google_calendar", "microsoft_calendar"]);
const modeSchema = z.enum(["READ_ONLY", "READ_WRITE"]);

const providerStatusSchema = z.object({
  schemaVersion: z.literal(1),
  provider: providerSchema,
  label: z.string().min(1).max(80),
  status: z.enum(["NOT_CONFIGURED", "PREPARED", "CONNECTED", "REVOKED", "ERROR"]),
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
}).strict();

const cockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1).max(160),
  role: z.enum(["owner", "admin", "member", "field_worker"]),
  providers: z.array(providerStatusSchema).max(2),
  externalTransportEnabled: z.literal(false),
  secretValuesVisible: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker" && value.providers.length !== 0) {
    context.addIssue({ code: "custom", path: ["providers"], message: "FIELD_PROVIDERS_MUST_BE_EMPTY" });
  }
});

const FIELD_FORBIDDEN_KEYS = new Set([
  "credentialRef",
  "syncCursorRef",
  "externalAccountKeyHash",
  "accessToken",
  "refreshToken",
  "oauthCode",
  "clientSecret",
  "secret",
  "token",
]);

function containsFieldLeak(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFieldLeak);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => FIELD_FORBIDDEN_KEYS.has(key) || containsFieldLeak(nested),
  );
}

export function parseMobileCalendarConnectorCockpit(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { role?: unknown }).role === "field_worker" &&
    containsFieldLeak(value)
  ) {
    throw new Error("MOBILE_CALENDAR_CONNECTOR_FIELD_LEAK_REFUSED");
  }
  return cockpitSchema.parse(value);
}

export type MobileCalendarConnectorCockpit = ReturnType<
  typeof parseMobileCalendarConnectorCockpit
>;
export type MobileCalendarProviderStatus = z.infer<typeof providerStatusSchema>;

const commandBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  requestId: identifier,
  idempotencyKey: identifier,
  workspaceId: z.string().min(1).max(160),
  provider: providerSchema,
  expectedStateVersion: z.number().int().nonnegative(),
};

export const mobileCalendarConnectorCommandSchema = z.discriminatedUnion("action", [
  z.object({
    ...commandBase,
    action: z.literal("PREPARE_CONNECTION"),
    mode: modeSchema,
  }).strict(),
  z.object({
    ...commandBase,
    action: z.literal("REVOKE_LOCAL"),
  }).strict(),
]);
export type MobileCalendarConnectorCommand = z.infer<
  typeof mobileCalendarConnectorCommandSchema
>;

export const mobileCalendarConnectorCommandResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  requestId: identifier,
  idempotencyKey: identifier,
  workspaceId: z.string().min(1).max(160),
  provider: providerSchema,
  accountId: identifier,
  operationId: identifier,
  status: z.enum(["PREPARED", "REVOKED"]),
  stateVersion: z.number().int().positive(),
  requestedScopes: z.array(z.string().min(1).max(240)),
  missingConfiguration: z.array(z.string().min(1).max(80)),
  localAccessDisabled: z.boolean(),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();
