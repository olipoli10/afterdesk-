import * as Calendar from "expo-calendar";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { personalDeviceStatusSchema, type DevicePermissionSnapshot } from "@/lib/personal-device-bridge";

const IDENTITY_KEY = "endvera.device.identity.v1";
const CALENDAR_KEY = "endvera.device.calendar.v1";
const JOURNAL_KEY = "endvera.device.calendar.receipt.v1";

const identitySchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1).max(191),
  deviceId: z.string().uuid(),
  deviceSecret: z.string().regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/),
}).strict();

const selectedCalendarSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(512),
  title: z.string().min(1).max(240),
  ownerAccount: z.string().max(320).nullable(),
}).strict();

const journalSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1).max(191),
  directiveId: z.string().min(1).max(191),
  expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/),
  receiptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  phase: z.enum(["CLAIMED", "NATIVE_APPLIED", "UNCERTAIN"]),
  nativeEventId: z.string().min(1).max(512).nullable(),
  reason: z.enum(["NATIVE_RESULT_UNKNOWN", "RECEIPT_RECOVERY_REQUIRED"]).nullable(),
}).strict();

export type WritableDeviceCalendar = z.infer<typeof selectedCalendarSchema>;
export type DeviceBridgeOutcome = {
  state: "IDLE" | "REGISTERED" | "COMPLETED" | "UNCERTAIN" | "OFFLINE" | "REFUSED";
  detail: string;
  at: string;
};

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const api = new MobileApi({
  browserManagedCredentials: Platform.OS === "web",
  getCookie: () => {
    try { return typeof authClient.getCookie === "function" ? authClient.getCookie() : ""; }
    catch { return ""; }
  },
});
let runPromise: Promise<DeviceBridgeOutcome> | null = null;

async function ensureNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("endvera-actions", {
    name: "Actions ENDVERA",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#C97B39",
    sound: "default",
  });
}

function randomToken() {
  const bytes = Crypto.getRandomBytes(43);
  let token = "";
  for (const byte of bytes) token += alphabet[byte & 63];
  return token;
}

async function readSecure<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try { return schema.parse(JSON.parse(raw)); }
  catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}

async function writeSecure(key: string, value: unknown) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function listWritableDeviceCalendars(): Promise<WritableDeviceCalendar[]> {
  if (Platform.OS !== "android") return [];
  const permission = await Calendar.getCalendarPermissions(false);
  if (permission.status !== "granted") return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.allowsModifications && calendar.isVisible !== false)
    .sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
      || left.title.localeCompare(right.title))
    .map((calendar) => selectedCalendarSchema.parse({
      schemaVersion: 1,
      id: calendar.id,
      title: calendar.title,
      ownerAccount: calendar.ownerAccount ?? null,
    }));
}

export async function loadSelectedDeviceCalendar() {
  return readSecure(CALENDAR_KEY, selectedCalendarSchema);
}

export async function selectWritableDeviceCalendar(calendar: WritableDeviceCalendar | null) {
  if (!calendar) {
    await SecureStore.deleteItemAsync(CALENDAR_KEY);
    return;
  }
  await writeSecure(CALENDAR_KEY, selectedCalendarSchema.parse(calendar));
}

async function permissionSnapshot(selected: WritableDeviceCalendar | null): Promise<DevicePermissionSnapshot> {
  const [calendar, notifications] = await Promise.all([
    Calendar.getCalendarPermissions(false).catch(() => null),
    Notifications.getPermissionsAsync().catch(() => null),
  ]);
  const normalize = (status: string | undefined): DevicePermissionSnapshot["calendar"] => {
    if (status === "granted") return "GRANTED";
    if (status === "denied") return "DENIED";
    if (status === "undetermined") return "UNDETERMINED";
    return "UNAVAILABLE";
  };
  return {
    calendar: normalize(calendar?.status),
    notifications: normalize(notifications?.status),
    selectedWritableCalendar: Boolean(selected && calendar?.status === "granted"),
  };
}

