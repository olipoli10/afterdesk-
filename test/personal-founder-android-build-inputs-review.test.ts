import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validateFounderAndroidBuildInputs } from "../scripts/check-founder-android-inputs.mjs";

// Separate supplied-input review. No EAS, signing, network, account or device calls.
const root = process.cwd();
const origin = "https://endvera-core-sandbox-afterdesk.vercel.app";
const head = "a".repeat(40);
function fixture() {
  const json = (relative: string) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
  const app = json("apps/mobile/app.json");
  const eas = json("apps/mobile/eas.json");
  // Synthetic explicit future profile only; never writes the actual profile.
  eas.build["founder-device"].env = { EXPO_PUBLIC_ENDVERA_API_URL: origin };
  return { expectedHead: head, expectedApiOrigin: origin, expectedVersionCode: app.expo.android.versionCode,
    head, gitStatus: "", app, eas, packageJson: json("apps/mobile/package.json"),
    definition: json("release/endvera-construction-v1/release-definition-v3.json"),
    readiness: json("release/endvera-construction-v1/mobile-build-readiness.json") };
}

describe("founder APK input guard separate review — no build authority", () => {
  it("validates only the synthetic source contract, with all remote/build permissions false", () => {
    const input = fixture();
    const result = validateFounderAndroidBuildInputs(input);
    expect(result).toMatchObject({ sourceHead: head, apiOrigin: origin, profile: "founder-device",
      executionAuthorized: false, backendCompatibilityVerified: false, remoteEasConfigurationVerified: false,
      budgetVerified: false, buildInvoked: false });
    expect(Object.isFrozen(result)).toBe(true);
    input.app.expo.android.versionCode += 1;
    input.eas.build["founder-device"].env.EXPO_PUBLIC_ENDVERA_API_URL = "https://changed.invalid";
    expect(result.versionCode).not.toBe(input.app.expo.android.versionCode);
    expect(result.apiOrigin).toBe(origin);
  });

  it("refuses the current source profile without manufacturing an origin", () => {
    const input = fixture();
    input.eas = JSON.parse(readFileSync(path.join(root, "apps/mobile/eas.json"), "utf8"));
    expect(input.eas.build["founder-device"]).not.toHaveProperty("env");
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_FOUNDER_PROFILE");
  });

  it.each([`${origin}/`, `${origin}:443`, `${origin}?secret=sentinel`, "https://u:p@endvera-core-sandbox-afterdesk.vercel.app"])("refuses normalization-equivalent or credential-bearing origin %s", candidate => {
    const input = fixture(); input.expectedApiOrigin = candidate;
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_EXPECTED_ORIGIN");
  });

  it("refuses environment indirection and arbitrary env values instead of echoing their content", () => {
    const input = fixture();
    input.eas.build["founder-device"].env.PRIVATE_TOKEN = "SYNTHETIC_DO_NOT_ECHO_123";
    let error: unknown;
    try { validateFounderAndroidBuildInputs(input); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("FOUNDER_ANDROID_PROFILE_ORIGIN");
    expect((error as Error).message).not.toContain("SYNTHETIC_DO_NOT_ECHO_123");
    delete input.eas.build["founder-device"].env.PRIVATE_TOKEN;
    input.eas.build["founder-device"].environment = "production";
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_FOUNDER_PROFILE");
  });

  it("does not execute an input accessor or proxy trap", () => {
    const getter = vi.fn(() => origin); const input = fixture();
    Object.defineProperty(input, "expectedApiOrigin", { enumerable: true, get: getter });
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_INPUT_ACCESSOR");
    expect(getter).not.toHaveBeenCalled();
    const ownKeys = vi.fn(() => []);
    expect(() => validateFounderAndroidBuildInputs(new Proxy(fixture(), { ownKeys }))).toThrow("FOUNDER_ANDROID_INPUT_SHAPE");
    expect(ownKeys).not.toHaveBeenCalled();
  });

  it("rechecking the same mutable observation refuses later source version and HEAD changes", () => {
    const input = fixture(); expect(validateFounderAndroidBuildInputs(input).buildInvoked).toBe(false);
    input.app.expo.android.versionCode += 1;
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_APP_IDENTITY");
    input.app.expo.android.versionCode -= 1; input.head = "b".repeat(40);
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_HEAD_CHANGED");
  });

  it("does not accept a new version solely because the controller expects it", () => {
    const input = fixture(); input.expectedVersionCode += 1;
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_APP_IDENTITY");
    input.app.expo.android.versionCode = input.expectedVersionCode;
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_RELEASE_IDENTITY");
  });

  it("refuses a dirty tree and inflated signing evidence without leaking Git paths", () => {
    const input = fixture(); input.gitStatus = "?? SYNTHETIC_PRIVATE_PATH\0";
    // NUL-containing observations are rejected even before Git-state semantics.
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_INPUT_STRING");
    input.gitStatus = " M SYNTHETIC_PRIVATE_PATH";
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_DIRTY_GIT");
    input.gitStatus = ""; input.readiness.signed = true;
    expect(() => validateFounderAndroidBuildInputs(input)).toThrow("FOUNDER_ANDROID_BUILD_CONTRACT");
  });

  it("CLI invalid expectations stop with a fixed error and no supplied value disclosure", () => {
    const command = path.join(root, "scripts/check-founder-android-inputs.mjs");
    const result = spawnSync(process.execPath, [command, "--expected-head", head, "--expected-api-origin",
      "https://synthetic-secret.invalid/SYNTHETIC_DO_NOT_ECHO_456", "--expected-version-code", "4"],
    { encoding: "utf8", windowsHide: true, timeout: 5000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("FOUNDER_ANDROID_EXPECTED_ORIGIN");
  });

  it("launcher shape guards its only external invocation and has only whoami plus one fixed internal build", () => {
    const source = readFileSync(path.join(root, "scripts/start-founder-android-build-secure.ps1"), "utf8");
    expect(source.match(/& npx\b/g)).toHaveLength(1);
    const wrapper = source.slice(source.indexOf("function Invoke-FounderEas"), source.indexOf("Push-Location $mobileRoot"));
    expect(wrapper.indexOf("Assert-FounderBuildInputs")).toBeGreaterThan(0);
    expect(wrapper.indexOf("& npx")).toBeGreaterThan(wrapper.indexOf("Assert-FounderBuildInputs"));
    expect(source.match(/^\s+Invoke-FounderEas .+$/gm)?.map(line => line.trim())).toEqual([
      "Invoke-FounderEas whoami", "Invoke-FounderEas build --platform android --profile founder-device --non-interactive --wait",
    ]);
    expect(source).not.toMatch(/project:init|Invoke-FounderEas login|& git|auto-submit|Invoke-Expression/);
    expect(source).not.toContain("$Arguments -join");
    // Static source shape only; the launch script is never executed by this test.
  });
});
