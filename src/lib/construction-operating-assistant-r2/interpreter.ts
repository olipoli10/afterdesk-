import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { interpretConstructionMessage } from "@/lib/construction-assistant-v1/interpreter";
import {
  operatingInterpretationSchema,
  type OperatingInterpretation,
  type OperatingInterpreterContext,
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

function nextWeekday(referenceNow: string, timezone: string, targetDay: number): Date {
  const zoned = toZonedTime(new Date(referenceNow), timezone);
  let delta = (targetDay - zoned.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(zoned, delta);
}

function utcFor(day: Date, hour: number, minute: number, timezone: string): Date {
  const localIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  return fromZonedTime(localIso, timezone);
}

function mentions<T extends { id: string }>(
  text: string,
  values: T[],
  labels: (value: T) => string[],
): T[] {
  const normalized = normalize(text);
  return values.filter((value) =>
    labels(value).some((label) => {
      const candidate = normalize(label);
      if (!candidate) return false;
      if (normalized.includes(candidate)) return true;
      return candidate
        .split(/\s+/)
        .filter((token) => token.length >= 4)
        .some((token) => new RegExp(`(^|\\W)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(normalized));
    }),
  );
}

function base(context: OperatingInterpreterContext): Omit<OperatingInterpretation, "intent"> {
  return {
    schemaVersion: 2,
    confidence: 1,
    language: context.locale.startsWith("fr") ? "fr" : "en",
    timezone: context.timezone,
    projectId: null,
    contactId: null,
    calendarItemId: null,
    startsAtUtc: null,
    endsAtUtc: null,
    dueAtUtc: null,
    title: null,
    approvalRequired: false,
    queryWindow: null,
    clarification: null,
    legacy: null,
  };
}

function clarify(
  context: OperatingInterpreterContext,
  reason: NonNullable<OperatingInterpretation["clarification"]>["reason"],
  question: string,
  candidateCount = 0,
): OperatingInterpretation {
  return operatingInterpretationSchema.parse({
    ...base(context),
    intent: "CLARIFICATION_REQUIRED",
    clarification: { reason, question, candidateCount },
  });
}

function findWeekday(text: string): string | null {
  const normalized = normalize(text);
  return Object.keys(FRENCH_WEEKDAYS).find((weekday) => normalized.includes(weekday)) ?? null;
}

function parseExplicitHour(text: string, weekday: string) {
  const normalized = normalize(text);
  const explicit = normalized.match(new RegExp(`${weekday}\\s+a\\s+(\\d{1,2})\\s*h(?:\\s*(\\d{1,2}))?`));
  const bare = normalized.match(new RegExp(`${weekday}\\s+a\\s+(\\d{1,2})(?!\\s*h)`));
  if (!explicit) return { hour: null, minute: null, ambiguous: Boolean(bare) };
  const hour = Number(explicit[1]);
  const minute = explicit[2] ? Number(explicit[2]) : 0;
  if (hour > 23 || minute > 59) return { hour: null, minute: null, ambiguous: true };
  return { hour, minute, ambiguous: false };
}

export function interpretOperatingAssistantCommand(
  rawText: string,
  context: OperatingInterpreterContext,
): OperatingInterpretation {
  const text = rawText.trim();
  const normalized = normalize(text);
  const projectMatches = mentions(text, context.projects, (project) => [project.code, project.name]);
  const contactMatches = mentions(text, context.contacts, (contact) => [contact.displayName]);

  if (/\b(briefing|resume.*journee|priorites.*journee)\b/.test(normalized)) {
    return operatingInterpretationSchema.parse({
      ...base(context),
      intent: "DAILY_BRIEFING",
      queryWindow: { kind: "TODAY" },
    });
  }

  if (/qu'est-ce que j'ai aujourd'hui|quoi.*aujourd'hui|what do i have today/.test(normalized)) {
    return operatingInterpretationSchema.parse({
      ...base(context),
      intent: "AGENDA_QUERY",
      queryWindow: { kind: "TODAY" },
    });
  }

  if (/^(rappelle-moi|rappel|remind me)/.test(normalized)) {
    if (projectMatches.length > 1) return clarify(context, "AMBIGUOUS_PROJECT", "Pour quel chantier dois-je créer ce rappel?", projectMatches.length);
    if (contactMatches.length > 1) return clarify(context, "AMBIGUOUS_CONTACT", "Quel contact dois-je utiliser?", contactMatches.length);
    const weekday = findWeekday(text);
    if (!weekday) return clarify(context, "AMBIGUOUS_DATE", "Quel jour précis dois-je utiliser pour ce rappel?");
    const parsedTime = parseExplicitHour(text, weekday);
    if (parsedTime.ambiguous) return clarify(context, "AMBIGUOUS_TIME", "Est-ce le matin ou l’après-midi?");
    if (parsedTime.hour === null || parsedTime.minute === null) {
      return clarify(context, "AMBIGUOUS_TIME", "À quelle heure exacte dois-je créer ce rappel?");
    }
    const day = nextWeekday(context.referenceNow, context.timezone, FRENCH_WEEKDAYS[weekday]);
    const dueAt = utcFor(day, parsedTime.hour, parsedTime.minute, context.timezone);
    const title = text
      .replace(/^rappelle-moi\s+/i, "")
      .replace(new RegExp(`${weekday}\\s+à\\s+\\d{1,2}\\s*h(?:\\s*\\d{1,2})?\\s*`, "i"), "")
      .replace(/^d['’]*/i, "")
      .replace(/[.]$/, "")
      .trim();
    return operatingInterpretationSchema.parse({
      ...base(context),
      intent: "REMINDER_CREATE",
      projectId: projectMatches[0]?.id ?? null,
      contactId: contactMatches[0]?.id ?? null,
      dueAtUtc: dueAt.toISOString(),
      title: title || "Rappel",
      approvalRequired: false,
    });
  }

  if (/^(deplace|deplacer|reporte|reporter)\b/.test(normalized) && /rendez-vous|meeting|appointment/.test(normalized)) {
    if (projectMatches.length > 1) return clarify(context, "AMBIGUOUS_PROJECT", "Quel chantier dois-je utiliser?", projectMatches.length);
    if (contactMatches.length > 1) return clarify(context, "AMBIGUOUS_CONTACT", "Quel contact dois-je utiliser?", contactMatches.length);
    const weekday = findWeekday(text);
    if (!weekday) return clarify(context, "AMBIGUOUS_DATE", "Quel jour porte le rendez-vous à déplacer?");
    const range = normalized.match(/\bde\s+(\d{1,2})\s*h(?:\s*(\d{1,2}))?\s+a\s+(\d{1,2})\s*h(?:\s*(\d{1,2}))?/);
    if (!range) return clarify(context, "AMBIGUOUS_TIME", "Indiquez l’ancienne et la nouvelle heure, par exemple de 14 h à 16 h.");
    const oldHour = Number(range[1]);
    const oldMinute = range[2] ? Number(range[2]) : 0;
    const newHour = Number(range[3]);
    const newMinute = range[4] ? Number(range[4]) : 0;
    if (oldHour > 23 || newHour > 23 || oldMinute > 59 || newMinute > 59) {
      return clarify(context, "AMBIGUOUS_TIME", "Quelles heures valides dois-je utiliser?");
    }
    const day = nextWeekday(context.referenceNow, context.timezone, FRENCH_WEEKDAYS[weekday]);
    const oldStart = utcFor(day, oldHour, oldMinute, context.timezone);
    const matchingItems = context.calendarItems.filter((item) => {
      if (item.status !== "scheduled") return false;
      if (projectMatches[0] && item.projectId !== projectMatches[0].id) return false;
      if (contactMatches[0] && item.contactId !== contactMatches[0].id) return false;
      return item.startsAtUtc === oldStart.toISOString();
    });
    if (matchingItems.length === 0) return clarify(context, "CALENDAR_ITEM_NOT_FOUND", "Je ne trouve aucun rendez-vous correspondant. Lequel voulez-vous déplacer?");
    if (matchingItems.length > 1) return clarify(context, "AMBIGUOUS_CALENDAR_ITEM", "Plus d’un rendez-vous correspond. Lequel voulez-vous déplacer?", matchingItems.length);
    const current = matchingItems[0];
    const startsAt = utcFor(day, newHour, newMinute, context.timezone);
    const duration = current.endsAtUtc
      ? new Date(current.endsAtUtc).getTime() - new Date(current.startsAtUtc).getTime()
      : 60 * 60 * 1000;
    return operatingInterpretationSchema.parse({
      ...base(context),
      intent: "CALENDAR_ITEM_RESCHEDULE",
      projectId: current.projectId,
      contactId: current.contactId,
      calendarItemId: current.id,
      startsAtUtc: startsAt.toISOString(),
      endsAtUtc: new Date(startsAt.getTime() + duration).toISOString(),
      title: current.title,
      approvalRequired: false,
    });
  }

  const legacy = interpretConstructionMessage(text, {
    referenceNow: context.referenceNow,
    locale: context.locale,
    timezone: context.timezone,
    projects: context.projects,
    contacts: context.contacts,
  });

  if (legacy.intent === "CALENDAR_QUERY") {
    return operatingInterpretationSchema.parse({
      ...base(context),
      intent: "AGENDA_QUERY",
      queryWindow: { kind: "TOMORROW" },
      legacy,
    });
  }

  return operatingInterpretationSchema.parse({
    ...base(context),
    intent: legacy.intent,
    confidence: legacy.confidence,
    projectId: legacy.projectId,
    contactId: legacy.contactId,
    startsAtUtc: legacy.startsAtUtc,
    endsAtUtc: legacy.endsAtUtc,
    title: legacy.title,
    approvalRequired: legacy.intent === "OUTBOUND_MESSAGE_DRAFT",
    clarification: legacy.clarification,
    legacy,
  });
}
