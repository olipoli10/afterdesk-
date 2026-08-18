import { describe, expect, it } from "vitest";
import { CLIENT_I18N } from "@/lib/i18n/client";
import { INSIDE_I18N } from "@/lib/i18n/inside";
import { SITE_LANGS } from "@/lib/i18n/langs";

/**
 * TWO CLAIM BOUNDARIES THE FIRST CORRECTION PASS LEFT OPEN.
 *
 * WHAT THESE TESTS PROVE, EXACTLY. Each is a keyword scan over named regions
 * of the four active dictionaries. A scan proves that a listed phrase is
 * absent from — or present in — a named region. It does not read meaning, does
 * not catch paraphrase, and cannot see a claim spelled in words absent from
 * these lists. Invariant 19: the assertion and the comment must describe the
 * same boundary, so the boundary is named precisely below and nowhere widened.
 *
 * GUARD 1 — execution lanes are IN DEVELOPMENT, and only the registry may
 * name them. `/inside` classified automated model, connected-tool and browser
 * execution as IN DEVELOPMENT while its own operating-model row and method
 * paragraph said, in the present tense, that those methods are chosen per
 * step. One page cannot say both. The lane vocabulary is therefore confined to
 * the IN DEVELOPMENT group: absent from the page body, absent from AVAILABLE,
 * absent from the homepage entirely, and required to be present in the
 * development group so the classification stays disclosed rather than deleted.
 *
 * GUARD 2 — no zero-exposure or zero-error absolute. `ch05.desk` promised the
 * client "never sees" a failed attempt. Nothing in the product can guarantee
 * what a review will and will not surface, and the supported shape is the
 * conditional one: a flagged version returns for rework before delivery, and
 * review is careful rather than exhaustive.
 */

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
 * Execution-lane vocabulary, four languages, and the exact scope of guard 1.
 *
 * BARE "models" / "modèles" / "modelos" IS DELIBERATELY NOT LISTED. The
 * comparison section legitimately says "what changes between the models",
 * meaning buying models — DIY, marketplace, hourly staffing, Endvera — and
 * banning the bare word would fail on true copy while teaching nothing. The
 * connected-tool and browser terms below are unambiguous, and in this copy the
 * lane list never names models without also naming them, so the boundary still
 * bites on the sentence it exists to catch. Model vocabulary IS asserted, but
 * positively and only inside the development group, where it cannot be
 * confused with a buying model.
 */
const LANES = [
  // en
  "connected tools", "browser work", "browser automation",
  // fr
  "outils connectés", "travail au navigateur", "automatisation du navigateur",
  // es
  "herramientas conectadas", "trabajo en navegador", "automatización de navegador",
  // tl
  "konektadong tools", "trabaho sa browser",
];

/**
 * Zero-exposure / zero-error absolutes, four languages. Same caveat: this list
 * is the scope of guard 2.
 */
const ABSOLUTES = [
  // en
  "never see", "never sees", "never reaches you",
  // fr
  "ne voyez jamais", "ne verrez jamais", "ne vous parvient jamais", "jamais cette tentative",
  // es
  "nunca ves", "nunca verás", "nunca te llega", "nunca ese intento",
  // tl
  "hindi mo na nakikita", "hindi kailanman makakarating",
];

/**
 * The completeness half, and why it is a REQUIREMENT rather than a ban.
 *
 * "every possible error is detected" cannot be banned as a substring: the
 * correct copy contains it, inside its own negation — "that review is careful,
 * NOT a guarantee that every possible error is detected". A ban would forbid
 * the exact sentence this correction was asked to write. So the assertion is
 * inverted: wherever the comparison desk describes what review does, the
 * qualifier must be present. Deleting the qualifier fails; adding an
 * unqualified completeness promise fails with it.
 */
const QUALIFIERS: Record<string, string[]> = {
  en: ["not a promise", "not a guarantee"],
  fr: ["pas une promesse", "pas une garantie"],
  es: ["no es una promesa", "no es una garantía"],
  tl: ["hindi ito pangako", "hindi pangako", "hindi garantiya"],
};

/** The `/inside` regions that are NOT the registry. */
const insideBodyRegions = (t: (typeof INSIDE_I18N)[keyof typeof INSIDE_I18N]) => ({
  meta: t.meta,
  h1: t.h1,
  lede: t.lede,
  model: t.model,
  method: t.method,
  boundaries: t.boundaries,
  cta: t.cta,
});

describe("guard 1 — execution lanes stay classified as IN DEVELOPMENT", () => {
  for (const { code } of SITE_LANGS) {
    const t = INSIDE_I18N[code];

    it(`in ${code}, the /inside body names no execution lane`, () => {
      const body = lower(insideBodyRegions(t));
      for (const lane of LANES) {
        expect(
          body,
          `/inside body[${code}] presents "${lane}" outside the registry, which reads as available today`
        ).not.toContain(lane);
      }
    });

    it(`in ${code}, AVAILABLE names no execution lane`, () => {
      const available = lower(t.registry.available);
      for (const lane of LANES) {
        expect(available, `available[${code}] must not contain "${lane}"`).not.toContain(lane);
      }
    });

    /**
     * The disclosure half. Without it, deleting the lanes from the development
     * group would satisfy every assertion above while the page quietly stopped
     * saying what is being built.
     */
    it(`in ${code}, IN DEVELOPMENT does name the lanes`, () => {
      const building = lower(t.registry.building);
      expect(
        LANES.some((l) => building.includes(l)),
        `building[${code}] must disclose the automated lanes it is classifying`
      ).toBe(true);
    });

    it(`in ${code}, the homepage names no execution lane at all`, () => {
      const home = lower(CLIENT_I18N[code]);
      for (const lane of LANES) {
        expect(home, `homepage[${code}] must not contain "${lane}"`).not.toContain(lane);
      }
    });
  }
});

describe("guard 2 — no zero-exposure or zero-error absolute", () => {
  for (const { code } of SITE_LANGS) {
    it(`in ${code}, the homepage comparison desk states the conditional boundary`, () => {
      const desk = CLIENT_I18N[code].ch05.desk.toLowerCase();
      for (const phrase of ABSOLUTES) {
        expect(desk, `ch05.desk[${code}] must not contain "${phrase}"`).not.toContain(phrase);
      }
      expect(desk.length, `ch05.desk[${code}] must still say something`).toBeGreaterThan(60);
      // The qualifier must be there, not merely the absence of an absolute.
      expect(
        QUALIFIERS[code].some((q) => desk.includes(q)),
        `ch05.desk[${code}] must qualify what review guarantees, using one of: ${QUALIFIERS[code].join(", ")}`
      ).toBe(true);
    });

    it(`in ${code}, no absolute survives anywhere on the homepage or /inside`, () => {
      const all = lower(CLIENT_I18N[code]) + " · " + lower(INSIDE_I18N[code]);
      for (const phrase of ABSOLUTES) {
        expect(all, `${code} must not contain "${phrase}"`).not.toContain(phrase);
      }
    });
  }
});
