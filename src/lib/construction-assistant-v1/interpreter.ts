import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  constructionInterpretationSchema,
  type ConstructionInterpretation,
  type InterpreterContext,
} from "./contracts";

const FRENCH_WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchingProjects(text: string, context: InterpreterContext) {
  const normalized = normalize(text);
  return context.projects.filter((project) => {
    const code = normalize(project.code);
    const name = normalize(project.name);
    return normalized.includes(name) || new RegExp(`(^|\\W)${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(normalized);
  });
}

function matchingContacts(text: string, context: InterpreterContext) {
  const normalized = normalize(text);
  return context.contacts.filter((contact) => normalized.includes(normalize(contact.displayName)));
}

function clarification(
  context: InterpreterContext,
  reason: NonNullable<ConstructionInterpretation["clarification"]>["reason"],
  question: string,
  candidateCount = 0,
): ConstructionInterpretation {
  return constructionInterpretationSchema.parse({
    schemaVersion: 1,
    intent: "CLARIFICATION_REQUIRED",
    confidence: 1,
    language: context.locale.startsWith("fr") ? "fr" : "en",
    projectId: null,
    contactId: null,
    originalDatePhrase: null,
    startsAtUtc: null,
    endsAtUtc: null,
    timezone: context.timezone,
    title: null,
    clarification: { reason, question, candidateCount },
    queryWindow: null,
    outboundDraft: null,
  });
}

function base(context: InterpreterContext): Omit<ConstructionInterpretation, "intent"> {
  return {
    schemaVersion: 1,
    confidence: 1,
    language: context.locale.startsWith("fr") ? "fr" : "en",
    projectId: null,
    contactId: null,
    originalDatePhrase: null,
    startsAtUtc: null,
    endsAtUtc: null,
    timezone: context.timezone,
    title: null,
    clarification: null,
    queryWindow: null,
    outboundDraft: null,
  };
}

function nextWeekday(referenceNow: string, timezone: string, targetDay: number): Date {
  const zoned = toZonedTime(new Date(referenceNow), timezone);
  const currentDay = zoned.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(zoned, delta);
}

function parseFrenchAppointment(
  text: string,
  context: InterpreterContext,
  projectId: string,
  contactId: string,
  contactName: string,
): ConstructionInterpretation {
  const normalized = normalize(text);
  const weekday = Object.keys(FRENCH_WEEKDAYS).find((day) => normalized.includes(day));
  if (!weekday) {
    return clarification(context, "AMBIGUOUS_DATE", "Quel jour précis dois-je inscrire?");
  }

  const explicit24h = normalized.match(new RegExp(`${weekday}\\s+a\\s+(\\d{1,2})\\s*h(?:\\s*(\\d{1,2}))?`));
  const bareHour = normalized.match(new RegExp(`${weekday}\\s+a\\s+(\\d{1,2})(?!\\s*h)`));
  if (!explicit24h && bareHour) {
    return clarification(context, "AMBIGUOUS_TIME", "Est-ce 2 h ou 14 h?", 0);
  }
  if (!explicit24h) {
    return clarification(context, "AMBIGUOUS_TIME", "À quelle heure exacte est le rendez-vous?", 0);
  }

  const hour = Number(explicit24h[1]);
  const minute = explicit24h[2] ? Number(explicit24h[2]) : 0;
  if (hour > 23 || minute > 59) {
    return clarification(context, "AMBIGUOUS_TIME", "Quelle heure valide dois-je inscrire?", 0);
  }

  const day = nextWeekday(context.referenceNow, context.timezone, FRENCH_WEEKDAYS[weekday]);
  const localIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const startsAt = fromZonedTime(localIso, context.timezone);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const originalDatePhrase =
    text.match(new RegExp(`${weekday}\\s+à\\s+${explicit24h[1]}\\s*h(?:\\s*${explicit24h[2] ?? ""})?`, "i"))?.[0].replace(/\s+/g, " ").trim() ??
    explicit24h[0].replace(/\s+/g, " ");

  return constructionInterpretationSchema.parse({
    ...base(context),
    intent: "CALENDAR_ITEM_CREATE",
    projectId,
    contactId,
    originalDatePhrase,
    startsAtUtc: startsAt.toISOString(),
    endsAtUtc: endsAt.toISOString(),
    title: `Rendez-vous avec ${contactName}`,
  });
}

export function interpretConstructionMessage(
  rawText: string,
  context: InterpreterContext,
): ConstructionInterpretation {
  const text = rawText.trim();
  const normalized = normalize(text);

  if (/qu'est-ce que j'ai demain|quoi.*demain|what do i have tomorrow/.test(normalized)) {
    return constructionInterpretationSchema.parse({
      ...base(context),
      intent: "CALENDAR_QUERY",
      queryWindow: { kind: "TOMORROW" },
    });
  }

  const projects = matchingProjects(text, context);
  const contacts = matchingContacts(text, context);

  if (/^(texte|text|envoie un texto)/.test(normalized)) {
    if (contacts.length === 0) return clarification(context, "CONTACT_NOT_FOUND", "À quel contact dois-je préparer le message?");
    if (contacts.length > 1) return clarification(context, "AMBIGUOUS_CONTACT", "Quel Marc voulez-vous joindre?", contacts.length);
    const split = text.match(/\bque\b\s+(.+)$/i);
    const body = split?.[1]?.trim();
    if (!body) return clarification(context, "UNSUPPORTED_REQUEST", "Quel message exact voulez-vous préparer?");
    return constructionInterpretationSchema.parse({
      ...base(context),
      intent: "OUTBOUND_MESSAGE_DRAFT",
      contactId: contacts[0].id,
      outboundDraft: { body, channel: "SMS", sendAuthorized: false },
    });
  }

  if (/rendez-vous|meeting|appointment/.test(normalized)) {
    if (projects.length === 0) return clarification(context, "PROJECT_NOT_FOUND", "Pour quel chantier est ce rendez-vous?");
    if (projects.length > 1) return clarification(context, "AMBIGUOUS_PROJECT", "Quel chantier dois-je utiliser?", projects.length);
    if (contacts.length === 0) return clarification(context, "CONTACT_NOT_FOUND", "Avec quel contact est le rendez-vous?");
    if (contacts.length > 1) return clarification(context, "AMBIGUOUS_CONTACT", "Quel Marc voulez-vous utiliser?", contacts.length);
    return parseFrenchAppointment(text, context, projects[0].id, contacts[0].id, contacts[0].displayName);
  }

  return constructionInterpretationSchema.parse({
    ...base(context),
    intent: "UNSUPPORTED",
    confidence: 0,
    clarification: {
      reason: "UNSUPPORTED_REQUEST",
      question: "Je peux gérer un rendez-vous, votre agenda de demain ou préparer un message.",
      candidateCount: 0,
    },
  });
}
