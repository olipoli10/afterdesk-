import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_I18N } from "@/lib/i18n/client";
import { HOME_CONCIERGE_I18N } from "@/lib/i18n/home-assembly";
import { INSIDE_I18N } from "@/lib/i18n/inside";
import { SERVICES_I18N } from "@/lib/i18n/services";
import { V7_ACTS_I18N } from "@/lib/i18n/v7-acts";
import { SITE_LANGS } from "@/lib/i18n/langs";

/**
 * PUBLIC-SITE TRUTH GUARDS (ADR-022; Project Brain public-product invariants
 * 18 and 19).
 *
 * WHAT THESE TESTS DO AND DO NOT PROVE. Every check below is a keyword or
 * structural scan over the dictionaries and over three source files. A
 * keyword scan proves exactly one thing: that a named phrase is absent from,
 * or present in, a named place. It does NOT prove a sentence is true, does
 * not understand paraphrase, and cannot catch a claim written in words this
 * file does not list. Invariant 19 exists because the first version of this
 * file overstated its own reach — it checked recurrence only outside
 * AVAILABLE and its comment claimed "recurrence is VISION-only", which is a
 * strictly larger statement than the assertion made.
 *
 * So each guard below names its boundary precisely, and each was proven to
 * fire by planting a counterexample AT THAT boundary — not at one convenient
 * spelling of it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every user-visible string in a dict subtree, functions included. */
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

const lower = (node: unknown) => stringsOf(node).join(" · ").toLowerCase();

/**
 * Recurrence vocabulary in the four site languages. The list is the exact
 * scope of every recurrence assertion in this file: a recurrence claim
 * phrased outside these forms would not be caught.
 */
const RECURRENCE = [
  "recurring",
  "recurrence",
  "repeatable",
  "repeated operation",
  "récurrent",
  "récurrence",
  "répétable",
  "opération répétée",
  "recurrente",
  "repetible",
  "operación repetida",
  "paulit-ulit",
  "inuulit na operasyon",
  "repeatable operation",
];

