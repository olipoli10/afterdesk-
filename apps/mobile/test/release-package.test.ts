import { describe, expect, it } from "vitest";
import appConfig from "../app.json";
import { MOBILE_RELEASE_INFO, mobileReleaseLabel } from "../src/lib/release";

describe("R35 mobile release information", () => {
  it("matches the shared iOS and Android application identities", () => {
    const expo = appConfig.expo;
    expect(MOBILE_RELEASE_INFO).toMatchObject({
      semanticVersion: expo.version,
      ios: { bundleIdentifier: expo.ios.bundleIdentifier, buildNumber: expo.ios.buildNumber },
      android: { package: expo.android.package, versionCode: expo.android.versionCode },
    });
    expect(mobileReleaseLabel("ios")).toBe("0.1.0 (1)");
    expect(mobileReleaseLabel("android")).toBe("0.1.0 (1)");
  });

  it("shows only local package readiness and no external effect", () => {
    expect(MOBILE_RELEASE_INFO).toMatchObject({ readiness: "LOCAL_PACKAGE_READY", signed: false, uploaded: false, published: false, deployed: false, providerObserved: false, externalEffectCount: 0 });
    expect(Object.values(MOBILE_RELEASE_INFO.publicPaths)).toEqual(["/privacy", "/security", "/construction/support", "/client/privacy"]);
  });
});
