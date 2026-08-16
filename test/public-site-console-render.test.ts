import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THREE RENDER DEFECTS CODEX FOUND BY RASTERISING `118be62`, and the guards
 * that keep them fixed.
 *
 * SCOPE, STATED EXACTLY (invariant 19). These read source files. Guard A
 * asserts the positioning ANCHOR exists, not the rendered rectangle — the
 * rectangle is measured in a browser and recorded in the checkpoint. Guard B
 * computes real WCAG contrast from the declared opacity, so it is arithmetic
 * on a value the stylesheet actually carries, not a magic-number match.
 * Guard C asserts the absence of a second paint mechanism.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CONSOLE_SRC = "src/components/operation-console.tsx";
const MOTION_SRC = "src/components/operation-console-motion.tsx";
const CSS_SRC = "src/app/globals.css";

/** CSS with comments removed — a value must never be pinned from prose. */
const css = () => read(CSS_SRC).replace(/\/\*[\s\S]*?\*\//g, "");

// ───────────────────────── A. ring geometry ─────────────────────────

describe("the ring is anchored to the 44px badge, not the row", () => {
  it("the badge that contains the ring establishes a containing block", () => {
    const src = read(CONSOLE_SRC);
    // Locate the badge by its own 44px classes, not by walking back from the
    // ring — the ring is itself a <span>, so a naive lastIndexOf("<span")
    // finds the ring's own tag and asserts against the wrong element.
    const badgeAt = src.indexOf("h-11 w-11");
    expect(badgeAt, "the 44px badge must exist").toBeGreaterThan(-1);
    const tagStart = src.lastIndexOf("<span", badgeAt);
    const badgeOpen = src.slice(tagStart, src.indexOf(">", badgeAt));
    // And the ring must genuinely be nested inside it.
    const ringAt = src.indexOf('className="op-station-ring"');
    expect(ringAt, "the ring must exist").toBeGreaterThan(-1);
    expect(ringAt, "the ring must sit inside the badge").toBeGreaterThan(tagStart);

    // An absolutely positioned child resolves against its nearest POSITIONED
    // ancestor. Without this the ring escapes the 44px badge and stretches to
    // the width of the relative <li> — a row-wide capsule, which is exactly
    // what Codex measured at ~766px desktop and ~333px mobile.
    expect(
      badgeOpen,
      "the 44px badge must be positioned, or the ring resolves against the row"
    ).toMatch(/\brelative\b/);
    expect(badgeOpen, "sanity: this really is the 44px badge").toMatch(/h-11 w-11/);
  });

  it("the ring is absolutely positioned, which is what makes the anchor matter", () => {
    const block = css().slice(css().indexOf(".op-station-ring {"));
    const rule = block.slice(0, block.indexOf("}"));
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/inset:\s*-3px/);
  });
});

// ───────────────────────── B. contrast floor ─────────────────────────

/** WCAG relative luminance for an sRGB triple. */
function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text drawn at `alpha` over `ground` composites toward the ground. */
function composite(
  text: [number, number, number],
  ground: [number, number, number],
  alpha: number
): [number, number, number] {
  return [0, 1, 2].map((i) => ground[i] + alpha * (text[i] - ground[i])) as [
    number,
    number,
    number,
  ];
}

/** The console section's own ground, and every text colour drawn on it. */
const GROUND: [number, number, number] = [13, 14, 17]; // #0D0E11
const TEXT_COLOURS: Array<[string, [number, number, number]]> = [
  ["badge number #8A9099", [138, 144, 153]],
  ["station body #9AA1AB", [154, 161, 171]],
  ["station title #FFFFFF", [255, 255, 255]],
];

describe("no text falls below AA in a frame Pause can hold", () => {
  /** The opacity the dimming rule actually declares. */
  function dimmingOpacity(): number {
    const source = css();
    const at = source.indexOf("[data-seen=");
    expect(at, "a dimming rule must exist").toBeGreaterThan(-1);
    const rule = source.slice(at, source.indexOf("}", at));
    const m = rule.match(/opacity:\s*([0-9.]+)/);
    expect(m, "the dimming rule must declare an opacity").toBeTruthy();
    return Number(m![1]);
  }

  it("every text colour on a dimmed row still clears 4.5:1", () => {
    const alpha = dimmingOpacity();
    for (const [name, rgb] of TEXT_COLOURS) {
      const ratio = contrast(composite(rgb, GROUND, alpha), GROUND);
      expect(
        ratio,
        `${name} at opacity ${alpha} renders ${ratio.toFixed(2)}:1 — below AA. ` +
          "Pause can hold a dimmed frame indefinitely, so a future row is not a transient."
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the arithmetic itself is right", () => {
    // Pins the helper so the assertion above cannot go vacuously green.
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 1);
    // 0.32 is the value Codex measured as failing; it must still fail here.
    const bad = contrast(composite([138, 144, 153], GROUND, 0.32), GROUND);
    expect(bad).toBeLessThan(2.5);
  });
});

// ───────────────── C. one paint mechanism, not two ─────────────────

describe("the decorative paint has exactly one mechanism", () => {
  it("the island does not reach into the DOM to paint", () => {
    const motion = read(MOTION_SRC);
    // data-seen/data-active plus CSS is the mechanism. A second, imperative
    // one drifts from the first and hides which is really in effect.
    expect(motion).not.toMatch(/querySelector/);
    expect(motion).not.toMatch(/\.style\.opacity/);
    expect(motion).not.toMatch(/\buseRef\b/);
    expect(motion).not.toMatch(/rootRef/);
  });

  it("the island still writes the attributes the CSS matches", () => {
    const motion = read(MOTION_SRC);
    expect(motion).toMatch(/data-seen=\{frame < 0 \? undefined :/);
    expect(motion).toMatch(/data-active=\{frame < 0 \? undefined :/);
  });

  it("the server render carries no leftover custom property", () => {
    const src = read(CONSOLE_SRC);
    // --i drove the abandoned arithmetic mechanism. Nothing reads it now.
    expect(src).not.toMatch(/--i/);
    expect(src).not.toMatch(/--console-seen|--console-active/);
  });

  it("no stale custom-property mechanism survives in the stylesheet", () => {
    const source = css();
    expect(source).not.toMatch(/--console-seen|--console-active/);
    expect(source).not.toMatch(/@property/);
  });
});