/** Autonomy vocabulary banned from the homepage dictionary. */
const AUTONOMY = [
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

/** Semantic next-run promises that avoid the recurrence keywords above. */
const NEXT_RUN_PROMISE = [
  "next approved run",
  "next managed run",
  "next time",
  "prochaine exécution",
  "la prochaine fois",
  "siguiente ejecución",
  "próxima vez",
  "susunod na aprubadong run",
  "susunod na managed run",
  "sa susunod",
];

/**
 * Engine-DEPLOYMENT vocabulary. Naming an internal work engine in the
 * AVAILABLE group asserts a deployed, client-serving capability, which is
 * exactly the source-tree-is-not-deployment error invariant 18 names.
 */
const ENGINE_CLAIM = [
  "work engine",
  "moteur de travail",
  "moteur interne",
  "motor de trabajo",
  "motor interno",
  "internal engine",
];

/**
 * The only thing that could license an AVAILABLE engine claim: an approved
 * release-evidence fixture. It does not exist, so the ban is currently
 * absolute — and if someone adds the fixture, this guard forces the claim to
 * be listed in it rather than merely asserted in marketing copy.
 */
const RELEASE_EVIDENCE = "test/fixtures/public-release-evidence.json";

// ────────────────────────── 1. homepage claims ──────────────────────────

describe("the homepage dictionary claims no recurrence and no autonomy", () => {
  for (const { code } of SITE_LANGS) {
    it(`holds in ${code}`, () => {
      const all = lower({
        legacy: CLIENT_I18N[code],
        activeNarrative: V7_ACTS_I18N[code],
        activeGuide: HOME_CONCIERGE_I18N[code],
      });
      for (const word of [...RECURRENCE, ...AUTONOMY, ...NEXT_RUN_PROMISE]) {
        expect(all, `homepage[${code}] must not contain "${word}"`).not.toContain(word);
      }
    });
  }
});

// ──────────────── 2 & 3. recurrence is VISION-only on /inside ────────────

describe("/inside places recurrence in VISION and nowhere else", () => {
  for (const { code } of SITE_LANGS) {
    const t = INSIDE_I18N[code];

    it(`in ${code}, AVAILABLE names no recurrence`, () => {
      const available = lower(t.registry.available);
      for (const word of RECURRENCE) {
        expect(available, `available[${code}] must not contain "${word}"`).not.toContain(word);
      }
    });

    /** The half the earlier version of this file never checked. */
    it(`in ${code}, IN DEVELOPMENT names no recurrence`, () => {
      const building = lower(t.registry.building);
      for (const word of RECURRENCE) {
        expect(building, `building[${code}] must not contain "${word}"`).not.toContain(word);
      }
    });

    /**
     * "Only under VISION" is two statements: absent elsewhere (above) AND
     * present there. Without this, deleting the vision row entirely would
     * leave the suite green while the site silently stopped disclosing the
     * roadmap.
     */
    it(`in ${code}, VISION does name recurrence`, () => {
      const vision = lower(t.registry.vision);
      expect(
        RECURRENCE.some((w) => vision.includes(w)),
        `vision[${code}] must disclose recurrence in one of: ${RECURRENCE.join(", ")}`
      ).toBe(true);
    });

    /** Outside the three registry groups, /inside must not mention it either. */
    it(`in ${code}, the rest of the page names no recurrence`, () => {
      const rest = lower({
        lede: t.lede,
        model: t.model,
        method: t.method,
        boundaries: t.boundaries,
        cta: t.cta,
        meta: t.meta,
        h1: t.h1,
      });
      for (const word of RECURRENCE) {
        expect(rest, `inside body[${code}] must not contain "${word}"`).not.toContain(word);
      }
    });
  }
});

// ─────────────── 4. active /services offerings sell no recurrence ────────

describe("the active /services offerings claim no recurring operation", () => {
  for (const { code } of SITE_LANGS) {
    it(`holds in ${code}`, () => {
      const t = SERVICES_I18N[code];
      // The whole visible page, not only the cards: the headline and intro
      // sell just as hard as an offering description.
      const page = lower(t);
      for (const word of RECURRENCE) {
        expect(page, `services[${code}] must not contain "${word}"`).not.toContain(word);
      }
      // Four families, still four — a fifth would mean Standing Capacity or
      // something like it came back without a decision.
      expect(t.offerings).toHaveLength(4);
    });
  }
});

// ───────── 5. AVAILABLE may not claim a deployed internal engine ─────────

describe("AVAILABLE cannot claim a deployed work engine without release evidence", () => {
  const evidencePresent = existsSync(join(process.cwd(), RELEASE_EVIDENCE));

  for (const { code } of SITE_LANGS) {
    it(`holds in ${code}`, () => {
      const available = lower(INSIDE_I18N[code].registry.available);
      const claimed = ENGINE_CLAIM.filter((w) => available.includes(w));
      if (!evidencePresent) {
        expect(
          claimed,
          `available[${code}] names ${claimed.join(", ")} but ${RELEASE_EVIDENCE} does not exist — ` +
            "source-tree presence is not deployment evidence (invariant 18)"
        ).toEqual([]);
        return;
      }
      // If the fixture is ever added, the claim must be listed IN it.
      const approved: string[] = JSON.parse(read(RELEASE_EVIDENCE)).approvedClaims ?? [];
      for (const w of claimed) {
        expect(approved.map((a) => a.toLowerCase()), `"${w}" not in ${RELEASE_EVIDENCE}`).toContain(w);
      }
    });
  }
});

// ──────────────────────── 6. the Console's own rules ────────────────────

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
      expect(c.reviewNote.trim().length, `console[${code}] review note empty`).toBeGreaterThan(0);
      // Orientation, not a re-narration of the seven <li> that follow it.
      // Upper bound is the point of this assertion; the lower bound only
      // stops it being emptied.
      expect(c.srSummary.length, `console[${code}] sr summary empty`).toBeGreaterThan(40);
      expect(
        c.srSummary.length,
        `console[${code}] sr summary should orient, not re-read all seven steps`
      ).toBeLessThan(240);
    }
  });

  it("the component renders the status WORDS next to the amber and green marks", () => {
    const src = read("src/components/operation-console.tsx");
    expect(src).toContain("#D98324");
    expect(src).toContain("#1E7F5C");
    expect(src).toMatch(/\{copy\.statusIssue\}/);
    expect(src).toMatch(/\{copy\.statusVerified\}/);
  });

  it("the component carries the sr-only journey and no client-side JavaScript", () => {
    const src = read("src/components/operation-console.tsx");
    expect(src).toMatch(/sr-only/);
    expect(src).toMatch(/\{copy\.srSummary\}/);
    // Either quote style, and the JSX pragma spelling too — the earlier
    // version only matched the double-quoted form.
    expect(src).not.toMatch(/['"`]use client['"`]/);
    expect(src).not.toMatch(/\buseState\b|\buseEffect\b|\bsetInterval\b|\bsetTimeout\b/);
  });

  it("the homepage mounts the ported V5.5 experience (ADR-026 replaced the console composition)", () => {
    const src = read("src/app/page.tsx");
    /* V7 moved the chrome to the page's own header and runs the machine as
       the continuation of the acts, so the mount is the continuation call */
    expect(src).toMatch(/<AssemblyExperience copy=\{t\} ctaHref="\/register" continuation \/>/);
  });
});

