import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_I18N } from "@/lib/i18n/client";
import { SITE_LANGS } from "@/lib/i18n/langs";

/**
 * STAGE B — the guarantees the motion layer must not quietly lose.
 *
 * SCOPE, STATED EXACTLY (invariant 19). These are source and dictionary
 * assertions: they read the two component files, `globals.css`, and the four
 * active dictionaries. They prove the STRUCTURE that makes the guarantees
 * possible — a server component that never gained a client directive, a
 * fallback whose defaults are the complete state, controls that exist only
 * behind a mount check, a reduced-motion rule that exists. They do not run a
 * browser, so they cannot prove a frame rendered; browser behaviour was
 * verified separately and is recorded in the checkpoint.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CONSOLE_SRC = "src/components/operation-console.tsx";
const MOTION_SRC = "src/components/operation-console-motion.tsx";
const CSS_SRC = "src/app/globals.css";

describe("the static console survives the motion layer", () => {
  it("the console itself is still a Server Component", () => {
    const src = read(CONSOLE_SRC);
    // The whole architecture rests on this file never becoming a client
    // component: the list, the copy and all four dictionaries ship as HTML.
    expect(src).not.toMatch(/['"`]use client['"`]/);
    expect(src).not.toMatch(/\buseState\b|\buseEffect\b|\bsetInterval\b|\bsetTimeout\b/);
  });

  it("the list, its stations and their words are still rendered here", () => {
    const src = read(CONSOLE_SRC);
    expect(src).toMatch(/<ol\b/);
    expect(src).toMatch(/copy\.stations\.map/);
    expect(src).toMatch(/\{copy\.statusIssue\}/);
    expect(src).toMatch(/\{copy\.statusVerified\}/);
    expect(src).toMatch(/\{copy\.srSummary\}/);
  });

  it("the island receives the list as children rather than importing it", () => {
    const motion = read(MOTION_SRC);
    // Server children stay outside the client module graph. If the island ever
    // imported the console (or its dictionary) instead, the page would convert.
    expect(motion).toMatch(/children/);
    expect(motion).not.toMatch(/from "\.\/operation-console"/);
    expect(motion).not.toMatch(/CLIENT_I18N/);
  });

  it("only the island carries the client directive", () => {
    expect(read(MOTION_SRC)).toMatch(/^["']use client["'];?/m);
  });

  it("no animation dependency was added", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ["framer-motion", "motion", "gsap", "@react-spring/web", "animejs"]) {
      expect(Object.keys(deps), `${banned} must not be a dependency`).not.toContain(banned);
    }
  });
});

describe("the fallback is the complete state, not a degraded one", () => {
  it("nothing is dimmed unless the island says so", () => {
    /**
     * THE FALLBACK IS THE ABSENCE OF STATE, and this asserts exactly that.
     *
     * An earlier version of this test scanned the whole stylesheet for
     * `--console-seen: 99` and passed even when the real declaration was
     * mutated to 0 — because the explanatory comment above it contains that
     * literal string. It was pinning its own documentation. Comments are
     * stripped here, and the two halves of the guarantee are checked
     * separately: the base state is opaque, and every dimming rule is gated
     * behind the attribute the island only writes once motion starts.
     */
    const css = read(CSS_SRC).replace(/\/\*[\s\S]*?\*\//g, "");
    const base = css.slice(css.indexOf(".op-station {"));
    expect(base.slice(0, base.indexOf("}"))).toMatch(/opacity:\s*1\s*;/);

    const dimming = css
      .split(/\r?\n/)
      .filter((l) => l.includes(".op-station:nth-child"))
      .filter((l) => !l.includes(".op-station-ring"));
    expect(dimming.length, "dimming rules must exist").toBeGreaterThan(0);
    for (const line of dimming) {
      expect(line, "every dimming rule must be gated on data-seen").toContain("[data-seen=");
    }

    // And the island writes no attribute at all when there is no motion.
    const motion = read(MOTION_SRC);
    expect(motion).toMatch(/data-seen=\{frame < 0 \? undefined :/);
    expect(motion).toMatch(/data-active=\{frame < 0 \? undefined :/);
  });

  it("a reduced-motion rule forces the complete state", () => {
    const css = read(CSS_SRC);
    const reduce = css.slice(css.indexOf("prefers-reduced-motion: reduce"));
    expect(reduce).toMatch(/\.op-station\s*\{[^}]*opacity:\s*1/);
    expect(reduce).toMatch(/transform:\s*none/);
  });

  it("the island refuses to start under reduced motion", () => {
    const motion = read(MOTION_SRC);
    expect(motion).toMatch(/prefers-reduced-motion: reduce/);
    // The early return is what makes it a hard stop rather than a slow play.
    expect(motion).toMatch(/matches\)\s*return;/);
  });

  it("reveal uses opacity and transform only, so nothing reflows", () => {
    const css = read(CSS_SRC);
    const block = css.slice(css.indexOf(".op-station {"), css.indexOf(".op-station-ring"));
    expect(block).toMatch(/opacity:/);
    expect(block).not.toMatch(/\b(height|margin|padding|display|position):/);
  });
});

