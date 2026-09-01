import "server-only";

import {
  CONSTRUCTION_MOBILE_API_VERSION,
  constructionMobileBootstrapResponseSchema,
} from "@/lib/construction-operating-assistant-r8/mobile-contracts";
import { prisma } from "@/lib/db";
import {
  constructionPermissionsForRole,
  constructionProjectionRole,
} from "@/server/construction-operating-assistant-r7/gateway";

export async function constructionMobileBootstrapForUser(input: {
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const memberships = await prisma.constructionWorkspaceMember.findMany({
    where: {
      userId: input.userId,
      status: "active",
      workspace: { status: "active" },
    },
    orderBy: [{ workspace: { name: "asc" } }, { workspaceId: "asc" }],
    take: 100,
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          defaultTimezone: true,
          defaultLocale: true,
        },
      },
    },
  });

  return constructionMobileBootstrapResponseSchema.parse({
    schemaVersion: CONSTRUCTION_MOBILE_API_VERSION,
    generatedAt: new Date().toISOString(),
    user: {
      id: input.userId,
      name: input.userName,
      email: input.userEmail,
    },
    workspaces: memberships.map((membership) => {
      const role = constructionProjectionRole(membership.role);
      return {
        ...membership.workspace,
        role,
        permissions: constructionPermissionsForRole(role),
      };
    }),
  });
}
