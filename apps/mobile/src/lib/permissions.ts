import { z } from "zod";

const stateSchema = z.enum(["INTERNAL", "PREPARED_DISABLED", "GRANTED_LOCAL", "REVOKED"]);
const capabilitySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  state: stateSchema,
  effective: z.boolean(),
}).strict();
const memberSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]),
  status: z.literal("ACTIVE"),
  isCurrentUser: z.boolean(),
}).strict();
const grantSchema = z.object({
  id: z.string().min(1),
  capability: z.string().min(1),
  state: stateSchema,
  stateVersion: z.number().int().positive(),
  requestedScopes: z.array(z.string().min(1)).max(20),
  grantedScopes: z.array(z.string().min(1)).max(20),
  revocable: z.boolean(),
}).strict();
const connectorSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  state: stateSchema,
  stateVersion: z.number().int().positive(),
  grants: z.array(grantSchema).max(50),
  revocable: z.boolean(),
  externalTransportEnabled: z.literal(false),
}).strict();
const base = {
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  workspace: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
  capabilities: z.array(capabilitySchema).max(50),
  members: z.array(memberSchema).max(200),
  externalTransportEnabled: z.literal(false),
};
const officeSchema = z.object({
  ...base,
  currentUser: z.object({
    userId: z.string().min(1),
    role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  }).strict(),
  connectors: z.array(connectorSchema).max(50),
  canManageConnectors: z.literal(true),
}).strict();
const fieldSchema = z.object({
  ...base,
  currentUser: z.object({ userId: z.string().min(1), role: z.literal("FIELD_WORKER") }).strict(),
  connectors: z.tuple([]),
  canManageConnectors: z.literal(false),
}).strict();

export const mobilePermissionCenterSchema = z.union([officeSchema, fieldSchema]);

export const mobileRevokePermissionCommandSchema = z.discriminatedUnion("action", [
  z.object({
    schemaVersion: z.literal(1),
    action: z.literal("REVOKE_ACCOUNT_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1),
    accountId: z.string().min(1),
    expectedStateVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    action: z.literal("REVOKE_GRANT_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1),
    accountId: z.string().min(1),
    grantId: z.string().min(1),
    expectedStateVersion: z.number().int().positive(),
  }).strict(),
]);

export const mobileRevokePermissionResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  grantId: z.string().min(1).nullable(),
  target: z.enum(["ACCOUNT", "GRANT"]),
  state: z.literal("REVOKED"),
  stateVersion: z.number().int().positive(),
  operationId: z.string().min(1),
  replayed: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

const FORBIDDEN_KEYS = new Set([
  "credentialRef",
  "externalAccountKeyHash",
  "syncCursorRef",
  "token",
  "accessToken",
  "refreshToken",
  "invoiceReference",
  "amountMinor",
]);

function rejectForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectForbiddenKeys);
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("MOBILE_PERMISSION_SECRET_LEAK_REFUSED");
    rejectForbiddenKeys(nested);
  }
}

export function parseMobilePermissionCenter(value: unknown) {
  rejectForbiddenKeys(value);
  const parsed = mobilePermissionCenterSchema.parse(value);
  if (parsed.currentUser.role === "FIELD_WORKER") {
    if (
      parsed.members.length !== 1 ||
      parsed.members[0]?.userId !== parsed.currentUser.userId ||
      parsed.members[0]?.isCurrentUser !== true
    ) {
      throw new Error("MOBILE_PERMISSION_FIELD_SCOPE_REFUSED");
    }
  }
  return parsed;
}

export type MobilePermissionCenter = ReturnType<typeof parseMobilePermissionCenter>;
export type MobileRevokePermissionCommand = z.infer<typeof mobileRevokePermissionCommandSchema>;
