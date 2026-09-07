import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEVICE_RESOURCES, normalizeDevicePermission } from "../src/lib/device-access";

const screenSource = readFileSync("src/app/(app)/device-access.tsx", "utf8");

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

  it("covers every useful permission without SMS or call-log surveillance", () => {
    expect(DEVICE_RESOURCES).toEqual(["CONTACTS", "CALENDAR", "MICROPHONE", "CAMERA", "PHOTOS", "NOTIFICATIONS", "LOCATION"]);
    expect(screenSource).toContain("Tu écris au numéro ENDVERA depuis l’application Messages normale");
    expect(screenSource).not.toContain("READ_SMS");
    expect(screenSource).not.toContain("READ_CALL_LOG");
  });

  it("contains synchronous native failures inside guarded adapters", () => {
    expect(screenSource).toContain("async function readNativePermission");
    expect(screenSource).toContain("async function askNativePermission");
    expect(screenSource.match(/catch \{/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(screenSource).not.toContain("Promise.all([Contacts.getPermissionsAsync()");
  });
});
