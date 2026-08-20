/* Phase 1.4C guards - CORRECTED at the Codex gate. The first version held
   three false negatives (it demanded literals the valid architecture
   produces through components). These guards understand the real
   contract, strip comments before proving rendered claims, recompute the
   concierge provenance independently, and cover the whole zero-model
   boundary. Every guard can catch its matching defect - the named
   mutations in the evidence run prove it. */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HOME_CONCIERGE_I18N } from "../src/lib/i18n/home-assembly";
import { SERVICES_I18N } from "../src/lib/i18n/services";
import { INSIDE_I18N } from "../src/lib/i18n/inside";
import { ABOUT_I18N } from "../src/lib/i18n/docs";
import { WORKERS_I18N } from "../src/lib/i18n/workers";
import { pageConcierge, composeVerified, CONCIERGE_SOURCES, PUBLIC_SHELL_I18N } from "../src/lib/i18n/public-shell";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
/* comments are not architecture: strip them before proving rendered claims */
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SECONDARY = [
  "src/app/services/page.tsx",
  "src/app/how-it-works/page.tsx",
  "src/app/inside/page.tsx",
  "src/app/about/page.tsx",
  "src/app/workers/page.tsx",
];
const LANGS = ["en", "fr", "es", "tl"] as const;
const PAGES = ["services", "how", "inside", "about", "workers"] as const;

describe("C1 - every secondary page renders through the ONE shared shell", () => {
  it("the shell exists with night and paper variants and every utility", () => {
    expect(existsSync(join(root, "src/components/public-shell.tsx"))).toBe(true);
    const s = noComments(read("src/components/public-shell.tsx"));
    expect(s).toMatch(/"night"/);
    expect(s).toMatch(/"paper"/);
    for (const fn of ["LangSwitch", "signIn", "portal", "cta", "MobileNav"]) {
      expect(s, `shell must carry ${fn}`).toMatch(new RegExp(fn));
    }
  });
  it("each secondary page mounts exactly one PublicShell and no bespoke <header>", () => {
    for (const p of SECONDARY) {
      const s = noComments(read(p));
      expect(s.match(/<PublicShell\b/g) ?? [], `${p} must mount PublicShell once`).toHaveLength(1);
      expect(s, `${p} must not hand-roll a <header>`).not.toMatch(/<header[\s>]/);
    }
  });
});

describe("C2 - exactly one A2 concierge per route, mounted through the contract", () => {
  it("PublicShell mounts exactly one A2Concierge", () => {
    const s = noComments(read("src/components/public-shell.tsx"));
    expect(s.match(/<A2Concierge\b/g) ?? []).toHaveLength(1);
  });
  it("no secondary page mounts a second concierge or forks the sprite", () => {
    for (const p of SECONDARY) {
      const s = noComments(read(p));
      expect(s, `${p} must not mount A2 directly`).not.toMatch(/<A2Concierge\b/);
      expect(s, `${p} must not duplicate sprite internals`).not.toMatch(/A2_REST|a2pose|data-a2-being=/);
    }
  });
  it("the homepage owns exactly one concierge, mounted through the V7 acts tree", () => {
    /* V7 moved the mount INSIDE SimplicityActs so the escort engine owns
       the dock by ref (no global querySelector, no second being possible).
       The contract stays: exactly one mount in the homepage tree. */
    const page = noComments(read("src/app/page.tsx"));
    const acts = noComments(read("src/app/_v7/simplicity-acts.tsx"));
    expect(page.match(/<A2Concierge\b/g) ?? [], "page must not double-mount").toHaveLength(0);
    expect(acts.match(/<A2Concierge\b/g) ?? [], "the acts own the single mount").toHaveLength(1);
    expect(page).toMatch(/<SimplicityActs\b/);
    expect(page).not.toMatch(/<PublicShell\b/);
  });
});

