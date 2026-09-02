import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { clientPortalLangOf } from "@/lib/i18n/client-portal";
import { CommercialAccountPanel } from "@/components/construction-operating-assistant-r34/commercial-account-panel";
import { commercialAccountForUser } from "@/server/construction-operating-assistant-r34/commercial";

export const dynamic = "force-dynamic";
export const metadata = { title: "Construction account" };

export default async function ConstructionAccountPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const user = await requireRole("CLIENT");
  const requested = (await searchParams).workspaceId;
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: { userId: user.id, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active", ...(requested ? { id: requested } : {}) } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (!membership) return <p className="text-[#A1A8B3]">Aucun compte Construction autorisé.</p>;
  const locale = clientPortalLangOf((await headers()).get("x-site-lang")) === "fr" ? "fr-CA" as const : "en-CA" as const;
  const projection = await commercialAccountForUser({ userId: user.id, workspaceId: membership.workspaceId });
  return <CommercialAccountPanel projection={projection} locale={locale} />;
}