async function expoPushToken(snapshot: DevicePermissionSnapshot) {
  if (snapshot.notifications !== "GRANTED" || Platform.OS !== "android") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId) return null;
  try {
    await ensureNotificationChannel();
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  catch { return null; }
}

export async function registerThisAndroidDevice(workspaceId: string) {
  if (Platform.OS !== "android") throw new Error("DEVICE_BRIDGE_ANDROID_ONLY");
  const selected = await loadSelectedDeviceCalendar();
  const existing = await readSecure(IDENTITY_KEY, identitySchema);
  const identity = existing?.workspaceId === workspaceId ? existing : identitySchema.parse({
    schemaVersion: 1,
    workspaceId,
    deviceId: Crypto.randomUUID(),
    deviceSecret: `${randomToken()}.${randomToken()}`,
  });
  const permissions = await permissionSnapshot(selected);
  const status = await api.registerPersonalDevice({
    schemaVersion: 1,
    action: existing?.workspaceId === workspaceId ? "REFRESH" : "REGISTER",
    workspaceId,
    deviceId: identity.deviceId,
    deviceSecret: identity.deviceSecret,
    platform: "android",
    pushToken: await expoPushToken(permissions),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    permissions,
  });
  await writeSecure(IDENTITY_KEY, identity);
  return personalDeviceStatusSchema.parse(status);
}

export async function refreshLinkedAndroidDevice(workspaceId: string) {
  if (Platform.OS !== "android") return null;
  const identity = await readSecure(IDENTITY_KEY, identitySchema);
  if (!identity || identity.workspaceId !== workspaceId) return null;
  return registerThisAndroidDevice(workspaceId);
}

export async function runLinkedDeviceCalendarBridge() {
  if (Platform.OS !== "android") return null;
  const identity = await readSecure(IDENTITY_KEY, identitySchema);
  if (!identity) return null;
  return runDeviceCalendarBridge(identity.workspaceId);
}

export async function localDeviceBridgeSnapshot() {
  return {
    identity: await readSecure(IDENTITY_KEY, identitySchema),
    calendar: await loadSelectedDeviceCalendar(),
    journal: await readSecure(JOURNAL_KEY, journalSchema),
  };
}

async function recoverReceipt(identity: z.infer<typeof identitySchema>, journal: z.infer<typeof journalSchema>) {
  const receipt = journal.phase === "NATIVE_APPLIED" && journal.nativeEventId
    ? {
        schemaVersion: 1 as const, action: "RECEIPT" as const, workspaceId: journal.workspaceId,
        directiveId: journal.directiveId, expectedRequestHash: journal.expectedRequestHash,
        receiptToken: journal.receiptToken, outcome: "COMPLETED" as const, nativeEventId: journal.nativeEventId,
      }
    : {
        schemaVersion: 1 as const, action: "RECEIPT" as const, workspaceId: journal.workspaceId,
        directiveId: journal.directiveId, expectedRequestHash: journal.expectedRequestHash,
        receiptToken: journal.receiptToken, outcome: "UNCERTAIN" as const,
        reason: journal.reason ?? "RECEIPT_RECOVERY_REQUIRED" as const,
      };
  const result = await api.recordPersonalDeviceReceipt(identity.deviceId, identity.deviceSecret, receipt);
  await SecureStore.deleteItemAsync(JOURNAL_KEY);
  return result.status;
}

