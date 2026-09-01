import { z } from "zod";

export const CONNECTOR_IDS = [
  "PORTAL",
  "SMS",
  "EMAIL",
  "VOICE",
  "GOOGLE_CALENDAR",
  "HUMAN_WORK_UNIT",
] as const;

export const connectorCapabilitySchema = z
  .object({
    id: z.enum(CONNECTOR_IDS),
    status: z.enum(["LOCAL_READY", "CONTRACT_READY", "NOT_CONFIGURED"]),
    inboundEnabled: z.boolean(),
    queryEnabled: z.boolean(),
    externalWriteEnabled: z.boolean(),
    externalTransportEnabled: z.literal(false),
    approvalRequiredForExternalWrite: z.boolean(),
    note: z.string().min(1).max(240),
  })
  .strict();

export type ConnectorCapability = z.infer<typeof connectorCapabilitySchema>;

export function connectorCapabilities(): ConnectorCapability[] {
  return [
    {
      id: "PORTAL",
      status: "LOCAL_READY",
      inboundEnabled: true,
      queryEnabled: true,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Conversation et actions internes persistantes dans ENDVERA.",
    },
    {
      id: "SMS",
      status: "LOCAL_READY",
      inboundEnabled: true,
      queryEnabled: true,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Adaptateur local provider-neutral prêt; aucun numéro ni fournisseur externe configuré.",
    },
    {
      id: "EMAIL",
      status: "CONTRACT_READY",
      inboundEnabled: false,
      queryEnabled: false,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Contrat d’enveloppe prêt; aucun compte courriel connecté.",
    },
    {
      id: "VOICE",
      status: "LOCAL_READY",
      inboundEnabled: true,
      queryEnabled: true,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Les transcriptions consenties utilisent le même moteur; téléphonie externe non configurée.",
    },
    {
      id: "GOOGLE_CALENDAR",
      status: "CONTRACT_READY",
      inboundEnabled: false,
      queryEnabled: false,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Autorité et requêtes prêtes localement; OAuth Google reste à connecter.",
    },
    {
      id: "HUMAN_WORK_UNIT",
      status: "CONTRACT_READY",
      inboundEnabled: false,
      queryEnabled: false,
      externalWriteEnabled: false,
      externalTransportEnabled: false,
      approvalRequiredForExternalWrite: true,
      note: "Le moteur de travail humain existe, mais son escalade n’est pas encore branchée à cet assistant.",
    },
  ].map((value) => connectorCapabilitySchema.parse(value));
}
