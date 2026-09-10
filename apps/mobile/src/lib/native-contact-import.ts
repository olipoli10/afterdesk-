import { z } from "zod";
import { mobileOnboardingCommandSchema } from "./onboarding";

const nativeDetails = z.object({
  fullName: z.string().max(160).nullable().optional(),
  phones: z.array(z.object({ number: z.string().max(80).optional() })).max(20).optional(),
  emails: z.array(z.object({ address: z.string().max(254).optional() })).max(20).optional(),
});

export function sanitizeSelectedContact(value: unknown) {
  const selected = nativeDetails.parse(value);
  // Explicit projection: no native ID, notes, images, birthdays or other fields survive.
  return Object.freeze({
    displayName: selected.fullName?.trim() ?? "",
    phones: Object.freeze([...new Set((selected.phones ?? []).map(phone => phone.number?.trim() ?? "").filter(Boolean))]),
    emails: Object.freeze([...new Set((selected.emails ?? []).map(email => email.address?.trim() ?? "").filter(Boolean))]),
  });
}
export type SelectedNativeContact = ReturnType<typeof sanitizeSelectedContact>;

type Permission = { granted: boolean; canAskAgain: boolean };
export type NativeContactBridge = {
  readPermission: () => Promise<Permission>;
  requestPermission: () => Promise<Permission>;
  pick: () => Promise<{ readFields: () => Promise<unknown> } | null>;
};

// The caller invokes this only from an explicit user gesture. No service/client,
// storage, address-book enumeration or background listener belongs in this bridge.
export async function chooseOneNativeContact(bridge: NativeContactBridge) {
  try {
    let permission = await bridge.readPermission();
    if (!permission.granted && permission.canAskAgain) permission = await bridge.requestPermission();
    if (!permission.granted) return { status: "PERMISSION_DENIED" as const, canAskAgain: permission.canAskAgain };
    const selected = await bridge.pick();
    if (!selected) return { status: "CANCELED" as const };
    return { status: "SELECTED_NOT_UPLOADED" as const, contact: sanitizeSelectedContact(await selected.readFields()) };
  } catch {
    // Native failures can contain private contact data; never surface the raw error.
    return { status: "UNAVAILABLE" as const };
  }
}

const draftSchema = z.object({
  displayName: z.string().trim().min(1).max(160), role: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(80), email: z.string().trim().max(254), projectId: z.string().max(200).optional(),
}).strict();
export type NativeContactDraft = z.infer<typeof draftSchema>;

export function prepareNativeContactImport(value: unknown, context: {
  workspaceId: string; role: string; projectIds: readonly string[]; commandId: string;
}) {
  if (context.role !== "OWNER") throw new Error("CONTACT_IMPORT_OWNER_REQUIRED");
  const draft = draftSchema.parse(value);
  const phone = draft.phone.replace(/[\s().-]/gu, "");
  const email = draft.email.toLocaleLowerCase("en-CA");
  // Never guess the country code or send ambiguous local/extension numbers.
  if (phone && !/^\+[1-9]\d{7,14}$/u.test(phone)) throw new Error("CONTACT_IMPORT_INTERNATIONAL_PHONE_REQUIRED");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("CONTACT_IMPORT_EMAIL_INVALID");
  if (!phone && !email) throw new Error("CONTACT_IMPORT_IDENTITY_REQUIRED");
  if (draft.projectId && !context.projectIds.includes(draft.projectId)) throw new Error("CONTACT_IMPORT_PROJECT_REFUSED");
  const command = mobileOnboardingCommandSchema.parse({ schemaVersion: 1, action: "CREATE_FIRST_CONTACT",
    commandId: context.commandId, workspaceId: context.workspaceId, displayName: draft.displayName, role: draft.role,
    ...(phone ? { phone } : {}), ...(email ? { email } : {}), ...(draft.projectId ? { projectId: draft.projectId } : {}),
  });
  if (command.action !== "CREATE_FIRST_CONTACT") throw new Error("CONTACT_IMPORT_COMMAND_REFUSED");
  return Object.freeze(command);
}
export type NativeContactImportCommand = ReturnType<typeof prepareNativeContactImport>;

const receiptSchema = z.object({
  schemaVersion: z.literal(1), resultType: z.literal("CONTACT"), commandId: z.string().uuid(),
  workspaceId: z.string().min(1), contactId: z.string().min(1), created: z.boolean(), replayed: z.boolean(),
  providerObserved: z.literal(false), externalEffectCount: z.literal(0),
});
export function parseContactImportReceipt(value: unknown, command: NativeContactImportCommand) {
  const result = receiptSchema.parse(value);
  if (result.commandId !== command.commandId || result.workspaceId !== command.workspaceId) throw new Error("CONTACT_IMPORT_RECEIPT_MISMATCH");
  return Object.freeze(result);
}
