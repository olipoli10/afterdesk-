/* Phase 1.4C guards - written RED against 14dafff.
   Codex's live audit: homepage 9.1 is the visual reference; the five
   secondary pages fragment into three different brand chromes, /services
   is a generic SaaS grid, /inside is a wall of text, and A2 exists only
   on the homepage. These guards pin the cohesion contract:
   one shared public shell, one wordmark, one A2 per route, a real proof
   surface on every page, four complete languages, and a concierge that
   can never fetch, store or call a model. */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SECONDARY = [
  "src/app/services/page.tsx",
  "src/app/how-it-works/page.tsx",
  "src/app/inside/page.tsx",
  "src/app/about/page.tsx",
  "src/app/workers/page.tsx",
];
const ALL_PAGES = ["src/app/page.tsx", ...SECONDARY];

describe("C1 - every secondary page uses the ONE shared public shell", () => {
  it("the shell exists as a real reusable component", () => {
    expect(existsSync(join(root, "src/components/public-shell.tsx"))).toBe(true);
  });
  it("all five secondary pages import PublicShell instead of hand-rolling chrome", () => {
    for (const p of SECONDARY) {
      const s = read(p);
      expect(s, `${p} must import the shared shell`).toMatch(/from "@\/components\/public-shell"/);
      /* no page keeps its own bespoke header markup */
      expect(s, `${p} must not hand-roll a <header>`).not.toMatch(/<header[\s>]/);
    }
  });
  it("the shell offers the night and paper variants and carries every utility", () => {
    const s = read("src/components/public-shell.tsx");
    expect(s).toMatch(/"night"/);
    expect(s).toMatch(/"paper"/);
    for (const fn of ["Wordmark", "LangSwitch", "signIn", "cta"]) {
      expect(s, `shell must carry ${fn}`).toMatch(new RegExp(fn));
    }
  });
});

describe("C2 - exactly one A2 concierge on every main route", () => {
  it("all six pages mount the shared A2 concierge exactly once", () => {
    for (const p of ALL_PAGES) {
      const s = read(p);
      const mounts = s.match(/<A2Concierge\b/g) ?? [];
      expect(mounts, `${p} must mount A2 exactly once`).toHaveLength(1);
    }
  });
  it("the concierge stays a single component - no per-page forks of the sprite", () => {
    const grepable = ["src/app/services", "src/app/how-it-works", "src/app/inside", "src/app/about", "src/app/workers"];
    for (const dir of grepable) {
      const page = read(join(dir, "page.tsx"));
      expect(page, `${dir} must not duplicate sprite internals`).not.toMatch(/A2_REST|a2pose|data-a2-being=/);
    }
  });
  it("page-aware answers come from approved public dictionaries, localized in the four languages", () => {
    const s = read("src/lib/i18n/home-assembly.ts");
    for (const langMark of ['en:', 'fr:', 'es:', 'tl:']) {
      expect(s, `concierge dict must carry ${langMark}`).toContain(langMark);
    }
  });
});

describe("C3 - the concierge can never fetch, store or call a model", () => {
  it("a2-concierge has no fetch/XHR/storage/model surface", () => {
    const s = read("src/app/_home/a2-concierge.tsx");
    for (const banned of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "openrouter", "OpenRouter", "api.openai", "anthropic"]) {
      expect(s, `concierge must not contain ${banned}`).not.toContain(banned);
    }
  });
});

describe("C4 - every page owns at least one real proof/instrument surface", () => {
  it("each of the five secondary pages renders a data-proof instrument, not just text", () => {
    for (const p of SECONDARY) {
      const s = read(p);
      expect(s, `${p} needs a data-proof surface`).toMatch(/data-proof=/);
    }
  });
  it("/inside is a cutaway, not a wall: it renders the six-passage operation diagram", () => {
    const s = read("src/app/inside/page.tsx");
    expect(s).toMatch(/data-proof="operation-cutaway"/);
  });
  it("/services families each carry a distinct visual signature and an expected-result example", () => {
    const s = read("src/app/services/page.tsx");
    expect(s).toMatch(/data-proof="family-/);
  });
  it("/about renders the accountability moment as an onyx instrument", () => {
    const s = read("src/app/about/page.tsx");
    expect(s).toMatch(/data-proof="accountability"/);
  });
});

describe("C5 - four languages render with no missing keys", () => {
  it("the shared shell nav dictionaries carry en/fr/es/tl in parallel", async () => {
    const mod = await import("../src/lib/i18n/public-shell");
    const dict = (mod as Record<string, unknown>).PUBLIC_SHELL_I18N as Record<string, Record<string, unknown>>;
    expect(dict).toBeTruthy();
    const langs = Object.keys(dict);
    expect(langs.sort()).toEqual(["en", "es", "fr", "tl"]);
    const shape = JSON.stringify(Object.keys(dict.en as object).sort());
    for (const l of langs) {
      expect(JSON.stringify(Object.keys(dict[l] as object).sort()), `keys of ${l}`).toBe(shape);
    }
  });
});

describe("C6 - truth constraints hold after the redesign", () => {
  it("/inside still names all three registers: available, in development, refused", () => {
    const s = read("src/app/inside/page.tsx") + read("src/lib/i18n/inside.ts");
    for (const requirement of [/available/i, /development|being built/i, /refuse/i]) {
      expect(s).toMatch(requirement);
    }
  });
  it("no page claims generalized autonomous automation", () => {
    for (const p of ALL_PAGES) {
      expect(read(p)).not.toMatch(/fully automated|entirely automated|no humans involved/i);
    }
  });
});
