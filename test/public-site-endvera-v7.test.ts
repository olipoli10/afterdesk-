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
