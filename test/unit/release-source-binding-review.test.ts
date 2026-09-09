import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReleaseSourceBinding } from "../../scripts/endvera-release-source-binding.mjs";
import { buildReleaseManifest, writeReleaseManifest } from "../../scripts/generate-endvera-release-package.mjs";
const root = process.cwd();
const git = (...args: string[]) => execFileSync("git",args,{windowsHide:true});
const head = git("rev-parse","HEAD").toString("utf8").trim();
const tree = git("rev-parse","HEAD^{tree}").toString("utf8").trim();
const path = "AGENTS.md";
const blob = git("show",`${head}:${path}`);
const input = (bytes: Buffer) => ({path,byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
const manifestFor = (bytes: Buffer) => ({source:{head,tree},inputs:[input(bytes)]});

describe("Release source binding, actual Git and explicitly synthetic working-byte mutations", () => {
  it("binds an actual unchanged committed input without normalizing its manifest hash", () => {
    const bytes = readFileSync(path);
    expect(assertReleaseSourceBinding({repositoryRoot:root,manifest:manifestFor(bytes)}).mode).toBe("GIT_COMMIT_INPUT_BINDING");
  });
  it("rejects a fictional commit and a mismatching tree", () => {
    const manifest = manifestFor(blob);
    expect(() => assertReleaseSourceBinding({repositoryRoot:root,manifest:{...manifest,source:{head:"0".repeat(40),tree}}})).toThrow("RELEASE_SOURCE_COMMIT_NOT_FOUND");
    expect(() => assertReleaseSourceBinding({repositoryRoot:root,manifest:{...manifest,source:{head,tree:"1".repeat(40)}}})).toThrow("RELEASE_SOURCE_TREE_MISMATCH");
  });
  it("allows only explicit text checkout CRLF equivalence while keeping raw bytes hashed", () => {
    const crlf = Buffer.from(blob.toString("utf8").replaceAll("\n","\r\n"));
    const result = assertReleaseSourceBinding({repositoryRoot:root,manifest:manifestFor(crlf),readFile:()=>crlf});
    expect(result.crlfCheckoutEquivalentInputPaths).toEqual([path]);
    expect(result.crlfCheckoutEquivalence).toBe("WORKTREE_CRLF_TO_COMMITTED_LF_ONLY_RAW_MANIFEST_HASHES_UNCHANGED");
  });
  it("rejects a real content edit even when its raw manifest hash is recomputed", () => {
    const changed = Buffer.concat([blob,Buffer.from("real mutation\n")]);
    expect(() => assertReleaseSourceBinding({repositoryRoot:root,manifest:manifestFor(changed),readFile:()=>changed})).toThrow("RELEASE_SOURCE_INPUT_BLOB_MISMATCH");
    expect(() => assertReleaseSourceBinding({repositoryRoot:root,manifest:manifestFor(blob),readFile:()=>changed})).toThrow("RELEASE_SOURCE_WORKING_BYTES_CHANGED");
  });
  it("rejects binary input changes with a recomputed raw hash", () => {
    const binaryPath = "apps/mobile/assets/images/icon.png";
    const bytes = git("show",`${head}:${binaryPath}`);
    const changed = Buffer.from(bytes); changed[changed.length-1] ^= 1;
    const manifest = {source:{head,tree},inputs:[{...input(changed),path:binaryPath}]};
    expect(() => assertReleaseSourceBinding({repositoryRoot:root,manifest,readFile:()=>changed})).toThrow("RELEASE_SOURCE_INPUT_BLOB_MISMATCH");
  });
  it("refuses writing a manifest for a fictional commit before any write", () => {
    expect(() => writeReleaseManifest({repositoryRoot:root,sourceHead:"0".repeat(40),sourceTree:"1".repeat(40)})).toThrow("RELEASE_SOURCE_COMMIT_NOT_FOUND");
  });
  it("rejects a synthetic Web definition version mismatch in the shape-only factory", () => {
    const definitionPath = resolve("release/endvera-construction-v1/release-definition-v3.json");
    const readFile = (file: string, encoding?: BufferEncoding) => {
      if (resolve(file) !== definitionPath) return readFileSync(file,encoding);
      const definition = JSON.parse(readFileSync(file,"utf8"));
      definition.identities.find((item: {target:string})=>item.target === "WEB").semanticVersion = "999.0.0";
      return encoding ? JSON.stringify(definition) : Buffer.from(JSON.stringify(definition));
    };
    expect(() => buildReleaseManifest({repositoryRoot:root,sourceHead:head,sourceTree:tree,readFile})).toThrow("RELEASE_WEB_IDENTITY_MISMATCH");
  });
});
