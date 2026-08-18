import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OFFERINGS } from "@/lib/offerings";
import { SERVICES_I18N } from "@/lib/i18n/services";
import sitemap from "@/app/sitemap";

/**
 * THE STOREFRONT IS CLOSED. THE PRODUCT IS NOT.
 *
 * Standing Capacity bills a weekly block of hours — tierHours multiplied by
 * weeklyClientPriceCents, drawn down in minutes — and its public page said so
 * in as many words: "It is a capacity service, not outcome pricing." That is
 * an honest description of the invoice and the one thing the client
 * positioning cannot carry, because Endvera sells finished outcomes rather
 * than blocks of labour. Rewording the page would have made the copy lie about
 * the billing.
 *
 * So this suite pins both halves, and the second half matters as much as the
 * first: a depublication that quietly broke existing accounts would be a worse
 * outcome than leaving the page up. Nothing here touches the schema, the
 * billing or the portal.
 */

const ROOT = join(__dirname, "..");

/** Every .ts/.tsx file under a directory, for the repo-wide sweeps below. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("Standing Capacity is unpublished from the public storefront", () => {
  it("the public page no longer exists as a route", () => {
    expect(existsSync(join(ROOT, "src/app/services/standing-capacity"))).toBe(false);
  });

  it("/services/standing-capacity redirects TEMPORARILY to /services", () => {
    // Temporary on purpose: a permanent redirect tells search engines to forget
    // the URL, which is the wrong signal for an offer that may return as
    // recurring fixed-price outcomes.
    const config = read("next.config.ts");
    expect(config).toContain('source: "/services/standing-capacity"');
    expect(config).toContain('destination: "/services"');
    expect(config).toMatch(/source: "\/services\/standing-capacity",[\s\S]{0,120}permanent: false/);
  });

  it("the services hub offers no capacity card", () => {
    expect(OFFERINGS.map((o) => o.slug)).not.toContain("standing-capacity");
    expect(OFFERINGS.every((o) => !o.href.includes("standing-capacity"))).toBe(true);
  });

  it("no public surface still sells hours, in any of the four languages", () => {
    // The hub's own title, heading and intro sold the capacity half. A card
    // removed from a page whose H1 still reads "or recurring capacity" is not
    // an unpublished offer, it is a broken one.
    /**
     * The first version of this regex listed paraphrases and missed the offer's
     * ACTUAL names: "standing capacity" itself was absent, and so were
     * "capacité permanente" (fr) and "capacidad fija" (es). Reverting the FR,
     * ES or TL intro alone left this test green while the page went back to
     * selling capacity — three of the four languages it claimed to cover.
     */
    const HOURS =
      /standing capacity|managed hours|weekly capacity|recurring capacity|reserved weekly|hour block|capacité (permanente|récurrente|hebdomadaire)|capacidad (fija|recurrente|semanal)|temps réservé|tiempo reservado|reserved time kada/i;
    for (const [lang, dict] of Object.entries(SERVICES_I18N)) {
      for (const [field, value] of [
        ["meta.title", dict.meta.title],
        ["meta.description", dict.meta.description],
        ["h1", dict.h1],
        ["intro", dict.intro],
      ] as [string, string][]) {
        expect(HOURS.test(value), `${lang}.${field} still sells hours: ${value}`).toBe(false);
      }
    }
  });

  it("the registration page no longer proposes reserved weekly capacity", () => {
    const source = read("src/app/(public)/register/page.tsx");
    expect(source).not.toMatch(/reserved weekly capacity|weekly hours|managed hours/i);
  });

  it("the sitemap no longer invites crawlers to the page", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes("/services/standing-capacity"))).toBe(false);
    // Not vacuous: the sitemap still lists the pages that ARE published.
    expect(urls.some((u) => u.endsWith("/services"))).toBe(true);
  });

  it("NOTHING in src/ references the removed page except the redirect itself", () => {
    /**
     * This replaced a closed list of four files matched on JSX `href=`. Three
     * of those four passed before the change too — offerings.ts wrote
     * `href: "..."` with a colon, sitemap.ts a bare string, and services/page
     * uses `href={offering.href}`, never a literal. So it proved almost
     * nothing, and it could not see a link left anywhere it did not name.
     *
     * A repo-wide sweep for the path in ANY form is what the invariant
     * actually is: after the depublication the only place that string may
     * appear is the redirect that retires it.
     */
    const offenders = walk(join(ROOT, "src")).filter((file) => {
      if (file.endsWith(join("src", "proxy.ts"))) return false;
      return readFileSync(file, "utf8").includes("/services/standing-capacity");
    });
    expect(
      offenders.map((f) => f.slice(ROOT.length + 1)),
      "the removed page is still referenced in src/"
    ).toEqual([]);
    // Not vacuous: the redirect that replaces it does exist, outside src/.
    expect(read("next.config.ts")).toContain("/services/standing-capacity");
  });

  it("the proxy no longer claims the route, since the redirect runs before it", () => {
    // next.config redirects are evaluated ahead of middleware, so the path can
    // never reach the language-cookie logic. Leaving it in the matcher would be
    // a dead entry that reads as if the page were still served.
    const proxy = read("src/proxy.ts");
    expect(proxy).not.toContain('"/services/standing-capacity"');
    // Not vacuous: the other document pages are still matched.
    expect(proxy).toContain('"/services"');
  });

  it("every offering in the list has copy to render, in all four languages", () => {
    /**
     * The hub used to resolve copy through a Record<string, ...> keyed by slug.
     * TypeScript types that lookup as always-defined, so a row added to
     * offerings.ts with no copy compiled cleanly and crashed at render on
     * `copy.audience`. The dict is now a fixed-length tuple joined by index.
     *
     * That tuple catches a SHORT LANGUAGE at build time and nothing else. It
     * cannot see offerings.ts, which is typed Offering[]; indexing a 4-tuple
     * with a plain number is always-defined while noUncheckedIndexedAccess is
     * off, so a fifth row over there compiles and crashes at render exactly
     * like the old Record did. This assertion is the only guard for that case,
     * which is why it compares the two lengths rather than just checking that
     * each card has text.
     */
    for (const [lang, dict] of Object.entries(SERVICES_I18N)) {
      expect(dict.offerings.length, `${lang} has a different number of cards`).toBe(
        OFFERINGS.length
      );
      dict.offerings.forEach((copy, i) => {
        expect(copy.title.length, `${lang} card ${i} has no title`).toBeGreaterThan(0);
        expect(copy.description.length, `${lang} card ${i} has no description`).toBeGreaterThan(0);
      });
    }
  });

  it("the standing-capacity page body is still preserved for a future rebuild", () => {
    /**
     * The CARD copy is gone, and deliberately: /services is now organised by
     * kind of work, so a purchasing arrangement would not be a card in that
     * list even if the offer returned. What is worth keeping is the page
     * body — four languages of it, the expensive half of a rebuild — and that
     * is still in services.ts under STANDING_I18N.
     */
    const source = read("src/lib/i18n/services.ts");
    expect(source).toContain("STANDING_I18N");
    expect(source).toMatch(/NO CONSUMER TODAY, AND KEPT ON PURPOSE/);
  });
});

