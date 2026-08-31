import { z } from "zod";

export const R3_REFERENCE_NOW = "2026-08-31T13:00:00.000Z";
export const R3_MESSAGES = {
  clearAppointment: "Rendez-vous avec Marc mardi à 14 h pour Laval.",
  ambiguousAppointment: "Rendez-vous avec Marc mardi à 2 pour Laval.",
  tomorrowQuery: "Qu’est-ce que j’ai demain?",
  inbound: "Le matériel de Laval est prêt pour mardi.",
  outbound: "Texte Marc que je serai 30 minutes en retard.",
} as const;

export const FOUNDER_RETEST_STEPS = [
  { number: 1, title: "Rendez-vous clair", message: R3_MESSAGES.clearAppointment, button: "Envoyer" },
  { number: 2, title: "Heure ambiguë", message: R3_MESSAGES.ambiguousAppointment, button: "Envoyer" },
  { number: 3, title: "Question sur demain", message: R3_MESSAGES.tomorrowQuery, button: "Demander" },
  { number: 4, title: "Premier SMS simulé", message: R3_MESSAGES.inbound, button: "Injecter localement" },
  { number: 5, title: "Duplicate", message: "ENDVERA réutilise automatiquement le même événement.", button: "Tester le duplicate" },
  { number: 6, title: "Demande sortante", message: R3_MESSAGES.outbound, button: "Préparer le message" },
  { number: 7, title: "Inspection et première approbation", message: "Vérifiez Marc, SMS simulé et le texte avant d’approuver.", button: "Approuver localement" },
  { number: 8, title: "Deuxième approbation", message: "ENDVERA retente exactement la même version.", button: "Tenter une seconde approbation" },
  { number: 9, title: "Cohérence finale", message: "ENDVERA recalcule Projects, Calendar et Inbox depuis PostgreSQL.", button: "Vérifier le dossier final" },
] as const;

export const founderAnswersSchema = z
  .object({
    clarificationUnderstandabilityRating: z.coerce.number().int().min(1).max(5),
    approvalComprehensionRating: z.coerce.number().int().min(1).max(5),
    actionabilityRating: z.coerce.number().int().min(1).max(5),
    founderCorrectionCount: z.coerce.number().int().min(0).max(100),
    nextDecisionIdentified: z.enum(["yes", "no"]).transform((value) => value === "yes"),
    manualContextRestatementCount: z.coerce.number().int().min(0).max(100),
    comment: z.string().trim().max(1_000).optional().default(""),
  })
  .strict();

export type FounderAnswers = z.infer<typeof founderAnswersSchema>;

export type RetestProjection = {
  workspaceName: string;
  projectCode: string;
  projectName: string;
  contactName: string;
  contactRole: string;
  appointmentCount: number;
  appointmentLabel: string | null;
  inboundCanonicalCount: number;
  duplicateCanonicalEffectCount: number;
  outboundPreparedCount: number;
  simulatedDeliveryCount: number;
  externalTransportCount: number;
  projectionsAgree: boolean;
  outboundPreview: null | {
    recipientName: string;
    channel: "SMS simulé";
    body: string;
    projectName: string;
    status: "PREPARED_UNSENT" | "SIMULATED_DELIVERED";
  };
};

export type RetestActionState = {
  ok: boolean;
  currentStep: number;
  message: string;
  resultCode: string;
  startedAtUtc: string | null;
  projection: RetestProjection | null;
  sealedVerdict?: "FOUNDER_OWNED_CORRECTED_CONSTRUCTION_LOOP_OBSERVED_PASS" | "REWORK" | "REJECT";
};

export const INITIAL_RETEST_ACTION_STATE: RetestActionState = {
  ok: true,
  currentStep: 1,
  message: "Le dossier synthétique Laval sera créé à votre première action.",
  resultCode: "READY",
  startedAtUtc: null,
  projection: null,
};
