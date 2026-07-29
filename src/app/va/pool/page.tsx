import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { poolForVa } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { ClaimButton } from "@/components/va-actions";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";

/**
 * The task pool. Mobile-first: many workers only ever see this on a phone, so
 * it is a stack of cards, not a table.
 *
 * RULE 2: the query is poolForVa(), whose select never lists clientPriceCents,
 * clientId or clientDeadlineUtc. Filenames are excluded too — a client's own
 * filename can identify them, and the pool is visible to every approved worker.
 */
export default async function VaPoolPage() {
  const user = await requireRole("VA");
  const profile = await prisma.vaProfile.findUnique({
    where: { userId: user.id },
    select: { status: true, scoreCache: true, ratedCount: true },
  });
  if (profile?.status !== "approved") redirect("/va");

  const settings = await getSettings();
  const tasks = await poolForVa({
    score: profile.scoreCache,
    ratedCount: profile.ratedCount,
    highValueThreshold: settings.highValueThreshold,
    minRatedDeliveries: settings.minRatedDeliveries,
  });

  const gatedFromHighValue =
    profile.scoreCache === null ||
    profile.scoreCache < settings.highValueThreshold ||
    profile.ratedCount < settings.minRatedDeliveries;

  return (
    <>
      <PageTitle
        title="Available work"
        sub="First come, first served. Every task here is already paid for by the client."
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Nothing in the pool right now"
          body="New tasks appear here as soon as they are paid for. Check back — claiming is first come, first served."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-medium text-neutral-900">{t.title}</h2>
                      {t.tier === "high_value" ? (
                        <Badge className="border-indigo-200 bg-indigo-50 text-indigo-800">
                          High-value
                        </Badge>
                      ) : null}
                      {t.category ? (
                        <Badge className="border-neutral-200 bg-neutral-50 text-neutral-600">
                          {t.category.name}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-600">
                      {t.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-semibold tabular-nums text-neutral-900">
                      {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                    </p>
                    <p className="text-[11px] text-neutral-400">you earn</p>
                  </div>
                </div>

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-100 pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-400">Due from you</dt>
                    <dd className="text-neutral-800">
                      {t.vaDeadlineUtc ? (
                        <LocalTime iso={t.vaDeadlineUtc} dateStyle="short" />
                      ) : (
                        "No fixed deadline"
                      )}
                    </dd>
                  </div>
                  {t.quantity ? (
                    <div>
                      <dt className="text-xs text-neutral-400">Volume</dt>
                      <dd className="text-neutral-800">{t.quantity}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-neutral-400">Files provided</dt>
                    <dd className="text-neutral-800">{t._count.files}</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <ClaimButton taskId={t.id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {gatedFromHighValue ? (
        <p className="mt-6 text-xs leading-relaxed text-neutral-500">
          High-value tasks unlock at a {settings.highValueThreshold.toFixed(1)} rating across{" "}
          {settings.minRatedDeliveries} rated deliveries. You have{" "}
          {profile.ratedCount} so far.
        </p>
      ) : null}

      <p className="mt-2 text-xs text-neutral-400">
        <Link href="/va" className="hover:text-neutral-700">
          ← My work
        </Link>
      </p>
    </>
  );
}
