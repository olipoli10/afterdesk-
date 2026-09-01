import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { PermissionCenterClient } from "@/components/construction-operating-assistant-r16/permission-center-client";
import { constructionPermissionCenterForUser } from "@/server/construction-operating-assistant-r16/permissions";

export const dynamic = "force-dynamic";

export default async function ConstructionPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await requireRole("CLIENT");
  const requested = (await searchParams).workspaceId;
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: {
      userId: user.id,
      status: "active",
      workspace: { status: "active", ...(requested ? { id: requested } : {}) },
    },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (!membership) {
    return <p className="text-[#A1A8B3]">Aucun espace Construction actif.</p>;
  }
  const snapshot = await constructionPermissionCenterForUser({
    userId: user.id,
    workspaceId: membership.workspaceId,
  });
  return <PermissionCenterClient initial={snapshot} />;
}
