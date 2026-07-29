import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { poolForVa } from "@/lib/queries/tasks";
import { formatCents } from "@/lib/money";
import { LocalTime } from "@/components/local-time";
import { ClaimButton } from "@/components/va-actions";
import { Badge, Card, EmptyState, PageTitle, moneyPayout } from "@/components/ui";
import { vaProfileFor } from "../layout";

/**
 * The task pool. Mobile-first: many workers only ever see this on a phone, so
 * it is a stack of cards, not a table.
 *
 * RULE 2: the query is poolForVa(), whose select never lists clientPriceCents,
 * clientId or clientDeadlineUtc. Filenames are excluded too — a client's own
 * filename can identify them, and the pool is visible to every approved worker.
 */

const metaLabel = "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]";

/** Roughly three clamped lines — shorter briefs don't need an expander. */
const CLAMP_THRESHOLD = 160;

export default async function VaPoolPage() {
  const user = await requireRole("VA");
  const [profile, settings] = await Promise.all([vaProfileFor(user.id), getSettings()]);
  if (profile?.status !== "approved") redirect("/va");

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
        sub="First come, first served. Every task here has a fixed payout the client already approved."
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Nothing in the pool right now"
          body="New tasks appear here the moment a client approves a fixed price. Check back — claiming is first come, first served."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-medium text-[#14161A]">{t.title}</h2>
                      {t.tier === "high_value" ? (
                        <Badge className="border-[#1B2740]/30 bg-[#1B2740]/[0.06] text-[#1B2740]">
                          High-value
                        </Badge>
                      ) : null}
                      {t.category ? (
                        <Badge className="border-[#14161A]/15 bg-transparent text-[#5B6069]">
                          {t.category.name}
                        </Badge>
                      ) : null}
                    </div>
                    {/* The full brief must be readable BEFORE claiming — a claim
                        release is recorded on the worker's record, so never make
                        them commit on a three-line fragment. */}
                    {t.description.length > CLAMP_THRESHOLD ? (
                      <details className="group mt-2">
                        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          <span className="line-clamp-3 text-sm leading-relaxed text-[#5B6069] group-open:hidden">
                            {t.description}
                          </span>
                          <span className="-my-1.5 inline-flex min-h-11 items-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A] group-open:hidden">
                            Read the full brief
                          </span>
                          <span className="-my-1.5 hidden min-h-11 items-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A] group-open:inline-flex">
                            Collapse the brief
                          </span>
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#5B6069]">
                          {t.description}
                        </p>
                      </details>
                    ) : (
                      <p className="mt-2 text-sm leading-relaxed text-[#5B6069]">{t.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xl font-medium ${moneyPayout}`}>
                      {t.vaPayoutCents != null ? formatCents(t.vaPayoutCents, t.currency) : "—"}
                    </p>
                    <p className={metaLabel}>Your payout</p>
                  </div>
                </div>

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#14161A]/[0.08] pt-3 text-sm">
                  <div>
                    <dt className={metaLabel}>Due from you</dt>
                    <dd className="mt-0.5 text-[#14161A]">
                      {t.vaDeadlineUtc ? (
                        <LocalTime iso={t.vaDeadlineUtc} dateStyle="short" />
                      ) : (
                        "No fixed deadline"
                      )}
                    </dd>
                  </div>
                  {t.quantity ? (
                    <div>
                      <dt className={metaLabel}>Volume</dt>
                      <dd className="mt-0.5 font-mono tabular-nums text-[#14161A]">{t.quantity}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className={metaLabel}>Files provided</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-[#14161A]">{t._count.files}</dd>
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
        <p className="mt-6 text-xs leading-relaxed text-[#5B6069]">
          High-value tasks unlock at a{" "}
          <span className="font-mono tabular-nums">{settings.highValueThreshold.toFixed(1)}</span>{" "}
          rating across{" "}
          <span className="font-mono tabular-nums">{settings.minRatedDeliveries}</span> rated
          deliveries. You have{" "}
          <span className="font-mono tabular-nums">{profile.ratedCount}</span> so far.
        </p>
      ) : null}

      <p className="mt-2">
        <Link
          href="/va"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← My work
        </Link>
      </p>
    </>
  );
}
