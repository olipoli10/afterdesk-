import type {
  AssistantDataClass,
  AssistantIntentClass,
  AssistantPrivacyRequirement,
  AssistantRoutingRequest,
} from "./contracts";

export type AssistantIntentClassification = Readonly<{
  intentClass: AssistantIntentClass;
  inferredDataClass: AssistantDataClass;
  inferredPrivacyRequirement: AssistantPrivacyRequirement;
  subjectKind: "business" | "person" | "ambiguous" | "none";
  citationsRequired: boolean;
}>;

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

const has = (value: string, pattern: RegExp) => pattern.test(value);

export function classifyAssistantIntent(
  request: Pick<AssistantRoutingRequest, "message">,
): AssistantIntentClassification {
  const text = normalized(request.message);
  const restrictedPersonal = has(
    text,
    /\b(adresse (?:privee|personnelle|domicile)|numero d'assurance sociale|\bnas\b|social security|coordonnees bancaires|compte bancaire|mot de passe|credential|dossier medical|date de naissance|numero de carte|telephone prive)\b/u,
  );
  if (restrictedPersonal) {
    return {
      intentClass: "RESTRICTED_PERSONAL_RESEARCH",
      inferredDataClass: "restricted_sensitive",
      inferredPrivacyRequirement: "regional_zero_retention",
      subjectKind: "person",
      citationsRequired: false,
    };
  }

  const research = has(
    text,
    /\b(recherche|chercher|trouve des (?:infos|informations)|verifie|verification|reputation|qui est|enquete publique|research|look up|background public)\b/u,
  );
  const consequential = has(
    text,
    /\b(texte|text|envoie|send|ajoute|add|deplace|move|planifie|schedule|annule|cancel|approuve|approve|paie|pay)\b/u,
  );
  if (research && consequential) {
    return {
      intentClass: "MIXED_CONSEQUENTIAL",
      inferredDataClass: "business_confidential",
      inferredPrivacyRequirement: "no_training",
      subjectKind: "ambiguous",
      citationsRequired: true,
    };
  }

  if (research) {
    const explicitBusiness = has(
      text,
      /\b(entreprise|compagnie|societe|fournisseur|produit|materiau|marque|contracteur|business|company|supplier)\b/u,
    );
    const person = has(
      text,
      /\b(personne|quelqu'un|individu|professionnel|employe|monsieur|madame|qui est)\b/u,
    ) || /(?:sur|au sujet de)\s+[A-ZÀ-ÖØ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'-]+)?/u.test(request.message);
    return {
      intentClass: "PUBLIC_WEB_RESEARCH",
      inferredDataClass: person ? "personal_data" : "public",
      inferredPrivacyRequirement: person ? "zero_retention" : "standard",
      subjectKind: person ? "person" : explicitBusiness ? "business" : "ambiguous",
      citationsRequired: true,
    };
  }

  if (has(text, /\b(qu'est-ce que j'ai|quoi.*demain|etat (?:du|de mon) chantier|combien.*(?:cout|du|factur)|ou en est|what.*tomorrow|project status)\b/u)) {
    return {
      intentClass: "CANONICAL_STATE_QUERY",
      inferredDataClass: "business_confidential",
      inferredPrivacyRequirement: "no_training",
      subjectKind: "none",
      citationsRequired: false,
    };
  }

  const calendar = has(text, /\b(rendez-vous|rdv|calendrier|calendar|meeting)\b/u);
  const declarativeAppointment = has(text, /^(?:rendez-vous|rdv|meeting)\b/u);
  if (calendar && (consequential || declarativeAppointment)) {
    return {
      intentClass: "CALENDAR_OPERATION",
      inferredDataClass: "personal_data",
      inferredPrivacyRequirement: "zero_retention",
      subjectKind: "person",
      citationsRequired: false,
    };
  }

  if (has(text, /\b(texte|text|envoie (?:un )?message|send (?:a )?message|sms|courriel|email)\b/u)) {
    return {
      intentClass: "COMMUNICATION_DRAFT",
      inferredDataClass: "personal_data",
      inferredPrivacyRequirement: "zero_retention",
      subjectKind: "person",
      citationsRequired: false,
    };
  }

  if (has(text, /\b(analyse|lis|extrais|resume).*(facture|devis|photo|document|piece jointe)|\b(facture|devis|photo|document).*(analyse|extrais|resume)\b/u)) {
    return {
      intentClass: "DOCUMENT_UNDERSTANDING",
      inferredDataClass: "business_confidential",
      inferredPrivacyRequirement: "no_training",
      subjectKind: "none",
      citationsRequired: false,
    };
  }

  if (has(text, /\b(analyse|compare|raisonne|(?:fais|faire) un plan|meilleure option|strategie|optimize|reason)\b/u)) {
    return {
      intentClass: "COMPLEX_REASONING",
      inferredDataClass: "business_confidential",
      inferredPrivacyRequirement: "no_training",
      subjectKind: "none",
      citationsRequired: false,
    };
  }

  return {
    intentClass: "UNSUPPORTED",
    inferredDataClass: "business_confidential",
    inferredPrivacyRequirement: "no_training",
    subjectKind: "none",
    citationsRequired: false,
  };
}
