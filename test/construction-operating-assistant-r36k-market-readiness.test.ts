import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import report from "../release/endvera-construction-v1/market-readiness-report.json";
import { validateMarketReadiness } from "../scripts/validate-endvera-market-readiness.mjs";

describe("R36K unified market-readiness gate", () => {
  it("returns one honest decision for Web, iOS and Android", () => {
    const result = validateMarketReadiness(report);
    expect(result.status).toBe("LOCAL_MARKET_PREPARATION_COMPLETE");
    expect(result.externalDecision).toBe("EXTERNAL_AUTHORITY_REQUIRED");
    expect(report.targets).toEqual([
      { target: "WEB", localStatus: "READY_FOR_DEPLOYMENT_AUTHORITY", firstExternalBlocker: "PUBLIC_PRODUCTION_ORIGIN", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
      { target: "IOS", localStatus: "READY_FOR_SIGNING_AUTHORITY", firstExternalBlocker: "APPLE_DEVELOPER_MEMBERSHIP", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
      { target: "ANDROID", localStatus: "READY_FOR_SIGNING_AUTHORITY", firstExternalBlocker: "GOOGLE_PLAY_DEVELOPER_ACCOUNT", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
    ]);
  });

  it("verifies every protected source hash", () => {
    const result = validateMarketReadiness(report);
    expect(result.sourceHashesVerified).toBe(5);
    expect(report.sourceHashes.every((item) => /^[a-f0-9]{64}$/u.test(item.sha256))).toBe(true);
  });

  it("distinguishes evidence without inventing observed or inferred proof", () => {
    expect(report.evidence).toEqual([
      { label: "CODE", available: true },
      { label: "TEST", available: true },
      { label: "SYNTHETIC", available: true },
      { label: "OBSERVED", available: false },
      { label: "INFERRED", available: false },
      { label: "UNKNOWN", available: true },
    ]);
    expect(report.unknowns).toContain("SIGNED_BINARY_BEHAVIOR");
    expect(report.unknowns).toContain("PUBLIC_PRODUCTION_BEHAVIOR");
    expect(report.unknowns).toContain("STORE_REVIEW_OUTCOME");
  });

  it("preserves every external boundary and zero external effect", () => {
    expect(report.boundary).toEqual({ signed: false, uploaded: false, submitted: false, deployed: false, published: false, providerObserved: false, customerObserved: false, productionReady: false, externalEffectCount: 0 });
    expect(report.storeReady).toBe(false);
    expect(report.externalBlockers.length).toBeGreaterThanOrEqual(12);
    expect(new Set(report.externalBlockers.map((item) => item.code)).size).toBe(report.externalBlockers.length);
  });

  it("fails closed on source mutation and readiness inflation", () => {
    expect(() => validateMarketReadiness({ ...report, deployed: true })).toThrow("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
    expect(() => validateMarketReadiness({ ...report, storeReady: true })).toThrow("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
    expect(() => validateMarketReadiness({ ...report, sourceHashes: report.sourceHashes.map((item, index) => index === 0 ? { ...item, sha256: "0".repeat(64) } : item) })).toThrow("MARKET_READINESS_SOURCE_HASH_MISMATCH");
    expect(() => validateMarketReadiness({ ...report, evidence: report.evidence.map((item) => item.label === "OBSERVED" ? { ...item, available: true } : item) })).toThrow("MARKET_READINESS_EVIDENCE_INFLATION_REFUSED");
  });

  it("uses no network, child process, deploy, build or store command", () => {
    const source = readFileSync("scripts/validate-endvera-market-readiness.mjs", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(source).not.toMatch(/eas\s+(?:build|submit|update)|vercel\s+(?:deploy|--prod)|fastlane|play\.googleapis/iu);
  });
});