describe("existing Standing Capacity accounts keep working", () => {
  it("the client portal route still exists and is NOT redirected", () => {
    expect(existsSync(join(ROOT, "src/app/client/standing-capacity/page.tsx"))).toBe(true);
    const config = read("next.config.ts");
    expect(config).not.toContain('"/client/standing-capacity"');
  });

  it("the worker and admin routes still exist and are NOT redirected", () => {
    expect(existsSync(join(ROOT, "src/app/va/standing-capacity/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/admin/standing-capacity/page.tsx"))).toBe(true);
    const config = read("next.config.ts");
    expect(config).not.toContain('"/va/standing-capacity"');
    expect(config).not.toContain('"/admin/standing-capacity"');
  });

  it("the server actions are untouched", () => {
    const actions = read("src/server/actions/standing-capacity.ts");
    // The full lifecycle an existing account depends on: submitting work into
    // the block, opening/closing an account, assigning its specialist, and
    // recording the period's payment and payout.
    for (const fn of [
      "submitStandingTask",
      "createStandingCapacityAccount",
      "setStandingCapacityStatus",
      "assignWorker",
      "recordPeriodPayment",
      "recordWorkerPeriodPayout",
    ]) {
      expect(actions).toContain(fn);
    }
  });

  it("the portal still routes an account holder's tasks and deliverables", () => {
    // The empty state changed (it used to pitch the offer and link to the page
    // that is now gone). Everything an account HOLDER needs is below it.
    const page = read("src/app/client/standing-capacity/page.tsx");
    expect(page).toContain("standingCapacityForClient");
    expect(page).toContain("STANDING_STATUS_LABELS");
    /**
     * The empty state must NOT announce that the offer is closed. An operator
     * can still open an account from the admin screen, so a client who agreed
     * to one by phone an hour ago would read a denial of what they were just
     * promised. It states the account's actual condition and points at the
     * route that is definitely open.
     */
    expect(page).toContain("Nothing is set up on this account yet");
    expect(page).toContain("/client/tasks/new");
    expect(page).not.toMatch(/not (open|available) for new accounts|no longer offered/i);
  });

  it("billing and schema are untouched by this pass", () => {
    const schema = read("prisma/schema.prisma");
    for (const field of ["tierHours", "weeklyClientPriceCents", "minutesUsedThisPeriod"]) {
      expect(schema).toContain(field);
    }
  });

  it("the terms still GOVERN the weekly allocation without still SELLING it", () => {
    /**
     * The first version of this test pinned /^weekly capacity allocation/ and
     * pointed at the wrong sentence. That phrase occurred exactly once, in the
     * intro — "before work is purchased: what you are buying ... a weekly
     * capacity allocation" — which is the offer being sold to a prospect, on a
     * page in the sitemap. The clause that actually governs a live account
     * reads "the weekly allocation shown in the account" and does not contain
     * the word "capacity" at all.
     *
     * So the test locked the sentence that had to go and would have failed the
     * moment anyone removed it. Both halves are now asserted explicitly, in
     * all four languages.
     */
    const legal = read("src/lib/i18n/legal.ts");
    const governing = [
      "weekly allocation shown in the account",
      "allocation affichée dans le compte",
      "asignación mostrada en la cuenta",
      "allocation na nakalagay sa account",
    ];
    for (const clause of governing) {
      expect(legal, `a live account lost its governing clause: ${clause}`).toContain(clause);
    }
    // And the terms no longer present capacity as one of the things on sale.
    expect(legal).not.toMatch(/what you are buying[^"]*weekly capacity allocation/i);
    expect(legal).not.toMatch(/approved scope or capacity/i);
  });
});
