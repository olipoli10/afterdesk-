import { requireRole } from "@/lib/authz";
import { Card, CardBody, PageTitle } from "@/components/ui";
import { constructionSupportPortfolioForAdmin } from "@/server/construction-operating-assistant-r34/support";

export const dynamic = "force-dynamic";
export const metadata = { title: "Construction support" };

export default async function ConstructionSupportAdminPage() {
  const admin = await requireRole("ADMIN");
  const portfolio = await constructionSupportPortfolioForAdmin({ actorId: admin.id });
  return <main className="space-y-6 text-[#F7F6F3]"><PageTitle tone="night" title="Construction support" sub="Exact human exceptions and their next owner. Reading this queue executes nothing." /><div className="grid gap-3">{portfolio.items.length ? portfolio.items.map((item) => <Card key={item.escalationId} tone="night"><CardBody><p className="font-semibold">{item.workspaceName} · {item.projectCode}</p><p className="mt-1 text-sm text-[#A1A8B3]">{item.state} · next: {item.nextResponsibleRole}</p><p className="mt-2 text-sm">{item.nextAction}</p></CardBody></Card>) : <p className="text-sm text-[#A1A8B3]">No open Construction support item.</p>}</div></main>;
}
