import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const PAGE = "src/app/page.tsx";
const LAYOUT = "src/app/layout.tsx";
const ACTS = "src/app/_v7/simplicity-acts.tsx";
const COPY = "src/lib/i18n/v7-acts.ts";
const ASSEMBLY_COPY = "src/lib/i18n/home-assembly.ts";
const A2 = "src/app/_home/a2-concierge.tsx";
const LOGO = "src/components/logo.tsx";
const ICON = "src/app/icon.svg";
const PUBLIC_ACADEMY = "src/lib/academy/public.ts";
const SHARED_ACADEMY = "src/lib/academy/content.ts";

describe("ENDVERA public experience candidate", () => {
  it("uses ENDVERA consistently across the complete homepage surface", () => {
    for (const path of [PAGE, LAYOUT, ACTS, COPY, ASSEMBLY_COPY, A2, LOGO]) {
      expect(read(path), `retired brand in ${path}`).not.toMatch(/AfterDesk/);
    }

    const page = read(PAGE);
    expect(page).toMatch(/name:\s*"ENDVERA"/);
    expect(page).toMatch(/<Wordmark\s+tone="paper"/);
    expect((page.match(/<Wordmark\b/g) ?? []).length).toBe(1);
  });

  it("cuts the public Academy over to ENDVERA without rewriting the shared worker curriculum", () => {
    const projection = read(PUBLIC_ACADEMY);
    expect(projection).toMatch(/const publicBrand = \(text: string\).*replaceAll\("AfterDesk", "ENDVERA"\)/);
    for (const field of ["title", "tagline", "summary", "lessonTitles", "outcomes", "sections", "keyPoints", "prompt", "options", "explain"]) {
      expect(projection, `unbranded public Academy projection: ${field}`).toMatch(
        new RegExp(`${field}:[\\s\\S]{0,180}publicBrand`),
      );
    }
    expect(read(SHARED_ACADEMY)).toMatch(/AfterDesk/);
  });

  it("keeps the reusable mark, app icon and social cards in the amber identity", () => {
    for (const path of [LOGO, ICON, "src/app/opengraph-image.tsx", "src/app/workers/opengraph-image.tsx"]) {
      const source = read(path);
      expect(source, path).toMatch(/#D87526/i);
      expect(source, path).not.toMatch(/#1E7F5C/i);
    }
  });

  it("states the five-second promise explicitly in English, French and the longest-wrap locale", () => {
    const copy = read(COPY);
    expect(copy).toContain('h: "Give ENDVERA the workflow. Get the finished result."');
    expect(copy).toContain(
      'sub: "ENDVERA coordinates AI, software, browser work, authorized systems and human judgment. A person verifies the result before you receive it—finished and documented."',
    );
    expect(copy).toContain("ENDVERA coordonne l’IA, les logiciels, le travail navigateur, les systèmes autorisés et le jugement humain");
    expect(copy).toContain("Kino-coordinate ng ENDVERA ang AI, software, browser work, mga awtorisadong system, at paghatol ng tao");
  });

  it("positions A2 as a cited guide, never as the magical executor", () => {
    const copy = read(COPY);
    const guide = read(ASSEMBLY_COPY);
    expect(guide).toContain('title: "A2 · ENDVERA guide"');
    expect(guide).toContain("A2 is a site guide with approved answers and citations");
    expect(`${copy}\n${guide}`).not.toMatch(/A2 (?:executes|runs|does|delivers) (?:the )?(?:work|workflow|result)/i);
    expect(copy).not.toMatch(/takes it from here|runs it/i);
  });

  it("hardens the header and narrative against narrow-screen clipping", () => {
    const page = read(PAGE);
    const acts = read(ACTS);
    expect(page).toMatch(/data-site-header=/);
    expect(page).toMatch(/data-site-wordmark=/);
    expect(page).toMatch(/data-early-access=/);
    expect(acts).toMatch(/data-v7-acts=""\s+className="[^"]*overflow-x-clip/);
    expect(acts).toMatch(/data-act="1"[^>]*className="[^"]*box-border/);
  });

  it("does not spend a full extra mobile gesture on empty hero dwell", () => {
    const acts = read(ACTS);
    expect(acts).toMatch(/min-h-\[calc\(var\(--v7vh,100vh\)\*0\.82\)\]/);
    expect(acts).not.toMatch(/data-act="1"[^>]*min-h-\[calc\(var\(--v7vh,100vh\)\*1\.(?:06|26)\)\]/);
  });

  it("reserves the lower-right A2 lane when the next mobile heading enters", () => {
    const acts = read(ACTS);
    expect(acts).toMatch(/data-act="2"[\s\S]*?<h2 className="[^"]*max-w-\[15ch\]/);
  });

  it("keeps the final deliverable card below its sticky mobile heading", () => {
    const acts = read(ACTS);
    const copy = read(COPY);
    expect(acts).toMatch(/data-act="4"[\s\S]*?pb-\[calc\(var\(--v7vh,100vh\)\*0\.06\)\][^\"]*pt-\[calc\(var\(--v7vh,100vh\)\*0\.10\)\]/);
    expect(copy).toContain('h: "You receive one finished, documented result within the boundary you approved."');
  });

  it("keeps critical narrative copy at 12px or larger", () => {
    const acts = read(ACTS);
    expect(acts).not.toMatch(/text-\[(?:10|10\.5|11)px\]/);
    expect(acts).toMatch(/const mono = "font-mono text-\[12px\]/);
  });

  it("gives every mobile header action a 44px touch target", () => {
    const page = read(PAGE);
    expect(page).toMatch(/data-site-wordmark=""[^>]*className="[^"]*min-h-11/);
    expect(page).toMatch(/href=\{portal\} className="inline-flex min-h-11 items-center/);
    expect(page).toMatch(/href="\/login" className="inline-flex min-h-11 items-center/);
    expect(page).toMatch(/data-early-access="" className="[^"]*min-h-11/);
  });

  it("retains a complete static reduced-motion composition without a new scheduler", () => {
    const acts = read(ACTS);
    expect(acts).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(acts).toMatch(/reduced && <StaticArtifact state="request"/);
    expect(acts).toMatch(/reduced && <StaticArtifact state="locked"/);
    expect(acts).toMatch(/reduced && <StaticArtifact state="checked"/);
    expect((acts.match(/requestAnimationFrame/g) ?? []).length).toBeLessThanOrEqual(4);
  });
});
