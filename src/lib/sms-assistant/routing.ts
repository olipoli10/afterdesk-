import { z } from "zod";
import { classifyAssistantIntent } from "../construction-operating-assistant-r36a/classifier";
import { weatherQuestion } from "./weather";

export const assistantLaneSchema = z.enum([
  "CANONICAL_QUERY", "GENERAL_ANSWER", "PUBLIC_RESEARCH", "PROPERTY_RESEARCH",
  "EXTERNAL_ACTION", "PAID_OR_SENSITIVE", "HUMAN",
]);
export type AssistantLane = z.infer<typeof assistantLaneSchema>;
export const assistantRequestSchema = z.object({
  requestId: z.string().min(1).max(191), workspaceId: z.string().min(1).max(191),
  body: z.string().trim().min(1).max(10_000),
  senderVerified: z.boolean(), workspaceBound: z.boolean(),
}).strict();
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantRoute = Readonly<{
  version: 1; lane: AssistantLane | null;
  disposition: "ROUTE" | "CLARIFY" | "REFUSE";
  reason: string; citationsRequired: boolean; actionAuthority: false;
  greeting: boolean;
}>;

export function normalizeAssistantText(text: string) {
  return text.normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLowerCase()
    .replace(/[’‘]/gu, "'").replace(/\s+/gu, " ").trim();
}

/** Intent hints only. No classification can grant a tool permission, identity,
 * paid lookup, provider dispatch, or execution authority. */
export function routeSmsAssistant(value: unknown): AssistantRoute {
  const input = assistantRequestSchema.parse(value);
  const route = (lane: AssistantLane | null, reason: string,
    disposition: AssistantRoute["disposition"] = "ROUTE", greeting = false): AssistantRoute => Object.freeze({
    version: 1, lane, reason, disposition, greeting, actionAuthority: false,
    citationsRequired: lane === "PUBLIC_RESEARCH" || lane === "PROPERTY_RESEARCH",
  });
  if (!input.senderVerified) return route(null, "SENDER_NOT_VERIFIED", "REFUSE");
  if (!input.workspaceBound) return route(null, "WORKSPACE_NOT_BOUND", "REFUSE");
  const text = normalizeAssistantText(input.body);
  const legacy = classifyAssistantIntent({ message: input.body });
  if (legacy.intentClass === "RESTRICTED_PERSONAL_RESEARCH"
    || /\b(?:sk-or-v1-|api[_ -]?key|auth[_ -]?token|secret key|numero personnel|cellulaire personnel|private phone|password)\b/u.test(text)) {
    return route("PAID_OR_SENSITIVE", "SENSITIVE_INPUT_REQUIRES_LOCAL_REVIEW", "REFUSE");
  }
  if (/^(?:(?:allo|salut|bonjour|bonsoir|hey|hi|hello|coucou)(?:[\s,!?.]+(?:endvera|envera|nvera|vera))?|merci(?: beaucoup)?)[\s!?.]*$/u.test(text)) {
    return route("GENERAL_ANSWER", "GREETING", "ROUTE", true);
  }
  const action = /\b(?:texte|texter|text|envoie|envoyer|send|appelle|appeler|call|ajoute|ajouter|add|cree|creer|create|deplace|deplacer|move|modifie|modifier|planifie|schedule|annule|cancel|supprime|delete|paie|paye|pay|achete|buy|reserve|book|redige|draft)\b/u.test(text);
  const property = /\b(?:proprietaire|proprio|cadastre|cadastral|matricule foncier|zonage|zoning|terrain|lot vacant|parcel|property owner|vacant lot|assessment roll|role d'evaluation)\b/u.test(text)
    || /\blot\s+(?:[0-9]|numero|no\b)/u.test(text);
  const research = property || /\b(?:recherche|cherche|chercher|trouve|trouver|search|look up|find|verifie|qui est|actualite|actuel|actuelle|latest|current|meteo|weather|prix|price|aujourd'hui|today|internet|web)\b/u.test(text);
  if (/\b(?:registre foncier|land registry|acte de vente|deed)\b/u.test(text) && /\b(?:achete|buy|commande|order|paie|pay|obtiens|obtenir|telecharge|download)\b/u.test(text)) {
    return route("PAID_OR_SENSITIVE", "PAID_SOURCE_REQUIRES_REVIEW", "CLARIFY");
  }
  if (action && research) return route("EXTERNAL_ACTION", "RESEARCH_AND_ACTION_MUST_BE_SEPARATED", "CLARIFY");
  if (action || legacy.intentClass === "CALENDAR_OPERATION" || legacy.intentClass === "COMMUNICATION_DRAFT") {
    return route("EXTERNAL_ACTION", "PREPARE_THROUGH_EXISTING_GATEWAY");
  }
  if (property) return route("PROPERTY_RESEARCH", "PROPERTY_EVIDENCE_CHAIN");
  if (weatherQuestion(text) && !/\b(?:calendrier|agenda|calendar|horaire|schedule|chantier)\b/u.test(text)) return route("PUBLIC_RESEARCH", "CURRENT_PUBLIC_WEATHER_REQUIRED");
  if (/\b(?:parler|parle|transfere|joindre|besoin d'un|speak to|talk to)\b.*\b(?:humain|operateur|conseiller|human|operator)\b/u.test(text)) {
    return route("HUMAN", "HUMAN_EXPLICITLY_REQUESTED");
  }
  if (legacy.intentClass === "CANONICAL_STATE_QUERY" || legacy.intentClass === "DOCUMENT_UNDERSTANDING"
    || /\b(?:mon|mes|ma|notre|nos|my|our)\b.*\b(?:calendrier|agenda|horaire|chantier|projet|document|facture|calendar|schedule|project|invoice)\b/u.test(text)
    || /\b(?:qu'est-ce que j'ai|j'ai quoi|quoi.*demain)\b/u.test(text)) {
    return route("CANONICAL_QUERY", "WORKSPACE_FACTS_REQUIRED");
  }
  if (research || weatherQuestion(text)) return route("PUBLIC_RESEARCH", "CURRENT_PUBLIC_SOURCES_REQUIRED");
  return route("GENERAL_ANSWER", "CONVERSATIONAL_ANSWER");
}

export function localGreetingReply(route: AssistantRoute): string | null {
  return route.greeting && route.lane === "GENERAL_ANSWER" && route.disposition === "ROUTE"
    ? "Allô! C’est ENDVERA. Dis-moi ce dont tu as besoin. Pour une recherche sur un terrain, donne-moi l’adresse et la ville."
    : null;
}
