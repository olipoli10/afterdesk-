import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEVICE_RESOURCES, devicePermissionAction, normalizeDevicePermission } from "../src/lib/device-access";

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

  it("does not describe a selected-photo grant as unrestricted access", () => {
    expect(normalizeDevicePermission("PHOTOS", { status: "granted", granted: true, canAskAgain: true, accessPrivileges: "limited" }).status).toBe("LIMITED");
    expect(normalizeDevicePermission("PHOTOS", { status: "granted", granted: true, canAskAgain: true, accessPrivileges: "all" }).status).toBe("GRANTED");
  });

  it("offers settings for granted and blocked access without re-requesting either", () => {
    for (const status of ["GRANTED", "LIMITED"] as const) {
      expect(devicePermissionAction({ resource: "PHOTOS", status, canAskAgain: true, valuesDisclosed: false })).toBe("SETTINGS");
    }
    expect(devicePermissionAction(normalizeDevicePermission("CONTACTS", { granted: false, canAskAgain: false, status: "denied" }))).toBe("SETTINGS");
    expect(devicePermissionAction(normalizeDevicePermission("CONTACTS", { granted: false, canAskAgain: true, status: "denied" }))).toBe("REQUEST");
    expect(devicePermissionAction(normalizeDevicePermission("CAMERA", null))).toBe("UNAVAILABLE");
  });

  it("refreshes native status on return and makes revocation discoverable", () => {
    expect(screenSource).toContain('AppState.addEventListener("change"');
    expect(screenSource).toContain('state === "active"');
    expect(screenSource).toContain("Modifier ou retirer cet accès");
    expect(screenSource).toContain("calendrier de ce téléphone");
    expect(screenSource).not.toContain("Autoriser tous les accès utiles");
    expect(screenSource).toContain("await Linking.openSettings()");
  });

  it("covers every useful permission without SMS or call-log surveillance", () => {
    expect(DEVICE_RESOURCES).toEqual(["CALENDAR", "CONTACTS", "MICROPHONE", "CAMERA", "PHOTOS", "NOTIFICATIONS", "LOCATION"]);
    expect(screenSource).toContain("Tu écris au numéro ENDVERA depuis l’application Messages normale");
    expect(screenSource).toContain("Le serveur prépare une action");
    expect(screenSource).not.toContain("READ_SMS");
    expect(screenSource).not.toContain("READ_CALL_LOG");
  });

  it("contains synchronous native failures inside guarded adapters", () => {
    expect(screenSource).toContain("async function readNativePermission");
    expect(screenSource).toContain("async function askNativePermission");
    expect(screenSource.match(/catch \{/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(screenSource).not.toContain("Promise.all([Contacts.getPermissionsAsync()");
  });

  it("never leaves the permission review button silent", () => {
    expect(screenSource).toContain("Une vérification est déjà en cours. Réessaie dans un instant.");
    expect(screenSource).toContain("Android vérifie les permissions une à une…");
    expect(screenSource).toContain("Vérification terminée");
    expect(screenSource).toContain("Vérification en cours…");
    expect(screenSource).toContain("finally(() =>");
  });
});
