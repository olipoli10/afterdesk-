import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { GoldenWorkflowCockpit, GoldenWorkflowUnavailable } from "@/components/construction-operating-assistant-r33/golden-workflow-cockpit";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { goldenWorkflowForUser } from "@/server/construction-operating-assistant-r33/golden-workflow";

export const dynamic = "force-dynamic";

export default async function GoldenWorkflowPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requireRole("CLIENT");
  const displayLocale = clientPortalLangOf((await headers()).get("x-site-lang")) === "fr" ? "fr-CA" : "en-CA";
  const requested = (await searchParams).workspaceId;
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: { userId: user.id, status: "active", workspace: { status: "active", ...(requested ? { id: requested } : {}) } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (!membership) return <p className="text-[#A1A8B3]">Aucun espace Construction actif.</p>;
  let snapshot;
  try {
    snapshot = await goldenWorkflowForUser({ userId: user.id, workspaceId: membership.workspaceId });
  } catch {
    return <GoldenWorkflowUnavailable displayLocale={displayLocale} />;
  }
  return <GoldenWorkflowCockpit displayLocale={displayLocale} snapshot={snapshot} />;
}
