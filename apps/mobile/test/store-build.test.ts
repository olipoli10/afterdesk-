import { describe, expect, it } from "vitest";
import appConfig from "../app.json";
import easConfig from "../eas.json";
import readiness from "../../../release/endvera-construction-v1/mobile-build-readiness.json";
import {
  expectedMobileBuildProfiles,
  validateCredentialFreeMobileBuild,
} from "../src/lib/store-build";

describe("R36G credential-free mobile build preparation", () => {
  it("binds exact local and store-candidate profiles to the canonical app identity", () => {
    const result = validateCredentialFreeMobileBuild({
      appConfig,
      easConfig,
      readiness,
    });

    expect(result).toMatchObject({
      status: "READY_FOR_SIGNING_AUTHORITY",
      appName: "ENDVERA",
      ios: { bundleIdentifier: "ai.endvera.mobile", buildNumber: "1", artifact: "IPA" },
      android: { package: "ai.endvera.mobile", versionCode: 7, artifact: "AAB" },
      signed: false,
      uploaded: false,
      submitted: false,
      externalEffectCount: 0,
    });
    expect(result.profiles).toEqual(expectedMobileBuildProfiles);
  });

  it("contains no submit section, credential value, account identity or remote update channel", () => {
    const serialized = JSON.stringify(easConfig);
    expect(easConfig).not.toHaveProperty("submit");
    expect(serialized).not.toMatch(/"(?:credentials|credentialsSource|projectId|owner|channel|environment|token|secret|password)"\s*:/iu);
    expect(serialized).not.toMatch(/eas\s+(?:build|submit|update)/iu);
    expect(easConfig.build['founder-device'].env).toEqual({ EXPO_PUBLIC_ENDVERA_API_URL: 'https://endvera-core-sandbox-afterdesk.vercel.app' });
    const withoutPublicOrigin = structuredClone(easConfig) as unknown as { build: Record<string, Record<string, unknown>> };
    delete withoutPublicOrigin.build['founder-device'].env;
    expect(JSON.stringify(withoutPublicOrigin)).not.toMatch(/https?:\/\//iu);
  });

  it("refuses build-profile, identity and readiness inflation", () => {
    expect(() => validateCredentialFreeMobileBuild({
      appConfig,
      easConfig: { ...easConfig, submit: { production: {} } },
      readiness,
    })).toThrow("MOBILE_BUILD_SUBMIT_PATH_REFUSED");

    expect(() => validateCredentialFreeMobileBuild({
      appConfig: {
        ...appConfig,
        expo: { ...appConfig.expo, ios: { ...appConfig.expo.ios, bundleIdentifier: "invalid.example" } },
      },
      easConfig,
      readiness,
    })).toThrow("MOBILE_BUILD_IDENTITY_MISMATCH");

    expect(() => validateCredentialFreeMobileBuild({
      appConfig,
      easConfig,
      readiness: { ...readiness, signed: true },
    })).toThrow("MOBILE_BUILD_CLAIM_INFLATION_REFUSED");
  });

  it("refuses hidden values and unsupported profile drift", () => {
    expect(() => validateCredentialFreeMobileBuild({
      appConfig,
      easConfig: {
        ...easConfig,
        build: {
          ...easConfig.build,
          "store-candidate": { ...easConfig.build["store-candidate"], env: { API_KEY: "not-allowed" } },
        },
      },
      readiness,
    })).toThrow("MOBILE_BUILD_VALUE_MATERIAL_REFUSED");

    expect(() => validateCredentialFreeMobileBuild({
      appConfig,
      easConfig: {
        ...easConfig,
        build: { ...easConfig.build, surprise: {} },
      },
      readiness,
    })).toThrow("MOBILE_BUILD_PROFILE_SET_MISMATCH");
  });

  it("keeps every external prerequisite explicit and value-free", () => {
    expect(readiness.requiredExternalInputs.map((item) => item.code)).toEqual([
      "EXPO_PROJECT_OWNERSHIP",
      "APPLE_DEVELOPER_MEMBERSHIP",
      "APPLE_SIGNING_CUSTODY",
      "GOOGLE_PLAY_DEVELOPER_ACCOUNT",
      "ANDROID_SIGNING_CUSTODY",
      "PUBLIC_API_ORIGIN",
    ]);
    for (const input of readiness.requiredExternalInputs) {
      expect(input).toEqual(expect.objectContaining({ evidenceRequired: expect.any(String), ownerClass: expect.any(String) }));
      expect(input).not.toHaveProperty("value");
    }
  });

  it.each(['alternate-origin', 'extra-key', 'other-profile', 'nested-env'])('rejects %s outside the one public-origin exception', kind => {
    const config = structuredClone(easConfig) as unknown as { build: Record<string, Record<string, unknown>> };
    const origin = { EXPO_PUBLIC_ENDVERA_API_URL: 'https://endvera-core-sandbox-afterdesk.vercel.app' };
    if (kind === 'alternate-origin') config.build['founder-device'].env = { EXPO_PUBLIC_ENDVERA_API_URL: origin.EXPO_PUBLIC_ENDVERA_API_URL + '/' };
    if (kind === 'extra-key') config.build['founder-device'].env = { ...origin, TOKEN: 'synthetic' };
    if (kind === 'other-profile') config.build['store-candidate'].env = origin;
    if (kind === 'nested-env') config.build['founder-device'].extra = { env: origin };
    expect(() => validateCredentialFreeMobileBuild({ appConfig, easConfig: config, readiness })).toThrow('MOBILE_BUILD_VALUE_MATERIAL_REFUSED');
  });
});
