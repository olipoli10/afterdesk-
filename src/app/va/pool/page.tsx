import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { poolForVa, type VaPoolView } from "@/lib/queries/tasks";
import { familyOf, familyRank, FAMILIES } from "@/lib/families";
import { EmptyState, LinkButton } from "@/components/ui";
import { BoardTile, duePill } from "./board-tile";
import { vaProfileFor } from "../layout";

/**
 * THE BOARD — the founder-approved pool design ("variant 3"). Not a feed of
 * full-width cards: a dusk masthead with live counts, a filter row, a
 * four-family category key that doubles as navigation, then per-category
 * groups of compact tiles, two-up wherever two fit.
 *
 * Hierarchy strategy: colour names the KIND of work (four families), size
 * names the category, and tone (dusk → paper → white) builds the rhythm a
 * flat stack never had. Reserved colours stay reserved — green #166049 is
 * payout only; red #A82318 is the ≤24h pill only; a category is always a
 * dot + label, never a fill.
 *
 * The default view caps each group at GROUP_CAP tiles with a ghost "+N more"
 * cell, so the page's height tracks the category count, not the task count.
 * Nothing claimable is hidden: every category name is a link to its full
 * flat list, and the sort/filter chips are one tap.
 *
 * RULE 2: the query is poolForVa() — its select never lists clientPriceCents,
 * clientId or clientDeadlineUtc, and filenames stay out entirely (counts
 * only): the pool is visible to every approved worker.
 */

export const metadata = {
  title: "Available work",
  robots: { index: false, follow: false },
};

/** Tiles per group in the default view — two rows of the two-up grid. */
const GROUP_CAP = 4;

type View = "all" | "due24" | "high" | "pay";

function viewHref(v: View): string {
  if (v === "due24") return "/va/pool?view=due24";
  if (v === "high") return "/va/pool?view=high";
  if (v === "pay") return "/va/pool?sort=pay";
  return "/va/pool";
}

function chip(active: boolean): string {
  return `inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[3px] border px-3.5 font-mono text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] ${
    active
      ? "border-[#14161A] bg-[#14161A] text-white"
      : "border-[#D5D2CB] text-[#14161A] hover:border-[#14161A]"
  }`;
}

function slugOf(t: VaPoolView): string {
  return t.category?.slug ?? "unfiled";
}

