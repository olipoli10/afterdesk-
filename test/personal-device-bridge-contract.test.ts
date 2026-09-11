import { describe, expect, it } from "vitest";
import {
  deviceCalendarDirectiveRequestSchema,
  personalDeviceCommandSchema,
  personalDeviceRegistrationSchema,
} from "@/lib/personal-device-bridge";

const registration = {
  schemaVersion: 1 as const, action: "REGISTER" as const, workspaceId: "workspace-1",
  deviceId: "018f47a8-0f12-4aa6-8000-000000000001",
  deviceSecret: `${"a".repeat(43)}.${"b".repeat(43)}`,
  platform: "android" as const, pushToken: "ExponentPushToken[synthetic]", appVersion: "0.3.0",
  permissions: { calendar: "GRANTED" as const, notifications: "GRANTED" as const, selectedWritableCalendar: true },
};

describe("personal Android device bridge contracts", () => {
  it("accepts one strict registration without exposing phone data", () => {
    expect(personalDeviceRegistrationSchema.parse(registration)).toEqual(registration);
    expect(JSON.stringify(registration)).not.toMatch(/contact|sms|call.?log/i);
  });

  it("rejects weak secrets and unknown registration fields", () => {
    expect(personalDeviceRegistrationSchema.safeParse({ ...registration, deviceSecret: "weak" }).success).toBe(false);
    expect(personalDeviceRegistrationSchema.safeParse({ ...registration, phoneContents: [] }).success).toBe(false);
  });

  it("rejects an inverted or unbound calendar directive", () => {
    const base = { schemaVersion: 1 as const, title: "Rendez-vous Marc",
      startsAt: "2026-09-12T14:00:00.000Z", endsAt: "2026-09-12T15:00:00.000Z",
      timezone: "America/Toronto", sourceOperationId: "source-1", sourceRequestHash: "a".repeat(64) };
    expect(deviceCalendarDirectiveRequestSchema.parse(base)).toEqual(base);
    expect(deviceCalendarDirectiveRequestSchema.safeParse({ ...base, endsAt: base.startsAt }).success).toBe(false);
    expect(deviceCalendarDirectiveRequestSchema.safeParse({ ...base, sourceOperationId: undefined }).success).toBe(false);
  });

  it("requires a one-use receipt token for terminal device evidence", () => {
    const receipt = { schemaVersion: 1 as const, action: "RECEIPT" as const, workspaceId: "workspace-1",
      directiveId: "directive-1", expectedRequestHash: "b".repeat(64), receiptToken: "c".repeat(43),
      outcome: "COMPLETED" as const, nativeEventId: "synthetic-native-event" };
    expect(personalDeviceCommandSchema.parse(receipt)).toEqual(receipt);
    expect(personalDeviceCommandSchema.safeParse({ ...receipt, receiptToken: undefined }).success).toBe(false);
  });
});
