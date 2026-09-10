import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { assertReleaseRegularFile, isExactCheckoutCrlfEquivalent, assertRegularGitEntry } from "../../scripts/endvera-release-source-binding.mjs";
import { validateMobileReleaseMetadata, collectPublicRouteInputs, publicRouteImplementations } from "../../scripts/endvera-release-source-contracts.mjs";
import { buildReleaseManifest } from "../../scripts/generate-endvera-release-package.mjs";
const root=process.cwd();
const definition=JSON.parse(readFileSync("release/endvera-construction-v1/release-definition-v3.json","utf8"));
const mobileSource=readFileSync("apps/mobile/src/lib/release.ts","utf8");
function temporaryFixture(run:(directory:string)=>void) {
 const directory=mkdtempSync(resolve(root,".release-security-test-"));
 try {run(directory);} finally {
  const rel=relative(root,resolve(directory));
  if(isAbsolute(rel)||!rel.startsWith(".release-security-test-")||rel.includes("/" )||rel.includes("\\"))throw new Error("TEST_CLEANUP_SCOPE_INVALID");
  rmSync(directory,{recursive:true,force:true});
 }
}
describe("Release provenance security regression boundaries",()=>{
 it("does not expose a mutable canonical route map to module consumers",()=>{
  expect(Object.isFrozen(publicRouteImplementations)).toBe(true);
  expect(Reflect.set(publicRouteImplementations,"accountDeletion","src/app/privacy/page.tsx")).toBe(false);
  expect(Reflect.deleteProperty(publicRouteImplementations,"accountDeletion")).toBe(false);
  expect(collectPublicRouteInputs(root,definition)).toContain("src/app/account-deletion/page.tsx");
 });
 it("refuses a real intermediate directory junction before reading an external target",()=>temporaryFixture(directory=>{
  const repo=resolve(directory,"repo"),outside=resolve(directory,"outside");mkdirSync(repo);mkdirSync(outside);
  writeFileSync(resolve(outside,"input.json"),"{}");symlinkSync(outside,resolve(repo,"link"),"junction");
  expect(()=>assertReleaseRegularFile(repo,"link/input.json")).toThrow("RELEASE_SOURCE_SYMLINK_REFUSED");
  expect(()=>assertReleaseRegularFile(repo,"link")).toThrow("RELEASE_SOURCE_SYMLINK_REFUSED");
  expect(()=>assertReleaseRegularFile(repo,"../outside/input.json")).toThrow("RELEASE_SOURCE_INPUT_PATH_INVALID");
 }));
 it("refuses a generator definition junction before invoking its file reader",()=>temporaryFixture(directory=>{
  const repo=resolve(directory,"repo"),outside=resolve(directory,"outside");mkdirSync(repo);mkdirSync(outside);
  mkdirSync(resolve(outside,"endvera-construction-v1"));writeFileSync(resolve(outside,"endvera-construction-v1/release-definition-v3.json"),"{}");
  symlinkSync(outside,resolve(repo,"release"),"junction");let reads=0;
  const reader=((...args:Parameters<typeof readFileSync>)=>{reads++;return readFileSync(...args);}) as typeof readFileSync;
  expect(()=>buildReleaseManifest({repositoryRoot:repo,sourceHead:"a".repeat(40),sourceTree:"b".repeat(40),readFile:reader})).toThrow("RELEASE_SOURCE_SYMLINK_REFUSED");
  expect(reads).toBe(0);
 }));
 it("accepts regular files and rejects directories and Git symlink/non-blob modes",()=>temporaryFixture(directory=>{
  writeFileSync(resolve(directory,"ordinary.txt"),"safe\n");mkdirSync(resolve(directory,"folder"));
  expect(assertReleaseRegularFile(directory,"ordinary.txt")).toBe(resolve(directory,"ordinary.txt"));
  expect(()=>assertReleaseRegularFile(directory,"folder")).toThrow("RELEASE_SOURCE_NONREGULAR_INPUT_REFUSED");
  for(const mode of ["120000 blob","160000 commit","040000 tree"])expect(()=>assertRegularGitEntry(`${mode} ${"a".repeat(40)}\tordinary.txt\0`,"ordinary.txt")).toThrow("RELEASE_SOURCE_GIT_NONREGULAR_INPUT_REFUSED");
  for(const mode of ["100644","100755"])expect(()=>assertRegularGitEntry(`${mode} blob ${"a".repeat(40)}\tordinary.txt\0`,"ordinary.txt")).not.toThrow();
 }));
 it("allows only a normal all-CRLF checkout of an LF-only text blob",()=>{
  expect(isExactCheckoutCrlfEquivalent(Buffer.from("a\r\nb\r\n"),Buffer.from("a\nb\n"),"file.txt")).toBe(true);
  for(const [working,blob] of [["a\r\r\n","a\r\n"],["a\r\nb\n","a\nb\n"],["a\r","a\n"],["a\n","a\n"],["a\r\r\n","a\n"],["a\r\nb\r\n","a\r\nb\n"]])expect(isExactCheckoutCrlfEquivalent(Buffer.from(working),Buffer.from(blob),"file.txt")).toBe(false);
  expect(isExactCheckoutCrlfEquivalent(Buffer.from("a\r\n"),Buffer.from("a\n"),"file.png")).toBe(false);
 });
 it.each([
  ['semanticVersion: "0.2.0"','semanticVersion: "0.9.9"'],['buildNumber: "1"','buildNumber: "2"'],['versionCode: 4','versionCode: 99'],['bundleIdentifier: "ai.endvera.mobile"','bundleIdentifier: "wrong.id"'],['package: "ai.endvera.mobile"','package: "wrong.id"'],['accountDeletion: "/account-deletion"','accountDeletion: "/wrong"'],['readiness: "LOCAL_PACKAGE_READY"','readiness: "EXTERNAL"'],['signed: false','signed: true'],['providerObserved: false','providerObserved: true'],['externalEffectCount: 0','externalEffectCount: 1'],['status: "READY_FOR_SIGNING_AUTHORITY"','status: "DONE"'],
 ])("rejects changed exported mobile metadata: %s",(before,after)=>{
  expect(mobileSource).toContain(before);
  expect(()=>validateMobileReleaseMetadata(mobileSource.replace(before,after),definition)).toThrow("RELEASE_MOBILE_METADATA_MISMATCH");
 });
 it("retains valid metadata but refuses executable/nonliteral metadata",()=>{
  expect(validateMobileReleaseMetadata(mobileSource,definition).semanticVersion).toBe("0.2.0");
  expect(()=>validateMobileReleaseMetadata(mobileSource.replace('semanticVersion: "0.2.0"','semanticVersion: process.env.VERSION'),definition)).toThrow("RELEASE_MOBILE_METADATA_NOT_LITERAL");
 });
 it("binds all declared public pages and their local content dependencies",()=>{
  const inputs=collectPublicRouteInputs(root,definition);
  for(const file of ["src/app/account-deletion/page.tsx","src/app/privacy/page.tsx","src/app/security/page.tsx","src/app/construction/support/page.tsx","src/components/logo.tsx","src/components/policy-page.tsx","src/lib/i18n/legal.ts","src/lib/settings.ts"])expect(inputs).toContain(file);
  const manifest=buildReleaseManifest({sourceHead:"a".repeat(40),sourceTree:"b".repeat(40)});
  for(const file of inputs)expect(manifest.inputs.some((input:{path:string})=>input.path===file)).toBe(true);
  expect(()=>collectPublicRouteInputs(root,{...definition,publicPaths:{...definition.publicPaths,accountDeletion:"/missing"}})).toThrow("RELEASE_PUBLIC_PATHS_MISMATCH");
 });
 it("refuses a missing page or a replaced page without its default export",()=>temporaryFixture(directory=>{
  expect(()=>collectPublicRouteInputs(directory,definition)).toThrow("RELEASE_PUBLIC_ROUTE_INPUT_MISSING");
  const file=resolve(directory,"src/app/account-deletion/page.tsx");mkdirSync(dirname(file),{recursive:true});writeFileSync(file,"export const unrelated = true;");
  expect(()=>collectPublicRouteInputs(directory,definition)).toThrow("RELEASE_PUBLIC_ROUTE_DEFAULT_EXPORT_MISSING");
 }));
});
