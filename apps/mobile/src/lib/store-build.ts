type JsonRecord = Record<string, unknown>;

export const expectedMobileBuildProfiles = [
  "local-simulator",
  "internal-preview",
  "founder-device",
  "store-candidate",
] as const;

const forbiddenValueKeys = new Set([
  "channel",
  "credentials",
  "credentialsSource",
  "env",
  "environment",
  "owner",
  "password",
  "projectId",
  "secret",
  "submit",
  "token",
]);

function record(value: unknown, error: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[], error: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(error);
}

function assertNoValueMaterial(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoValueMaterial(item);
    return;
  }
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (forbiddenValueKeys.has(key)) {
      if (key === "submit") throw new Error("MOBILE_BUILD_SUBMIT_PATH_REFUSED");
      throw new Error("MOBILE_BUILD_VALUE_MATERIAL_REFUSED");
    }
    assertNoValueMaterial(child);
  }
}

function assertBuildProfiles(easConfig: JsonRecord) {
  exactKeys(easConfig, ["build", "cli"], "MOBILE_BUILD_ROOT_CONTRACT_MISMATCH");
  const cli = record(easConfig.cli, "MOBILE_BUILD_CLI_CONTRACT_MISMATCH");
  exactKeys(cli, ["appVersionSource", "promptToConfigurePushNotifications", "requireCommit"], "MOBILE_BUILD_CLI_CONTRACT_MISMATCH");
  if (cli.appVersionSource !== "local" || cli.requireCommit !== true || cli.promptToConfigurePushNotifications !== false) throw new Error("MOBILE_BUILD_CLI_CONTRACT_MISMATCH");

  const build = record(easConfig.build, "MOBILE_BUILD_PROFILE_SET_MISMATCH");
  exactKeys(build, expectedMobileBuildProfiles, "MOBILE_BUILD_PROFILE_SET_MISMATCH");

  const local = record(build["local-simulator"], "MOBILE_BUILD_LOCAL_PROFILE_MISMATCH");
  const localIos = record(local.ios, "MOBILE_BUILD_LOCAL_PROFILE_MISMATCH");
  const localAndroid = record(local.android, "MOBILE_BUILD_LOCAL_PROFILE_MISMATCH");
  if (local.distribution !== "internal" || local.autoIncrement !== false || localIos.simulator !== true || localAndroid.withoutCredentials !== true || localAndroid.buildType !== "apk") throw new Error("MOBILE_BUILD_LOCAL_PROFILE_MISMATCH");

  const preview = record(build["internal-preview"], "MOBILE_BUILD_PREVIEW_PROFILE_MISMATCH");
  exactKeys(preview, ["extends"], "MOBILE_BUILD_PREVIEW_PROFILE_MISMATCH");
  if (preview.extends !== "local-simulator") throw new Error("MOBILE_BUILD_PREVIEW_PROFILE_MISMATCH");

  const founder = record(build["founder-device"], "MOBILE_BUILD_FOUNDER_PROFILE_MISMATCH");
  const founderIos = record(founder.ios, "MOBILE_BUILD_FOUNDER_PROFILE_MISMATCH");
  const founderAndroid = record(founder.android, "MOBILE_BUILD_FOUNDER_PROFILE_MISMATCH");
  if (founder.distribution !== "internal" || founder.autoIncrement !== false || founderIos.simulator !== false || "withoutCredentials" in founderAndroid || founderAndroid.buildType !== "apk") throw new Error("MOBILE_BUILD_FOUNDER_PROFILE_MISMATCH");

  const candidate = record(build["store-candidate"], "MOBILE_BUILD_STORE_PROFILE_MISMATCH");
  const candidateIos = record(candidate.ios, "MOBILE_BUILD_STORE_PROFILE_MISMATCH");
  const candidateAndroid = record(candidate.android, "MOBILE_BUILD_STORE_PROFILE_MISMATCH");
  if (candidate.distribution !== "store" || candidate.autoIncrement !== false || candidateIos.simulator !== false || candidateAndroid.buildType !== "app-bundle") throw new Error("MOBILE_BUILD_STORE_PROFILE_MISMATCH");
}

