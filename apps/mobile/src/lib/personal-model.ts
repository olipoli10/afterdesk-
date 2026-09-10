import { z } from "zod";
export const PERSONAL_MODEL_CONSENT_VERSION = "personal-model-consent-v1";
export const personalModelStatusSchema = z.object({ prepared: z.boolean(), credentialPrepared: z.boolean(), credentialStorageConfigured: z.boolean(),
  consentGranted: z.boolean(), configured: z.boolean(), transportConfigured: z.boolean(), readyForAdmission: z.boolean(),
  liveObserved: z.literal(false), executionAuthorized: z.literal(false), consentVersion: z.literal(PERSONAL_MODEL_CONSENT_VERSION),
}).strict().refine(value => !value.readyForAdmission || (value.prepared && value.credentialPrepared && value.credentialStorageConfigured && value.consentGranted && value.configured),
  { message: "Model readiness prerequisites are inconsistent" });
export type PersonalModelStatus = z.infer<typeof personalModelStatusSchema>;
export const personalModelPreparedSchema = z.object({ prepared: z.literal(true), executionAuthorized: z.literal(false) }).strict();
export const personalModelConsentSchema = z.object({ consentGranted: z.literal(true), executionAuthorized: z.literal(false), consentVersion: z.literal(PERSONAL_MODEL_CONSENT_VERSION) }).strict();
export const personalModelDisconnectedSchema = z.object({ disconnected: z.literal(true), providerGrantRevoked: z.literal(false) }).strict();
export function personalModelCommand(workspaceId: string, action: "PREPARE" | "CONSENT" | "DISCONNECT") {
  const validatedWorkspace = z.string().min(1).max(160).parse(workspaceId);
  if (action === "DISCONNECT") return Object.freeze({ workspaceId: validatedWorkspace });
  if (action === "PREPARE") return Object.freeze({ workspaceId: validatedWorkspace, action });
  if (action === "CONSENT") return Object.freeze({ workspaceId: validatedWorkspace, action, confirmation: PERSONAL_MODEL_CONSENT_VERSION });
  throw new Error("PERSONAL_MODEL_ACTION_INVALID");
}
export async function loadPersonalModelState(read: () => Promise<unknown>) {
  try { return { model: personalModelStatusSchema.parse(await read()), unavailable: false as const }; }
  catch { return { model: null, unavailable: true as const }; }
}
export function personalModelReadinessLabel(status: PersonalModelStatus) {
  if (!status.prepared) return "Connexion IA à préparer";
  if (!status.consentGranted) return "Ton autorisation IA est requise";
  if (!status.credentialPrepared || !status.credentialStorageConfigured) return "Clé sécurisée à configurer sur le serveur";
  if (!status.configured) return "Configuration et budget IA à vérifier sur le serveur";
  if (!status.transportConfigured) return "Prérequis en place — transport IA désactivé";
  return "Prérequis en place — fonctionnement réel à vérifier";
}
