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
    expect(dictionary).toContain('h: "Give us the workflow—not another task."');
    expect(dictionary).toContain('h: "One workflow. One managed run."');
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

  it("turns one approved run into a reusable standard without claiming live recurrence", () => {
    const dictionary = read(DICTIONARY);
    const engine = read(ENGINE);
    const guide = read(HOME_ASSEMBLY);

    expect(dictionary, "all four languages name the first-run quality standard").toSatisfy(
      (source: string) => (source.match(/standard(?: d'exécution| operativo| ng pagpapatakbo)?/gi) ?? []).length >= 4,
    );
    expect(dictionary).not.toMatch(/handed over|mise en place et remise|configurada y entregada|iset up at ipinasa/i);
    expect(dictionary).toContain('continuity: ["First run", "Checks recorded", "Operating standard"]');
    expect(dictionary).toContain('h: "Give us the workflow—not another task."');
    expect(dictionary).toContain('h: "Approve the run. Keep the standard."');
    expect(dictionary).not.toMatch(/recurring|recurrence|récurrent|récurrence|recurrente|paulit-ulit|next approved run|prochaine exécution|siguiente ejecución|susunod na aprubadong run/i);
    expect(`${dictionary}\n${guide}`).not.toMatch(/one proven run|first run is proven|exécution éprouvée|première exécution est éprouvée|ejecución probada|primera ejecución está probada|napatunayang run|napatunayan ang first run/i);

    expect((engine.match(/data-engine-standard=/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/copy\.engine\.continuity\.map/);
    expect(engine).toMatch(/data-engine-standard[\s\S]*data-power-fill[\s\S]*--power-release/);
    expect(engine).not.toMatch(/@keyframes\s+(?:loop|recurr|cycle)/i);
    expect(engine).toMatch(/max-w-\[calc\(87%-80px\)\][\s\S]*grid-cols-1[\s\S]*sm:grid-cols-3/);
    expect(engine).toMatch(/text-\[12px\][\s\S]*continuitySub/);
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
    expect(engine, "the gait is tied to ground actually covered, so A2 can never walk in place").toMatch(
      /const\s+phase\s*=\s*route\.movingLeg\s*\?\s*Math\.abs\(Math\.floor\(route\.arc\s*\/\s*28\)\)\s*%\s*4\s*:\s*0/,
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
    for (const scene of ["hero", "problem", "solution", "run", "review", "outcome", "example", "final"]) {
      expect(copy, `all four languages define the ${scene} supervision line`).toSatisfy(
        (source: string) => (source.match(new RegExp(`${scene}:\\s*[\"']`, "g")) ?? []).length === 4,
      );
    }
    expect(a2).toMatch(/data-a2-scene-guide/);
    expect(a2).toMatch(/data-a2-guide-line=\{scene\}/);
    expect(a2).not.toMatch(/setWhisper\("scene"\)/);
    expect(engine, "the guide speaks from the one A2, never a duplicate outcome label").not.toMatch(/data-a2-outcome-guide/);
    expect(engine, "scene supervision remains visible during escort").not.toMatch(
      /data-v7-escorting="on"[^}]*span\[aria-hidden\][^}]*display:\s*none/,
    );
    expect(a2).toContain("if (reducedRef.current) { stop(); setRects(A2_REST); return; }");
    expect(a2).toMatch(/launcherPlay\(SEQ\.arrival\)[\s\S]*?\}, \[launcherPlay\]\);/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-being/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-whisper/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-part[\s\S]*transform:\s*none/);
  });

  it("binds every A2 explanation to the scene that is actually being shown", () => {
    const a2 = read(A2);
    const copy = read(HOME_ASSEMBLY);
    const engine = read(ENGINE);
    const page = read(PAGE);

    for (const scene of ["hero", "problem", "solution", "run", "review", "outcome", "example", "final"]) {
      expect(copy, `all four languages define the ${scene} A2 line`).toSatisfy(
        (source: string) => (source.match(new RegExp(`${scene}:\\s*[\"']`, "g")) ?? []).length === 4,
      );
    }

    /* The guide lines are rendered once and selected by the scene attribute
       in the same paint. A MutationObserver/React render may still drive the
       facial reaction, but it must not be the text timing authority. */
    expect(a2).toMatch(/data-a2-scene-guide/);
    expect(a2).toMatch(/data-a2-guide-line=\{scene\}/);
    expect(a2).not.toMatch(/setWhisper\("scene"\)/);
    expect(engine).toMatch(/type\s+MotionSnapshot/);
    expect(engine).toMatch(/const\s+snapshotAt\s*=/);
    expect(engine).toMatch(/data-v7-scene/);
    expect(engine).toMatch(/data-a2-scene/);
    expect(page).toMatch(/data-a2-guide="example"/);
    expect(page).toMatch(/data-a2-guide="final"/);
  });

  it("shows one living coordination core instead of two static capability lists", () => {
    const engine = read(ENGINE);
    expect((engine.match(/data-living-engine=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-coordination-heart=/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/data-engine-boundary/);
    expect(engine).toMatch(/data-engine-core/);
    expect(engine, "the heartbeat belongs to a compact chamber inside the core, not to the whole module stack").not.toMatch(
      /data-engine-core=""\s+data-core-heart/,
    );
    expect(engine).toMatch(
      /data-engine-core=""[\s\S]*?<div data-core-heart=""[\s\S]*?data-heart-shell="left"[\s\S]*?data-heart-shell="right"[\s\S]*?data-heart-seam[\s\S]*?copy\.engine\.core[\s\S]*?<\/div>[\s\S]*?data-engine-modules/,
    );
    expect(engine).toMatch(/data-heart-shell="left"/);
    expect(engine).toMatch(/data-heart-shell="right"/);
    expect(engine).toMatch(/data-heart-seam/);
    expect(engine).toMatch(/data-engine-modules/);
    expect(engine).toMatch(/data-engine-module/);
    expect(engine).toMatch(/data-evidence-ledger/);
    expect(engine).toMatch(/data-engine-verification/);
    expect(engine).toMatch(/data-engine-result/);
    expect(engine).toMatch(/--engine-p/);
    expect((engine.match(/copy\.act3\.stations\.map/g) ?? []).length).toBe(1);
  });

  it("makes the conductor carry scroll-owned energy without another animation clock", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(/data-conductor-segment/);
    expect(engine).toMatch(/data-power-fill/);
    expect(engine).toMatch(/data-power-fill[\s\S]*scale[XY]\(var\(--power-/);
    for (const channel of ["intake", "problem", "engine", "run", "release"]) {
      expect(engine).toContain(`--power-${channel}`);
    }
    expect(engine).toMatch(/--power-beat/);
    expect(engine).not.toMatch(/@keyframes\s+(?:heartbeat|power|energy)/i);
    expect((engine.match(/\binfinite\b/g) ?? []).length).toBe(1);
  });

  it("turns the conductor into one continuous living vein instead of disconnected hairlines", () => {
    const engine = read(ENGINE);
    expect((engine.match(/data-main-vein=/g) ?? []).length, "every narrative segment belongs to the same main vein").toBeGreaterThanOrEqual(5);
    expect((engine.match(/data-vein-vessel=/g) ?? []).length, "the conductor is a bounded vessel, not a one-pixel rule").toBeGreaterThanOrEqual(6);
    expect(engine).toMatch(/data-main-vein[\s\S]*data-vein-channel/);
    expect(engine).toMatch(/data-main-vein[\s\S]*data-energy-packet/);
    expect(engine).toMatch(/data-main-vein[\s\S]*clamp\(2px/);
    expect(engine).toMatch(/data-engine-vein-bed[\s\S]*stroke-width:\s*7/);
    expect(engine).toMatch(/data-engine-vein[\s\S]*stroke-width:\s*3/);
    expect(engine).toMatch(/\[data-main-vein\][\s\S]*border:[\s\S]*inset/);
    expect(engine).toMatch(/data-energy-packet[\s\S]*linear-gradient[\s\S]*#FFD28E[\s\S]*#F0A14A/);
    expect(engine).toMatch(/@property\s+--energy-p[\s\S]*inherits:\s*true/);
    expect(engine).toMatch(/\[data-v7-acts\][\s\S]*animation:\s*v7pulse\s+5\.2s/);
    expect(engine, "the current stays visibly brighter than the vessel while it travels").toMatch(
      /@keyframes\s+v7pulse[\s\S]*--packet-o:\s*0\.3[\s\S]*--packet-o:\s*1/,
    );
    expect(engine).not.toMatch(/data-energy-packet[^}]*animation:/);
    expect(engine).not.toMatch(/data-await-sweep[^}]*animation:/);
    expect((engine.match(/animation:\s*v7pulse/g) ?? []).length, "the entire vein reads one inherited ambient clock").toBe(1);
  });

  it("moves one legible current through consecutive vein segments before the heart beats", () => {
    const engine = read(ENGINE);
    for (const step of ["origin", "burden", "handoff", "approach", "curve", "intake", "output", "release"]) {
      expect(engine, `${step} owns one phase of the same current`).toContain(`data-flow-step="${step}"`);
      expect(engine).toMatch(new RegExp(`\\[data-flow-step="${step}"\\][\\s\\S]*--flow-start`));
    }
    expect(engine).toMatch(/--packet-p:\s*clamp\(0,[\s\S]*--flow-scale/);
    expect(engine).toMatch(/--packet-visible:[\s\S]*--packet-enter[\s\S]*--packet-leave/);
    expect(engine).toContain("translate3d(calc(var(--packet-p, var(--energy-p)) * 355%)");
    expect(engine).toContain("translate3d(0, calc(var(--packet-p, var(--energy-p)) * 455%)");
    expect(engine).toContain("stroke-dashoffset: calc(var(--packet-p, var(--energy-p)) * -100)");
    /* the double beat HOLDS its peaks long enough for normal video to keep
       several bright frames: first beat held across two keyframes, a short
       dip, then the second beat held again */
    expect(engine).toMatch(/@keyframes\s+v7pulse[\s\S]*63%\s*\{[^}]*--heart-p:\s*1[\s\S]*66%\s*\{[^}]*--heart-p:\s*0\.92[\s\S]*68%\s*\{[^}]*--heart-p:\s*0\.3[\s\S]*71%\s*\{[^}]*--heart-p:\s*0\.95/);
    expect(engine, "the beat lights the heart's interior, not only its rim").toMatch(
      /\[data-core-heart\][\s\S]*background:\s*color-mix\(in srgb,\s*#0C0F14,\s*#2E2413\s*calc\(var\(--heart-p\)\s*\*\s*100%\)\)/,
    );
    expect(engine, "the seam flares with a real spread at the beat").toMatch(/data-heart-seam[\s\S]*calc\(var\(--heart-p\)\s*\*\s*5px\)/);
  });

  it("routes the request into a real heart port and keeps the heartbeat inside the core", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(/data-engine-handoff[\s\S]*data-port[\s\S]*data-heart-feed/);
    expect(engine).toMatch(/data-heart-feed[\s\S]*data-main-vein[\s\S]*data-vein-channel[\s\S]*data-energy-packet/);
    expect((engine.match(/data-heart-drop=/g) ?? []).length, "the carry lane must descend into the engine frame").toBe(1);
    expect(engine).toMatch(/data-heart-drop[\s\S]*data-main-vein[\s\S]*data-vein-channel/);
    expect((engine.match(/data-engine-vein-lane=/g) ?? []).length, "the outside vein must terminate at the heart port").toBe(1);
    expect((engine.match(/data-engine-header-feed=/g) ?? []).length, "the vessel must continue through the engine header").toBe(1);
    expect((engine.match(/data-engine-feed-joint=/g) ?? []).length, "the outside drop and header feed need one visible junction").toBe(1);
    expect(engine).toMatch(/data-engine-vein-lane[\s\S]*data-engine-vein-energy/);
    expect((engine.match(/data-heart-intake=/g) ?? []).length, "the core must own a visible intake port").toBe(1);
    /* THE RECEIVER: a machined port with closed lids drawn at rest, opened
       by scroll (--gate) as the plate arrives, closed behind it, with an
       entry wash (--entry) carrying the received energy to the heart */
    expect(engine).toMatch(/data-engine-feed-joint=""\s+data-artifact-receiver=""/);
    expect((engine.match(/<i data-port-lid="left"/g) ?? []).length).toBe(1);
    expect((engine.match(/<i data-port-lid="right"/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/\[data-port-lid="left"\]\s*\{\s*transform:\s*translateX\(calc\(var\(--gate,\s*0\)\s*\*\s*-8px\)\)/);
    expect(engine).toMatch(/const gate = Math\.min\(clamp01\(\(pinP - 0\.30\) \/ 0\.08\), 1 - clamp01\(\(pinP - 0\.60\) \/ 0\.06\)\)/);
    expect(engine).toMatch(/const entry = clamp01\(\(pinP - 0\.60\) \/ 0\.12\)/);
    expect(engine, "the plate descends the drop's own x and vanishes only inside the port mouth").toMatch(
      /const inPort = clamp01\(\(plateP - 0\.86\) \/ 0\.14\)[\s\S]*x:\s*dropXm\s*-\s*sx\s*-\s*26/,
    );
    expect((engine.match(/data-heart-inlet=/g) ?? []).length, "the port must terminate in a machined inlet").toBe(1);
    expect(engine).toMatch(/data-heart-intake[\s\S]*data-vein-channel[\s\S]*data-energy-packet/);
    expect((engine.match(/data-mobile-heart-bridge=/g) ?? []).length, "mobile boundary must not break the vein before the heart").toBe(1);
    expect(engine).toMatch(/data-engine-boundary[\s\S]*data-mobile-heart-bridge[\s\S]*data-energy-packet/);
    expect(engine, "the mobile curve must terminate on the first-column heart axis, not the empty frame centre").toMatch(
      /data-engine-vein-bed="" d="M87 0 C87 14 58 11 36 28"/,
    );
    expect((engine.match(/data-mobile-vein-link=/g) ?? []).length, "narrow mobile widths need one physical curve-to-heart coupler").toBe(1);
    expect(engine).toMatch(/data-mobile-vein-link[\s\S]*calc\(\(100% - 96px\) \/ 2\)[\s\S]*right: "64%"/);
    expect((engine.match(/data-heart-neck=/g) ?? []).length, "the inlet must physically continue into the compact heart").toBe(1);
    expect(engine).toMatch(/data-heart-intake[\s\S]*data-heart-neck[\s\S]*data-core-heart/);
    expect((engine.match(/data-heart-output-desktop=/g) ?? []).length, "the heart must feed verification on desktop").toBe(1);
    expect((engine.match(/data-heart-output-mobile=/g) ?? []).length, "the heart must feed verification on mobile").toBe(1);
    expect((engine.match(/data-result-feed=/g) ?? []).length, "verification must visibly feed the finished result").toBe(1);
    expect((engine.match(/data-verification-inlet=/g) ?? []).length, "the heart output must terminate in the verification card, not dangle beside it").toBe(1);
    expect((engine.match(/data-result-inlet=/g) ?? []).length, "the result feed must terminate in the result card, not dangle above it").toBe(1);
    expect(engine).toMatch(/@property\s+--heart-p[\s\S]*inherits:\s*true/);
    expect(engine).toMatch(/data-heart-aura[\s\S]*--heart-p/);
    expect(engine).toMatch(/data-heart-seam[\s\S]*--heart-p/);
    expect(engine).not.toMatch(/data-engine-intake-desktop|data-boundary-turn-mobile|data-core-input-desktop/);
  });

  it("attaches one real dialogue window to A2 at every beat, in reserved bands", () => {
    const engine = read(ENGINE);
    const css = read(A2_CSS);
    const guide = read(HOME_ASSEMBLY);
    /* the six mandated beats: five reserved in-flow windows on the route,
       plus the final conclusion at the freed being's post */
    for (const beat of ["probleme", "perimetre", "moteur", "jugement", "resultat"]) {
      expect(engine, `${beat} has one reserved dialogue band`).toContain(`beat="${beat}"`);
    }
    expect(engine).toMatch(/function\s+A2Dialogue[\s\S]*data-a2-beat=\{beat\}[\s\S]*data-a2-dialog=\{beat\}/);
    expect((engine.match(/data-a2-note-speaker=/g) ?? []).length, "the window visibly identifies A2 as its speaker").toBe(1);
    expect((engine.match(/data-a2-note-tether=/g) ?? []).length, "the tether visibly reaches the being").toBe(1);
    expect((engine.match(/data-beat-marker=/g) ?? []).length, "a folded band still reads as a waiting station, never a hole").toBe(1);
    /* folded by default, opened by the ONE scroll authority, folded again
       before A2 walks - windows live strictly inside plateaus */
    expect(engine).toMatch(/\[data-a2-dialog\]\s*\{[^}]*visibility:\s*hidden/);
    for (const beat of ["probleme", "perimetre", "moteur", "jugement", "resultat"]) {
      expect(engine).toContain(`[data-v7-beat="${beat}"] [data-a2-dialog="${beat}"]`);
    }
    expect(engine).toMatch(/const beatAt = \(y: number\): string/);
    expect(engine).toMatch(/root\.setAttribute\("data-v7-beat", beat\)/);
    expect(engine, "a plateau outlasts one whole normal gesture on every device").toMatch(
      /window\.innerWidth < 640 \? Math\.max\(u \* 0\.48, 640\) : u \* 0\.48/,
    );
    expect(engine).toMatch(/data-review-heading=""[^>]*className="(?![^"]*\bsticky\b)/);
    for (const scene of ["problem", "solution", "run", "review", "outcome"]) {
      expect(engine).toContain(`concierge.guide.${scene}`);
    }
    /* the floating guide never rides over the story: silent during escort,
       and on phones the conclusion opens only at the end-of-page stop
       inside the footer's reserved corner */
    expect(css).toMatch(/data-a2-free="on"\]\[data-a2-scene="final"\]\s*\.sceneGuide\s*\{\s*display:\s*block/);
    expect(css).toMatch(/data-v7-end="on"\][\s\S]*\.sceneGuide\s*\{\s*display:\s*block/);
    expect(engine).toMatch(/data-v7-end/);
    expect(guide).toContain("This is the work between the work—the burden your team should not manage.");
    expect(guide).toContain("Anything the system cannot confirm comes here for human judgment.");
    expect(guide).not.toMatch(/First, the burden: prompts|Exceptions surface here\. A person checks/);
  });

  it("keeps A2's torso stable while scroll locomotion is expressed by the feet", () => {
    const engine = read(ENGINE);
    const a2 = read(A2);
    const a2Css = read(A2_CSS);
    const escortCss = engine.slice(engine.indexOf('[data-a2-dock][data-v7-escorting="on"]'));
    expect(escortCss).toMatch(/data-a2-gait="1"[\s\S]*data-a2-part="front-foot"/);
    expect(escortCss).toMatch(/data-a2-gait="3"[\s\S]*data-a2-part="back-foot"/);
    expect(escortCss, "walking must not bob the body, head or crown on every scroll quantum").not.toMatch(
      /data-a2-gait="[13]"[^}]*data-a2-part="(?:body|head|crown)"/,
    );
    expect(engine, "the dock itself must not receive a separate gait bounce").not.toMatch(
      /--a2-travel-y[\s\S]*const\s+step\s*=\s*\[[^\]]*-[12]/,
    );
    expect(a2Css, "the sprite must stop interpolating after the finger stops").toMatch(
      /data-v7-escorting="on"[\s\S]*\.launch\s*>\s*svg\s*\{[\s\S]*transition:\s*none/,
    );
    expect(a2, "scene reactions during travel must be eyes-only, never a second body gait").toMatch(
      /function\s+escortReaction[\s\S]*\{\s*ex,\s*ey,\s*lid\s*\}/,
    );
    expect(a2).toMatch(/data-v7-escorting[\s\S]*escortReaction\(STORY_REACTIONS\[scene\]\)/);
    expect(a2, "the delayed arrival must never start after scroll escort has begun").toMatch(
      /arrivalTimer\.current\s*=\s*setTimeout[\s\S]*data-v7-escorting[\s\S]*launcherPlay\(SEQ\.arrival\)/,
    );
  });

  it("walks A2 along one measured painted polyline to the very end of the story", () => {
    const engine = read(ENGINE);
    /* the leg table: measured document/stage points, plateaus at the
       dialogue bands, evaluated by one pure function of scroll */
    expect(engine).toMatch(/type\s+Leg\s*=\s*\{[\s\S]*space:\s*"doc"\s*\|\s*"stage"/);
    expect(engine).toMatch(/const\s+buildLegs\s*=\s*\(\)\s*=>/);
    expect(engine).toMatch(/const\s+a2At\s*=\s*\(y:\s*number\)\s*=>/);
    expect(engine).toMatch(/legArc\s*=\s*legs\.map/);
    expect(engine).toMatch(/const\s+routeAt\s*=\s*\(y:\s*number\)/);
    expect(engine).toMatch(/artifact:\s*plate,[\s\S]*a2:\s*\{\s*x:\s*a\.vx/);
    expect(engine).toMatch(/root\.style\.setProperty\("--handoff"/);
    expect(engine).toMatch(/root\.style\.setProperty\("--gate"/);
    expect(engine).toMatch(/root\.style\.setProperty\("--entry"/);
    expect(engine).toMatch(/data-v7-handed-off/);
    /* the pinned choreography owns real scroll for every moment */
    expect(engine).toMatch(/handoffStart = pinStart \+ pinSpan \* 0\.38/);
    expect(engine).toMatch(/handoffEnd = pinStart \+ pinSpan \* 0\.60/);
    expect(engine).toMatch(/push\(p\(0\), p\(0\.30\), "stage", cx, laneStageY, dropXm, laneStageY\)/);
    expect(engine, "A2 supervises the entry from the datum, standing").toMatch(
      /push\(p\(0\.30\), p\(0\.70\), "stage", dropXm, laneStageY, dropXm, laneStageY, true\)/,
    );
    /* the service bay rides down in DOCUMENT space at slope one, so the
       supervisor stays in view through the whole human review */
    expect(engine).toMatch(/const bayEnd = pinEnd \+ Math\.max\(1, bayBotDoc - bayTopDoc\)/);
    expect(engine).toMatch(/push\(pinEnd, bayEnd, "doc", railX, bayTopDoc, railX, bayBotDoc\)/);
    /* the release: down the column, along the painted deck to the exact
       point where the free post paints; the corner takes over off-screen */
    expect(engine).toMatch(/push\(rampTurn, releaseY, "doc", cx, deckY - 3, freeX, deckY - 3\)/);
    expect(engine).toMatch(/push\(releaseY, freeFixY, "doc", freeX, deckY - 3, freeX, deckY - 3, true\)/);
    expect(engine).toMatch(/freeFixY = releaseY \+ narrativeVh \* 0\.85/);
    expect(engine).toMatch(/const\s+storyActive\s*=[\s\S]*y\s*<\s*freeFixY/);
    /* the painted world the polyline rides: elbows, bay, jog, deck, port */
    expect((engine.match(/data-vein-inbound=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-vein-elbow=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-bay-approach=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-bay-exit=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-vein-jog=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-vein-jog-elbow=/g) ?? []).length).toBe(2);
    expect((engine.match(/data-release-deck=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-example-port=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-escort-rail=/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/data-engine-escort-rail[\s\S]*data-main-vein[\s\S]*data-energy-packet/);
    expect(engine, "the narrow-language approach must keep its minimum runway").toMatch(
      /const minApproach = narrativeVh \* 0\.05/,
    );
  });

  it("restores the accepted nested coordination heart without a full-height scrollbar through its copy", () => {
    const engine = read(ENGINE);
    expect((engine.match(/data-engine-handoff=/g) ?? []).length).toBe(1);
    expect((engine.match(/copy\.engine\.boundaryItems\.map/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-boundary=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-core=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-coordination-heart=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-heart-seam=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-heart-aura=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-modules=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-module=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-evidence-ledger=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-verification=/g) ?? []).length).toBe(1);
    expect((engine.match(/data-engine-result=/g) ?? []).length).toBe(1);
    expect(engine).toMatch(/sm:grid-cols-\[0\.8fr_1\.5fr_0\.8fr\]/);
    expect(engine).not.toMatch(/data-engine-intake-desktop|data-core-input-desktop|data-core-output-desktop/);
  });

  it("gives every choreography moment its own scroll and groups the activations", () => {
    const engine = read(ENGINE);
    /* the run act owns enough scroll that the tour, the pause, the descent,
       the close and the watch each survive one whole normal gesture */
    expect(engine).toContain("sm:h-[230vh]");
    expect(engine).toContain("h-[calc(var(--v7vh,100vh)*3.1)]");
    expect(engine).toMatch(/const\s+engineVisualEnd\s*=\s*yApproachEnd\s*\+\s*\(pinEnd\s*-\s*yApproachEnd\)\s*\*\s*0\.45/);
    expect(engine).toMatch(/const\s+engineP\s*=\s*between\(ySolution,\s*Math\.max\(ySolution\s*\+\s*1,\s*engineVisualEnd\)\)/);
    /* the station tour completes before the plate ever leaves the datum */
    expect(engine).toMatch(/const walk = clamp01\(pinP0 \/ 0\.3\)/);
    expect(engine).toMatch(/root\.style\.setProperty\("--run", pinP0\.toFixed\(4\)\)/);
    /* the mandated groups: models+software+browser on the tour, approved
       systems + human judgment during the entry */
    expect(engine).toContain("[0.05, 0.12, 0.19, 0.46, 0.56][i]");
    expect(engine).toMatch(/\[data-engine-module\]\s*\{[\s\S]*--ep:\s*var\(--run,\s*1\)/);
    expect(engine, "an activation must survive normal video: the whole card lifts").toMatch(
      /\[data-engine-module\][\s\S]*background:\s*color-mix\(in srgb,\s*#12151B,\s*#46331B/,
    );
    expect(engine).toContain("sm:gap-[3.5vh]");
    expect(engine).toMatch(/data-v7-lane=""[^>]*h-\[76px\]/);
    expect(engine).toMatch(/data-engine-modules=""[^>]*grid-cols-2/);
  });

  it("keeps the living heart visible in the mobile stack and complete in reduced motion", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(/data-living-engine[\s\S]*className="[^"]*w-full/);
    expect(engine).not.toMatch(/data-living-engine[^>]*w-\[calc\(100%-96px\)\]/);
    expect(engine).toMatch(/<A2Dialogue beat="moteur"/);
    expect(engine).toMatch(/data-engine-core[\s\S]*data-engine-module/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-v7-acts[\s\S]*animation:\s*none/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-energy-packet[\s\S]*transform:\s*none/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\[data-v7-acts\][^}]*--packet-o:\s*0\.72/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-engine-module[\s\S]*opacity:\s*1/);
    /* the static composition is COMPLETE: heart lit but still, receiver
       drawn, every dialogue window open and readable */
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\[data-core-heart\]\s*\{\s*background:\s*color-mix\(in srgb,\s*#0C0F14,\s*#2E2413\s*40%\)/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\[data-a2-dialog\]\s*\{\s*opacity:\s*1;\s*visibility:\s*visible/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-port-glow[\s\S]*opacity:\s*0\.42/);
  });

  it("keeps the one A2 through the live example and releases it as the final guide", () => {
    const page = read(PAGE);
    const engine = read(ENGINE);
    const a2 = read(A2);
    const css = read(A2_CSS);

    expect(engine).toMatch(/children\??:\s*React\.ReactNode/);
    expect(engine).toMatch(/\{children\}/);
    expect(page).toMatch(/<SimplicityActs[^>]*>[\s\S]*<AssemblyExperience[\s\S]*<\/SimplicityActs>/);
    expect(engine).toMatch(/data-a2-free/);
    expect(css).toMatch(/data-a2-free="on"[\s\S]*position:\s*fixed/);
    expect(a2).toMatch(/data-a2-guide-line=\{scene\}/);
    expect(page).toMatch(/data-a2-guide="final"/);
  });

  it("reserves the solution copy outside A2's mobile transport lane", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(
      /<p className="max-w-\[calc\(87%-80px\)\][^"]*sm:max-w-\[44ch\][^"]*">\{copy\.solution\.sub\}<\/p>/,
    );
  });

  it("uses the single ambient slot for a moving awaiting bar and disables it for reduced motion", () => {
    const engine = read(ENGINE);
    expect(engine).toMatch(/@keyframes\s+v7pulse/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*no-preference[\s\S]*\[data-v7-acts\][\s\S]*animation:\s*v7pulse\s+5\.2s/);
    expect(engine).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\[data-v7-acts\][\s\S]*animation:\s*none/);
    expect((engine.match(/animation:\s*v7pulse/g) ?? []).length).toBe(1);
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
