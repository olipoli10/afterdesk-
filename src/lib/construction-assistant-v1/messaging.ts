import { createHash } from "node:crypto";
import { z } from "zod";

export const localInboundEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    provider: z.literal("ENDVERA_LOCAL_SIMULATOR"),
    providerMessageId: z.string().min(1).max(160),
    channel: z.enum(["SMS", "EMAIL"]),
    normalizedSender: z.string().min(3).max(320),
    body: z.string().min(1).max(10_000),
    receivedAt: z.string().datetime(),
    signatureValid: z.boolean(),
    projectHint: z.string().min(1).max(120).optional(),
  })
  .strict();

export type LocalInboundEnvelope = z.infer<typeof localInboundEnvelopeSchema>;

type Admission =
  | { admitted: false; reason: "SIGNATURE_INVALID" | "IDENTITY_UNVERIFIED" }
  | { admitted: true; idempotencyKey: string; envelope: LocalInboundEnvelope };

export function admitLocalEnvelope(input: {
  envelope: LocalInboundEnvelope;
  identityVerified: boolean;
}): Admission {
  const envelope = localInboundEnvelopeSchema.parse(input.envelope);
  if (!envelope.signatureValid) return { admitted: false, reason: "SIGNATURE_INVALID" };
  if (!input.identityVerified) return { admitted: false, reason: "IDENTITY_UNVERIFIED" };
  const idempotencyKey = createHash("sha256")
    .update(`${envelope.provider}\u0000${envelope.providerMessageId}`, "utf8")
    .digest("hex");
  return { admitted: true, idempotencyKey, envelope };
}
