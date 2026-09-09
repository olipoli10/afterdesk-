import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const app = readJson("apps/mobile/app.json").expo;
const eas = readJson("apps/mobile/eas.json");
const readiness = readJson("release/endvera-construction-v1/mobile-build-readiness.json");
const profileNames = ["founder-device", "internal-preview", "local-simulator", "store-candidate"];

if (JSON.stringify(Object.keys(eas.build ?? {}).sort()) !== JSON.stringify(profileNames)) throw new Error("MOBILE_BUILD_PROFILE_SET_MISMATCH");
if ("submit" in eas) throw new Error("MOBILE_BUILD_SUBMIT_PATH_REFUSED");
if (JSON.stringify([...readiness.profiles].sort()) !== JSON.stringify(profileNames)) throw new Error("MOBILE_READINESS_PROFILE_SET_MISMATCH");
if (eas.build['founder-device']?.distribution !== 'internal' || eas.build['founder-device']?.android?.buildType !== 'apk' || eas.build['founder-device']?.autoIncrement !== false) throw new Error("MOBILE_FOUNDER_PROFILE_INVALID");
if (JSON.stringify(eas).match(/"(?:credentials|credentialsSource|projectId|owner|channel|environment|token|secret|password)"\s*:/iu)) throw new Error("MOBILE_BUILD_VALUE_MATERIAL_REFUSED");
if (app.ios?.bundleIdentifier !== readiness.ios?.bundleIdentifier || app.ios?.buildNumber !== readiness.ios?.buildNumber || app.android?.package !== readiness.android?.package || app.android?.versionCode !== readiness.android?.versionCode) throw new Error("MOBILE_BUILD_IDENTITY_MISMATCH");
if (readiness.status !== "READY_FOR_SIGNING_AUTHORITY" || readiness.signed || readiness.uploaded || readiness.submitted || readiness.published || readiness.deployed || readiness.providerObserved || readiness.externalEffectCount !== 0) throw new Error("MOBILE_BUILD_CLAIM_INFLATION_REFUSED");

process.stdout.write("READY_FOR_SIGNING_AUTHORITY externalEffectCount=0\n");
