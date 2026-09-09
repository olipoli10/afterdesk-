import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateWholeProductReadiness } from "../scripts/validate-endvera-whole-product-readiness.mjs";
import { buildCurrentProjection, validateCurrentProjection } from "../release/current-projection-v3.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const report = () => JSON.parse(read("release/endvera-construction-v1/whole-product-readiness.json"));

describe("Historical R36P attestations and narrow current configuration gate", () => {
  it("preserves the historical Web, iOS, Android and disabled backend declaration", () => {
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

  it("validates current configuration without declaring whole-product readiness", () => {
    const output = execFileSync(process.execPath, ["scripts/validate-endvera-whole-product-readiness.mjs"], { cwd: root, encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({status:"CURRENT_CONFIGURATION_COHERENCE_ONLY",wholeProductReadiness:"NOT_EVALUATED",wholeProductClosure:"NOT_EVALUATED",externalReadiness:"NOT_EVALUATED",providerCustomerTestDecision:"NO-GO"});
    expect(output).not.toContain("LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED");
  });
  it("does not accept old raw input hashes as a current validation", () => {
    expect(()=>validateWholeProductReadiness(report())).toThrow("PROTECTED_INPUT_HASH_MISMATCH");
  });
  it("accepts exact current bytes but refuses unrelated inputs and manufactured observations",()=>{
    const current=buildCurrentProjection();
    expect(validateCurrentProjection(current).status).toBe("CURRENT_CONFIGURATION_COHERENCE_ONLY");
    expect(()=>validateCurrentProjection({...current,currentInputs:current.currentInputs.map((item,index)=>index===0?{...item,path:"package.json"}:item)})).toThrow("CURRENT_PROJECTION_INPUT_SET_INVALID");
    expect(()=>validateCurrentProjection({...current,observedProof:{device:"claimed"}})).toThrow("CURRENT_PROJECTION_CLAIM_OR_BINDING_MISMATCH");
    expect(()=>validateCurrentProjection({...current,wholeProductReadiness:"PASS"})).toThrow("CURRENT_PROJECTION_CLAIM_OR_BINDING_MISMATCH");
    expect(()=>validateCurrentProjection({...current,currentInputs:current.currentInputs.map((item,index)=>index===0?{...item,sha256:"0".repeat(64)}:item)})).toThrow("CURRENT_PROJECTION_INPUT_HASH_MISMATCH");
  });
  it("rejects malformed, omitted, duplicate and extra current input bindings",()=>{
    const current=buildCurrentProjection();
    for(const inputs of [[null,...current.currentInputs.slice(1)],current.currentInputs.slice(1),[current.currentInputs[0],...current.currentInputs.slice(0,-1)],[...current.currentInputs,current.currentInputs[0]]]) {
      expect(()=>validateCurrentProjection({...current,currentInputs:inputs})).toThrow("CURRENT_PROJECTION_INPUT_SET_INVALID");
    }
  });
  it("checks mobile identities and disabled external authority against actual source bytes",()=>{
    type ConfigurationFixture={expo:{android:{versionCode:number}};version:string;externalReleaseAuthorized:boolean;publicPaths:{accountDeletion:string}};
    const cases:[string,(value:ConfigurationFixture)=>void,string][]=[
      ["apps/mobile/app.json",value=>{value.expo.android.versionCode+=1;},"CURRENT_CONFIG_IDENTITY_MISMATCH"],
      ["apps/mobile/package.json",value=>{value.version="999.0.0";},"CURRENT_CONFIG_IDENTITY_MISMATCH"],
      ["release/endvera-construction-v1/environment-contract-v2.json",value=>{value.externalReleaseAuthorized=true;},"CURRENT_ENVIRONMENT_AUTHORITY_INVALID"],
      ["release/endvera-construction-v1/release-definition-v3.json",value=>{value.publicPaths.accountDeletion="/missing";},"CURRENT_ACCOUNT_DELETION_CONFIG_INVALID"],
    ];
    for(const [target,mutate,code] of cases) {
      const mutatedRead=((path:Parameters<typeof readFileSync>[0])=>{
        const bytes=readFileSync(path);
        if(String(path)!==resolve(root,target))return bytes;
        const value=JSON.parse(bytes.toString());mutate(value);return Buffer.from(JSON.stringify(value));
      }) as typeof readFileSync;
      expect(()=>buildCurrentProjection({root,readFile:mutatedRead})).toThrow(code);
    }
  });
  it("pins unchanged historical checkout bytes and the original Git blobs separately",()=>{
    const archive=JSON.parse(read("release/current-projection-v3.history.json"));
    const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
    for(const entry of archive.entries) {
      expect(hash(readFileSync(join(root,entry.path)))).toBe(entry.checkoutSha256);
      expect(hash(execFileSync("git",["show",`${entry.archivedInCommit}:${entry.path}`],{cwd:root}))).toBe(entry.gitBlobSha256);
    }
    const target=archive.entries[0].path;
    const mutatedRead=((path:Parameters<typeof readFileSync>[0])=>String(path)===resolve(root,target)?Buffer.from("changed historical report"):readFileSync(path)) as typeof readFileSync;
    expect(()=>buildCurrentProjection({root,readFile:mutatedRead})).toThrow("HISTORICAL_ATTESTATION_BYTES_CHANGED");
  });
});
