/* R2 transplant guards. Written RED against ENDVERA Production `1b37f77`
   before any product edit, so each one is observed failing for the reason it
   names. They encode the risks R1 identified when the locally proven V7
   narration is reimplemented on the official ENDVERA lineage: the official
   wordmark must survive as a rendered component, the official metadata must
   not be reverted by the V7 page, the retired brand must not ride along, the
   single A2 invariant must hold, and nothing outside the authorised surface
   may change. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const PAGE = "src/app/page.tsx";
const MACHINE = "src/app/_home/assembly-experience.tsx";
const ENGINE = "src/app/_v7/simplicity-acts.tsx";
const DICTIONARY = "src/lib/i18n/v7-acts.ts";
const A2 = "src/app/_home/a2-concierge.tsx";
const A2_CSS = "src/app/_home/a2-concierge.module.css";
const HOME_ASSEMBLY = "src/lib/i18n/home-assembly.ts";
const HOME_ASSEMBLY_CSS = "src/app/_home/home-assembly.module.css";

/* the closed surface this phase may touch: the R1 manifest, EXTENDED by
   the FABLE opening reconstruction's presentation-only files - the lockup
   (opt-in plate variant), the language switcher (additive onyx tone), and
   the A2 launcher chrome (station platform, integer 2x being). All four
   are visual surfaces; no server, business or data file is in the set. */
const ALLOWED = new Set([
  PAGE,
  MACHINE,
  ENGINE,
  DICTIONARY,
  HOME_ASSEMBLY,
  HOME_ASSEMBLY_CSS,
  "src/components/logo.tsx",
  "src/components/lang-switch.tsx",
  "src/app/_home/a2-concierge.tsx",
  "src/app/_home/a2-concierge.module.css",
  "test/public-site-endvera-v7.test.ts",
  "test/public-site-endvera-brand.test.ts",
  "test/public-site-cohesion.test.ts",
  "test/public-site-header-consolidation.test.ts",
  "test/public-site-home-v55.test.ts",
  "test/public-site-truth.test.ts",
]);

