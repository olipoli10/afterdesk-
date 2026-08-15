import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_I18N } from "@/lib/i18n/client";
import { INSIDE_I18N } from "@/lib/i18n/inside";
import { SITE_LANGS } from "@/lib/i18n/langs";

/**
 * PUBLIC-SITE TRUTH GUARDS (ADR-022, Project Brain public-product
 * invariant 18).
 *
 * The repositioning is allowed to say "operation"; it is NOT allowed to say
 * things the released product does not do. These tests are the enforcement
 * point, and each one was proven to FIRE by planting its violation before
 * this file was committed — a pin that never fires is counted as coverage
 * while protecting nothing (the T022 lesson).
 *
 * The four guards:
 *  1. the homepage dictionary may not claim recurrence or autonomy, in any
 *     of the four languages;
 *  2. /inside may name recurrence only OUTSIDE the "available today" group,
 *     and may not leak internal engineering vocabulary (task ids, branch
 *     names, test counts) to customers;
 *  3. the Operation Console's amber/green states must carry their words —
 *     color is never the only carrier — and the sr-only journey must exist;
 *  4. the /services route survives the label change: the route file exists
 *     and no redirect moves it (ADR-022 approved no redirect).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every user-visible string in a dict subtree, functions included (they
 *  are called with representative arguments so their sentences count). */
function stringsOf(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "function") {
    try {
      return stringsOf((node as (...a: unknown[]) => unknown)(24));
    } catch {
      try {
        return stringsOf((node as (...a: unknown[]) => unknown)("X"));
      } catch {
        return [];
      }
    }
  }
  if (Array.isArray(node)) return node.flatMap(stringsOf);
  if (node && typeof node === "object") return Object.values(node).flatMap(stringsOf);
  return [];
}

/**
 * The banned homepage vocabulary. Recurrence in all four languages, and the
 * autonomy words that would turn the Console into a claim the product does
 * not support. Word-boundary-free on purpose for the accented/agglutinated
 * forms; every entry is lowercase and matched against lowercased text.
 */
const HOMEPAGE_BANNED = [
  "recurring",
  "recurrence",
  "récurrent",
  "récurrence",
  "recurrente",
  "paulit-ulit",
  "autonomous",
  "autonomously",
  "autonome",
  "autónomo",
  "autónoma",
  "unattended",
  "fully automated",
  "entièrement automatisé",
  "totalmente automatizado",
];

describe("the homepage dictionary claims no recurrence and no autonomy", () => {
  for (const { code } of SITE_LANGS) {
    it(`holds in ${code}`, () => {
      const all = stringsOf(CLIENT_I18N[code]).join(" · ").toLowerCase();
      for (const word of HOMEPAGE_BANNED) {
        expect(all, `homepage[${code}] must not contain "${word}"`).not.toContain(word);
      }
    });
  }
});

describe("/inside keeps its registry honest", () => {
  const RECURRENCE = ["recurring", "récurrent", "recurrente", "paulit-ulit"];

  for (const { code } of SITE_LANGS) {
    const t = INSIDE_I18N[code];

    it(`in ${code}, recurrence appears only outside AVAILABLE TODAY`, () => {
      const available = stringsOf(t.registry.available).join(" · ").toLowerCase();
      for (const word of RECURRENCE) {
        expect(available, `available[${code}] must not contain "${word}"`).not.toContain(word);
      }
      // The vision group is where the roadmap lives, and it must actually
      // say so in its own language — an empty vision group would mean the
      // registry stopped disclosing the plan.
      expect(t.registry.vision.items.length).toBeGreaterThan(0);
    });

    it(`in ${code}, no internal engineering vocabulary leaks to customers`, () => {
      const all = stringsOf(t).join(" · ");
      // Task ids (T035…), branch names (feat/…), test counts (85/85).
      expect(all).not.toMatch(/\bT0\d\d\b/);
      expect(all).not.toMatch(/\bfeat\//);
      expect(all).not.toMatch(/\b\d+\/\d+\b/);
      expect(all).not.toMatch(/HumanWorkUnit/);
    });

    it(`in ${code}, the three registry groups all exist and are labelled`, () => {
      expect(t.registry.available.label.length).toBeGreaterThan(0);
      expect(t.registry.building.label.length).toBeGreaterThan(0);
      expect(t.registry.vision.label.length).toBeGreaterThan(0);
      expect(t.registry.available.items.length).toBeGreaterThan(0);
      expect(t.registry.building.items.length).toBeGreaterThan(0);
    });
  }
});

describe("the Operation Console never lets color speak alone", () => {
  it("every language carries seven fully-worded stations and both status words", () => {
    for (const { code } of SITE_LANGS) {
      const c = CLIENT_I18N[code].console;
      expect(c.stations, `console[${code}] must have exactly 7 stations`).toHaveLength(7);
      for (const [label, body] of c.stations) {
        expect(label.trim().length, `console[${code}] station label empty`).toBeGreaterThan(0);
        expect(body.trim().length, `console[${code}] station body empty`).toBeGreaterThan(0);
      }
      expect(c.statusIssue.trim().length, `console[${code}] issue word empty`).toBeGreaterThan(0);
      expect(
        c.statusVerified.trim().length,
        `console[${code}] verified word empty`
      ).toBeGreaterThan(0);
      expect(c.srSummary.length, `console[${code}] sr summary too thin`).toBeGreaterThan(80);
      expect(c.reviewNote.trim().length, `console[${code}] review note empty`).toBeGreaterThan(0);
    }
  });

  it("the component renders the status WORDS next to the amber and green marks", () => {
    const src = read("src/components/operation-console.tsx");
    // The amber and green tokens are allowed here ONLY because the words
    // render beside them. Delete either render and this fires.
    expect(src).toContain("#D98324");
    expect(src).toContain("#1E7F5C");
    expect(src).toMatch(/\{copy\.statusIssue\}/);
    expect(src).toMatch(/\{copy\.statusVerified\}/);
  });

  it("the component carries the sr-only journey and no client-side JavaScript", () => {
    const src = read("src/components/operation-console.tsx");
    expect(src).toMatch(/sr-only/);
    expect(src).toMatch(/\{copy\.srSummary\}/);
    // Static slice: a Server Component with no interactivity. Turning this
    // into a client component is an explicit later decision, not a drift.
    expect(src).not.toMatch(/"use client"/);
    expect(src).not.toMatch(/useState|useEffect|setInterval|setTimeout/);
  });

  it("the homepage actually mounts it", () => {
    const src = read("src/app/page.tsx");
    expect(src).toMatch(/<OperationConsole copy=\{t\.console\} \/>/);
  });
});

describe("/services survives the operations relabel", () => {
  it("the route file still exists", () => {
    expect(read("src/app/services/page.tsx").length).toBeGreaterThan(0);
  });

  it("no redirect moves /services (ADR-022 approved none)", () => {
    const config = read("next.config.ts");
    // A redirect FROM /services would appear as source: "/services…".
    // The existing standing-capacity redirect TO /services must survive.
    expect(config).not.toMatch(/source:\s*["']\/services["']/);
    expect(config).toMatch(/destination:\s*["']\/services["']/);
  });
});
