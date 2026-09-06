import { describe, expect, it } from "vitest";
import appConfig from "../app.json";
import easConfig from "../eas.json";
import readiness from "../../../release/endvera-construction-v1/founder-self-activation-readiness.json";
import { parseFounderActivationReadiness } from "../src/lib/founder-activation";

describe("founder self live activation boundary", () => {
  it("declares physical builds and protected native resources without claiming a live pilot", () => {
    const parsed = parseFounderActivationReadiness(readiness);
    expect(easConfig.build["founder-device"]).toMatchObject({
      distribution: "internal",
      ios: { simulator: false },
      android: { buildType: "apk" },
    });
    expect("withoutCredentials" in easConfig.build["founder-device"].android).toBe(false);
    expect(parsed.status).toBe("CODE_READY_EXTERNAL_SETUP_REQUIRED");
    expect(parsed.devicePermissions.map((item) => item.resource)).toEqual(["CONTACTS", "CALENDAR"]);
    expect(parsed.claims).toMatchObject({ signedBuildReady: false, liveNumberReady: false, liveSelfPilotReady: false, externalTransportPerformed: false });
  });

  it("forbids personal SMS, call-log and contact-write permissions", () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(expect.arrayContaining([
      "android.permission.READ_SMS",
      "android.permission.WRITE_SMS",
      "android.permission.READ_CALL_LOG",
      "android.permission.WRITE_CALL_LOG",
      "android.permission.WRITE_CONTACTS",
    ]));
  });

  it("refuses unsupported live-readiness inflation", () => {
    expect(() => parseFounderActivationReadiness({ ...readiness, status: "LIVE_SELF_PILOT_READY", claims: { ...readiness.claims, liveSelfPilotReady: true } })).toThrow("FOUNDER_ACTIVATION_CLAIM_INFLATION_REFUSED");
    expect(() => parseFounderActivationReadiness({ ...readiness, claims: { ...readiness.claims, providerObserved: true } })).toThrow("FOUNDER_ACTIVATION_UNOBSERVED_CLAIM_REFUSED");
  });
});
