import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

export const PERSONAL_CORRELATED_CALENDAR_REQUEST_NAMESPACE = "personal-sms-correlated-calendar:v1";
const receiptIdSchema = z.string().min(1).max(191).refine(value => !value.includes("\0")
  && Buffer.from(value, "utf8").toString("utf8") === value, "RECEIPT_ID_UNICODE_INVALID");

/** Stable namespaced UUIDv8, not random, secret or authorization. Never rotate
 * this namespace to evade the permanent one-draft-per-receipt constraint. */
export function personalCorrelatedCalendarRequestId(untrustedReceiptId: unknown): string {
  const receiptId = receiptIdSchema.parse(untrustedReceiptId);
  const bytes = createHash("sha256").update(PERSONAL_CORRELATED_CALENDAR_REQUEST_NAMESPACE, "utf8")
    .update(Buffer.from([0])).update(receiptId, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
