import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, PageTitle } from "@/components/ui";

export default async function VaHome() {
  const user = await requireRole("VA");
  const profile = await prisma.vaProfile.findUnique({ where: { userId: user.id } });

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="My account" />
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900">Account status</p>
            <Badge className="bg-amber-50 text-amber-800 border-amber-200">
              {profile?.status === "pending_test" ? "Entry test required" : profile?.status}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Before you can see the task pool, you&apos;ll complete a short entry test —
            2–3 sample exercises graded personally by the operator. The test opens here
            shortly (it&apos;s being finalized). Once you pass, you&apos;ll browse available
            tasks, see the payout for each, and claim work first-come-first-served.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Payouts are shown per task in USD before you claim. Your quality score
            starts building with your first rated delivery.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
