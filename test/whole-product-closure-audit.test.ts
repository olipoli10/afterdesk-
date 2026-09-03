import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import report from "../release/endvera-construction-v1/whole-product-closure-audit.json";
import { validateWholeProductClosure } from "../scripts/validate-endvera-whole-product-closure.mjs";

describe("ENDVERA whole-product closure audit", () => {
  it("closes only the remaining credential-free local product scope", () => {
    expect(validateWholeProductClosure(report)).toEqual({
      status: "LOCAL_CREDENTIAL_FREE_PRODUCT_SCOPE_CLOSED",
      protectedInputCount: 7,
      externalBlockerCount: 18,
    });
    expect(report.localScopeGaps).toEqual([]);
    expect(report.projectTerminalState).toBe("INCOMPLETE");
  });

  it("preserves the existing site while keeping TextAssist additive", () => {
    expect(report.preservation).toMatchObject({
      existingHomepagePreserved: true,
      managedWorkOfferingRetained: true,
      textAssistRoute: "/textassist",
      constructionRoute: "/construction",
    });
  });

  it("keeps native binaries and every external effect unclaimed", () => {
    expect(report.platforms.filter((item) => item.target !== "WEB").every((item) => item.binaryBuilt === false)).toBe(true);
    expect(report).toMatchObject({
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

  it("fails closed on gaps, stale evidence and inflated claims", () => {
    expect(() => validateWholeProductClosure({ ...report, localScopeGaps: ["LOCAL_GAP"] })).toThrow("LOCAL_SCOPE_GAPS_REMAIN");
    expect(() => validateWholeProductClosure({ ...report, deployed: true })).toThrow("EXTERNAL_CLAIM_INFLATED:deployed");
    expect(() => validateWholeProductClosure({ ...report, protectedInputs: report.protectedInputs.map((item, index) => index === 0 ? { ...item, sha256: "0".repeat(64) } : item) })).toThrow("PROTECTED_INPUT_HASH_MISMATCH");
  });

  it("uses no network or external release command", () => {
    const source = readFileSync("scripts/validate-endvera-whole-product-closure.mjs", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(source).not.toMatch(/eas\s+(?:build|submit|update)|vercel\s+(?:deploy|--prod)|fastlane|play\.googleapis/iu);
  });
});