export default async function VaPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; cat?: string }>;
}) {
  const user = await requireRole("VA");
  const [profile, settings, params] = await Promise.all([
    vaProfileFor(user.id),
    getSettings(),
    searchParams,
  ]);
  if (profile?.status !== "approved") redirect("/va");

  const tasks = await poolForVa({
    score: profile.scoreCache,
    ratedCount: profile.ratedCount,
    highValueThreshold: settings.highValueThreshold,
    minRatedDeliveries: settings.minRatedDeliveries,
  });

  // Counts over the whole visible pool — they never shift as you filter.
  const catCounts = new Map<string, { name: string; n: number }>();
  for (const t of tasks) {
    const slug = slugOf(t);
    const e = catCounts.get(slug) ?? { name: t.category?.name ?? "Unfiled", n: 0 };
    e.n += 1;
    catCounts.set(slug, e);
  }
  // Board order: family by family, biggest category first inside each.
  const cats = [...catCounts.entries()]
    .map(([slug, v]) => ({ slug, ...v, famRank: familyRank(slug) }))
    .sort((a, b) => a.famRank - b.famRank || b.n - a.n || a.name.localeCompare(b.name));

  const due24 = tasks.filter((t) => duePill(t.vaDeadlineUtc)?.tone === "soon");
  const highValue = tasks.filter((t) => t.tier === "high_value");

  // An unknown ?cat= is ignored, never an error state.
  const cat = params.cat && catCounts.has(params.cat) ? params.cat : null;
  const view: View =
    cat ? "all"
    : params.view === "due24" ? "due24"
    : params.view === "high" ? "high"
    : params.sort === "pay" ? "pay"
    : "all";

  // The flat list each non-default view renders. DB order is already
  // deadline-asc; "pay" re-ranks globally by payout.
  const flat: { title: string; list: VaPoolView[] } | null = cat
    ? { title: catCounts.get(cat)!.name, list: tasks.filter((t) => slugOf(t) === cat) }
    : view === "due24"
      ? { title: "Due within 24 h", list: due24 }
      : view === "high"
        ? { title: "High value", list: highValue }
        : view === "pay"
          ? {
              title: "Highest pay first",
              list: [...tasks].sort((a, b) => (b.vaPayoutCents ?? 0) - (a.vaPayoutCents ?? 0)),
            }
          : null;

  const gatedFromHighValue =
    profile.scoreCache === null ||
    profile.scoreCache < settings.highValueThreshold ||
    profile.ratedCount < settings.minRatedDeliveries;

  // The key shows only families that actually hold open work.
  const presentFamilies = FAMILIES.filter((f) =>
    cats.some((c) => familyOf(c.slug).key === f.key)
  );

  return (
    <>
      {/* ── masthead (dusk) ── */}
      <div className="-mx-5 -mt-7 mb-0 bg-[#1B2740]">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 py-6">
          <div className="min-w-0 flex-[1_1_300px]">
            <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#9AA9C4]">
              Task pool
            </p>
            <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-[30px]">
              Available work
            </h1>
            <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-[#9AA9C4]">
              Unclaimed and open to every approved worker. First to claim keeps the task.
            </p>
          </div>
          <div className="flex shrink-0 gap-6">
            <div>
              <p className="font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-white sm:text-[38px]">
                {tasks.length}
              </p>
              <p className="mt-1.5 text-[12px] text-[#9AA9C4]">open now</p>
            </div>
            <div>
              <p className="font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#FF9A8B] sm:text-[38px]">
                {due24.length}
              </p>
              <p className="mt-1.5 text-[12px] text-[#9AA9C4]">due within 24 h</p>
            </div>
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="The pool is empty"
            body="New work is posted the moment a client approves a fixed price. Nothing is held back — when it's empty, it's empty."
          />
        </div>
      ) : (
        <>
          {/* ── filter chips ── */}
          <div className="flex flex-wrap gap-2 pb-1 pt-4">
            <Link href={viewHref("all")} className={chip(view === "all" && !cat)}>
              All open <span className="tabular-nums text-inherit opacity-60">{tasks.length}</span>
            </Link>
            {due24.length > 0 ? (
              <Link href={viewHref("due24")} className={chip(view === "due24")}>
                Due ≤ 24 h{" "}
                <span
                  className={`font-bold tabular-nums ${view === "due24" ? "text-[#FF9A8B]" : "text-[#A82318]"}`}
                >
                  {due24.length}
                </span>
              </Link>
            ) : null}
            {highValue.length > 0 ? (
              <Link href={viewHref("high")} className={chip(view === "high")}>
                High value{" "}
                <span className="tabular-nums text-inherit opacity-60">{highValue.length}</span>
              </Link>
            ) : null}
            <Link href={viewHref("pay")} className={chip(view === "pay")}>
              Highest pay first
            </Link>
          </div>

          {/* ── category key / navigation ── */}
          {cats.length >= 2 ? (
            <nav
              aria-label="Categories"
              className="mb-6 mt-2.5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-[4px] border border-[#E4E2DC] bg-white px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {presentFamilies.map((f) => (
                <div key={f.key} className="min-w-0 py-1">
                  <p
                    className="mb-1 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: f.hue }}
                  >
                    <span
                      aria-hidden
                      className="h-[3px] w-4 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: f.hue }}
                    />
                    {f.label}
                  </p>
                  {cats
                    .filter((c) => familyOf(c.slug).key === f.key)
                    .map((c) => (
                      <Link
                        key={c.slug}
                        href={`/va/pool?cat=${c.slug}`}
                        className="flex min-h-11 items-center gap-3 py-1 text-sm text-[#14161A] transition-colors duration-150 hover:underline hover:decoration-[#14161A]/30 hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#14161A]"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-sm tabular-nums text-[#5B6069]">
                          {c.n}
                        </span>
                      </Link>
                    ))}
                </div>
              ))}
            </nav>
          ) : null}

          {/* Above the board, not below it — under a full board nobody ever
              saw it, and a gated worker facing a high-value-only pool sees an
              empty page and concludes the app is broken. */}
          {gatedFromHighValue ? (
            <div className="mb-6 rounded-[4px] border border-dashed border-[#14161A]/20 px-4 py-3">
              <p className="text-sm leading-relaxed text-[#5B6069]">
                <span className="font-medium text-[#14161A]">
                  High-value work isn&apos;t in your pool yet.
                </span>{" "}
                It unlocks at a{" "}
                <span className="font-mono tabular-nums text-[#14161A]">
                  {settings.highValueThreshold.toFixed(1)}
                </span>{" "}
                rating across{" "}
                <span className="font-mono tabular-nums text-[#14161A]">
                  {settings.minRatedDeliveries}
                </span>{" "}
                rated deliveries. You have{" "}
                <span className="font-mono tabular-nums text-[#14161A]">{profile.ratedCount}</span>.
              </p>
            </div>
          ) : null}

          {flat ? (
            /* ── one flat, complete list (a category, a filter, or the pay ranking) ── */
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[19px] font-semibold tracking-[-0.012em] text-[#14161A]">
                  {flat.title}
                </h2>
                <span className="font-mono text-[12px] tabular-nums text-[#5B6069]">
                  {flat.list.length} open
                </span>
              </div>
              {flat.list.length === 0 ? (
                <EmptyState
                  title="Nothing here right now"
                  body="This view is empty at the moment. The rest of the board still has open work."
                  action={<LinkButton href="/va/pool" variant="secondary">Show all open work</LinkButton>}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {flat.list.map((t) => (
                      <BoardTile key={t.id} task={t} headingLevel="h3" />
                    ))}
                  </div>
                  <p className="mt-5">
                    <LinkButton href="/va/pool" variant="secondary">
                      Show all open work
                    </LinkButton>
                  </p>
                </>
              )}
            </section>
          ) : (
            /* ── the board: per-category groups, capped, ghost link to the rest ── */
            <div className="space-y-7">
              {cats.map((c) => {
                const fam = familyOf(c.slug);
                const inGroup = tasks.filter((t) => slugOf(t) === c.slug);
                // Never hide a single tile behind a ghost that costs the same space.
                const shown =
                  inGroup.length <= GROUP_CAP + 1 ? inGroup : inGroup.slice(0, GROUP_CAP);
                return (
                  <section key={c.slug}>
                    <div
                      className="mb-2.5 flex items-center gap-2.5 rounded-[4px] px-3 py-2"
                      style={{ backgroundColor: fam.tint }}
                    >
                      <span
                        aria-hidden
                        className="h-[11px] w-[11px] shrink-0 rounded-full"
                        style={{ backgroundColor: fam.hue }}
                      />
                      <h2
                        className="min-w-0 text-[19px] font-semibold tracking-[-0.012em] [overflow-wrap:anywhere]"
                        style={{ color: fam.hue }}
                      >
                        <Link
                          href={`/va/pool?cat=${c.slug}`}
                          className="transition-colors duration-150 hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                        >
                          {c.name}
                        </Link>
                      </h2>
                      <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-[#5B6069]">
                        {c.n} open
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {shown.map((t) => (
                        <BoardTile key={t.id} task={t} headingLevel="h3" />
                      ))}
                      {inGroup.length > shown.length ? (
                        <Link
                          href={`/va/pool?cat=${c.slug}`}
                          className="flex min-h-11 items-center gap-2 rounded-[4px] border border-dashed border-[#D5D2CB] px-3.5 py-3 font-mono text-[12px] text-[#5B6069] transition-colors duration-150 hover:border-current hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
                        >
                          <span className="font-bold tabular-nums text-[#14161A]">
                            +{inGroup.length - shown.length}
                          </span>
                          more in {c.name} →
                        </Link>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
