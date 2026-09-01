import { z } from "zod";

export const CONSTRUCTION_MOBILE_API_VERSION = 1 as const;

export const constructionMobileRoleSchema = z.enum([
  "OWNER",
  "OFFICE_MANAGER",
  "FIELD_WORKER",
]);

export const constructionMobilePermissionsSchema = z
  .object({
    financialsVisible: z.boolean(),
    canManageReceivables: z.boolean(),
    canScheduleFollowUps: z.boolean(),
    canApprovePreparedActions: z.boolean(),
    externalTransportAuthorized: z.literal(false),
  })
  .strict();

export const constructionMobileWorkspaceSchema = z
  .object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(200),
    defaultTimezone: z.string().min(1).max(100),
    defaultLocale: z.string().min(1).max(32),
    role: constructionMobileRoleSchema,
    permissions: constructionMobilePermissionsSchema,
  })
  .strict();

export const constructionMobileBootstrapResponseSchema = z
  .object({
    schemaVersion: z.literal(CONSTRUCTION_MOBILE_API_VERSION),
    generatedAt: z.string().datetime(),
    user: z
      .object({
        id: z.string().min(1).max(160),
        name: z.string().min(1).max(200),
        email: z.string().email().max(320),
      })
      .strict(),
    workspaces: z.array(constructionMobileWorkspaceSchema).max(100),
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
          message: "CONSTRUCTION_MOBILE_ROLE_PERMISSIONS_INVALID",
          path: ["workspaces", index, "permissions"],
        });
      }
    });
  });

export type ConstructionMobileBootstrapResponse = z.infer<
  typeof constructionMobileBootstrapResponseSchema
>;