describe("C3 - the zero-model boundary covers the whole concierge path", () => {
  const BOUNDARY_FILES = [
    "src/app/_home/a2-concierge.tsx",
    "src/components/public-shell.tsx",
    "src/components/mobile-nav.tsx",
    "src/components/instruments.tsx",
    "src/lib/i18n/public-shell.ts",
  ];
  it("no fetch/XHR/storage/model/form-action surface anywhere on the path", () => {
    for (const p of BOUNDARY_FILES) {
      const s = noComments(read(p));
      for (const banned of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "openrouter", "OpenRouter", "api.openai", "anthropic.com", "formAction", '"use server"', "navigator.sendBeacon"]) {
        expect(s, `${p} must not contain ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("C4 - proof surfaces are real component contracts, not literals", () => {
  it("InstrumentFrame emits data-proof from its proof prop", () => {
    const s = noComments(read("src/components/instruments.tsx"));
    expect(s).toMatch(/data-proof=\{proof\}/);
  });
  it("/inside passes the operation-cutaway proof id through its instrument", () => {
    const s = noComments(read("src/app/inside/page.tsx"));
    expect(s).toMatch(/proof="operation-cutaway"|data-proof="operation-cutaway"/);
    expect(s).toMatch(/data-proof="truth-registry"|proof="truth-registry"/);
  });
  it("/services derives a distinct family proof id for every offering", () => {
    const s = noComments(read("src/app/services/page.tsx"));
    expect(s).toMatch(/proof=\{`family-\$\{offering\.slug\}`\}/);
  });
  it("/about passes the accountability proof id", () => {
    const s = noComments(read("src/app/about/page.tsx"));
    expect(s).toMatch(/data-proof="accountability"|proof="accountability"/);
  });
});

describe("C5 - shell chrome and mobile navigation, four languages in parallel", () => {
  it("shell dictionaries carry en/fr/es/tl with identical key shapes", () => {
    const langs = Object.keys(PUBLIC_SHELL_I18N);
    expect(langs.sort()).toEqual(["en", "es", "fr", "tl"]);
    const shape = JSON.stringify(Object.keys(PUBLIC_SHELL_I18N.en).sort());
    for (const l of LANGS) {
      expect(JSON.stringify(Object.keys(PUBLIC_SHELL_I18N[l]).sort()), `keys of ${l}`).toBe(shape);
      expect(PUBLIC_SHELL_I18N[l].menu.length, `menu label ${l}`).toBeGreaterThan(1);
    }
  });
  it("the shell renders MobileNav with all five destinations and a localized name", () => {
    const s = noComments(read("src/components/public-shell.tsx"));
    expect(s).toMatch(/<MobileNav/);
    expect(s).toMatch(/label=\{t\.menu\}/);
    expect(s).toMatch(/NAV_ROUTES\.map\(\(\[href, key\]\) => \(\{ href, text: t\.nav\[key\] \}\)\)/);
  });
  it("MobileNav is a real disclosure: 44px target, aria-expanded, Escape, focus return", () => {
    const s = noComments(read("src/components/mobile-nav.tsx"));
    expect(s).toMatch(/min-h-11 min-w-11/);
    expect(s).toMatch(/aria-expanded=\{open\}/);
    expect(s).toMatch(/Escape/);
    expect(s).toMatch(/buttonRef\.current\?\.focus\(\)/);
    expect(s).toMatch(/querySelector<HTMLElement>\("a"\)\?\.focus\(\)/);
  });
});

describe("C6 - the wordmark contract is rendered, not commented", () => {
  it("PublicShell renders exactly one brand link to /, with the homepage typography", () => {
    const s = noComments(read("src/components/public-shell.tsx"));
    const marks = s.match(/<Wordmark\b/g) ?? [];
    expect(marks, "exactly one rendered ENDVERA wordmark").toHaveLength(1);
    expect(s).toMatch(/href="\/"[\s\S]{0,200}?text-\[1\.0625rem\] font-\[640\]/);
  });
  it("no secondary page renders its own brand text node", () => {
    for (const p of SECONDARY) {
      const s = noComments(read(p));
      expect(s.match(/>\s*ENDVERA\s*</g) ?? [], `${p} must not add a typed wordmark`).toHaveLength(0);
    }
  });
});

describe("C7 - concierge truth provenance: recomputed, never asserted", () => {
  it("every page/lang verified answer equals its dictionary composition exactly", () => {
    for (const page of PAGES) {
      for (const lang of LANGS) {
        const got = pageConcierge(page, lang).answers;
        const expected =
          page === "services" ? SERVICES_I18N[lang].intro :
          page === "how" ? INSIDE_I18N[lang].model.items[1][1] :
          page === "inside" ? INSIDE_I18N[lang].registry.available.items.map(([c]) => c).join(". ") + "." :
          page === "about" ? ABOUT_I18N[lang].solutionLede :
          `${WORKERS_I18N[lang].hero.h1} ${WORKERS_I18N[lang].hero.sub}`;
        expect(got.verified, `${page}/${lang} answer must be the dictionary sentence`).toBe(expected);
        expect(got.verifiedCite, `${page}/${lang} cite names its real source route`).toContain(CONCIERGE_SOURCES[page].route);
        expect(got.unknown).toBe(HOME_CONCIERGE_I18N[lang].answers.unknown);
        expect(got.unavailable).toBe(HOME_CONCIERGE_I18N[lang].answers.unavailable);
      }
    }
  });
  it("the SOURCES map names a route and expression for all five pages", () => {
    for (const page of PAGES) {
      expect(CONCIERGE_SOURCES[page].route).toMatch(/^\//);
      expect(CONCIERGE_SOURCES[page].expr.length).toBeGreaterThan(3);
    }
  });
  it("public-shell.ts holds no long answer literal of its own", () => {
    const s = noComments(read("src/lib/i18n/public-shell.ts"));
    /* questions and chrome labels are short; any 90+ char string would be a
       smuggled claim */
    const long = (s.match(/"[^"\n]{90,}"/g) ?? []).filter((m) => !m.includes("afterdesk.co"));
    expect(long, `long literals found: ${long.join(" | ")}`).toHaveLength(0);
  });
  it("composeVerified and pageConcierge stay consistent for every combination", () => {
    for (const page of PAGES) for (const lang of LANGS) {
      expect(pageConcierge(page, lang).answers.verified).toBe(composeVerified(page, lang).a);
    }
  });
});

describe("C8 - truth constraints hold after the redesign", () => {
  it("/inside still names all three registers: available, in development, refused", () => {
    const s = read("src/app/inside/page.tsx") + read("src/lib/i18n/inside.ts");
    for (const requirement of [/available/i, /development|being built/i, /refuse/i]) {
      expect(s).toMatch(requirement);
    }
  });
  it("no page claims generalized autonomous automation", () => {
    for (const p of ["src/app/page.tsx", ...SECONDARY]) {
      expect(read(p)).not.toMatch(/fully automated|entirely automated|no humans involved/i);
    }
  });
});
