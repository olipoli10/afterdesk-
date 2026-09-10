import { z } from "zod";
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const personalPhoneSchema = z.object({ configured: z.boolean(), number: phone.nullable(), boundPhone: phone.nullable() }).strict();
export const personalPairingSchema = z.object({ number: phone, text: z.string().regex(/^CONNECTER ENDVERA [a-f0-9]{32}$/), expiresAt: z.string().datetime() }).strict();
export const personalOutboxSchema = z.object({ operations: z.array(z.object({ id: z.string(), kind: z.enum(["sms_outbound", "voice_outbound"]), status: z.string(), requestHash: z.string().regex(/^[a-f0-9]{64}$/), request: z.object({ to: phone, from: phone, text: z.string(), sourceOperationId: z.string().optional() }).strict(), deliveryConfirmed: z.boolean(), receiptStates: z.array(z.string()), createdAt: z.string().datetime() }).strict()) }).strict();
export type PersonalPhone = z.infer<typeof personalPhoneSchema>;
export type PersonalOutbox = z.infer<typeof personalOutboxSchema>;
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
