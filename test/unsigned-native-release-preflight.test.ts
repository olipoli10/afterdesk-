import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA unsigned native release preflight", () => {
  it("passes the deterministic local validator", () => {
    const output = execFileSync(process.execPath, ["scripts/validate-endvera-native-preflight.mjs"], { cwd: root, encoding: "utf8" });
    expect(output).toContain("LOCAL_UNSIGNED_NATIVE_PREFLIGHT_READY");
    expect(output).toContain("IOS_BINARY=NOT_BUILT:MACOS_XCODE_REQUIRED");
    expect(output).toContain("ANDROID_BINARY=NOT_BUILT:ANDROID_SDK_AND_JDK_REQUIRED");
  });

  it("keeps native evidence unsigned and external-effect free", () => {
    const report = JSON.parse(read("release/endvera-construction-v1/native-preflight-readiness.json"));
    expect(report).toMatchObject({ externalBuildInvoked: false, signed: false, uploaded: false, submitted: false, published: false, providerObserved: false, externalEffectCount: 0 });
  });
});
