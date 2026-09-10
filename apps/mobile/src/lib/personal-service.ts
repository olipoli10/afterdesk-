import { z } from "zod";
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const personalPhoneSchema = z.object({ configured: z.boolean(), number: phone.nullable(), boundPhone: phone.nullable() }).strict();
export const personalPairingSchema = z.object({ number: phone, text: z.string().regex(/^CONNECTER ENDVERA [a-f0-9]{32}$/), expiresAt: z.string().datetime() }).strict();
export const personalOutboxSchema = z.object({ operations: z.array(z.object({ id: z.string(), kind: z.enum(["sms_outbound", "voice_outbound"]), status: z.string(), requestHash: z.string().regex(/^[a-f0-9]{64}$/), request: z.object({ to: phone, from: phone, text: z.string(), sourceOperationId: z.string().optional() }).strict(), deliveryConfirmed: z.boolean(), receiptStates: z.array(z.string()), createdAt: z.string().datetime() }).strict()) }).strict();
export type PersonalPhone = z.infer<typeof personalPhoneSchema>;
export type PersonalOutbox = z.infer<typeof personalOutboxSchema>;
const draftPayloadSchema = z.object({ workspaceId: z.string().min(1).max(128), kind: z.enum(["sms_outbound", "voice_outbound"]), to: phone, text: z.string().min(1).max(1500) }).strict();
const draftReceiptSchema = z.object({ operationId: z.string().uuid(), requestHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.string().min(1).max(64) }).strict();
type PersonalDraftPayload = z.infer<typeof draftPayloadSchema>;
type PersonalDraftRequest = Readonly<PersonalDraftPayload & { requestId: string }>;
const draftKey = (payload: PersonalDraftPayload) => JSON.stringify([payload.workspaceId, payload.kind, payload.to, payload.text]);

/** Screen-session retry identities only. No storage of personal message contents on disk. */
export function createPersonalDraftRequests(newId: () => string) {
  const uncertain = new Map<string, PersonalDraftRequest>();
  return {
    prepare(input: PersonalDraftPayload): PersonalDraftRequest {
      const payload = draftPayloadSchema.parse(input);
      const key = draftKey(payload);
      const existing = uncertain.get(key);
      if (existing) return existing;
      // Never evict an uncertain request: losing its key could duplicate a server draft.
      if (uncertain.size >= 16) throw new Error("DRAFT_RETRY_CAPACITY_REACHED");
      const request = Object.freeze({ ...payload, requestId: z.string().uuid().parse(newId()) });
      uncertain.set(key, request);
      return request;
    },
    confirm(request: PersonalDraftRequest, rawReceipt: unknown) {
      const receipt = draftReceiptSchema.parse(rawReceipt);
      const key = draftKey(request);
      if (uncertain.get(key) !== request) throw new Error("DRAFT_CONFIRMATION_STALE");
      uncertain.delete(key);
      // This confirms only the prepare response, never approval, dispatch or delivery.
      return receipt;
    },
  };
}
export async function loadPersonalServiceState(readPhone: () => Promise<unknown>, readOutbox: () => Promise<unknown>) {
  // Independent resources: an unavailable outbox must not block phone pairing.
  // Parse inside each promise so a malformed response also clears only its own state.
  const [phoneResult, outboxResult] = await Promise.allSettled([
    Promise.resolve().then(readPhone).then(value => personalPhoneSchema.parse(value)),
    Promise.resolve().then(readOutbox).then(value => personalOutboxSchema.parse(value)),
  ]);
  return {
    phone: phoneResult.status === "fulfilled" ? phoneResult.value : null,
    outbox: outboxResult.status === "fulfilled" ? outboxResult.value : null,
    phoneUnavailable: phoneResult.status === "rejected",
    outboxUnavailable: outboxResult.status === "rejected",
  };
}
export function personalPairingSmsUri(value: unknown) {
  const result = personalPairingSchema.parse(value);
  if (Date.parse(result.expiresAt) <= Date.now()) throw new Error("PAIRING_EXPIRED");
  return `sms:${result.number}?body=${encodeURIComponent(result.text)}`;
}
export function personalDeliveryLabel(operation: PersonalOutbox["operations"][number]) {
  if (operation.deliveryConfirmed) return "Livraison du SMS confirmée";
  if (operation.kind === "voice_outbound" && operation.receiptStates.includes("completed")) return "Appel terminé — écoute du message non vérifiée";
  if (operation.receiptStates.some(state => ["failed", "undelivered", "busy", "no-answer", "canceled"].includes(state))) return "Envoi ou appel non abouti — consulter avant de réessayer";
  if (operation.status === "completed") return "Accepté par le fournisseur — livraison non confirmée";
  if (operation.status === "pending") return "Préparé, pas envoyé";
  if (operation.status === "approved") return "Approuvé, envoi non confirmé";
  if (operation.status === "processing") return "Envoi en cours — ne pas répéter";
  if (operation.status === "uncertain") return "Résultat incertain — aucune relance automatique";
  return "Refusé ou accès retiré";
}
