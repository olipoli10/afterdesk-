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

const ALLOWED = new Set([
  PAGE,
  MACHINE,
  ENGINE,
  DICTIONARY,
  HOME_ASSEMBLY,
  HOME_ASSEMBLY_CSS,
  "src/components/logo.tsx",
  "src/components/lang-switch.tsx",
  A2,
  A2_CSS,
  "test/public-site-endvera-v7.test.ts",
  "test/public-site-endvera-brand.test.ts",
  "test/public-site-cohesion.test.ts",
  "test/public-site-header-consolidation.test.ts",
  "test/public-site-home-v55.test.ts",
  "test/public-site-truth.test.ts",
]);

describe("ENDVERA public narrative", () => {
  it("mounts the narration with its four-language dictionary", () => {
    const page = read(PAGE);
    expect(page).toMatch(/import\s+\{\s*SimplicityActs\s*\}\s+from\s+"@\/app\/_v7\/simplicity-acts"/);
    expect(page).toMatch(/import\s+\{\s*V7_ACTS_I18N\s*\}\s+from\s+"@\/lib\/i18n\/v7-acts"/);
    expect(page).toMatch(/<SimplicityActs\b/);
    expect(read(DICTIONARY)).toMatch(/Record<SiteLang, V7ActsCopy>/);
  });

  it("runs the accepted example machine as a continuation", () => {
    const page = read(PAGE);
    const machine = read(MACHINE);
    expect(page).toMatch(/<AssemblyExperience[^>]*\scontinuation\b/s);
    expect(machine).toMatch(/continuation\?:\s*boolean/);
    expect(machine).toMatch(/\{!continuation && <nav/);
  });

  it("keeps the official ENDVERA wordmark and metadata", () => {
    const page = read(PAGE);
    const titles = [...page.matchAll(/title:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(page).toMatch(/import\s+\{\s*Wordmark\s*\}\s+from\s+"@\/components\/logo"/);
    expect((page.match(/<Wordmark\b/g) ?? []).length).toBe(1);
    expect(page).not.toMatch(/>\s*(?:Endvera|ENDVERA)\s*<\/Link>/);
    expect(titles).toHaveLength(4);
    expect(titles.every((title) => title.endsWith("| Endvera"))).toBe(true);
    expect(page).toMatch(/name:\s*"Endvera"/);
  });

  it("carries no retired brand string into the public surface", () => {
    for (const path of [PAGE, MACHINE, ENGINE, DICTIONARY]) {
      expect(read(path), `retired brand in ${path}`).not.toMatch(/AfterDesk/);
    }
  });

  it("keeps exactly one A2 owner and no hidden data action", () => {
    const page = read(PAGE);
    const engine = read(ENGINE);
    expect(page).not.toMatch(/<A2Concierge\b/);
    expect((engine.match(/<A2Concierge\b/g) ?? []).length).toBe(1);
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /sendBeacon/, /document\.cookie/]) {
      expect(engine, `narrative must not use ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("keeps the client-readable first-run truth in all languages", () => {
    const dictionary = read(DICTIONARY);
    const guide = read(HOME_ASSEMBLY);
    expect(dictionary).toContain('h: "Digital work, finished."');
    expect(dictionary).toContain('h: "Give us the workflow—not another task."');
    expect(dictionary).toContain('h: "One workflow. One managed run."');
    expect(dictionary).toContain('h: "Human judgment where it matters."');
    expect(dictionary).toContain('h: "Finished. Checked. Ready to use."');
    expect(dictionary).toContain('continuity: ["First run", "Checks recorded", "Operating standard"]');
    expect(dictionary).not.toMatch(/recurring|recurrence|récurrent|récurrence|recurrente|paulit-ulit|next approved run|prochaine exécution|siguiente ejecución|susunod na aprubadong run/i);
    expect(`${dictionary}\n${guide}`).not.toMatch(/one proven run|first run is proven|exécution éprouvée|ejecución probada|napatunayang run/i);
  });

  it("uses structured amber emphasis instead of coloring whole headlines", () => {
    const engine = read(ENGINE);
    const dictionary = read(DICTIONARY);
    expect(engine).toMatch(/function\s+AccentLine\b/);
    expect(engine).toMatch(/data-copy-accent/);
    expect(dictionary).toMatch(/accent:\s*"finished\."/);
    expect(dictionary).toMatch(/accent:\s*"workflow"/);
    expect(dictionary).toMatch(/accent:\s*"One managed workflow\."/);
  });

  it("keeps native document scrolling instead of consuming gestures for choreography", () => {
    const engine = read(ENGINE);
    expect(engine).not.toMatch(/addEventListener\("scroll"|scrollTo\(|preventDefault\(\)|requestAnimationFrame|data-pin=|data-v7-stage=""[^>]*sticky/);
    expect(engine).not.toMatch(/h-\[calc\(var\(--v7vh,100vh\)\*3\.1\)\]|sm:h-\[230vh\]/);
    expect(engine).not.toMatch(/type\s+Leg\s*=|buildLegs|routeAt\(|a2At\(|--walk|--handoff|--gate|--entry/);
    expect(engine).toMatch(/className="relative z-10 mx-auto w-full[^\"]*py-20/);
  });

  it("keeps A2 inside the first mobile viewport and removes only the phone fragment stack", () => {
    const page = read(PAGE);
    const engine = read(ENGINE);
    expect(page).toMatch(/data-site-header=/);
    expect(page).toMatch(/data-site-wordmark=/);
    expect(page).toMatch(/data-early-access=/);
    expect(engine).not.toMatch(/\{copy\.instrument\.intake\}/);
    expect(engine).toMatch(/data-hero-shell=/);
    expect(engine).toMatch(/data-intake-console=/);
    expect(engine).toMatch(/data-mobile-fragment-stack=/);
    expect(engine).toMatch(/@media \(max-width:\s*639px\)[\s\S]*\[data-mobile-fragment-stack\][^{]*\{[^}]*display:\s*none/);
    expect(engine).toMatch(/@media \(max-width:\s*639px\)[\s\S]*\[data-intake-console\][^{]*\{[^}]*grid-template-columns/);
    expect(engine).toMatch(/if \(next === "hero"\)[\s\S]*removeProperty\("--a2-stop-x"\)[\s\S]*removeProperty\("--a2-stop-y"\)/);
  });

  it("routes one powered vein through the managed run and the actual heart", () => {
    const engine = read(ENGINE);
    expect((engine.match(/data-primary-vein=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-primary-vein-start=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-intake-bus=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-managed-run=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-managed-run-intake=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-managed-run-output=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-managed-run-channel=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-heart-intake=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-heart-target=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-heart-throughput=/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/data-primary-vein-bed/);
    expect(engine).toMatch(/data-primary-vein-current/);
    expect(engine).toMatch(/querySelector<HTMLElement>\("\[data-managed-run-intake\]"\)/);
    expect(engine).toMatch(/querySelector<HTMLElement>\("\[data-managed-run-output\]"\)/);
    expect(engine).toMatch(/querySelector<HTMLElement>\("\[data-heart-target\]"\)/);
    expect(engine).toMatch(/const path = \[[\s\S]*runInPoint[\s\S]*runOutPoint[\s\S]*heartTargetPoint/);
    expect(engine).toMatch(/@keyframes\s+v7powerflow/);
    expect(engine).toMatch(/@keyframes\s+v7managedpulse/);
    expect(engine).not.toMatch(/data-main-vein=|data-a2-rail=|data-service-drop=|data-bay-approach=|data-bay-exit=|data-vein-jog=|data-release-deck=/);
  });

  it("moves the single A2 discretely between exactly three explanatory stops", () => {
    const engine = read(ENGINE);
    const a2 = read(A2);
    const css = read(A2_CSS);
    for (const stop of ["scope", "core", "verification"]) {
      expect((engine.match(new RegExp(`data-a2-stop-anchor="${stop}"`, "g")) ?? []).length).toBe(1);
      expect(css).toContain(`data-a2-stop="${stop}"`);
    }
    expect((engine.match(/data-a2-stop-anchor=/g) ?? []).length).toBe(3);
    expect(engine).toMatch(/new IntersectionObserver/);
    expect(engine).toMatch(/rootMargin:\s*"-16% 0px -46% 0px"/);
    expect(engine).toMatch(/--a2-stop-x/);
    expect(engine).toMatch(/--a2-stop-y/);
    expect(engine).not.toMatch(/data-v7-escorting|data-a2-gait|data-a2-free|--a2-travel-y/);
    expect(a2).not.toMatch(/data-v7-escorting|escortReaction/);
  });

  it("binds the three A2 stops to localized explanations", () => {
    const engine = read(ENGINE);
    const copy = read(HOME_ASSEMBLY);
    expect(engine).toMatch(/data-a2-stop-anchor="scope"[\s\S]*concierge\.guide\.solution/);
    expect(engine).toMatch(/data-a2-stop-anchor="core"[\s\S]*concierge\.guide\.run/);
    expect(engine).toMatch(/data-a2-stop-anchor="verification"[\s\S]*concierge\.guide\.review/);
    expect(engine).toMatch(/scope:\s*"solution"[\s\S]*core:\s*"run"[\s\S]*verification:\s*"review"/);
    for (const scene of ["solution", "run", "review"]) {
      expect((copy.match(new RegExp(`${scene}:\\s*["']`, "g")) ?? []).length).toBe(4);
    }
  });

  it("keeps stop explanations accessible while hidden A2 is inert", () => {
    const engine = read(ENGINE);
    expect((engine.match(/aria-label=\{concierge\.guide\.(?:solution|run|review)\}/g) ?? []).length).toBe(3);
    expect(engine).toMatch(/dock\.setAttribute\("inert",\s*""\)/);
    expect(engine).toMatch(/dock\.removeAttribute\("inert"\)/);
    expect(engine).toMatch(/dock\.setAttribute\("aria-hidden",\s*"true"\)/);
  });

  it("keeps A2 alive at rest and reacts only to discrete stop changes", () => {
    const a2 = read(A2);
    const idle = a2.match(/export const IDLE:[\s\S]*?\n\];/)?.[0] ?? "";
    expect(idle).toMatch(/ex:\s*-1[\s\S]*ex:\s*1/);
    expect(idle).toMatch(/lid:\s*1/);
    expect((idle.match(/\b(?:dx|dy|hy|hdx|hdy|bfx|bfy|ffx|ffy)\s*:/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(a2).toMatch(/900\s*\+\s*Math\.random\(\)\s*\*\s*900/);
    expect(a2).toMatch(/MutationObserver/);
    expect(a2).toMatch(/attributeFilter:\s*\["data-a2-stop",\s*"data-a2-scene"\]/);
    expect(a2).toMatch(/data-a2-guide-line=\{scene\}/);
    expect(a2).toMatch(/data-a2-part=\{A2_PARTS\[i\]\}/);
  });

  it("keeps the fail-closed A2 panel, citations and single-being guard", () => {
    const a2 = read(A2);
    expect(a2).toMatch(/assertSingleA2/);
    expect(a2).toMatch(/querySelectorAll\("\[data-a2-being\]"\)/);
    expect(a2).toMatch(/copy\.answers\.verifiedHref/);
    expect(a2).toMatch(/copy\.answers\.unknown/);
    expect(a2).toMatch(/copy\.answers\.unavailable/);
    expect(a2).toMatch(/role="dialog"/);
    expect(a2).toMatch(/aria-modal="false"/);
    expect(a2).toMatch(/e\.key === "Escape"/);
  });

  it("shows one complete coordination heart and one written operating standard", () => {
    const engine = read(ENGINE);
    for (const marker of [
      "data-living-engine=",
      "data-engine-boundary=",
      "data-engine-core=",
      "data-coordination-heart=",
      "data-core-heart=",
      "data-heart-seam=",
      "data-heart-aura=",
      "data-engine-modules=",
      "data-evidence-ledger=",
      "data-engine-verification=",
      "data-engine-result=",
      "data-engine-standard=",
    ]) {
      expect((engine.match(new RegExp(marker, "g")) ?? []).length, marker).toBe(1);
    }
    expect(engine).toMatch(/copy\.act3\.stations\.map/);
    expect(engine).toMatch(/copy\.engine\.continuity\.map/);
    expect(engine).toContain("lg:grid-cols-[.8fr_1.5fr_.8fr]");
  });

  it("stops vein, heart and A2 pop motion for reduced-motion readers", () => {
    const engine = read(ENGINE);
    const css = read(A2_CSS);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-primary-vein-current[\s\S]*animation:\s*none/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-managed-run[\s\S]*animation:\s*none/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-core-heart[\s\S]*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-stop[\s\S]*animation:\s*none/);
    expect(engine).toMatch(/reduced \? 0 : 90/);
  });

  it("preserves a mobile-safe stop bubble and touch target", () => {
    const css = read(A2_CSS);
    expect(css).toMatch(/\.launch\s*\{[\s\S]*width:\s*76px[\s\S]*height:\s*76px/);
    expect(css).toMatch(/@media \(max-width:\s*640px\)[\s\S]*\.sceneGuide[\s\S]*calc\(100vw - 72px\)/);
    expect(css).toMatch(/\.sceneGuide\s*\{[\s\S]*right:\s*82px/);
    expect(css).not.toMatch(/\.dock\[data-a2-stop[^\{]*\{[^}]*position:\s*fixed/);
  });

  it("keeps the accepted machine and final conversion in the same reading flow", () => {
    const page = read(PAGE);
    const engine = read(ENGINE);
    expect(engine).toMatch(/children\??:\s*React\.ReactNode/);
    expect(engine).toMatch(/\{children\}/);
    expect(page).toMatch(/<SimplicityActs[^>]*>[\s\S]*<AssemblyExperience[\s\S]*<\/SimplicityActs>/);
    expect(page).toMatch(/acts\.act4\.cta/);
    expect(page).not.toContain("max-[900px]:pb-[300px]");
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

  it("changes nothing outside the authorised public-site surface", () => {
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
