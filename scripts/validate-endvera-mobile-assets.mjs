import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const expected = [
  ["apps/mobile/assets/images/icon.png", 1024, 1024],
  ["apps/mobile/assets/images/android-icon-background.png", 512, 512],
  ["apps/mobile/assets/images/android-icon-foreground.png", 1024, 1024],
  ["apps/mobile/assets/images/android-icon-monochrome.png", 432, 432],
  ["apps/mobile/assets/images/splash-icon.png", 512, 512],
  ["apps/mobile/assets/images/favicon.png", 64, 64],
];
const starterHash = "7a667804bb80a6a424a5daf18a2599c4f32237cf06fe78fc0de45dbb09e0eccf";

for (const [path, width, height] of expected) {
  const absolute = resolve(root, path);
  const content = await readFile(absolute);
  const metadata = await sharp(content).metadata();
  if (metadata.width !== width || metadata.height !== height) throw new Error(`MOBILE_ASSET_DIMENSION_INVALID:${path}`);
  if (path.endsWith("icon.png") && createHash("sha256").update(content).digest("hex") === starterHash) throw new Error("EXPO_STARTER_ICON_REFUSED");
}

const readiness = JSON.parse(await readFile(resolve(root, "release/endvera-construction-v1/mobile-visual-readiness.json"), "utf8"));
if (readiness.status !== "LOCAL_CANDIDATE_VISUALS_READY" || readiness.brandApproved || readiness.realDeviceIosScreenshots || readiness.realDeviceAndroidScreenshots || readiness.signed || readiness.uploaded || readiness.submitted || readiness.published || readiness.externalEffectCount !== 0) throw new Error("MOBILE_VISUAL_CLAIM_INFLATION_REFUSED");
if (!Array.isArray(readiness.shots) || readiness.shots.length !== 5) throw new Error("MOBILE_VISUAL_SHOT_PLAN_INVALID");

console.log("ENDVERA_MOBILE_ASSET_VALIDATION_PASS assets=6 candidateFrames=10 realDeviceEvidence=0 externalEffects=0");

