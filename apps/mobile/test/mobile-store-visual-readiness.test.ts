// @ts-nocheck -- Vitest executes this asset contract in Node; the Expo app omits Node globals.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const mobileRoot = join(import.meta.dirname, "..");
const repoRoot = join(mobileRoot, "..", "..");
const bytes = (path: string) => readFileSync(join(mobileRoot, path));
const text = (path: string) => bytes(path).toString("utf8");
const hash = (path: string) => createHash("sha256").update(bytes(path)).digest("hex");

describe("ENDVERA mobile store visual readiness", () => {
  it("uses one ENDVERA vector master instead of Expo starter artwork", () => {
    const master = text("assets/brand/endvera-mark.svg");
    const app = JSON.parse(text("app.json"));
    expect(master).toContain("ENDVERA mobile mark");
    expect(master).toContain("#09090B");
    expect(master).toContain("#D87526");
    expect(app.expo.ios.icon).toBe("./assets/images/icon.png");
    expect(hash("assets/images/icon.png")).not.toBe("7a667804bb80a6a424a5daf18a2599c4f32237cf06fe78fc0de45dbb09e0eccf");
  });

  it.each([
    ["assets/images/icon.png", 1024, 1024],
    ["assets/images/android-icon-background.png", 512, 512],
    ["assets/images/android-icon-foreground.png", 1024, 1024],
    ["assets/images/android-icon-monochrome.png", 432, 432],
    ["assets/images/splash-icon.png", 512, 512],
    ["assets/images/favicon.png", 64, 64],
  ])("renders %s at the required size", async (path, width, height) => {
    const metadata = await sharp(join(mobileRoot, path)).metadata();
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
  });

  it("keeps screenshot and store evidence claims honest", () => {
    const readiness = JSON.parse(readFileSync(join(repoRoot, "release/endvera-construction-v1/mobile-visual-readiness.json"), "utf8"));
    expect(readiness).toMatchObject({
      status: "LOCAL_CANDIDATE_VISUALS_READY",
      realDeviceIosScreenshots: false,
      realDeviceAndroidScreenshots: false,
      brandApproved: false,
      signed: false,
      uploaded: false,
      submitted: false,
      published: false,
      externalEffectCount: 0,
    });
    expect(readiness.shots).toHaveLength(5);
  });
});

