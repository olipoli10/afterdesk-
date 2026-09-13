import "server-only";
import { z } from "zod";
import { inspectPersonalIntentCandidate, type PersonalIntentInput, type PersonalIntentProposal } from "./contract";

/** Closed local grammar, not a general French date parser.
 * READ: aujourd'hui / aujourd’hui / demain, optionally "pour ", "toute la
 * journée ..." or "... toute la journée". No weekday/week/month inference.
 * START: YYYY-MM-DD[T or space]HH:mm; YYYY-MM-DD à TIME;
 *        aujourd'hui/demain/ce soir à TIME; the unaccented separator "a"
 *        is also accepted for SMS dictation; demain de TIME.
 * END: same forms, or TIME on the START's explicit local date. An earlier end
 * never rolls to tomorrow. Cross-day events must name both dates explicitly.
 * TIME: two-digit HH:mm; H[h] or H[h]MM with H=0 or 13..23;
 *       1..11 h [MM] du matin; 1..6 or 12 h de l'après-midi;
 *       5..11 h du soir; midi / minuit. Contradictory dayparts clarify.
 * Bare 1..12 h is ambiguous except that "ce soir" makes 5..11 h explicitly
 * evening (17:00..23:00). An END span may instead be an explicitly cued
 * duration (for example "il dure 1 h", "pendant 30 minutes" or
 * "d'une heure"). No duration, offset, year or timezone is ever guessed.
 * Dates 2000..2100 and minute-granularity modern IANA offsets only. The offset
 * search exhausts -14:00..+14:00, refusing nonexistent or duplicate wall times.
 * Context must later come from authenticated DB state, NOT a model's fields.
 */
