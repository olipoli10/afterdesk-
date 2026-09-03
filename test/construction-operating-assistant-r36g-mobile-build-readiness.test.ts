import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import appConfig from "../apps/mobile/app.json";
import easConfig from "../apps/mobile/eas.json";
import readiness from "../release/endvera-construction-v1/mobile-build-readiness.json";
import { MOBILE_RELEASE_INFO } from "../apps/mobile/src/lib/release";
import { validateCredentialFreeMobileBuild } from "../apps/mobile/src/lib/store-build";

describe("R36G root release integration", () => {
  it("keeps R35 identity and R36G build preparation aligned", () => {
    const report = validateCredentialFreeMobileBuild({ appConfig, easConfig, readiness });
    expect(report.ios.bundleIdentifier).toBe(MOBILE_RELEASE_INFO.ios.bundleIdentifier);
    expect(report.android.package).toBe(MOBILE_RELEASE_INFO.android.package);
    expect(MOBILE_RELEASE_INFO.buildPreparation).toEqual({
      status: "READY_FOR_SIGNING_AUTHORITY",
      configPath: "apps/mobile/eas.json",
      readinessPath: "release/endvera-construction-v1/mobile-build-readiness.json",
    });
  });

  it("uses a local parser only and exposes no release command", () => {
    const sources = [
      "apps/mobile/src/lib/store-build.ts",
      "scripts/validate-endvera-mobile-build-readiness.mjs",
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(sources).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(sources).not.toMatch(/eas\s+(?:build|submit|update)|vercel\s+(?:deploy|--prod)/iu);
  });
});
