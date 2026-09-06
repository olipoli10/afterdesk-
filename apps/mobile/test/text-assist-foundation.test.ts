import { describe, expect, it } from "vitest";
import { TEXT_ASSIST_FOUNDATION } from "../src/lib/text-assist-foundation";

describe("mobile TextAssist foundation", () => {
  it("makes the assistant the product entry and keeps the dedicated number honest", () => {
    expect(TEXT_ASSIST_FOUNDATION.productMode).toBe("ASSISTANT_FIRST");
    expect(TEXT_ASSIST_FOUNDATION.sms).toMatchObject({ readiness: "Numéro réel à provisionner", number: null, providerCandidate: "TWILIO", smsVerified: false, voiceVerified: false });
    expect(TEXT_ASSIST_FOUNDATION.sms.devicePermissions).toEqual([]);
    expect(TEXT_ASSIST_FOUNDATION.actions).toEqual({
      assistant: { label: "Parler à ENDVERA maintenant", route: "/assistant" },
      permissions: { label: "Connecter mon téléphone", route: "/device-access" },
    });
    expect(TEXT_ASSIST_FOUNDATION.externalTransportPerformed).toBe(false);
  });

  it("requests protected resources progressively without SMS or call-log surveillance", () => {
    expect(TEXT_ASSIST_FOUNDATION.permissions.map((item) => item.key)).toEqual(["CALENDAR", "CONTACTS", "MICROPHONE", "FILES", "NOTIFICATIONS"]);
    expect(TEXT_ASSIST_FOUNDATION.forbiddenDevicePermissions).toEqual(["READ_SMS", "WRITE_SMS", "READ_CALL_LOG", "WRITE_CALL_LOG"]);
  });

  it("keeps the model gateway server-only and disabled", () => {
    expect(TEXT_ASSIST_FOUNDATION.gateway).toMatchObject({ candidate: "OpenRouter", readiness: "Désactivé dans cette version locale", secretLocation: "SERVER_ONLY" });
  });
});