export const PERSONAL_TEMPORAL_GRAMMAR_VERSION = "quebec-explicit-calendar-v4";
const contextSchema = z.object({ receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).strict();
export type PersonalTemporalContext = Readonly<z.infer<typeof contextSchema>>;
type Reason = "INVALID_INPUT" | "INVALID_CONTEXT" | "UNSUPPORTED_ACTION" | "UNSUPPORTED_TEMPORAL_GRAMMAR"
  | "AMBIGUOUS_TIME" | "MISSING_END_TIME" | "INVALID_DATE" | "DST_GAP" | "DST_FOLD" | "END_NOT_AFTER_START" | "EXPLICIT_TIMEZONE_UNSUPPORTED";
const questions: Record<Reason, string> = {
  INVALID_INPUT: "La demande source n’est pas vérifiable. Vérifie la demande dans ENDVERA.",
  INVALID_CONTEXT: "Le moment de réception ou le fuseau horaire doit être vérifié dans ENDVERA.",
  UNSUPPORTED_ACTION: "Cette étape ne permet pas de résoudre cette action de calendrier.",
  UNSUPPORTED_TEMPORAL_GRAMMAR: "Précise aujourd’hui, ce soir, demain ou la date au format AAAA-MM-JJ, avec une heure au format 24 heures.",
  AMBIGUOUS_TIME: "Est-ce le matin ou l’après-midi? Précise l’heure au format 24 heures, par exemple 02:00 ou 14:00.",
  MISSING_END_TIME: "À quelle heure le rendez-vous se termine-t-il? Aucune durée par défaut n’a été ajoutée.",
  INVALID_DATE: "Cette date ou cette heure n’existe pas. Précise une date et une heure valides.",
  DST_GAP: "Cette heure locale n’existe pas à cause du changement d’heure. Choisis une autre heure.",
  DST_FOLD: "Cette heure locale se produit deux fois au changement d’heure. Choisis une heure non ambiguë.",
  END_NOT_AFTER_START: "La fin doit être après le début. Pour un autre jour, précise aussi la date de fin.",
  EXPLICIT_TIMEZONE_UNSUPPORTED: "Le fuseau horaire indiqué doit être précisé ou correspondre au fuseau du chantier. Aucun décalage n’a été deviné; vérifie le fuseau avant de préparer le rendez-vous.",
};
type CandidateClarification = Extract<PersonalIntentProposal["actions"][number], { kind: "CLARIFY" }>["reason"];
/** Fixed text selected by the strict enum, never candidate-authored questions. */
export function personalIntentClarificationQuestion(reason: CandidateClarification): string {
  const templates: Record<CandidateClarification, string> = {
    AMBIGUOUS_TIME: questions.AMBIGUOUS_TIME,
    MISSING_END_TIME: questions.MISSING_END_TIME,
    AMBIGUOUS_CONTACT: "Le destinataire doit être précisé. Ce pilote accepte seulement ton propre numéro vérifié; aucun contact n’a été choisi à ta place.",
    UNSUPPORTED_RECIPIENT: "Ce pilote accepte seulement ton propre numéro vérifié. Aucun message ou appel à un tiers n’a été préparé.",
    UNSUPPORTED_REQUEST: "Cette demande n’est pas prise en charge dans ce pilote. Précise une lecture d’agenda, un rendez-vous avec début et fin, ou un message à ton propre numéro.",
    MISSING_CONTEXT: "Il manque du contexte pour comprendre la demande. Précise l’action et ses détails; aucun ancien message n’a été associé automatiquement.",
  };
  return templates[reason] ?? templates.UNSUPPORTED_REQUEST;
}
type Failure = Readonly<{ status: "CLARIFY"; reason: Reason; question: string; executionAuthorized: false; preview: null }>;
type Success = Readonly<{
  status: "RESOLVED_NOT_AUTHORIZED"; executionAuthorized: false; preview: null;
  kind: "READ_CALENDAR" | "PREPARE_CALENDAR_EVENT";
  requestFingerprint: string; actionId: string; startsAtUtc: string; endsAtUtc: string;
  timezone: string; anchorReceivedAt: string; grammarVersion: typeof PERSONAL_TEMPORAL_GRAMMAR_VERSION;
  title?: string;
  sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_RESOLVER";
}>;
export type PersonalTemporalResult = Failure | Success;
const clarify = (reason: Reason): Failure => Object.freeze({ status: "CLARIFY", reason, question: questions[reason], executionAuthorized: false, preview: null });
type CalendarDate = { year: number; month: number; day: number };
type Wall = CalendarDate & { hour: number; minute: number };
const normalize = (value: string) => value.trim().toLowerCase().replace(/[’]/g, "'").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ");
const pad = (value: number) => String(value).padStart(2, "0");
const wallKey = (wall: Wall) => `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
const dateValid = (date: CalendarDate) => {
  const parsed = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return date.year >= 2000 && date.year <= 2100 && parsed.getUTCFullYear() === date.year
    && parsed.getUTCMonth() + 1 === date.month && parsed.getUTCDate() === date.day;
};
function formatter(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
/** Source spans alone cannot erase an explicit timezone written elsewhere.
 * Closed markers only: no city lookup, abbreviation expansion or offset guess.
 * Canonical IANA aliases may agree with the persisted zone. Everything else
 * explicitly presented as a timezone requires human clarification. */
function explicitTimezoneAgrees(source: string, timezone: string): boolean {
  const canonical = (value: string) => { try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return null; } };
  const expected = canonical(timezone);
  const same = (value: string) => canonical(value) === expected;
  const text = source.replace(/’/g, "'");
  // A numeric offset / Z suffix may not be dropped from an exact datetime span.
  if (/(?<!\d)\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:z\b|[+-]\d{2}(?::?\d{2})?\b)/i.test(text)
    || /\b(?:UTC|GMT)\s*[+-]\s*\d/i.test(text)) return false;
  const zoneToken = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+/;
  const markers = /\b(?:fuseau(?:\s+horaire)?|timezone|time\s+zone|heure\s+(?:de\s+|du\s+|d'))\s*(?::|=)?\s*/gi;
  for (const match of text.matchAll(markers)) {
    const tail = text.slice(match.index + match[0].length);
    const token = zoneToken.exec(tail)?.[0] ?? /^(?:UTC|GMT)\b/i.exec(tail)?.[0];
    if (!token || !same(token)) return false;
  }
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+\b/g)) if (!same(match[0])) return false;
  // Case-sensitive EST avoids interpreting the ordinary French verb "est".
  if (/\bEST\b/.test(text) || /\b(?:EDT|PST|PDT|CST|CDT|MST|MDT|HNE|HAE|HNP|HAP|CET|CEST)\b/i.test(text)) return false;
  for (const match of text.matchAll(/\b(?:UTC|GMT)\b/gi)) if (!same(match[0])) return false;
  return true;
}
function parts(date: Date, format: Intl.DateTimeFormat): Wall {
  const data = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return { year: Number(data.year), month: Number(data.month), day: Number(data.day), hour: Number(data.hour), minute: Number(data.minute) };
}
function nextDate(date: CalendarDate): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}
function uniqueUtc(wall: Wall, format: Intl.DateTimeFormat): { instant: string } | Failure {
  if (!dateValid(wall) || wall.hour < 0 || wall.hour > 23 || wall.minute < 0 || wall.minute > 59) return clarify("INVALID_DATE");
  const epoch = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const expected = wallKey(wall); const matches: number[] = [];
  // All modern minute offsets, not just +/- one hour around a guessed offset.
  // This also catches half-hour folds and whole-day changes without normalizing
  // a nonexistent wall clock into a different appointment.
  for (let offsetMinutes = -840; offsetMinutes <= 840; offsetMinutes++) {
    const instant = epoch - offsetMinutes * 60_000;
    if (wallKey(parts(new Date(instant), format)) === expected) matches.push(instant);
    if (matches.length > 1) return clarify("DST_FOLD");
  }
  return matches.length === 1 ? { instant: new Date(matches[0]).toISOString() } : clarify("DST_GAP");
}
function time(quote: string): { hour: number; minute: number } | Failure {
  if (quote === "midi") return { hour: 12, minute: 0 };
  if (quote === "minuit") return { hour: 0, minute: 0 };
  const full = /^(\d{2}):(\d{2})$/.exec(quote);
  if (full) return Number(full[1]) <= 23 && Number(full[2]) <= 59 ? { hour: Number(full[1]), minute: Number(full[2]) } : clarify("INVALID_DATE");
  const french = /^(\d{1,2})\s*h(?:\s*(\d{2}))?(?: (du matin|de l'après-midi|du soir))?$/.exec(quote);
  if (!french) return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
  let hour = Number(french[1]); const minute = Number(french[2] ?? 0); const period = french[3];
  if (hour > 23 || minute > 59) return clarify("INVALID_DATE");
  if (period) {
    if (hour < 1 || hour > 12) return clarify("INVALID_DATE");
    if ((period === "du matin" && hour === 12)
      || (period === "du soir" && (hour < 5 || hour === 12))
      || (period === "de l'après-midi" && hour > 6 && hour !== 12)) return clarify("AMBIGUOUS_TIME");
    hour = hour % 12 + (period === "du matin" ? 0 : 12);
  } else if (hour >= 1 && hour <= 12) return clarify("AMBIGUOUS_TIME");
  return { hour, minute };
}
function explicitDuration(raw: string): { minutes: number } | Failure | null {
  const quote = normalize(raw);
  const cue = /^(?:(?:il|elle|ça|ca|le rendez-vous|le rdv)\s+)?(?:dure|durera|durée(?:\s+de)?|pendant)\s+(.+)$/u.exec(quote)
    ?? /^d'(une\s+heure(?:\s+\d{1,2}\s*(?:min|minute|minutes))?)$/u.exec(quote);
  if (!cue) return null;
  const value = cue[1];
  let hours = 0; let minutes = 0; let minuteOnly = false;
  const hour = /^(\d{1,2})\s*h(?:\s*(\d{2}))?$/u.exec(value);
  const minute = /^(\d{1,3})\s*(?:min|minute|minutes)$/u.exec(value);
  const word = /^(?:une|1)\s+heure(?:\s+(\d{1,2})\s*(?:min|minute|minutes))?$/u.exec(value);
  if (hour) { hours = Number(hour[1]); minutes = Number(hour[2] ?? 0); }
  else if (minute) { minutes = Number(minute[1]); minuteOnly = true; }
  else if (word) { hours = 1; minutes = Number(word[1] ?? 0); }
  else return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
  const total = hours * 60 + minutes;
  return total >= 1 && total <= 1440 && (minuteOnly || minutes < 60) ? { minutes: total } : clarify("INVALID_DATE");
}
function parseWall(raw: string, today: CalendarDate, endDate?: CalendarDate, ambiguousTime?: { hour: number; minute: number }): Wall | Failure {
  const quote = normalize(raw);
  // An explicit reply can clarify only a literal the unchanged parser actually
  // classified AMBIGUOUS_TIME. It never replaces a date or an already clear time.
  const literalTime = (value: string) => {
    const parsed = time(value);
    return "status" in parsed && parsed.reason === "AMBIGUOUS_TIME" && ambiguousTime ? { hour: ambiguousTime.hour, minute: ambiguousTime.minute } : parsed;
  };
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:t| | à )(\d{2}:\d{2})$/.exec(quote);
  if (iso) {
    const date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    if (!dateValid(date)) return clarify("INVALID_DATE");
    const parsed = literalTime(iso[4]); return "status" in parsed ? parsed : { ...date, ...parsed };
  }
  const dated = /^(aujourd'hui|demain|ce soir|\d{4}-\d{2}-\d{2})\s+(?:à|a)\s*(.+)$/.exec(quote) ?? /^(demain) de\s*(.+)$/.exec(quote);
  if (dated) {
    const [year, month, day] = dated[1].split("-").map(Number);
    const date = dated[1] === "demain" ? nextDate(today) : dated[1] === "aujourd'hui" || dated[1] === "ce soir" ? today : { year, month, day };
    if (!dateValid(date)) return clarify("INVALID_DATE");
    const sameEveningClock = dated[1] === "ce soir"
      ? /^(\d{1,2})\s*h(?:\s*(\d{2}))?$/.exec(dated[2])
      : null;
    const parsed = sameEveningClock && Number(sameEveningClock[1]) >= 5 && Number(sameEveningClock[1]) <= 11
      && Number(sameEveningClock[2] ?? 0) <= 59
      ? { hour: Number(sameEveningClock[1]) + 12, minute: Number(sameEveningClock[2] ?? 0) }
      : literalTime(dated[2]);
    if ("status" in parsed) return parsed;
    // In ordinary Quebec French, "ce soir à 5 h..11 h" is itself the explicit
    // daypart. Other 12-hour clocks remain contradictory/ambiguous; never turn
    // "ce soir à 3 h" into tomorrow morning or silently reinterpret 14 h.
    if (dated[1] === "ce soir" && parsed.hour < 17) return clarify("AMBIGUOUS_TIME");
    return { ...date, ...parsed };
  }
  if (endDate) {
    const parsed = literalTime(quote); return "status" in parsed ? parsed : { ...endDate, ...parsed };
  }
  return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
}

/** Shared lexical/date-shape classification, not UTC or event resolution. END
 * uses the receipt's date only to admit a time-only literal; it does not claim
 * that date is the event's end date. No start/end ordering or DST is established. */
export function classifyPersonalCalendarTemporalSlot(raw: string, position: "START" | "END", untrustedContext: PersonalTemporalContext): "AMBIGUOUS" | "EXPLICIT" | "UNSUPPORTED" {
  try {
    if (typeof raw !== "string" || !["START", "END"].includes(position)) return "UNSUPPORTED";
    if (position === "END") {
      const duration = explicitDuration(raw);
      if (duration) return "status" in duration ? "UNSUPPORTED" : "EXPLICIT";
    }
    const context = contextSchema.parse(untrustedContext);
    const today = parts(new Date(context.receivedAt), formatter(context.timezone));
    if (!dateValid(today)) return "UNSUPPORTED";
    const parsed = parseWall(raw, today, position === "END" ? today : undefined);
    return "status" in parsed ? parsed.reason === "AMBIGUOUS_TIME" ? "AMBIGUOUS" : "UNSUPPORTED" : "EXPLICIT";
  } catch { return "UNSUPPORTED"; }
}

/** Pure inspection only. Revalidates the full source-bound proposal before using
 * any field. The caller must later authenticate/reload context and exact approval. */
function resolvePersonalCalendarTemporalInternal(input: PersonalIntentInput, rawProposal: string, actionId: string,
  untrustedContext: PersonalTemporalContext, override?: { slot: "START" | "END"; hour: number; minute: number }): PersonalTemporalResult {
  let inspected: ReturnType<typeof inspectPersonalIntentCandidate>;
  try { inspected = inspectPersonalIntentCandidate(rawProposal, input); } catch { return clarify("INVALID_INPUT"); }
  let context: PersonalTemporalContext; let format: Intl.DateTimeFormat; let today: CalendarDate;
  try {
    context = contextSchema.parse(untrustedContext);
    const received = new Date(context.receivedAt);
    if (!Number.isFinite(received.getTime())) throw new Error();
    format = formatter(context.timezone); today = parts(received, format);
    if (!dateValid(today)) throw new Error();
  } catch { return clarify("INVALID_CONTEXT"); }
  const action = inspected.proposal.actions.find(candidate => candidate.id === actionId);
  if (!action) return clarify("INVALID_INPUT");
  if (action.kind === "CLARIFY") return clarify(action.reason === "MISSING_END_TIME" ? "MISSING_END_TIME"
    : action.reason === "AMBIGUOUS_TIME" ? "AMBIGUOUS_TIME" : "UNSUPPORTED_ACTION");
  if (!explicitTimezoneAgrees(input.source, context.timezone)) return clarify("EXPLICIT_TIMEZONE_UNSUPPORTED");
  let starts: Wall | Failure; let ends: Wall | Failure | undefined; let durationMinutes: number | undefined;
  if (action.kind === "READ_CALENDAR") {
    const quote = normalize(action.period.quote).replace(/^pour /, "").replace(/^toute la journée /, "").replace(/ toute la journée$/, "");
    if (quote !== "demain" && quote !== "aujourd'hui") return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
    const date = quote === "demain" ? nextDate(today) : today;
    starts = { ...date, hour: 0, minute: 0 }; ends = { ...nextDate(date), hour: 0, minute: 0 };
  } else if (action.kind === "PREPARE_CALENDAR_EVENT") {
    starts = parseWall(action.starts.quote, today, undefined, override?.slot === "START" ? override : undefined);
    if ("status" in starts) return starts;
    const duration = override?.slot === "END" ? null : explicitDuration(action.ends.quote);
    if (duration && "status" in duration) return duration;
    if (duration) durationMinutes = duration.minutes;
    else ends = parseWall(action.ends.quote, today, starts, override?.slot === "END" ? override : undefined);
  } else return clarify("UNSUPPORTED_ACTION");
  if (ends && "status" in ends) return ends;
  const start = uniqueUtc(starts, format); if ("status" in start) return start;
  const end = durationMinutes !== undefined
    ? { instant: new Date(Date.parse(start.instant) + durationMinutes * 60_000).toISOString() }
    : uniqueUtc(ends!, format);
  if ("status" in end) return end;
  if (Date.parse(end.instant) <= Date.parse(start.instant)) return clarify("END_NOT_AFTER_START");
  return Object.freeze({ status: "RESOLVED_NOT_AUTHORIZED", executionAuthorized: false, preview: null,
    kind: action.kind, requestFingerprint: inspected.requestFingerprint, actionId: action.id,
    startsAtUtc: start.instant, endsAtUtc: end.instant, timezone: context.timezone, anchorReceivedAt: context.receivedAt,
    grammarVersion: PERSONAL_TEMPORAL_GRAMMAR_VERSION, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_RESOLVER",
    ...(action.kind === "PREPARE_CALENDAR_EVENT" ? { title: action.title.quote } : {}) });
}

/** Legacy single-source contract and behavior remain unchanged. */
export function resolvePersonalCalendarTemporal(input: PersonalIntentInput, rawProposal: string, actionId: string,
  untrustedContext: PersonalTemporalContext): PersonalTemporalResult {
  return resolvePersonalCalendarTemporalInternal(input, rawProposal, actionId, untrustedContext);
}

const clarificationTimeSchema = z.object({ slot: z.enum(["START", "END"]), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();
/** Low-level pure temporal primitive, NOT authentication of an SMS reply. The
 * correlated gateway entry must first inspect both exact source packets. This
 * independently refuses any attempt to replace an explicit or non-unique slot. */
export function resolvePersonalCalendarTemporalClarifiedSlot(input: PersonalIntentInput, rawProposal: string, actionId: string,
  context: PersonalTemporalContext, untrustedOverride: Readonly<z.infer<typeof clarificationTimeSchema>>): PersonalTemporalResult {
  const override = clarificationTimeSchema.safeParse(untrustedOverride);
  if (!override.success) return clarify("INVALID_INPUT");
  const original = resolvePersonalCalendarTemporal(input, rawProposal, actionId, context);
  if (original.status !== "CLARIFY" || original.reason !== "AMBIGUOUS_TIME") return clarify("UNSUPPORTED_ACTION");
  let inspected: ReturnType<typeof inspectPersonalIntentCandidate>;
  try { inspected = inspectPersonalIntentCandidate(rawProposal, input); } catch { return clarify("INVALID_INPUT"); }
  const action = inspected.proposal.actions[0];
  if (inspected.proposal.actions.length !== 1 || action.id !== actionId || action.kind !== "PREPARE_CALENDAR_EVENT" || action.dependsOn.length) return clarify("UNSUPPORTED_ACTION");
  const start = classifyPersonalCalendarTemporalSlot(action.starts.quote, "START", context);
  const end = classifyPersonalCalendarTemporalSlot(action.ends.quote, "END", context);
  if (start === "UNSUPPORTED" || end === "UNSUPPORTED" || (start === "AMBIGUOUS") === (end === "AMBIGUOUS")
    || override.data.slot !== (start === "AMBIGUOUS" ? "START" : "END")) return clarify("UNSUPPORTED_ACTION");
  return resolvePersonalCalendarTemporalInternal(input, rawProposal, actionId, context, override.data);
}
