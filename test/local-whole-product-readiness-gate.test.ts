import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const report = () => JSON.parse(read("release/endvera-construction-v1/whole-product-readiness.json"));

describe("ENDVERA local whole-product readiness gate", () => {
  it("reconciles Web, iOS, Android and disabled backend configuration", () => {
    expect(report()).toMatchObject({
      schemaVersion: 1,
      status: "LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED",
      scope: "WEB_IOS_ANDROID_AND_DISABLED_BACKEND_CONFIGURATION",
      localScopeGaps: [],
      backend: {
        localStatus: "CONFIGURATION_READY_CONNECTORS_DISABLED",
        allExternalTransportDisabled: true,
        providerBoundaryViolationCount: 0,
        secretValuesSerialized: false,
      },
    });
    expect(report().platforms.map((platform: { target: string }) => platform.target)).toEqual(["WEB", "IOS", "ANDROID"]);
  });

  it("resolves the public deletion resource without erasing external launch blockers", () => {
    const value = report();
    const codes = value.externalBlockers.map((blocker: { code: string }) => blocker.code);
    expect(value.resolvedSinceR36K).toContain("PUBLIC_ACCOUNT_DELETION_RESOURCE");
    expect(codes).not.toContain("PUBLIC_ACCOUNT_DELETION_RESOURCE");
    expect(codes).toHaveLength(18);
    expect(codes).toEqual(expect.arrayContaining(["FINAL_BRAND_ASSET_APPROVAL", "REAL_DEVICE_SCREENSHOTS", "LEGAL_PRIVACY_REVIEW", "EXTERNAL_SUPPORT_OWNER"]));
  });

  it("keeps the project and every external effect boundary open or disabled", () => {
    expect(report()).toMatchObject({
      projectTerminalState: "INCOMPLETE",
      nextExternalRelease: "R37-PROVIDER-SANDBOX",
      signed: false,
      uploaded: false,
      submitted: false,
      deployed: false,
      published: false,
      providerObserved: false,
      customerObserved: false,
      productionReady: false,
      externalEffectCount: 0,
    });
  });

  it("passes the deterministic hash and source validator", () => {
    const output = execFileSync(process.execPath, ["scripts/validate-endvera-whole-product-readiness.mjs"], { cwd: root, encoding: "utf8" });
    expect(output).toContain("LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED");
    expect(output).toContain("PROTECTED_INPUTS=7");
    expect(output).toContain("EXTERNAL_BLOCKERS=18");
    expect(output).toContain("EXTERNAL_EFFECTS=0");
  });
});