// ───────────────────── 7. /services survives the relabel ─────────────────

/**
 * Sources inside the `redirects()` block only. The `headers()` block
 * legitimately uses a `/:path*` catch-all, and scanning the whole file would
 * either flag that or force the guard to be loosened until it proved nothing.
 */
function redirectSources(config: string): string[] {
  const start = config.indexOf("async redirects()");
  if (start === -1) return [];
  const after = config.indexOf("async headers()", start);
  const block = config.slice(start, after === -1 ? undefined : after);
  return [...block.matchAll(/source:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

/** Would this redirect source capture the /services page itself? */
function capturesServices(source: string): boolean {
  if (source === "/services") return true;
  // Root catch-alls: "/:path*", "/:slug*", "/(.*)", "/:path([^/]*)".
  if (/^\/:[A-Za-z_]\w*\*?$/.test(source)) return true;
  if (/^\/\(\.[*+]\)$/.test(source)) return true;
  // Any parameterised source rooted at /services, e.g. "/services/:path*".
  if (/^\/services(\/|$)/.test(source) && /[:(]/.test(source)) return true;
  return false;
}

describe("/services survives the operations relabel", () => {
  it("the route file still exists", () => {
    expect(read("src/app/services/page.tsx").length).toBeGreaterThan(0);
  });

  it("no redirect source captures /services, in any wildcard form", () => {
    const sources = redirectSources(read("next.config.ts"));
    const offenders = sources.filter(capturesServices);
    expect(
      offenders,
      `these redirect sources would capture /services: ${offenders.join(", ")}`
    ).toEqual([]);
    // The legitimate standing-capacity redirect TO /services must survive —
    // otherwise "no offenders" could be achieved by deleting redirects wholesale.
    expect(read("next.config.ts")).toMatch(/destination:\s*["']\/services["']/);
  });

  it("the wildcard matcher itself is correct", () => {
    // Pinning the helper directly: a matcher that silently stopped matching
    // would make the assertion above vacuously green.
    expect(capturesServices("/services")).toBe(true);
    expect(capturesServices("/services/:path*")).toBe(true);
    expect(capturesServices("/:path*")).toBe(true);
    expect(capturesServices("/(.*)")).toBe(true);
    expect(capturesServices("/services/standing-capacity")).toBe(false);
    expect(capturesServices("/workers")).toBe(false);
  });
});
