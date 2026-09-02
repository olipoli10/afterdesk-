import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { PrivacyCenterClient } from "@/components/construction-operating-assistant-r30/privacy-center-client";
import { privacyCockpitForUser } from "@/server/construction-operating-assistant-r30/privacy";

export const dynamic = "force-dynamic";

export default async function ConstructionPrivacyPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requireRole("CLIENT");
  const requested = (await searchParams).workspaceId;
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: { userId: user.id, status: "active", workspace: { status: "active", ...(requested ? { id: requested } : {}) } },
    orderBy: { createdAt: "asc" }, select: { workspaceId: true },
  });
  if (!membership) return <p className="text-[#A1A8B3]">Aucun espace Construction actif.</p>;
  return <PrivacyCenterClient initial={await privacyCockpitForUser({ userId: user.id, workspaceId: membership.workspaceId })} />;
}
