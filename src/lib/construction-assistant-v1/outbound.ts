import { sha256Canonical } from "./canonical";
import { z } from "zod";

export const boundOutboundActionSchema = z
  .object({
    workspaceId: z.string().min(1),
    actionId: z.string().min(1),
    version: z.number().int().positive(),
    contactId: z.string().min(1),
    channel: z.enum(["SMS", "EMAIL"]),
    normalizedRecipient: z.string().min(3).max(320),
    body: z.string().min(1).max(1600),
  })
  .strict();

export type BoundOutboundAction = z.infer<typeof boundOutboundActionSchema>;

export function buildActionFingerprint(action: BoundOutboundAction): string {
  return sha256Canonical(boundOutboundActionSchema.parse(action));
}

export function verifyExactApproval(
  action: BoundOutboundAction,
  approval: { version: number; fingerprint: string },
): { valid: true } | { valid: false; reason: "STALE_VERSION" | "PAYLOAD_CHANGED" } {
  if (action.version !== approval.version) return { valid: false, reason: "STALE_VERSION" };
  if (buildActionFingerprint(action) !== approval.fingerprint) {
    return { valid: false, reason: "PAYLOAD_CHANGED" };
  }
  return { valid: true };
}
