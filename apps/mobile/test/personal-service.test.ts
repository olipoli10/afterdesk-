import { describe, expect, it } from "vitest";
import { personalDeliveryLabel, personalPairingSmsUri } from "../src/lib/personal-service";
describe("personal SMS app safety copy", () => {
  it("opens only a validated SMS draft, not an arbitrary URL", () => {
    const pairing = { number: "+15005550006", text: `CONNECTER ENDVERA ${"a".repeat(32)}`, expiresAt: new Date(Date.now() + 600000).toISOString() };
    expect(personalPairingSmsUri(pairing)).toBe(`sms:${pairing.number}?body=${encodeURIComponent(pairing.text)}`);
    expect(() => personalPairingSmsUri({ ...pairing, number: "https://evil.example" })).toThrow();
    expect(() => personalPairingSmsUri({ ...pairing, text: "send something else" })).toThrow();
  });
  it("does not call provider acceptance delivery or a completed call understood", () => {
    const base = { id: "synthetic", kind: "sms_outbound" as const, status: "completed", requestHash: "a".repeat(64), request: { to: "+15005550001", from: "+15005550006", text: "Synthetic" }, deliveryConfirmed: false, receiptStates: [], createdAt: new Date().toISOString() };
    expect(personalDeliveryLabel(base)).toContain("livraison non confirmée");
    expect(personalDeliveryLabel({ ...base, kind: "voice_outbound", receiptStates: ["completed"] })).toContain("écoute du message non vérifiée");
  });
});
