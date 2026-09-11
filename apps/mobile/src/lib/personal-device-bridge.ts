import { z } from "zod";

const id = z.string().min(1).max(191).refine((value) => value.trim() === value);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const permission = z.enum(["UNDETERMINED", "DENIED", "GRANTED", "LIMITED", "UNAVAILABLE"]);

export const devicePermissionSnapshotSchema = z.object({
  calendar: permission,
  notifications: permission,
  selectedWritableCalendar: z.boolean(),
}).strict();

export const personalDeviceRegistrationSchema = z.object({
  schemaVersion: z.literal(1), action: z.enum(["REGISTER", "REFRESH"]), workspaceId: id,
  deviceId: z.string().uuid(),
  deviceSecret: z.string().regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/),
  platform: z.literal("android"), pushToken: z.string().min(1).max(512).nullable(),
  appVersion: z.string().min(1).max(40),
  permissions: devicePermissionSnapshotSchema,
}).strict();

export const deviceCalendarDirectiveRequestSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().trim().min(1).max(240),
  startsAt: instant, endsAt: instant, timezone: z.string().min(1).max(80),
  sourceOperationId: id, sourceRequestHash: hash,
}).strict().refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt));

export const personalDeviceDirectiveSchema = z.object({
  directiveId: id, requestHash: hash, expiresAt: instant,
  request: deviceCalendarDirectiveRequestSchema,
}).strict();

export const personalDeviceStatusSchema = z.object({
  schemaVersion: z.literal(1), workspaceId: id,
  status: z.enum(["NOT_LINKED", "LINKED", "REVOKED"]), platform: z.literal("android").nullable(),
  stateVersion: z.number().int().nonnegative(), pushEnabled: z.boolean(),
  calendarReadEnabled: z.boolean(), calendarWriteEnabled: z.boolean(),
  permissions: devicePermissionSnapshotSchema.nullable(), pending: z.array(personalDeviceDirectiveSchema).max(10),
  lastSeenAt: instant.nullable(),
}).strict();

export const personalDeviceClaimResultSchema = z.object({
  schemaVersion: z.literal(1), status: z.literal("CLAIMED"), directive: personalDeviceDirectiveSchema,
  receiptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), automaticRetry: z.literal(false),
}).strict();

export const personalDeviceReceiptSchema = z.discriminatedUnion("outcome", [
  z.object({ schemaVersion: z.literal(1), action: z.literal("RECEIPT"), workspaceId: id,
    directiveId: id, expectedRequestHash: hash, receiptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    outcome: z.literal("COMPLETED"), nativeEventId: z.string().min(1).max(512) }).strict(),
  z.object({ schemaVersion: z.literal(1), action: z.literal("RECEIPT"), workspaceId: id,
    directiveId: id, expectedRequestHash: hash, receiptToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    outcome: z.literal("UNCERTAIN"), reason: z.enum(["NATIVE_RESULT_UNKNOWN", "RECEIPT_RECOVERY_REQUIRED"]) }).strict(),
]);

export const personalDeviceReceiptResultSchema = z.object({
  schemaVersion: z.literal(1), directiveId: id, status: z.enum(["COMPLETED", "UNCERTAIN"]),
  automaticRetry: z.literal(false), replayed: z.boolean(),
}).strict();

export type DevicePermissionSnapshot = z.infer<typeof devicePermissionSnapshotSchema>;
export type DeviceCalendarDirective = z.infer<typeof personalDeviceDirectiveSchema>;
export type PersonalDeviceRegistration = z.infer<typeof personalDeviceRegistrationSchema>;
export type PersonalDeviceReceipt = z.infer<typeof personalDeviceReceiptSchema>;
export type PersonalDeviceStatus = z.infer<typeof personalDeviceStatusSchema>;
