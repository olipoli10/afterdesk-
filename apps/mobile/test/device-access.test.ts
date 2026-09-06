import { describe, expect, it } from "vitest";
import { normalizeDevicePermission } from "../src/lib/device-access";

describe("founder device access", () => {
  it("normalizes native grants without disclosing values", () => {
    expect(normalizeDevicePermission("CONTACTS", { status: "granted", granted: true, canAskAgain: true })).toEqual({
      resource: "CONTACTS",
      status: "GRANTED",
      canAskAgain: true,
      valuesDisclosed: false,
    });
  });

  it("keeps denied, undetermined and unavailable states distinct", () => {
    expect(normalizeDevicePermission("CALENDAR", { status: "undetermined", granted: false, canAskAgain: true }).status).toBe("UNDETERMINED");
    expect(normalizeDevicePermission("CALENDAR", { status: "denied", granted: false, canAskAgain: false }).status).toBe("DENIED");
    expect(normalizeDevicePermission("CALENDAR", null).status).toBe("UNAVAILABLE");
  });
});