describe("the controls are accessible and only exist when motion does", () => {
  it("controls render behind a mount check, never for a no-JS visitor", () => {
    const motion = read(MOTION_SRC);
    expect(motion).toMatch(/enabled\s*&&/);
    // enabled is only set inside the effect, which never runs without JS.
    expect(motion).toMatch(/setEnabled\(true\)/);
  });

  it("both controls are real buttons with a visible focus ring and a touch target", () => {
    const motion = read(MOTION_SRC);
    // Split rather than regex the opening tag: an onClick arrow contains "=>",
    // and a non-greedy match to the first ">" stops inside it, silently
    // truncating the tag before className. That produced a false failure once.
    const buttons = motion
      .split("<button")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("</button>")));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const b of buttons) {
      expect(b).toMatch(/type="button"/);
      expect(b).toMatch(/min-h-11/);
      expect(b).toMatch(/focus-visible:ring/);
    }
  });

  it("no live region narrates the frames", () => {
    // Nine frames per run through an aria-live region is nine interruptions.
    expect(read(MOTION_SRC)).not.toMatch(/aria-live/);
    expect(read(CONSOLE_SRC)).not.toMatch(/aria-live/);
  });

  it("every language carries all four control labels", () => {
    for (const { code } of SITE_LANGS) {
      const m = CLIENT_I18N[code].console.motion;
      for (const key of ["pause", "resume", "replay", "hint"] as const) {
        expect(m[key].trim().length, `motion.${key}[${code}] is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the motion states the real sequence and claims nothing more", () => {
  it("the frame list goes back after the flagged step", () => {
    const motion = read(MOTION_SRC);
    const frames = motion.match(/const FRAMES = \[([^\]]+)\]/);
    expect(frames, "FRAMES must exist").toBeTruthy();
    const seq = frames![1].split(",").map((n) => Number(n.trim()));
    expect(seq[0]).toBe(0);
    expect(seq[seq.length - 1]).toBe(6);
    // Rework is the point: at least one frame moves to a LOWER station than
    // the one before it. A purely ascending list would be decoration.
    const goesBack = seq.some((v, i) => i > 0 && v < seq[i - 1]);
    expect(goesBack, "FRAMES must return to an earlier station — that is the rework").toBe(true);
  });

  it("it plays once and does not loop", () => {
    const motion = read(MOTION_SRC);
    // The end is expressed by scheduling nothing once the last frame is
    // reached — the guard below is what stops it. (An earlier version looked
    // for setPlaying(false); that call was removed when the advance effect was
    // restructured to keep setState out of effect bodies, and the guarantee
    // moved here rather than disappearing.)
    expect(motion).toMatch(/frame >= FRAMES\.length - 1\)\s*return;/);
    // A modulo would make it a loop, which reads as continuous throughput.
    expect(motion).not.toMatch(/%\s*FRAMES\.length/);
  });

  it("the control copy claims no recurrence, autonomy or queue", () => {
    const BANNED = [
      "recurring", "récurrent", "recurrente", "paulit-ulit",
      "autonomous", "autonome", "autónomo", "unattended",
      "queue", "file d'attente", "cola", "pila",
    ];
    for (const { code } of SITE_LANGS) {
      const m = CLIENT_I18N[code].console.motion;
      const all = [m.pause, m.resume, m.replay, m.hint].join(" · ").toLowerCase();
      for (const word of BANNED) {
        expect(all, `motion copy[${code}] must not contain "${word}"`).not.toContain(word);
      }
    }
  });
});
