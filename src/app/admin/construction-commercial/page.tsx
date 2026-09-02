import { requireRole } from "@/lib/authz";
import { Card, CardBody, PageTitle } from "@/components/ui";
import { commercialPortfolioForAdmin } from "@/server/construction-operating-assistant-r34/commercial";
import { applyCommercialAdminAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Construction commercial" };

export default async function ConstructionCommercialAdminPage() {
  const admin = await requireRole("ADMIN");
  const portfolio = await commercialPortfolioForAdmin({ actorId: admin.id });
  return (
    <main className="space-y-6 text-[#F7F6F3]">
      <PageTitle tone="night" title="Construction commercial" sub="Local plan state and informational canonical usage. Billing and providers stay disabled." />
      <div className="grid gap-4">
        {portfolio.workspaces.map((workspace) => (
          <Card key={workspace.workspaceId} tone="night">
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="font-semibold">{workspace.workspaceName}</p><p className="mt-1 font-mono text-xs text-[#A1A8B3]">{workspace.attentionReason} · {workspace.safeNextAction}</p></div>
                <p className="text-sm text-[#A1A8B3]">{workspace.account ? `${workspace.account.planKey} · ${workspace.account.state} · v${workspace.account.accountVersion}` : "No account"}</p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-4">{workspace.usage.readings.map((reading) => <div key={reading.metric} className="rounded-lg border border-white/10 p-3"><dt className="text-[11px] text-[#A1A8B3]">{reading.metric.replaceAll("_", " ")}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{reading.quantity}</dd></div>)}</dl>
              <form action={applyCommercialAdminAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="workspaceId" value={workspace.workspaceId} />
                <input type="hidden" name="expectedAccountVersion" value={workspace.account?.accountVersion ?? 0} />
                {!workspace.account ? <button name="action" value="assign" className="rounded-lg border border-[#D6B878] px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D6B878]">Assign EARLY ACCESS</button> : <>
                  {workspace.account.state !== "INTERNAL_TRIAL" && workspace.account.state !== "CANCELLED" ? <button name="action" value="INTERNAL_TRIAL" className="rounded-lg border border-white/20 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D6B878]">Internal trial</button> : null}
                  {workspace.account.state !== "SUSPENDED" && workspace.account.state !== "CANCELLED" ? <button name="action" value="SUSPENDED" className="rounded-lg border border-white/20 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D6B878]">Suspend</button> : null}
                  {workspace.account.state !== "CANCELLED" ? <button name="action" value="CANCELLED" className="rounded-lg border border-[#A65B4B] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D6B878]">Cancel</button> : null}
                </>}
              </form>
            </CardBody>
          </Card>
        ))}
      </div>
    </main>
  );
}
