import { describe, expect, it } from "vitest";
import { z } from "zod";
import { personalCorrelatedCalendarRequestId, PERSONAL_CORRELATED_CALENDAR_REQUEST_NAMESPACE } from "@/server/model-gateway/personal-intent/correlated-calendar-id";

describe("permanent correlated receipt calendar UUID", () => {
  it.each([
    ["receipt", "a912443d-1e19-8185-ba4d-3cbfbb315066"],
    ["reçu-🛠️", "39443e5b-2083-83d0-9043-df658dbedc20"],
    ["a".repeat(191), "b63f446c-0278-8764-815a-fffdfdd6ce61"],
  ])("pins SHA256/NUL namespace vector %s", (receipt, expected) => {
    const result = personalCorrelatedCalendarRequestId(receipt);
    expect(result).toBe(expected); expect(personalCorrelatedCalendarRequestId(receipt)).toBe(result);
    expect(z.string().uuid().parse(result)).toBe(result);
    expect(result).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
  it("does not trim, normalize, case-fold or accept parser/version options", () => {
    expect(PERSONAL_CORRELATED_CALENDAR_REQUEST_NAMESPACE).toBe("personal-sms-correlated-calendar:v1");
    expect(new Set(["receipt", "Receipt", "receipt ", "reçu", "rec\u0327u"].map(personalCorrelatedCalendarRequestId)).size).toBe(5);
    expect(() => personalCorrelatedCalendarRequestId({ receiptId: "receipt", parserVersion: 2 })).toThrow();
  });
  it.each(["", "a".repeat(192), "receipt\0other", "\ud800", "\udc00", null, undefined, 42, true, ["receipt"]])("refuses invalid id %#", value => {
    expect(() => personalCorrelatedCalendarRequestId(value)).toThrow();
  });
});
