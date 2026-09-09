import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignedTwilioSms, verifyTwilioFormSignature } from "../src/server/personal-assistant/twilio-envelope";

const config = {
  publicUrl: "https://endvera.example/api/webhooks/twilio/sms",
  authToken: "synthetic-test-token-never-a-provider-credential",
  accountSid: `AC${"a".repeat(32)}`,
  number: "+15005550006",
  contentType: "application/x-www-form-urlencoded; charset=UTF-8",
};
const base = { AccountSid: config.accountSid, MessageSid: `SM${"b".repeat(32)}`, From: "+15005550001", To: config.number, Body: "Ajoute ça à mon agenda à 14 h + confirme.", NumMedia: "0" };
function signed(fields: Record<string, string> = base) {
  const canonical = config.publicUrl + Object.keys(fields).sort().map(key => key + fields[key]).join("");
  return { ...config, rawBody: new URLSearchParams(fields).toString(), signature: createHmac("sha1", config.authToken).update(canonical).digest("base64") };
}

describe("personal assistant signed Twilio SMS", () => {
  it("matches Twilio's published protocol test vector", () => {
    expect(verifyTwilioFormSignature({
      publicUrl: "https://example.com/myapp.php?foo=1&bar=2", authToken: "12345",
      fields: { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" },
      signature: "L/OH5YylLD5NRKLltdqwSvS0BnU=",
    })).toBe(true);
  });
  it("preserves French accents, whitespace and plus signs", () => {
    expect(parseSignedTwilioSms(signed()).body).toBe(base.Body);
  });
  it("signs future provider fields without admitting them as authority", () => {
    const a = parseSignedTwilioSms(signed());
    const b = parseSignedTwilioSms(signed({ ...base, FutureProviderField: "added", workspaceId: "attacker" }));
    expect(a).toEqual(b);
    expect(b).not.toHaveProperty("workspaceId");
  });
  it.each(["", "invalid", "a".repeat(1000)])("rejects malformed signature %s", signature => {
    expect(() => parseSignedTwilioSms({ ...signed(), signature })).toThrow("SIGNATURE_INVALID");
  });
  it("refuses altered signed text", () => {
    expect(() => parseSignedTwilioSms({ ...signed(), rawBody: new URLSearchParams({ ...base, Body: "send money" }).toString() })).toThrow("SIGNATURE_INVALID");
  });
  it("refuses URL substitution", () => {
    expect(() => parseSignedTwilioSms({ ...signed(), publicUrl: config.publicUrl + "?x=1" })).toThrow("SIGNATURE_INVALID");
  });
  it.each([{ AccountSid: `AC${"c".repeat(32)}` }, { To: "+15005550002" }])("refuses a valid signature for another destination", change => {
    expect(() => parseSignedTwilioSms(signed({ ...base, ...change }))).toThrow("DESTINATION_MISMATCH");
  });
  it("refuses repeated form fields before their interpretation", () => {
    expect(() => parseSignedTwilioSms({ ...signed(), rawBody: signed().rawBody + "&Body=another" })).toThrow("DUPLICATE_PARAMETER");
  });
  it("refuses MMS instead of dropping attachments", () => {
    expect(() => parseSignedTwilioSms(signed({ ...base, NumMedia: "1", MediaUrl0: "https://example.com/private" }))).toThrow("MEDIA_NOT_ENABLED");
  });
  it.each([{ From: "whatsapp:+15005550001" }, { MessageSid: "anything" }, { Body: "  " }])("refuses invalid message envelope", change => {
    expect(() => parseSignedTwilioSms(signed({ ...base, ...change }))).toThrow();
  });
  it("bounds input and requires the expected form type", () => {
    expect(() => parseSignedTwilioSms({ ...signed(), rawBody: "x".repeat(32769) })).toThrow("BODY_TOO_LARGE");
    expect(() => parseSignedTwilioSms({ ...signed(), contentType: "application/json" })).toThrow("UNSUPPORTED_CONTENT_TYPE");
  });
  it("refuses insecure or credential-bearing configured URLs", () => {
    for (const publicUrl of ["http://endvera.example/sms", "https://user:pass@endvera.example/sms", "https://endvera.example/sms#fragment"]) {
      expect(() => parseSignedTwilioSms({ ...signed(), publicUrl })).toThrow("CONFIGURATION_REQUIRED");
    }
  });
});