describe("ENDVERA x V7 transplant", () => {
  it("mounts the V7 narration with its own four-language dictionary", () => {
    const page = read(PAGE);
    expect(page).toMatch(/import\s+\{\s*SimplicityActs\s*\}\s+from\s+"@\/app\/_v7\/simplicity-acts"/);
    expect(page).toMatch(/import\s+\{\s*V7_ACTS_I18N\s*\}\s+from\s+"@\/lib\/i18n\/v7-acts"/);
    expect(page).toMatch(/<SimplicityActs\b/);
  });

  it("runs the accepted machine in continuation mode instead of a second opening", () => {
    const page = read(PAGE);
    const machine = read(MACHINE);
    expect(page).toMatch(/<AssemblyExperience[^>]*\scontinuation\b/s);
    expect(machine).toMatch(/continuation\?:\s*boolean/);
    /* the machine's own navigation is suppressed while the acts own the top */
    expect(machine).toMatch(/\{!continuation && <nav/);
  });

  it("keeps the official ENDVERA wordmark as a rendered component, never a literal", () => {
    const page = read(PAGE);
    expect(page, "the header owner must import the shared wordmark").toMatch(
      /import\s+\{\s*Wordmark\s*\}\s+from\s+"@\/components\/logo"/,
    );
    expect(page).toMatch(/<Wordmark\b/);
    /* a hand-typed brand in the header is exactly what R1 forbade */
    expect(page).not.toMatch(/>\s*Endvera\s*<\/Link>/);
    expect(page).not.toMatch(/>\s*ENDVERA\s*</);
  });

  it("shows exactly one wordmark owner on the homepage", () => {
    const page = read(PAGE);
    const machine = read(MACHINE);
    const inPage = (page.match(/<Wordmark\b/g) ?? []).length;
    expect(inPage, "the page header owns one wordmark").toBe(1);
    /* the machine still contains its own, but only inside the suppressed nav */
    const navBlock = machine.slice(machine.indexOf("{!continuation && <nav"));
    expect(navBlock).toMatch(/<Wordmark\b/);
  });

  it("does not revert the official metadata, titles or organisation name", () => {
    const page = read(PAGE);
    const titles = [...page.matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toHaveLength(4);
    expect(titles.every((title) => title.endsWith("| Endvera"))).toBe(true);
    expect(page).toMatch(/name:\s*"Endvera"/);
    expect(page).toMatch(/"%s · Endvera"|HOME_META\[lang\]\.title/);
  });

  it("carries no retired brand string into the transplanted surface", () => {
    for (const path of [PAGE, MACHINE, ENGINE, DICTIONARY]) {
      expect(read(path), `retired brand in ${path}`).not.toMatch(/AfterDesk/);
    }
  });

  it("keeps one A2: the acts own the being, the page does not mount a second", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/<A2Concierge\b/);
    expect(read(ENGINE)).toMatch(/<A2Concierge\b/);
  });

  it("adds no network, storage or hidden action in the V7 layer", () => {
    const engine = read(ENGINE);
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /sendBeacon/, /document\.cookie/]) {
      expect(engine, `V7 engine must not use ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("replaces internal workflow jargon with one client-readable story", () => {
    const dictionary = read(DICTIONARY);
    expect(dictionary).toContain('h: "Digital work, finished."');
    expect(dictionary).toContain('h: "The work breaks between the tools."');
    expect(dictionary).toContain('h: "One engine coordinates the whole run."');
    expect(dictionary).toContain('h: "Human judgment where it matters."');
    expect(dictionary).toContain('h: "Finished. Checked. Ready to use."');
    for (const deadCopy of [
      "deliver it checked",
      "scoped run",
      "draft 2 of 3",
      "raw export",
      "unassigned",
      "Ready to deliver",
    ]) {
      expect(dictionary, `prototype copy remains: ${deadCopy}`).not.toContain(deadCopy);
    }
  });

  it("uses structured amber emphasis instead of coloring whole headlines", () => {
    const engine = read(ENGINE);
    const dictionary = read(DICTIONARY);
    expect(engine).toMatch(/function\s+AccentLine\b/);
    expect(engine).toMatch(/data-copy-accent/);
    expect(dictionary).toMatch(/accent:\s*"finished\."/);
    expect(dictionary).toMatch(/accent:\s*"between the tools\."/);
    expect(dictionary).toMatch(/accent:\s*"One coordinated run\."/);
  });

  it("gives A2 bounded rest-life, scroll-owned locomotion and scene reactions", () => {
    const a2 = read(A2);
    const css = read(A2_CSS);
    const engine = read(ENGINE);
    const idle = a2.match(/export const IDLE:[\s\S]*?\n\];/)?.[0] ?? "";
    expect(idle).toMatch(/ex:\s*-1[\s\S]*ex:\s*1/);
    expect(idle).toMatch(/lid:\s*1/);
    expect(idle, "rest-life includes a restrained body or head shift").toMatch(/\b(?:dx|dy|hy|hdx|hdy)\s*:/);
    expect(a2).toMatch(/hasAttribute\("data-v7-escorting"\)/);
    expect(a2, "A2 moves again quickly enough to read as alive at rest").toMatch(
      /900\s*\+\s*Math\.random\(\)\s*\*\s*900/,
    );
    const bodyLedIdle = (idle.match(/\b(?:dx|dy|hy|hdx|hdy|bfx|bfy|ffx|ffy)\s*:/g) ?? []).length;
    expect(bodyLedIdle, "rest-life is visibly anatomical, not eye-only").toBeGreaterThanOrEqual(12);
    expect(a2).toMatch(/MutationObserver/);
    expect(a2).toMatch(/data-a2-scene/);
    expect(a2).toMatch(/data-a2-whisper/);
    expect(css).toMatch(/data-v7-escorting="on"/);
    expect(css).toMatch(/rgba\(216,\s*117,\s*38/);
    expect(css).toMatch(/data-a2-whisper/);
    expect(engine).toMatch(/data-v7-trail/);
    expect(engine).toMatch(/data-v7-trail[\s\S]*scaleX\(var\(--walk/);
    expect(engine).toMatch(/data-v7-trail[\s\S]*origin-left/);
    expect(engine).toMatch(/--a2-travel-y/);
    expect(engine, "the existing scroll authority publishes a four-phase gait").toMatch(
      /setAttribute\(\s*["']data-a2-gait["']\s*,\s*String\(Math\.abs\(Math\.floor\(y\s*\/\s*18\)\)\s*%\s*4\)\s*\)/,
    );
    expect(engine).toMatch(/data-a2-scene/);
    expect(engine).toMatch(/translate3d\(0,\s*var\(--a2-travel-y/);
    expect(a2).toMatch(/data-a2-part=\{A2_PARTS\[i\]\}/);
    expect(engine).toMatch(/data-a2-gait="1"[\s\S]*data-a2-part="front-foot"/);
    expect(engine).toMatch(/data-a2-gait="3"[\s\S]*data-a2-part="back-foot"/);
    expect(engine).not.toMatch(/@keyframes\s+a2(?:walk|bob|travel)/);
  });

  it("keeps the A2 guide contextual, localized and static under reduced motion", () => {
    const a2 = read(A2);
    const css = read(A2_CSS);
    const copy = read(HOME_ASSEMBLY);
    const engine = read(ENGINE);
    for (const scene of ["hero", "solution", "run", "review", "outcome"]) {
      expect(copy, `all four languages define the ${scene} supervision line`).toSatisfy(
        (source: string) => (source.match(new RegExp(`${scene}:\\s*[\"']`, "g")) ?? []).length === 4,
      );
    }
    expect(a2).toMatch(/guideScene/);
    expect(a2).toMatch(/copy\.guide\[guideScene\]/);
    expect(a2).toMatch(/setWhisper\("scene"\)/);
    expect(engine).toMatch(/data-a2-outcome-guide[\s\S]*concierge\.guide\.outcome/);
    expect(engine, "scene supervision remains visible during escort").not.toMatch(
      /data-v7-escorting="on"[^}]*span\[aria-hidden\][^}]*display:\s*none/,
    );
    expect(a2).toContain("if (reducedRef.current) { stop(); setRects(A2_REST); return; }");
    expect(a2).toMatch(/launcherPlay\(SEQ\.arrival\)[\s\S]*?\}, \[launcherPlay\]\);/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-being/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-whisper/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-part[\s\S]*transform:\s*none/);
  });

  it("reserves the solution copy outside A2's mobile transport lane", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(
      /<p className="max-w-\[calc\(87%-80px\)\][^"]*sm:max-w-\[44ch\][^"]*">\{copy\.solution\.sub\}<\/p>/,
    );
  });

  it("uses the single ambient slot for a moving awaiting bar and disables it for reduced motion", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(/@keyframes\s+v7await/);
    expect(engine).toMatch(/\[data-await-sweep\][\s\S]*animation:\s*v7await/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\[data-await-sweep\][\s\S]*animation:\s*none/);
    expect(engine).not.toMatch(/animation:\s*v7lumen\s+18s/);
    expect((engine.match(/\binfinite\b/g) ?? []).length).toBe(1);
  });

  it("contextualizes the real example and removes the abstract boundary headline", () => {
    const copy = read(HOME_ASSEMBLY);
    const machine = read(MACHINE);
    const css = read(HOME_ASSEMBLY_CSS);
    expect(copy).toContain('kicker: "Example run · site selection · 34 sites screened"');
    expect(copy).toContain('title: "Controlled from request to delivery."');
    expect(copy).not.toContain('title: "The work runs inside a boundary."');
    expect(machine).toMatch(/continuation\s*\?\s*0\.3\s*\+\s*raw\s*\*\s*0\.7\s*:\s*raw/);
    expect(css).toMatch(/\.outcome[\s\S]*opacity:\s*clamp\(0,\s*calc\(var\(--s-c\)\s*\/\s*0\.14\),\s*1\)/);
  });

  it("changes nothing outside the authorised transplant surface", () => {
    /* tracked edits AND untracked additions: a diff against the base commit
       alone cannot see a new file, which is exactly how scope creep arrives */
    const tracked = execFileSync("git", ["diff", "--name-only", "1b37f778b14e8843ab69f5ce82758e744e6bf017"], {
      cwd: root,
      encoding: "utf8",
    });
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    const changed = `${tracked}\n${untracked}`
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const outside = changed.filter((path) => !ALLOWED.has(path));
    expect(outside, `outside the authorised surface:\n${outside.join("\n")}`).toEqual([]);
  });
});
