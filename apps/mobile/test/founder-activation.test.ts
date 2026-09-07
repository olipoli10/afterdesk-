import { describe, expect, it } from "vitest";
import appConfig from "../app.json";
import easConfig from "../eas.json";
import enLocale from "../locales/en.json";
import frLocale from "../locales/fr.json";
import readiness from "../../../release/endvera-construction-v1/founder-self-activation-readiness.json";
import { parseFounderActivationReadiness } from "../src/lib/founder-activation";

describe("founder self live activation boundary", () => {
  it("declares physical builds and protected native resources without claiming a live pilot", () => {
    const parsed = parseFounderActivationReadiness(readiness);
    expect(appConfig.expo.owner).toBe("endveras-team");
    expect(appConfig.expo.slug).toBe("endvera");
    expect(appConfig.expo.extra.eas.projectId).toBe("a7b2c087-f8e1-48e4-8798-f6fabefb69fe");
    expect(easConfig.build["founder-device"]).toMatchObject({
      distribution: "internal",
      ios: { simulator: false },
      android: { buildType: "apk" },
    });
    expect("withoutCredentials" in easConfig.build["founder-device"].android).toBe(false);
    expect(parsed.status).toBe("CODE_READY_EXTERNAL_SETUP_REQUIRED");
    expect(parsed.mobile).toMatchObject({ signed: true, installedOnFounderDevice: true });
    expect(parsed.devicePermissions.map((item) => item.resource)).toEqual(["CONTACTS", "CALENDAR"]);
    expect(parsed.claims).toMatchObject({ signedBuildReady: true, liveNumberReady: false, liveSelfPilotReady: false, externalTransportPerformed: false });
  });

  it("forbids personal SMS and call-log surveillance", () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(expect.arrayContaining([
      "android.permission.READ_SMS",
      "android.permission.WRITE_SMS",
      "android.permission.READ_CALL_LOG",
      "android.permission.WRITE_CALL_LOG",
    ]));
  });

  it("keeps iOS-only metadata out of Android locale resources", () => {
    for (const locale of [frLocale, enLocale]) {
      expect(Object.keys(locale).sort()).toEqual(["android", "ios"]);
      expect(locale.ios).toHaveProperty("CFBundleDisplayName", "ENDVERA");
      expect(locale.ios).toHaveProperty("NSMicrophoneUsageDescription");
      expect(locale.android).toEqual({ app_name: "ENDVERA" });
    }
  });

  it("refuses unsupported live-readiness inflation", () => {
    expect(() => parseFounderActivationReadiness({ ...readiness, mobile: { ...readiness.mobile, signed: false } })).toThrow("FOUNDER_ACTIVATION_SIGNED_BUILD_CLAIM_MISMATCH");
    expect(() => parseFounderActivationReadiness({ ...readiness, status: "LIVE_SELF_PILOT_READY", claims: { ...readiness.claims, liveSelfPilotReady: true } })).toThrow("FOUNDER_ACTIVATION_CLAIM_INFLATION_REFUSED");
    expect(() => parseFounderActivationReadiness({ ...readiness, claims: { ...readiness.claims, providerObserved: true } })).toThrow("FOUNDER_ACTIVATION_UNOBSERVED_CLAIM_REFUSED");
  });
});
