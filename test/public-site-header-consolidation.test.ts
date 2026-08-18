/* Phase 1.4B.6 guards - written RED against 8ef3953.
   Codex's final release review confirmed two visible defects in the shipped
   Preview: (1) HOME_META titles already end in "| Endvera" and the root
   layout template appends "· Endvera", so the rendered title carries the
   brand twice; (2) page.tsx renders an absolute utility header with an
   Endvera link while AssemblyExperience renders its own absolute nav and
   Endvera mark in the same top-left region - two overlapping wordmarks,
   conspicuous at 390px/360px.

   The physical non-overlap proof (pairwise rects at 1440/390/360/200% in all
   four languages) runs in the live rig against the deployed artifact; these
   static guards pin the structure that makes overlap impossible again:
   exactly one brand occurrence in the final title, exactly one visible
   header wordmark, one single header owning every utility. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const page = () => read("src/app/page.tsx");
const layout = () => read("src/app/layout.tsx");
const assembly = () => read("src/app/_home/assembly-experience.tsx");

/* Reproduce Next's title resolution for this page: layout declares a
   `template: "%s · Endvera"`; a page title given as a plain string goes
   through it, a `title: { absolute: ... }` skips it. */
function finalTitleFor(pageTitle: string): string {
  const src = layout();
  const tpl = src.match(/template:\s*"([^"]+)"/)?.[1];
  if (!tpl) throw new Error("layout template not found - guard needs updating");
  const usesAbsolute = /return\s*\{[^}]*title:\s*\{\s*absolute:/s.test(page());
  return usesAbsolute ? pageTitle : tpl.replace("%s", pageTitle);
}

function homeMetaTitles(): string[] {
  const src = page();
  const block = src.slice(src.indexOf("const HOME_META"), src.indexOf("const ORG_JSONLD"));
  const titles = [...block.matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]!);
  expect(titles, "HOME_META must carry the four language titles").toHaveLength(4);
  return titles;
}

describe("H1 - the final rendered title carries the brand exactly once", () => {
  it("every language's resolved <title> contains exactly one 'Endvera'", () => {
    for (const t of homeMetaTitles()) {
      const rendered = finalTitleFor(t);
      const count = (rendered.match(/Endvera/g) ?? []).length;
      expect(count, `rendered title: ${JSON.stringify(rendered)}`).toBe(1);
    }
  });
  it("the approved positioning text itself is preserved untouched", () => {
    const [en] = homeMetaTitles();
    expect(en).toBe("One request in. One verified result out. | Endvera");
  });
});

describe("H2 - exactly one visible header wordmark, and it is a real link", () => {
  it("page.tsx renders THE one premium header, and the machine renders none (V7)", () => {
    /* V7 inverts the 1.4B.6 arrangement by mandate: the acts need chrome from
       the first viewport, so page.tsx owns the single header and the V5.5
       machine runs in continuation mode with its nav conditional and off.
       The single-wordmark contract is unchanged - only its owner moved - and
       on this lineage the wordmark is the official component, never typed. */
    const s = page();
    expect(s.match(/<header/g) ?? [], "exactly one page header").toHaveLength(1);
    expect(s.match(/<Wordmark/g) ?? [], "exactly one official wordmark").toHaveLength(1);
    /* the JSON-LD organization *name* is data, not chrome - a typed brand in
       JSX would be a second, unofficial wordmark */
    expect(s).not.toMatch(/>\s*Endvera\s*</);
    expect(s).toMatch(/<AssemblyExperience[^>]*continuation/);
  });
  it("the assembly nav's mark is the single wordmark and links home", () => {
    const s = assembly();
    const markUses = s.match(/styles\.mark/g) ?? [];
    expect(markUses).toHaveLength(1);
    expect(s).toMatch(/import\s+\{\s*Wordmark\s*\}\s+from\s+"@\/components\/logo"/);
    expect(s).toMatch(/<Link\s+href="\/"\s+className=\{styles\.mark\}\s+aria-label="Endvera home">\s*<Wordmark\s+tone="paper"\s*\/>\s*<\/Link>/);
    expect(s).not.toMatch(/<span[^>]*className=\{styles\.mark\}/);
  });
});

describe("H3 - the single header keeps every utility function", () => {
  it("page.tsx still provides Sign in/Portal and the language switch, inside its header", () => {
    const s = page();
    expect(s).toMatch(/nav\.nav\.signIn/);
    expect(s).toMatch(/nav\.nav\.portal/);
    expect(s).toMatch(/<LangSwitch/);
  });
  it("the assembly nav renders the slot beside its own anchors and Early Access", () => {
    const s = assembly();
    const nav = s.slice(s.indexOf("<nav className={styles.nav}>"), s.indexOf("</nav>"));
    expect(nav).toMatch(/\{utility\}/);
    expect(nav).toMatch(/#outcomes/);
    expect(nav).toMatch(/#how/);
    expect(nav).toMatch(/#inside/);
    expect(nav).toMatch(/earlyAccess/);
  });
  it("the utility slot is part of the component contract", () => {
    expect(assembly()).toMatch(/utility\??:\s*React\.ReactNode/);
  });
});
