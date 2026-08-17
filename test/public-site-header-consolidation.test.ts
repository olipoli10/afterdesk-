/* Phase 1.4B.6 guards - written RED against 8ef3953.
   Codex's final release review confirmed two visible defects in the shipped
   Preview: (1) HOME_META titles already end in "| AfterDesk" and the root
   layout template appends "· AfterDesk", so the rendered title carries the
   brand twice; (2) page.tsx renders an absolute utility header with an
   AfterDesk link while AssemblyExperience renders its own absolute nav and
   AfterDesk mark in the same top-left region - two overlapping wordmarks,
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
   `template: "%s · AfterDesk"`; a page title given as a plain string goes
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
  it("every language's resolved <title> contains exactly one 'AfterDesk'", () => {
    for (const t of homeMetaTitles()) {
      const rendered = finalTitleFor(t);
      const count = (rendered.match(/AfterDesk/g) ?? []).length;
      expect(count, `rendered title: ${JSON.stringify(rendered)}`).toBe(1);
    }
  });
  it("the approved positioning text itself is preserved untouched", () => {
    const [en] = homeMetaTitles();
    expect(en).toBe("One request in. One verified result out. | AfterDesk");
  });
});

describe("H2 - exactly one visible header wordmark, and it is a real link", () => {
  it("page.tsx no longer renders its own header or a second brand wordmark", () => {
    const s = page();
    expect(s).not.toMatch(/<header/);
    /* the JSON-LD organization *name* is data, not chrome - only JSX text
       nodes count as a visible wordmark */
    expect(s).not.toMatch(/>\s*AfterDesk\s*</);
  });
  it("the assembly nav's mark is the single wordmark and links home", () => {
    const s = assembly();
    const markUses = s.match(/styles\.mark/g) ?? [];
    expect(markUses).toHaveLength(1);
    expect(s).toMatch(/<Link\s+href="\/"\s+className=\{styles\.mark\}>\s*AfterDesk\s*<\/Link>/);
    expect(s).not.toMatch(/<span[^>]*className=\{styles\.mark\}/);
  });
});

describe("H3 - the single header keeps every utility function", () => {
  it("page.tsx still provides Sign in/Portal and the language switch, now through the header slot", () => {
    const s = page();
    expect(s).toMatch(/utility=\{/);
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
