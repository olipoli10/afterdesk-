import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { assertReleaseRegularFile, assertReleaseInputBinding, assertReleaseSourceBinding } from "../../scripts/endvera-release-source-binding.mjs";
import { buildReleaseManifest } from "../../scripts/generate-endvera-release-package.mjs";
import { validateMobileReleaseMetadata } from "../../scripts/endvera-release-source-contracts.mjs";
import { validateMobileBuildPreparation } from "../../scripts/endvera-mobile-build-contract.mjs";
const root=process.cwd();
const definition=JSON.parse(readFileSync("release/endvera-construction-v1/release-definition-v3.json","utf8"));
const source=readFileSync("apps/mobile/src/lib/release.ts","utf8");
const app=JSON.parse(readFileSync("apps/mobile/app.json","utf8")).expo;
const eas=JSON.parse(readFileSync("apps/mobile/eas.json","utf8"));
const readiness=JSON.parse(readFileSync("release/endvera-construction-v1/mobile-build-readiness.json","utf8"));
function temporaryFixture(run:(directory:string)=>void){const directory=mkdtempSync(resolve(root,".release-r2-test-"));try{run(directory);}finally{const rel=relative(root,resolve(directory));if(isAbsolute(rel)||!rel.startsWith(".release-r2-test-")||/[\\/]/.test(rel))throw new Error("TEST_CLEANUP_SCOPE_INVALID");rmSync(directory,{recursive:true,force:true});}}
describe("Bounded R2 release source corrections",()=>{
 it("rejects a junction repository root before reading definition bytes",()=>temporaryFixture(directory=>{
  const real=resolve(directory,"real"),link=resolve(directory,"linked");mkdirSync(real);writeFileSync(resolve(real,"input.txt"),"synthetic");symlinkSync(real,link,"junction");
  expect(()=>assertReleaseRegularFile(link,"input.txt")).toThrow("RELEASE_SOURCE_SYMLINK_ROOT_REFUSED");
  let reads=0;const reader=((...args:Parameters<typeof readFileSync>)=>{reads++;return readFileSync(...args);}) as typeof readFileSync;
  expect(()=>buildReleaseManifest({repositoryRoot:link,sourceHead:"a".repeat(40),sourceTree:"b".repeat(40),readFile:reader})).toThrow("RELEASE_SOURCE_SYMLINK_ROOT_REFUSED");expect(reads).toBe(0);
 }));
 it.each([
  source.replace("export const MOBILE_RELEASE_INFO","export let MOBILE_RELEASE_INFO"),
  `${source}\nMOBILE_RELEASE_INFO.signed = true;`,
  `${source}\nMOBILE_RELEASE_INFO = {} as any;`,
  `${source}\nconst alias = MOBILE_RELEASE_INFO; alias.signed = true;`,
  `${source}\nexport const extra = true;`,
 ])("refuses extra or mutable mobile module syntax",mutated=>{
  expect(()=>validateMobileReleaseMetadata(mutated,definition)).toThrow("RELEASE_MOBILE_METADATA_MODULE_SHAPE_INVALID");
 });
 it("refuses parse errors and mutations hidden in the label helper",()=>{
  expect(()=>validateMobileReleaseMetadata(`${source}\nconst broken = ;`,definition)).toThrow("RELEASE_MOBILE_METADATA_SYNTAX_INVALID");
  expect(()=>validateMobileReleaseMetadata(source.replace('return platform === "ios"','return (MOBILE_RELEASE_INFO.signed = true), platform === "ios"'),definition)).toThrow("RELEASE_MOBILE_METADATA_LABEL_FUNCTION_INVALID");
  expect(validateMobileReleaseMetadata(source,definition).semanticVersion).toBe("0.1.1");
 });
 it("validates and binds EAS and mobile build-preparation sources without executing mobile code",()=>{
  expect(validateMobileBuildPreparation(app,eas,readiness).scope).toBe("STATIC_JSON_VALIDATION_ONLY");
  expect(()=>validateMobileBuildPreparation(app,{...eas,build:{...eas.build,"founder-device":{...eas.build["founder-device"],autoIncrement:true}}},readiness)).toThrow("MOBILE_FOUNDER_PROFILE_INVALID");
  expect(()=>validateMobileBuildPreparation(app,{...eas,build:{...eas.build,"store-candidate":{...eas.build["store-candidate"],autoIncrement:true}}},readiness)).toThrow("MOBILE_BUILD_PROFILE_SEMANTICS_INVALID");
  expect(()=>validateMobileBuildPreparation(app,eas,{...readiness,signed:true})).toThrow("MOBILE_BUILD_CLAIM_INFLATION_REFUSED");
  expect(()=>validateMobileBuildPreparation(app,eas,{...readiness,android:{...readiness.android,versionCode:999}})).toThrow("MOBILE_BUILD_IDENTITY_MISMATCH");
  const manifest=buildReleaseManifest({sourceHead:"a".repeat(40),sourceTree:"b".repeat(40)});
  for(const path of ["apps/mobile/eas.json","release/endvera-construction-v1/mobile-build-readiness.json","scripts/validate-endvera-mobile-build-readiness.mjs","scripts/endvera-mobile-build-contract.mjs"])expect(manifest.inputs.map((item:{path:string})=>item.path)).toContain(path);
 });
 it.each(["validate-endvera-mobile-build-readiness.mjs","validate-endvera-native-preflight.mjs"])("%s rejects an actual input junction before parsing external synthetic JSON",script=>temporaryFixture(directory=>{
  const repo=resolve(directory,"repo"),outside=resolve(directory,"outside");mkdirSync(resolve(repo,"scripts"),{recursive:true});mkdirSync(resolve(repo,"apps"));mkdirSync(outside);writeFileSync(resolve(outside,"app.json"),"INVALID_SYNTHETIC_JSON");symlinkSync(outside,resolve(repo,"apps/mobile"),"junction");
  for(const name of [script,"endvera-release-source-binding.mjs","endvera-mobile-build-contract.mjs"])writeFileSync(resolve(repo,"scripts",name),readFileSync(resolve(root,"scripts",name)));
  const result=spawnSync(process.execPath,[resolve(repo,"scripts",script)],{cwd:repo,encoding:"utf8",windowsHide:true,timeout:10000});
  expect(result.status).not.toBe(0);expect(result.stderr).toContain("RELEASE_SOURCE_SYMLINK_REFUSED");expect(result.stderr).not.toContain("Unexpected token");
 }));
 it("keeps input-only evidence distinct from the whole tracked checkout authority gate",()=>{
  const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8",windowsHide:true}).trim();
  const head=git("rev-parse","HEAD"),tree=git("rev-parse","HEAD^{tree}");const bytes=readFileSync("AGENTS.md");
  const manifest={source:{head,tree},inputs:[{path:"AGENTS.md",byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}]};
  expect(assertReleaseInputBinding({repositoryRoot:root,manifest}).mode).toBe("GIT_COMMIT_INPUT_BINDING");
  const diff=git("diff","--name-only","--no-ext-diff","--no-textconv",head,"--",".",":(exclude)release/endvera-construction-v1/release-manifest-v3.json");
  if(diff)expect(()=>assertReleaseSourceBinding({repositoryRoot:root,manifest})).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  else expect(assertReleaseSourceBinding({repositoryRoot:root,manifest}).trackedCheckoutMatchesSource).toBe(true);
 });
});
