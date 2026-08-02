import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  standingCapacityAccountsForAdmin,
  draftContextNotesForAdmin,
  contextNotesForAdmin,
  settledStandingPeriods,
} from "@/lib/queries/standing-capacity";
import { selectablePeriods } from "@/lib/standing-period";
import { unroutedStandingTaskCounts } from "@/lib/queries/tasks";
import { EmptyState, moneyClient, moneyPayout } from "@/components/ui";
import { CreateAccountForm } from "@/components/standing-capacity-create-form";
import {
  ReassignForm,
  RecordPaymentForm,
  RecordWorkerPayoutForm,
  StatusControl,
  ContextNoteControls,
  DraftNoteControls,
} from "@/components/standing-capacity-admin-actions";

export const metadata = {
  title: "Standing capacity",
  robots: { index: false, follow: false },
};

export default async function AdminStandingCapacityPage() {
  await requireRole("ADMIN");

  const [accounts, settings, workers, clientsWithoutAccount, unrouted, settledPeriods] = await Promise.all([
    standingCapacityAccountsForAdmin(),
    getSettings(),
    prisma.vaProfile.findMany({
      where: { status: "approved" },
      select: { user: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", standingCapacityAccount: null },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    unroutedStandingTaskCounts(),
    settledStandingPeriods(),
  ]);

  const workerOptions = workers.map((w) => w.user);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#14161A]">Standing capacity</h1>
        <p className="mt-1 text-sm text-[#5B6069]">
          Recurring weekly-block accounts, who&apos;s assigned, and capacity used vs reserved.
        </p>
      </div>

      <div className="rounded-[6px] border border-[#14161A]/10 p-4">
        <p className="mb-3 text-[13px] font-medium text-[#14161A]">Open a new account</p>
        <CreateAccountForm clients={clientsWithoutAccount} tiers={settings.standingCapacityTiers} />
      </div>

      {accounts.length === 0 ? (
        <EmptyState title="No standing capacity accounts yet" body="Open one above." />
      ) : (
        <div className="space-y-6">
          {await Promise.all(
            accounts.map(async (account) => {
              const [drafts, notes] = await Promise.all([
                draftContextNotesForAdmin(account.id),
                contextNotesForAdmin(account.id),
              ]);
              const assignee = account.assignments[0]?.worker;
              const waiting = unrouted.get(account.id) ?? 0;
              // Which weeks are recordable, and which are already settled.
              // Periods roll automatically whether or not the week was billed,
              // so without this list a week missed at the time stayed missed.
              const settled = settledPeriods.get(account.id) ?? new Set<number>();
              const periods = selectablePeriods(account).map((p) => ({
                value: p.periodStart.toISOString(),
                label: `${p.periodStart.toLocaleDateString()} – ${p.periodEnd.toLocaleDateString()}`,
                settled: settled.has(p.periodStart.getTime()),
              }));
              const capacityMinutes = account.tierHours * 60;
              const usedPct = Math.min(
                100,
                Math.round((account.minutesUsedThisPeriod / capacityMinutes) * 100)
              );
              const lastPayment = account.payments[0];

              return (
                <div key={account.id} className="rounded-[6px] border border-[#14161A]/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-medium text-[#14161A]">
                        {account.client.name}{" "}
                        <span className="font-normal text-[#5B6069]">({account.client.email})</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-[#5B6069]">
                        {account.tierHours}h/week ·{" "}
                        <span className={moneyClient}>${(account.weeklyClientPriceCents / 100).toFixed(0)}</span>{" "}
                        client ·{" "}
                        <span className={moneyPayout}>${(account.weeklyVaPayoutCents / 100).toFixed(0)}</span>{" "}
                        worker · {account.status}
                      </p>
                    </div>
                    <StatusControl accountId={account.id} status={account.status} />
                  </div>

                  <div className="mt-3">
                    <p className="text-[12px] text-[#5B6069]">
                      {Math.round(account.minutesUsedThisPeriod / 60)}h used of {account.tierHours}h this
                      period (ends {account.currentPeriodEnd.toLocaleDateString()})
                    </p>
                    <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#14161A]/8">
                      <div className="h-full rounded-full bg-[#14161A]" style={{ width: `${usedPct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 border-t border-[#14161A]/8 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                        Currently assigned
                      </p>
                      <p className="mb-2 text-[13px] text-[#14161A]">
                        {assignee ? assignee.name : "Unassigned — new tasks wait for this."}
                      </p>
                      {/* These are excluded from the pricing queue, so this is
                          the only place they surface. The client's minutes are
                          already spent on them and nobody is working them. */}
                      {waiting > 0 ? (
                        <p className="mb-2 text-[13px] font-medium text-[#8C2F23]">
                          {waiting === 1
                            ? "1 task submitted and waiting to be routed."
                            : `${waiting} tasks submitted and waiting to be routed.`}{" "}
                          Assigning a specialist routes them immediately.
                        </p>
                      ) : null}
                      <ReassignForm accountId={account.id} workers={workerOptions} />
                      {/* Shown even with nobody currently assigned. This used
                          to be gated on `assignee`, which made a past week
                          unpayable the moment its worker was suspended or
                          replaced — the exact case backdating exists for. The
                          action resolves who held the account when the chosen
                          week closed, and says so if nobody did. */}
                      <div className="mt-2">
                        <RecordWorkerPayoutForm accountId={account.id} periods={periods} />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                        Payment
                      </p>
                      <p className="mb-2 text-[13px] text-[#14161A]">
                        {lastPayment
                          ? `Last recorded: $${(lastPayment.amountCents / 100).toFixed(0)} (${lastPayment.reference})`
                          : "No payment recorded yet"}
                      </p>
                      <RecordPaymentForm accountId={account.id} periods={periods} />
                    </div>
                  </div>

                  {drafts.length > 0 ? (
                    <div className="mt-4 border-t border-[#14161A]/8 pt-4">
                      <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                        Worker notes awaiting review ({drafts.length})
                      </p>
                      <div className="space-y-2">
                        {drafts.map((d) => (
                          <div key={d.id} className="rounded-[4px] border border-dashed border-[#14161A]/15 p-3">
                            <p className="text-[13px] text-[#14161A]">{d.body}</p>
                            <p className="mt-1 text-[11px] text-[#5B6069]">from {d.author.name}</p>
                            <div className="mt-2">
                              <DraftNoteControls noteId={d.id} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 border-t border-[#14161A]/8 pt-4">
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#5B6069]">
                      Account history ({notes.filter((n) => n.visible).length} published)
                    </p>
                    <ContextNoteControls accountId={account.id} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
