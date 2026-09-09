import { readFileSync } from "node:fs";
import {createHash} from "node:crypto";
import { describe, expect, it } from "vitest";
import report from "../release/endvera-construction-v1/whole-product-closure-audit.json";
import { validateWholeProductClosure } from "../scripts/validate-endvera-whole-product-closure.mjs";
import {buildCurrentProjection,validateCurrentProjection} from "../release/current-projection-v3.mjs";
// Test-only reconstructed static metadata; never saved over the archived report.
const staticFixture=()=>({...report,protectedInputs:report.protectedInputs.map(item=>({...item,sha256:createHash("sha256").update(readFileSync(item.path)).digest("hex")}))});

describe("ENDVERA whole-product closure audit", () => {
  it("cannot turn a complete static fixture into current whole-product closure", () => {
    expect(validateWholeProductClosure(staticFixture())).toEqual({
      status: "HISTORICAL_STATIC_ATTESTATION_ONLY",
      historicalStatus: "LOCAL_CREDENTIAL_FREE_PRODUCT_SCOPE_CLOSED",
      currentReadiness: "NOT_EVALUATED",
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
    const value=staticFixture();
    expect(() => validateWholeProductClosure({ ...value, localScopeGaps: ["LOCAL_GAP"] })).toThrow("LOCAL_SCOPE_GAPS_REMAIN");
    expect(() => validateWholeProductClosure({ ...value, deployed: true })).toThrow("EXTERNAL_CLAIM_INFLATED:deployed");
    expect(() => validateWholeProductClosure({ ...value, protectedInputs: value.protectedInputs.map((item, index) => index === 0 ? { ...item, sha256: "0".repeat(64) } : item) })).toThrow("PROTECTED_INPUT_HASH_MISMATCH");
    expect(()=>validateWholeProductClosure(report)).toThrow("PROTECTED_INPUT_HASH_MISMATCH");
  });
  it("rejects seven correctly hashed but unrelated files before accepting their bytes",()=>{
    const unrelated=["package.json","tsconfig.json","AGENTS.md","apps/mobile/package.json","apps/mobile/app.json","prisma/schema.prisma","scripts/register-server-only.cjs"];
    expect(()=>validateWholeProductClosure({...staticFixture(),protectedInputs:unrelated.map(path=>({path,sha256:createHash("sha256").update(readFileSync(path)).digest("hex")}))})).toThrow("PROTECTED_INPUT_SET_INVALID");
  });
  it("supersedes all three histories with static-only current configuration",()=>{
    const value=buildCurrentProjection();
    expect(value.supersedes).toHaveLength(3);
    expect(value.observedProof).toBeNull();
    expect(validateCurrentProjection(value)).toMatchObject({wholeProductClosure:"NOT_EVALUATED",providerCustomerTestDecision:"NO-GO"});
    for(const mutation of [{wholeProductClosure:"PASS"},{productionReady:true},{deviceObserved:true},{providerCustomerTestDecision:"GO"}]) {
      expect(()=>validateCurrentProjection({...value,...mutation})).toThrow("CURRENT_PROJECTION_CLAIM_OR_BINDING_MISMATCH");
    }
  });

  it("uses no network or external release command", () => {
    const source = readFileSync("scripts/validate-endvera-whole-product-closure.mjs", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(source).not.toMatch(/eas\s+(?:build|submit|update)|vercel\s+(?:deploy|--prod)|fastlane|play\.googleapis/iu);
  });
});