function assertIdentity(appConfig: JsonRecord, readiness: JsonRecord) {
  const expo = record(appConfig.expo, "MOBILE_BUILD_IDENTITY_MISMATCH");
  const ios = record(expo.ios, "MOBILE_BUILD_IDENTITY_MISMATCH");
  const android = record(expo.android, "MOBILE_BUILD_IDENTITY_MISMATCH");
  const readyIos = record(readiness.ios, "MOBILE_BUILD_IDENTITY_MISMATCH");
  const readyAndroid = record(readiness.android, "MOBILE_BUILD_IDENTITY_MISMATCH");
  if (
    expo.name !== "ENDVERA" ||
    expo.slug !== "endvera" ||
    expo.version !== "0.1.0" ||
    ios.bundleIdentifier !== "ai.endvera.mobile" ||
    ios.buildNumber !== "1" ||
    android.package !== "ai.endvera.mobile" ||
    android.versionCode !== 2 ||
    readyIos.bundleIdentifier !== ios.bundleIdentifier ||
    readyIos.buildNumber !== ios.buildNumber ||
    readyIos.artifact !== "IPA" ||
    readyAndroid.package !== android.package ||
    readyAndroid.versionCode !== android.versionCode ||
    readyAndroid.artifact !== "AAB"
  ) throw new Error("MOBILE_BUILD_IDENTITY_MISMATCH");

  const plugins = Array.isArray(expo.plugins) ? expo.plugins : [];
  const audio = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio");
  const permission = Array.isArray(audio) ? record(audio[1], "MOBILE_BUILD_PERMISSION_MISMATCH").microphonePermission : undefined;
  if (typeof permission !== "string" || !permission.includes("ENDVERA") || !permission.includes("note vocale")) throw new Error("MOBILE_BUILD_PERMISSION_MISMATCH");
  const contacts = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-contacts");
  const contactsPermission = Array.isArray(contacts) ? record(contacts[1], "MOBILE_BUILD_PERMISSION_MISMATCH").contactsPermission : undefined;
  const calendar = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-calendar");
  const calendarPlugin = Array.isArray(calendar) ? record(calendar[1], "MOBILE_BUILD_PERMISSION_MISMATCH") : {};
  if (typeof contactsPermission !== "string" || !contactsPermission.includes("ENDVERA") || typeof calendarPlugin.calendarPermission !== "string" || !calendarPlugin.calendarPermission.includes("ENDVERA")) throw new Error("MOBILE_BUILD_PERMISSION_MISMATCH");
  const blocked = Array.isArray(android.blockedPermissions) ? android.blockedPermissions : [];
  for (const forbidden of ["android.permission.READ_SMS", "android.permission.WRITE_SMS", "android.permission.READ_CALL_LOG", "android.permission.WRITE_CALL_LOG", "android.permission.WRITE_CONTACTS"]) {
    if (!blocked.includes(forbidden)) throw new Error("MOBILE_BUILD_FORBIDDEN_PERMISSION_MISSING");
  }
}

function assertReadiness(readiness: JsonRecord) {
  if (
    readiness.schemaVersion !== 1 ||
    readiness.status !== "READY_FOR_SIGNING_AUTHORITY" ||
    readiness.configPath !== "apps/mobile/eas.json" ||
    JSON.stringify(readiness.profiles) !== JSON.stringify(expectedMobileBuildProfiles) ||
    readiness.signed !== false ||
    readiness.uploaded !== false ||
    readiness.submitted !== false ||
    readiness.published !== false ||
    readiness.deployed !== false ||
    readiness.providerObserved !== false ||
    readiness.externalEffectCount !== 0
  ) throw new Error("MOBILE_BUILD_CLAIM_INFLATION_REFUSED");

  const inputs = readiness.requiredExternalInputs;
  if (!Array.isArray(inputs) || inputs.length !== 6) throw new Error("MOBILE_BUILD_EXTERNAL_INPUTS_INCOMPLETE");
  for (const input of inputs) {
    const item = record(input, "MOBILE_BUILD_EXTERNAL_INPUTS_INCOMPLETE");
    exactKeys(item, ["code", "evidenceRequired", "ownerClass"], "MOBILE_BUILD_EXTERNAL_INPUTS_INCOMPLETE");
    if (![item.code, item.evidenceRequired, item.ownerClass].every((entry) => typeof entry === "string" && entry.length > 0)) throw new Error("MOBILE_BUILD_EXTERNAL_INPUTS_INCOMPLETE");
  }
}

export function validateCredentialFreeMobileBuild(input: {
  appConfig: unknown;
  easConfig: unknown;
  readiness: unknown;
}) {
  const appConfig = record(input.appConfig, "MOBILE_BUILD_IDENTITY_MISMATCH");
  const easConfig = record(input.easConfig, "MOBILE_BUILD_ROOT_CONTRACT_MISMATCH");
  const readiness = record(input.readiness, "MOBILE_BUILD_CLAIM_INFLATION_REFUSED");
  assertNoValueMaterial(easConfig);
  assertBuildProfiles(easConfig);
  assertIdentity(appConfig, readiness);
  assertReadiness(readiness);
  return {
    status: "READY_FOR_SIGNING_AUTHORITY" as const,
    appName: "ENDVERA",
    profiles: [...expectedMobileBuildProfiles],
    ios: { bundleIdentifier: "ai.endvera.mobile", buildNumber: "1", artifact: "IPA" as const },
    android: { package: "ai.endvera.mobile", versionCode: 2, artifact: "AAB" as const },
    signed: false,
    uploaded: false,
    submitted: false,
    externalEffectCount: 0,
  };
}
