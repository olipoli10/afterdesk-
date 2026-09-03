import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");

const report = json("release/endvera-construction-v1/whole-product-readiness.json");
assert(report.schemaVersion === 1, "WHOLE_PRODUCT_SCHEMA_INVALID");
assert(report.status === "LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED", "WHOLE_PRODUCT_STATUS_INVALID");
assert(report.scope === "WEB_IOS_ANDROID_AND_DISABLED_BACKEND_CONFIGURATION", "WHOLE_PRODUCT_SCOPE_INVALID");
assert(report.localScopeGaps.length === 0, "LOCAL_SCOPE_GAPS_REMAIN");

for (const input of report.protectedInputs) {
  assert(existsSync(resolve(root, input.path)), `PROTECTED_INPUT_MISSING:${input.path}`);
  assert(hash(input.path) === input.sha256, `PROTECTED_INPUT_HASH_MISMATCH:${input.path}`);
}

const homepage = read("src/app/page.tsx");
assert(homepage.includes("<SimplicityActs"), "ACCEPTED_HOMEPAGE_NOT_PRESERVED");
assert(homepage.includes("<TextAssistBanner"), "TEXTASSIST_BANNER_MISSING");
assert(existsSync(resolve(root, "src/app/textassist/page.tsx")), "TEXTASSIST_ROUTE_MISSING");
assert(existsSync(resolve(root, "src/app/account-deletion/page.tsx")), "ACCOUNT_DELETION_ROUTE_MISSING");

const mobile = json("release/endvera-construction-v1/mobile-assistant-experience-readiness.json");
assert(mobile.primaryTabCount === 5, "MOBILE_PRIMARY_TAB_COUNT_INVALID");
assert(mobile.secondaryRouteCount === 20, "MOBILE_SECONDARY_ROUTE_COUNT_INVALID");
assert(mobile.launchLanguages.join(",") === "fr-CA,en-CA", "MOBILE_LANGUAGE_PARITY_INVALID");
assert(mobile.androidLocalExport && mobile.iosLocalExport && mobile.webLocalExport, "MOBILE_LOCAL_EXPORT_INCOMPLETE");

const env = json("release/endvera-construction-v1/environment-contract-v2.json");
assert(env.secretValuesSerializable === false, "SECRET_VALUES_MUST_NOT_BE_SERIALIZABLE");
assert(env.externalReleaseAuthorized === false, "EXTERNAL_RELEASE_MUST_REMAIN_UNAUTHORIZED");
for (const variable of env.variables) {
  assert(!Object.hasOwn(variable, "value"), `ENVIRONMENT_VALUE_SERIALIZED:${variable.name}`);
}

const connectorSources = [
  { path: "src/lib/construction-operating-assistant-r36/contracts.ts", pattern: /providerObserved:\s*z\.literal\(false\)/ },
  { path: "src/lib/construction-operating-assistant-r2/connectors.ts", pattern: /externalTransportEnabled:\s*false/ },
  { path: "src/lib/construction-operating-assistant-r3/connector-contracts.ts", pattern: /externalTransportEnabled:\s*z\.literal\(false\)/ },
  { path: "src/lib/construction-operating-assistant-r4/communication-contracts.ts", pattern: /externalTransportEnabled:\s*z\.literal\(false\)/ },
  { path: "src/lib/construction-operating-assistant-r24/contracts.ts", pattern: /externalTransportEnabled:\s*z\.literal\(false\)/ },
  { path: "src/lib/construction-operating-assistant-r25/contracts.ts", pattern: /externalTransportEnabled:\s*z\.literal\(false\)/ },
  { path: "src/lib/construction-operating-assistant-r26/contracts.ts", pattern: /externalTransportEnabled:\s*z\.literal\(false\)/ },
  { path: "src/server/construction-operating-assistant-r27/accounting.ts", pattern: /externalWriteEnabled:\s*false/ }
];
for (const connector of connectorSources) {
  const source = read(connector.path);
  assert(connector.pattern.test(source), `CONNECTOR_NOT_DISABLED:${connector.path}`);
}

assert(report.backend.allExternalTransportDisabled === true, "BACKEND_EXTERNAL_TRANSPORT_NOT_DISABLED");
assert(report.backend.providerBoundaryViolationCount === 0, "PROVIDER_BOUNDARY_VIOLATIONS_PRESENT");
assert(report.resolvedSinceR36K.includes("PUBLIC_ACCOUNT_DELETION_RESOURCE"), "ACCOUNT_DELETION_RESOLUTION_MISSING");
const blockerCodes = report.externalBlockers.map((blocker) => blocker.code);
assert(blockerCodes.length === 18, "EXTERNAL_BLOCKER_COUNT_INVALID");
assert(new Set(blockerCodes).size === blockerCodes.length, "EXTERNAL_BLOCKERS_DUPLICATED");
assert(!blockerCodes.includes("PUBLIC_ACCOUNT_DELETION_RESOURCE"), "STALE_ACCOUNT_DELETION_BLOCKER_PRESENT");
for (const required of ["PUBLIC_PRODUCTION_ORIGIN", "FINAL_BRAND_ASSET_APPROVAL", "REAL_DEVICE_SCREENSHOTS", "APPLE_SIGNING_CUSTODY", "ANDROID_SIGNING_CUSTODY", "LEGAL_PRIVACY_REVIEW", "MONITORING_PROVIDER_SELECTION", "EXTERNAL_SUPPORT_OWNER"]) {
  assert(blockerCodes.includes(required), `REQUIRED_EXTERNAL_BLOCKER_MISSING:${required}`);
}

assert(report.projectTerminalState === "INCOMPLETE", "PROJECT_MUST_REMAIN_INCOMPLETE");
assert(report.nextExternalRelease === "R37-PROVIDER-SANDBOX", "NEXT_EXTERNAL_RELEASE_INVALID");
assert(report.remainingRoadmapReleases.at(-1) === "R40-PRODUCTION-V1", "TERMINAL_RELEASE_MISSING");
for (const flag of ["signed", "uploaded", "submitted", "deployed", "published", "providerObserved", "customerObserved", "productionReady"]) {
  assert(report[flag] === false, `EXTERNAL_BOUNDARY_INFLATED:${flag}`);
}
assert(report.externalEffectCount === 0, "EXTERNAL_EFFECT_DETECTED");

console.log("LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED");
console.log(`PROTECTED_INPUTS=${report.protectedInputs.length}`);
console.log(`EXTERNAL_BLOCKERS=${report.externalBlockers.length}`);
console.log("PROJECT_TERMINAL_STATE=INCOMPLETE");
console.log("EXTERNAL_EFFECTS=0");
