import { z } from "zod";

export const CONSTRUCTION_PERMISSION_CENTER_VERSION = 1 as const;

export const permissionCapabilityStateSchema = z.enum([
  "INTERNAL",
  "PREPARED_DISABLED",
  "GRANTED_LOCAL",
  "REVOKED",
]);

const effectiveCapabilitySchema = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    state: permissionCapabilityStateSchema,
    effective: z.boolean(),
  })
  .strict();

const memberSchema = z
  .object({
    userId: z.string().min(1).max(160),
    displayName: z.string().min(1).max(200),
    role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]),
    status: z.literal("ACTIVE"),
    isCurrentUser: z.boolean(),
  })
  .strict();

const connectorGrantSchema = z
  .object({
    id: z.string().min(1).max(160),
    capability: z.string().min(1).max(160),
    state: permissionCapabilityStateSchema,
    stateVersion: z.number().int().positive(),
    requestedScopes: z.array(z.string().min(1).max(500)).max(20),
    grantedScopes: z.array(z.string().min(1).max(500)).max(20),
    revocable: z.boolean(),
  })
  .strict();

const connectorSchema = z
  .object({
    id: z.string().min(1).max(160),
    provider: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    state: permissionCapabilityStateSchema,
    stateVersion: z.number().int().positive(),
    grants: z.array(connectorGrantSchema).max(50),
    revocable: z.boolean(),
    externalTransportEnabled: z.literal(false),
  })
  .strict();

const basePermissionCenterSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_PERMISSION_CENTER_VERSION),
    generatedAt: z.string().datetime(),
    workspace: z
      .object({
        id: z.string().min(1).max(160),
        name: z.string().min(1).max(200),
      })
      .strict(),
    currentUser: z
      .object({
        userId: z.string().min(1).max(160),
        role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]),
      })
      .strict(),
    capabilities: z.array(effectiveCapabilitySchema).max(50),
    members: z.array(memberSchema).max(200),
    externalTransportEnabled: z.literal(false),
  })
  .strict();

export const officePermissionCenterSchema = basePermissionCenterSchema
  .extend({
    currentUser: z
      .object({
        userId: z.string().min(1).max(160),
        role: z.enum(["OWNER", "OFFICE_MANAGER"]),
      })
      .strict(),
    connectors: z.array(connectorSchema).max(50),
    canManageConnectors: z.literal(true),
  })
  .strict();

export const fieldPermissionCenterSchema = basePermissionCenterSchema
  .extend({
    currentUser: z
      .object({
        userId: z.string().min(1).max(160),
        role: z.literal("FIELD_WORKER"),
      })
      .strict(),
    connectors: z.tuple([]),
    canManageConnectors: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.members.length !== 1 ||
      value.members[0]?.userId !== value.currentUser.userId ||
      value.members[0]?.isCurrentUser !== true ||
      value.capabilities.some((capability) =>
        capability.key.includes("FINANCIAL") ||
        capability.key.includes("RECEIVABLE") ||
        capability.key.includes("CONNECTOR"),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "FIELD_PERMISSION_PROJECTION_INVALID",
      });
    }
  });

export const constructionPermissionCenterSchema = z.union([
  officePermissionCenterSchema,
  fieldPermissionCenterSchema,
]);

export const permissionCenterQuerySchema = z
  .object({ workspaceId: z.string().min(1).max(160) })
  .strict();

const revokeAccountSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_PERMISSION_CENTER_VERSION),
    action: z.literal("REVOKE_ACCOUNT_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    accountId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
  })
  .strict();

const revokeGrantSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_PERMISSION_CENTER_VERSION),
    action: z.literal("REVOKE_GRANT_LOCAL"),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    accountId: z.string().min(1).max(160),
    grantId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
  })
  .strict();

export const revokePermissionCommandSchema = z.discriminatedUnion("action", [
  revokeAccountSchema,
  revokeGrantSchema,
]);

export const revokePermissionResultSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_PERMISSION_CENTER_VERSION),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    accountId: z.string().min(1).max(160),
    grantId: z.string().min(1).max(160).nullable(),
    target: z.enum(["ACCOUNT", "GRANT"]),
    state: z.literal("REVOKED"),
    stateVersion: z.number().int().positive(),
    operationId: z.string().min(1).max(160),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type ConstructionPermissionCenter = z.infer<
  typeof constructionPermissionCenterSchema
>;
export type RevokePermissionCommand = z.infer<
  typeof revokePermissionCommandSchema
>;
export type RevokePermissionResult = z.infer<
  typeof revokePermissionResultSchema
>;
