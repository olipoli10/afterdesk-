import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const app = json("apps/mobile/app.json").expo;
const eas = json("apps/mobile/eas.json");
const definition = json("release/endvera-construction-v1/release-definition-v3.json");
const report = json("release/endvera-construction-v1/native-preflight-readiness.json");
const mobile = json("release/endvera-construction-v1/mobile-assistant-experience-readiness.json");

assert(app.name === "ENDVERA" && app.slug === "endvera" && app.scheme === "endvera", "NATIVE_APP_IDENTITY_INVALID");
assert(app.version === '0.1.1' && app.android.versionCode === 3, "NATIVE_V3_IDENTITY_INVALID");
assert(app.ios.bundleIdentifier === "ai.endvera.mobile" && app.android.package === "ai.endvera.mobile", "NATIVE_PLATFORM_IDENTITY_INVALID");
assert(app.ios.icon === app.icon && existsSync(resolve(root, "apps/mobile", app.icon)), "NATIVE_IOS_ICON_INVALID");
for (const path of [app.android.adaptiveIcon.foregroundImage, app.android.adaptiveIcon.backgroundImage, app.android.adaptiveIcon.monochromeImage, app.web.favicon]) {
  assert(existsSync(resolve(root, "apps/mobile", path)), `NATIVE_ASSET_MISSING:${path}`);
}

assert(app.locales.fr === "./locales/fr.json" && app.locales.en === "./locales/en.json", "NATIVE_LOCALE_MAP_INVALID");
const fr = json("apps/mobile/locales/fr.json");
const en = json("apps/mobile/locales/en.json");
assert(fr.ios?.CFBundleDisplayName === "ENDVERA" && en.ios?.CFBundleDisplayName === "ENDVERA" && fr.android?.app_name === "ENDVERA" && en.android?.app_name === "ENDVERA", "NATIVE_LOCALIZED_NAME_INVALID");
assert(fr.ios?.NSMicrophoneUsageDescription && en.ios?.NSMicrophoneUsageDescription, "NATIVE_MICROPHONE_DISCLOSURE_MISSING");

assert(mobile.primaryTabCount === 5 && mobile.secondaryRouteCount === 20, "NATIVE_ROUTE_PARITY_INVALID");
assert(report.localStaticExportRouteCount === 53, "NATIVE_EXPORT_EVIDENCE_INVALID");
assert(definition.publicPaths.accountDeletion === "/account-deletion", "NATIVE_ACCOUNT_DELETION_PATH_STALE");
assert(definition.assets[0].kind === "APP_ICON", "NATIVE_PLACEHOLDER_ASSET_LABEL_PRESENT");
assert(!Object.hasOwn(eas, "submit") && !JSON.stringify(eas).match(/"(?:credentials|projectId|owner|channel|token|secret|password)"\s*:/iu), "NATIVE_EXTERNAL_BUILD_VALUE_PRESENT");

assert(report.status === "LOCAL_UNSIGNED_NATIVE_PREFLIGHT_READY", "NATIVE_PREFLIGHT_STATUS_INVALID");
assert(report.hostPlatform === process.platform, "NATIVE_HOST_PLATFORM_MISMATCH");
assert(report.nativeBinaryBuilds.ios.built === false && report.nativeBinaryBuilds.ios.blocker === "MACOS_XCODE_REQUIRED", "NATIVE_IOS_BINARY_CLAIM_INVALID");
assert(report.nativeBinaryBuilds.android.built === false && report.nativeBinaryBuilds.android.blocker === "ANDROID_SDK_AND_JDK_REQUIRED", "NATIVE_ANDROID_BINARY_CLAIM_INVALID");
for (const flag of ["externalBuildInvoked", "signed", "uploaded", "submitted", "published", "providerObserved"]) assert(report[flag] === false, `NATIVE_BOUNDARY_INFLATED:${flag}`);
assert(report.externalEffectCount === 0, "NATIVE_EXTERNAL_EFFECT_DETECTED");

console.log("LOCAL_UNSIGNED_NATIVE_PREFLIGHT_READY");
console.log("SCOPE=LOCAL_CONFIG_CHECK; BINARY_LINES_BELOW_ARE_HISTORICAL_PREFLIGHT_RECORD_NOT_CURRENT_DEVICE_OBSERVATION");
console.log("IOS_BINARY=NOT_BUILT:MACOS_XCODE_REQUIRED");
console.log("ANDROID_BINARY=NOT_BUILT:ANDROID_SDK_AND_JDK_REQUIRED");
console.log("EXTERNAL_EFFECTS=0");