async function runOnce(workspaceId: string): Promise<DeviceBridgeOutcome> {
  const at = new Date().toISOString();
  if (Platform.OS !== "android") return { state: "IDLE", detail: "Pont Android non applicable.", at };
  const identity = await readSecure(IDENTITY_KEY, identitySchema);
  if (!identity || identity.workspaceId !== workspaceId) return { state: "IDLE", detail: "Téléphone non associé.", at };
  const oldJournal = await readSecure(JOURNAL_KEY, journalSchema);
  if (oldJournal) {
    try {
      const status = await recoverReceipt(identity, oldJournal);
      return { state: status === "COMPLETED" ? "COMPLETED" : "UNCERTAIN", detail: "Reçu sécurisé récupéré sans rejouer l’écriture.", at };
    } catch {
      return { state: "OFFLINE", detail: "Reçu conservé localement; aucune écriture ne sera rejouée.", at };
    }
  }
  const selected = await loadSelectedDeviceCalendar();
  if (!selected) return { state: "IDLE", detail: "Choisis un calendrier modifiable.", at };
  const permissions = await Calendar.getCalendarPermissions(false);
  if (permissions.status !== "granted") return { state: "REFUSED", detail: "Permission calendrier absente.", at };
  const calendars = await listWritableDeviceCalendars();
  if (!calendars.some((calendar) => calendar.id === selected.id)) {
    return { state: "REFUSED", detail: "Le calendrier choisi n’est plus modifiable.", at };
  }
  let status;
  try { status = await api.personalDeviceStatus(workspaceId, identity.deviceId, identity.deviceSecret); }
  catch { return { state: "OFFLINE", detail: "Serveur indisponible; aucune action exécutée.", at }; }
  const directive = status.pending[0];
  if (!directive) return { state: "IDLE", detail: "Aucune action autorisée en attente.", at };
  let claim;
  try {
    claim = await api.claimPersonalDeviceDirective(workspaceId, identity.deviceId, identity.deviceSecret, directive.directiveId, directive.requestHash);
  } catch {
    return { state: "REFUSED", detail: "La directive n’a pas pu être réclamée; aucune écriture effectuée.", at };
  }
  let journal = journalSchema.parse({
    schemaVersion: 1, workspaceId, directiveId: directive.directiveId,
    expectedRequestHash: directive.requestHash, receiptToken: claim.receiptToken,
    phase: "CLAIMED", nativeEventId: null, reason: null,
  });
  await writeSecure(JOURNAL_KEY, journal);
  try {
    const calendar = await Calendar.ExpoCalendar.get(selected.id);
    const event = await calendar.createEvent({
      title: directive.request.title,
      startDate: new Date(directive.request.startsAt),
      endDate: new Date(directive.request.endsAt),
      timeZone: directive.request.timezone,
      notes: "Ajouté par ENDVERA à ta demande SMS.",
    });
    journal = journalSchema.parse({ ...journal, phase: "NATIVE_APPLIED", nativeEventId: event.id });
  } catch {
    journal = journalSchema.parse({ ...journal, phase: "UNCERTAIN", reason: "NATIVE_RESULT_UNKNOWN" });
  }
  await writeSecure(JOURNAL_KEY, journal);
  try {
    const result = await recoverReceipt(identity, journal);
    return {
      state: result === "COMPLETED" ? "COMPLETED" : "UNCERTAIN",
      detail: result === "COMPLETED" ? "Rendez-vous ajouté et reçu confirmé." : "Résultat incertain; aucune reprise automatique.",
      at,
    };
  } catch {
    return { state: "OFFLINE", detail: "Résultat conservé; le reçu sera repris sans recréer le rendez-vous.", at };
  }
}

export function runDeviceCalendarBridge(workspaceId: string) {
  if (!runPromise) runPromise = runOnce(workspaceId).finally(() => { runPromise = null; });
  return runPromise;
}

export async function revokeThisAndroidDevice(workspaceId: string) {
  const identity = await readSecure(IDENTITY_KEY, identitySchema);
  if (!identity || identity.workspaceId !== workspaceId) return;
  await api.revokePersonalDevice(workspaceId, identity.deviceId);
  await Promise.all([
    SecureStore.deleteItemAsync(IDENTITY_KEY),
    SecureStore.deleteItemAsync(CALENDAR_KEY),
    SecureStore.deleteItemAsync(JOURNAL_KEY),
  ]);
}
