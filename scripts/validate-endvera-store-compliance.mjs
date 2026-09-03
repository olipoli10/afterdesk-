import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(repositoryRoot, relativePath), "utf8"));
}

export function validateStoreCompliance({ app, disclosure, apple, google, screenshots, readiness, listings }) {
  if (!readiness || readiness.schemaVersion !== 1 || readiness.readiness !== "READY_FOR_EXTERNAL_COMPLIANCE_INPUTS" || readiness.uploaded !== false || readiness.submitted !== false || readiness.storeAvailable !== false || readiness.providerObserved !== false || readiness.externalEffectCount !== 0) throw new Error("STORE_COMPLIANCE_CLAIM_INFLATION_REFUSED");

  const canonical = disclosure?.classes?.map((item) => item.code) ?? [];
  if (canonical.length !== 9 || !same(apple?.canonicalDataClassCodes, canonical) || !same(google?.canonicalDataClassCodes, canonical)) throw new Error("STORE_COMPLIANCE_DATA_CLASS_DRIFT");

  const microphonePermission = app?.expo?.plugins?.find((entry) => Array.isArray(entry) && entry[0] === "expo-audio")?.[1]?.microphonePermission;
  const expectedPermissions = [{ code: "MICROPHONE", purpose: microphonePermission }];
  if (!microphonePermission || !same(apple?.permissions, expectedPermissions) || !same(google?.permissions, expectedPermissions)) throw new Error("STORE_COMPLIANCE_PERMISSION_DRIFT");

  if (!Array.isArray(listings) || listings.length !== 2 || listings.some((listing) => !["fr-CA", "en-CA"].includes(listing.locale) || listing.shortDescription.length > 80 || listing.privacyPath !== "/privacy" || listing.supportPath !== "/construction/support") || !same(listings[0].capabilityCodes, listings[1].capabilityCodes) || !same(listings[0].unavailableCapabilityCodes, listings[1].unavailableCapabilityCodes)) throw new Error("STORE_COMPLIANCE_LISTING_DRIFT");

  if (apple?.applicationId !== app?.expo?.ios?.bundleIdentifier || google?.applicationId !== app?.expo?.android?.package) throw new Error("STORE_COMPLIANCE_APPLICATION_ID_DRIFT");
  if (apple?.storeRequirements?.privacyPolicyUrlRequired !== true || apple?.storeRequirements?.privacyNutritionLabelsRequired !== true || apple?.storeRequirements?.screenshotMinimum !== 1 || apple?.storeRequirements?.screenshotMaximum !== 10 || apple?.storeRequirements?.appPreviewRequired !== false) throw new Error("STORE_COMPLIANCE_APPLE_REQUIREMENTS_INCOMPLETE");
  if (google?.storeRequirements?.privacyPolicyUrlRequired !== true || google?.storeRequirements?.dataSafetyFormRequired !== true || google?.storeRequirements?.screenshotMinimum !== 2 || google?.storeRequirements?.screenshotMaximumPerDeviceType !== 8 || google?.storeRequirements?.shortDescriptionMaximumCharacters !== 80 || google?.accountDeletion?.inAppPathPresent !== true || google?.accountDeletion?.publicWebResourcePresent !== false) throw new Error("STORE_COMPLIANCE_GOOGLE_REQUIREMENTS_INCOMPLETE");

  if (screenshots?.capturedCount !== 0 || screenshots?.realDeviceObserved !== false || screenshots?.uploaded !== false || screenshots?.scenes?.length !== 6 || screenshots.scenes.some((scene) => scene.captured !== false || scene.syntheticDataOnly !== true)) throw new Error("STORE_COMPLIANCE_SCREENSHOT_EVIDENCE_REFUSED");
  const expectedBlockers = ["APPLE_DEVELOPER_ACCOUNT", "GOOGLE_PLAY_DEVELOPER_ACCOUNT", "LEGAL_PRIVACY_REVIEW", "PUBLIC_ACCOUNT_DELETION_RESOURCE", "REAL_DEVICE_SCREENSHOTS", "STORE_REVIEW_CREDENTIALS"];
  if (!same(readiness.remainingBlockers?.map((item) => item.code), expectedBlockers)) throw new Error("STORE_COMPLIANCE_BLOCKER_DRIFT");

  return { status: readiness.readiness, dataClassesChecked: canonical.length, localeCount: listings.length, sceneCount: screenshots.scenes.length, externalEffectCount: 0 };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const readiness = readJson("release/endvera-construction-v1/store-compliance-readiness.json");
  const report = validateStoreCompliance({
    app: readJson("apps/mobile/app.json"),
    disclosure: readJson(readiness.privacyDisclosurePath),
    apple: readJson(readiness.appleWorkbookPath),
    google: readJson(readiness.googleWorkbookPath),
    screenshots: readJson(readiness.screenshotPlanPath),
    readiness,
    listings: [readJson("release/endvera-construction-v1/store/fr-CA.json"), readJson("release/endvera-construction-v1/store/en-CA.json")],
  });
  process.stdout.write(`${report.status} dataClasses=${report.dataClassesChecked} locales=${report.localeCount} scenes=${report.sceneCount} externalEffectCount=0\n`);
}
