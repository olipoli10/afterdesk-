import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { readCurrentProjection, requireExactInputs } from "../release/current-projection-v3.mjs";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const hash = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function validateWholeProductClosure(report = json("release/endvera-construction-v1/whole-product-closure-audit.json")) {
  assert(report?.schemaVersion === 1, "CLOSURE_SCHEMA_INVALID");
  assert(report.status === "LOCAL_CREDENTIAL_FREE_PRODUCT_SCOPE_CLOSED", "CLOSURE_STATUS_INVALID");
  assert(report.auditScope === "WEB_IOS_ANDROID_RELEASE_STORE_AND_DISABLED_BACKEND", "CLOSURE_SCOPE_INVALID");
  const expectedPlatforms = [
    {target:"WEB",localStatus:"READY_FOR_DEPLOYMENT_AUTHORITY",bilingual:true,deployed:false},
    {target:"IOS",localStatus:"READY_FOR_SIGNING_AUTHORITY",localExportRouteCount:53,binaryBuilt:false,binaryBlocker:"MACOS_XCODE_REQUIRED"},
    {target:"ANDROID",localStatus:"READY_FOR_SIGNING_AUTHORITY",localExportRouteCount:53,binaryBuilt:false,binaryBlocker:"ANDROID_SDK_AND_JDK_REQUIRED"},
  ];
  assert(JSON.stringify(report.platforms) === JSON.stringify(expectedPlatforms), "CLOSURE_PLATFORM_CLAIM_INVALID");
  assert(Array.isArray(report.localScopeGaps) && report.localScopeGaps.length === 0, "LOCAL_SCOPE_GAPS_REMAIN");
  requireExactInputs(report.protectedInputs, [
    "release/endvera-construction-v1/whole-product-readiness.json",
    "release/endvera-construction-v1/additive-public-brand-readiness.json",
    "release/endvera-construction-v1/construction-conversion-readiness.json",
    "release/endvera-construction-v1/backend-activation-readiness.json",
    "release/endvera-construction-v1/native-preflight-readiness.json",
    "release/endvera-construction-v1/release-manifest.json",
    "release/endvera-construction-v1/market-readiness-report.json",
  ], "PROTECTED_INPUT_SET_INVALID");

  const paths = new Set();
  for (const input of report.protectedInputs ?? []) {
    assert(typeof input.path === "string" && !isAbsolute(input.path) && !input.path.split(/[\\/]/u).includes(".."), "PROTECTED_INPUT_PATH_INVALID");
    assert(!paths.has(input.path), `PROTECTED_INPUT_DUPLICATED:${input.path}`);
    paths.add(input.path);
    assert(existsSync(resolve(root, input.path)), `PROTECTED_INPUT_MISSING:${input.path}`);
    assert(hash(input.path) === input.sha256, `PROTECTED_INPUT_HASH_MISMATCH:${input.path}`);
  }
  assert(paths.size === 7, "PROTECTED_INPUT_SET_INVALID");

  const homepage = read("src/app/page.tsx");
  assert(homepage.includes("<SimplicityActs"), "EXISTING_HOMEPAGE_NOT_PRESERVED");
  assert(homepage.includes("<TextAssistBanner"), "TEXTASSIST_BANNER_MISSING");
  for (const route of ["src/app/textassist/page.tsx", "src/app/construction/page.tsx", "src/app/account-deletion/page.tsx"]) {
    assert(existsSync(resolve(root, route)), `ADDITIVE_ROUTE_MISSING:${route}`);
  }
  assert(report.preservation?.existingHomepagePreserved === true, "HOMEPAGE_PRESERVATION_CLAIM_MISSING");
  assert(report.preservation?.managedWorkOfferingRetained === true, "MANAGED_WORK_PRESERVATION_CLAIM_MISSING");

  const native = json("release/endvera-construction-v1/native-preflight-readiness.json");
  assert(native.status === "LOCAL_UNSIGNED_NATIVE_PREFLIGHT_READY", "NATIVE_PREFLIGHT_NOT_READY");
  assert(native.localStaticExportRouteCount === 53, "NATIVE_EXPORT_ROUTE_COUNT_INVALID");
  assert(native.nativeBinaryBuilds.ios.built === false && native.nativeBinaryBuilds.android.built === false, "UNAUTHORIZED_NATIVE_BINARY_CLAIM");
  assert(native.externalEffectCount === 0, "NATIVE_EXTERNAL_EFFECT_DETECTED");

  const manifest = json("release/endvera-construction-v1/release-manifest.json");
  assert(manifest.readiness === "LOCAL_PACKAGE_READY", "RELEASE_PACKAGE_NOT_READY");
  const backend = json("release/endvera-construction-v1/backend-activation-readiness.json");
  assert(backend.status === "LOCAL_BACKEND_ACTIVATION_GATE_READY", "BACKEND_ACTIVATION_GATE_NOT_READY");
  assert(backend.credentialPresenceAloneActivates === false && backend.externalEffectCount === 0, "BACKEND_ACTIVATION_BOUNDARY_INVALID");
  assert(report.backend?.providerBoundaryModuleCount === 559, "PROVIDER_BOUNDARY_MODULE_COUNT_INVALID");
  assert(report.backend?.providerBoundaryViolationCount === 0, "PROVIDER_BOUNDARY_VIOLATION_PRESENT");
  assert(report.backend?.allExternalTransportDisabled === true, "EXTERNAL_TRANSPORT_NOT_DISABLED");

  const blockerCodes = report.externalBlockers ?? [];
  assert(blockerCodes.length === 18 && new Set(blockerCodes).size === 18, "EXTERNAL_BLOCKER_SET_INVALID");
  for (const required of ["PUBLIC_PRODUCTION_ORIGIN", "APPLE_SIGNING_CUSTODY", "ANDROID_SIGNING_CUSTODY", "LEGAL_PRIVACY_REVIEW", "FINAL_BRAND_ASSET_APPROVAL", "REAL_DEVICE_SCREENSHOTS", "MONITORING_PROVIDER_SELECTION", "EXTERNAL_SUPPORT_OWNER"]) {
    assert(blockerCodes.includes(required), `EXTERNAL_BLOCKER_MISSING:${required}`);
  }
  assert(JSON.stringify(report.remainingRoadmapReleases) === JSON.stringify(["R37-PROVIDER-SANDBOX", "R38-FOUNDER-FULL-LOOP", "R39-DESIGN-PARTNER-PILOT", "R40-PRODUCTION-V1"]), "REMAINING_ROADMAP_INVALID");
  assert(report.nextExternalRelease === "R37-PROVIDER-SANDBOX", "NEXT_EXTERNAL_RELEASE_INVALID");
  assert(report.projectTerminalState === "INCOMPLETE" && report.externalAuthorityRequired === true, "PROJECT_TERMINAL_STATE_INFLATED");
  for (const flag of ["signed", "uploaded", "submitted", "deployed", "published", "providerObserved", "customerObserved", "productionReady"]) {
    assert(report[flag] === false, `EXTERNAL_CLAIM_INFLATED:${flag}`);
  }
  assert(report.externalEffectCount === 0, "EXTERNAL_EFFECT_DETECTED");

  return { status: "HISTORICAL_STATIC_ATTESTATION_ONLY", historicalStatus: report.status,
    currentReadiness: "NOT_EVALUATED", protectedInputCount: paths.size, externalBlockerCount: blockerCodes.length };
}

if (process.argv[1]?.endsWith("validate-endvera-whole-product-closure.mjs")) {
  const result = process.argv.includes("--historical") ? validateWholeProductClosure() : readCurrentProjection(root);
  console.log(JSON.stringify(result));
}
