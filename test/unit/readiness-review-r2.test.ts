import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildCurrentProjection, currentInputPaths, historicalPaths, validateCurrentProjection } from "../../release/current-projection-v3.mjs";
import { validateMarketReadiness } from "../../scripts/validate-endvera-market-readiness.mjs";
const report=JSON.parse(readFileSync("release/endvera-construction-v1/market-readiness-report.json","utf8"));
const fixture=()=>({...report,sourceHashes:report.sourceHashes.map((item:{path:string})=>({...item,sha256:createHash("sha256").update(readFileSync(item.path)).digest("hex")}))});

describe("Readiness R2 review regressions",()=>{
  it.each([["current",currentInputPaths],["historical",historicalPaths]] as const)("does not let a consumer redefine the %s canonical path set",(_name,paths)=>{
    const original=[...paths];let mutationRefused=false;
    try { Reflect.apply(Array.prototype.splice,paths,[0,1,"package.json"]); } catch { mutationRefused=true; }
    finally { if(!mutationRefused)Reflect.apply(Array.prototype.splice,paths,[0,paths.length,...original]); }
    expect(mutationRefused).toBe(true);expect(Object.isFrozen(paths)).toBe(true);
    expect(paths).toEqual(original);
    expect(validateCurrentProjection(buildCurrentProjection()).status).toBe("CURRENT_CONFIGURATION_COHERENCE_ONLY");
  });
  it.each(["signed","uploaded","submitted","deployed","published","productionReady","providerObserved","customerObserved","deviceObserved","externalEffectCount","observedProof","currentReadiness","wholeProductReadiness","wholeProductClosure","externalReadiness"])("rejects the misplaced top-level claim %s regardless of value",(key)=>{
    for(const value of [true,false,1,0,null,"NOT_EVALUATED"]){
      expect(()=>validateMarketReadiness({...fixture(),[key]:value})).toThrow("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
    }
  });
  it("accepts a structurally exact historical fixture only as historical; never updates disk hashes",()=>{
    expect(validateMarketReadiness(fixture())).toMatchObject({status:"HISTORICAL_STATIC_ATTESTATION_ONLY",currentReadiness:"NOT_EVALUATED",externalDecision:"NOT_EVALUATED"});
    expect(()=>validateMarketReadiness(report)).toThrow("MARKET_READINESS_SOURCE_HASH_MISMATCH");
  });
  it("rejects extra report and nested boundary properties",()=>{
    expect(()=>validateMarketReadiness({...fixture(),otherClaim:"ready"})).toThrow("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
    expect(()=>validateMarketReadiness({...fixture(),boundary:{...report.boundary,deviceObserved:true}})).toThrow("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
  });
});
