/* Phase 1.4B guards - the REAL homepage must BE the accepted V5.5 Assembly
   Lock with the single A2 concierge. Written RED against the legacy
   homepage first (mandate section 7), then made GREEN by the port. */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const PAGE = "src/app/page.tsx";
const EXP = "src/app/_home/assembly-experience.tsx";
const CSS = "src/app/_home/home-assembly.module.css";
const I18N = "src/lib/i18n/home-assembly.ts";
const A2 = "src/app/_home/a2-concierge.tsx";

describe("R1 - the homepage IS the accepted V5.5 experience", () => {
  it("page.tsx renders the ported AssemblyExperience, not the legacy composition", () => {
    const s = read(PAGE);
    expect(s).toMatch(/AssemblyExperience/);
    expect(s).toMatch(/_home\/assembly-experience/);
  });
  it("the ported experience keeps the V5.5 stage grammar (data-g hooks, geo chart, outcome flow)", () => {
    expect(existsSync(join(root, EXP))).toBe(true);
    const s = read(EXP);
    for (const hook of ['data-g="hl"', 'data-g="geo"', 'data-g="ledger"', 'data-g="closing"', "OutcomeFlow", "GeoChart"])
      expect(s, hook).toContain(hook);
  });
  it("the ported stylesheet keeps the accepted seam/lock/afterworld system", () => {
    expect(existsSync(join(root, CSS))).toBe(true);
    const s = read(CSS);
    for (const sel of [".lockWord", ".afterworld", ".planeEdge", ".outcomeFlow", "--s-enter"])
      expect(s, sel).toContain(sel);
  });
});

describe("R2 - A2 is integrated on the homepage", () => {
  it("the A2 concierge component exists and the page mounts it", () => {
    expect(existsSync(join(root, A2))).toBe(true);
    expect(read(PAGE)).toMatch(/A2Concierge/);
  });
  it("the launcher is the semantic 44px button named Ask AfterDesk carrying the frozen A2", () => {
    const s = read(A2);
    expect(s).toMatch(/aria-label=\{copy\.ask\}/); // localized in 1.4B.1
    expect(s).toMatch(/A2_REST/);
    expect(s).toMatch(/aria-haspopup="dialog"/);
  });
});

describe("R3 - the single-being invariant is enforced", () => {
  it("a runtime guard counts rendered A2 instances and throws on duplication", () => {
    const s = read(A2);
    expect(s).toMatch(/data-a2-being/);
    expect(s).toMatch(/assertSingleA2/);
  });
});

describe("R4 - study routes stay unexposed", () => {
  it("sitemap and robots never mention the concept routes", () => {
    const site = read("src/app/sitemap.ts");
    const robots = read("src/app/robots.ts");
    expect(site).not.toMatch(/concept-(assembly|line)/);
    expect(robots).not.toMatch(/concept-(assembly|line)/);
  });
  it("the homepage and its components never link to a concept route", () => {
    for (const p of [PAGE, EXP, A2].filter(p => existsSync(join(root, p))))
      expect(read(p), p).not.toMatch(/concept-(assembly|line)/);
  });
});

describe("R5 - all four languages carry the new experience", () => {
  it("the home i18n module ships en/fr/es/tl with the V5.5 headline grammar", () => {
    expect(existsSync(join(root, I18N))).toBe(true);
    const s = read(I18N);
    for (const lang of ["en:", "fr:", "es:", "tl:"]) expect(s, lang).toContain(lang);
    for (const key of ["kicker", "door", "ledgerCompact", "closing"]) expect(s, key).toContain(key);
  });
});

describe("R6 - reduced motion covers the integrated experience", () => {
  it("the home stylesheet ships a prefers-reduced-motion story", () => {
    const s = read(CSS);
    expect(s).toMatch(/prefers-reduced-motion/);
  });
  it("the A2 concierge substitutes static poses under reduced motion", () => {
    const s = read(A2);
    expect(s).toMatch(/prefers-reduced-motion|reducedMotion/);
  });
});

describe("R7 - the frozen A2 and its motion contract", () => {
  it("A2_REST is byte-exact against the frozen FAMILY.A2 skeleton", async () => {
    const { A2_REST } = await import("../src/app/_home/a2-concierge");
    const FROZEN = [
      [9, 9, 9, 6, "#d87526"], [12, 13, 13, 6, "#d87526"], [10, 18, 14, 8, "#d87526"],
      [16, 15, 2, 2, "#0d1015"], [20, 15, 2, 2, "#0d1015"], [7, 21, 3, 3, "#d87526"],
      [12, 25, 4, 3, "#343a46"], [19, 26, 4, 2, "#343a46"],
    ];
    expect(JSON.stringify(A2_REST)).toBe(JSON.stringify(FROZEN));
  });
  it("every authored frame uses integer coordinates only", async () => {
    const { a2pose, SEQ } = await import("../src/app/_home/a2-concierge");
    for (const frames of Object.values(SEQ))
      for (const p of frames)
        for (const rect of a2pose(p))
          for (const v of rect.slice(0, 4)) expect(Number.isInteger(v)).toBe(true);
  });
  it("every non-holding sequence returns to the canonical rest", async () => {
    const { a2pose, A2_REST, SEQ } = await import("../src/app/_home/a2-concierge");
    for (const key of ["arrival", "listening", "verified", "unknown"]) {
      const frames = SEQ[key];
      expect(JSON.stringify(a2pose(frames[frames.length - 1])), key).toBe(JSON.stringify(A2_REST));
    }
  });
});

describe("R8 - every static answer is grounded and cited", () => {
  it("all four languages carry a citation route and never an empty cite", async () => {
    const { HOME_CONCIERGE_I18N } = await import("../src/lib/i18n/home-assembly");
    for (const [lang, c] of Object.entries(HOME_CONCIERGE_I18N)) {
      expect(c.answers.verifiedHref.startsWith("/"), lang).toBe(true);
      expect(c.answers.verifiedCite.length, lang).toBeGreaterThan(8);
      expect(c.answers.unknown.length, lang).toBeGreaterThan(10);
      expect(c.answers.unavailable.length, lang).toBeGreaterThan(10);
    }
  });
});
