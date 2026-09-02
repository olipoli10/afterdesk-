import { z } from "zod";
import { COMMERCIAL_FEATURE_KEYS } from "@/lib/construction-operating-assistant-r34/registry";

const publicCapabilityStatusSchema = z.enum(["AVAILABLE_LOCAL", "PREPARED_PROVIDER_DISABLED"]);
export const publicConstructionOfferSchema = z.object({
  schemaVersion: z.literal(1),
  locale: z.enum(["fr-CA", "en-CA"]),
  stage: z.literal("LOCAL_BUILD"),
  headline: z.string().min(1).max(180),
  promise: z.string().min(1).max(500),
  capabilities: z.array(z.object({
    code: z.enum(COMMERCIAL_FEATURE_KEYS),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(400),
    status: publicCapabilityStatusSchema,
  }).strict()).length(COMMERCIAL_FEATURE_KEYS.length),
  unavailable: z.array(z.string().min(1).max(200)).min(1),
  priceState: z.literal("PRICE_NOT_SET"),
  providerObserved: z.literal(false),
  customerProofAvailable: z.literal(false),
  productMarketFitProven: z.literal(false),
  mobileStoreAvailable: z.literal(false),
}).strict();

const capabilities = {
  "fr-CA": {
    PERSISTENT_PROJECT_MEMORY: ["Mémoire de chantier", "Les faits, décisions et preuves restent liés au bon chantier."],
    SCHEDULE_AND_FOLLOW_UP: ["Planification et suivis", "ENDVERA maintient les rendez-vous, responsabilités et suivis préparés."],
    EVIDENCE_AND_INVOICE_READINESS: ["Dossiers prêts à facturer", "Les preuves manquantes et contradictions demeurent visibles avant la facturation."],
    PREPARED_COMMUNICATIONS: ["Communications préparées", "Le destinataire, le canal et le texte sont visibles avant toute approbation."],
    HUMAN_EXCEPTION_ROUTING: ["Appui humain borné", "Une exception peut être structurée pour intervention humaine et reprise exacte."],
    ROLE_SAFE_COCKPIT: ["Cockpit selon le rôle", "Le propriétaire, le bureau et le chantier voient seulement ce qui leur est permis."],
  },
  "en-CA": {
    PERSISTENT_PROJECT_MEMORY: ["Persistent project memory", "Facts, decisions and evidence remain attached to the right project."],
    SCHEDULE_AND_FOLLOW_UP: ["Scheduling and follow-up", "ENDVERA maintains appointments, ownership and prepared follow-ups."],
    EVIDENCE_AND_INVOICE_READINESS: ["Invoice-ready files", "Missing evidence and contradictions stay visible before invoicing."],
    PREPARED_COMMUNICATIONS: ["Prepared communications", "Recipient, channel and exact text are visible before approval."],
    HUMAN_EXCEPTION_ROUTING: ["Bounded human support", "An exception can be structured for human work and exact workflow resume."],
    ROLE_SAFE_COCKPIT: ["Role-safe cockpit", "Owners, office staff and field teams see only what they are allowed to see."],
  },
} as const;

export function publicConstructionOffer(locale: "fr-CA" | "en-CA") {
  const french = locale === "fr-CA";
  return publicConstructionOfferSchema.parse({
    schemaVersion: 1,
    locale,
    stage: "LOCAL_BUILD",
    headline: french ? "L’assistant opérationnel des entrepreneurs." : "The operating assistant for contractors.",
    promise: french
      ? "Parlez à ENDVERA. Le système garde l’état du chantier, prépare le prochain travail et vous montre ce qui demande une décision."
      : "Talk to ENDVERA. The system maintains project state, prepares the next work and shows what needs a decision.",
    capabilities: COMMERCIAL_FEATURE_KEYS.map((code) => ({
      code,
      title: capabilities[locale][code][0],
      body: capabilities[locale][code][1],
      status: "AVAILABLE_LOCAL" as const,
    })),
    unavailable: french
      ? ["Les connecteurs réels, la facturation et les applications publiées ne sont pas encore activés."]
      : ["Live connectors, billing and published mobile applications are not enabled yet."],
    priceState: "PRICE_NOT_SET",
    providerObserved: false,
    customerProofAvailable: false,
    productMarketFitProven: false,
    mobileStoreAvailable: false,
  });
}
