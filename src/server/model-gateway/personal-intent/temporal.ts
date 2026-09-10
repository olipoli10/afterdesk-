import "server-only";
import { z } from "zod";
import { inspectPersonalIntentCandidate, type PersonalIntentInput } from "./contract";

/** Closed local grammar, not a general French date parser.
 * READ: aujourd'hui / aujourd’hui / demain, optionally "pour ", "toute la
 * journée ..." or "... toute la journée". No weekday/week/month inference.
 * START: YYYY-MM-DD[T or space]HH:mm; YYYY-MM-DD à TIME;
 *        aujourd'hui/demain à TIME.
 * END: same forms, or TIME on the START's explicit local date. An earlier end
 * never rolls to tomorrow. Cross-day events must name both dates explicitly.
 * TIME: two-digit HH:mm; H[h] or H[h]MM with H=0 or 13..23;
 *       1..11 h [MM] du matin; 1..6 or 12 h de l'après-midi;
 *       5..11 h du soir; midi / minuit. Contradictory dayparts clarify.
 * Bare 1..12 h is ambiguous. No guessed duration, offset, year or timezone.
 * Dates 2000..2100 and minute-granularity modern IANA offsets only. The offset
 * search exhausts -14:00..+14:00, refusing nonexistent or duplicate wall times.
 * Context must later come from authenticated DB state, NOT a model's fields.
 */
export const PERSONAL_TEMPORAL_GRAMMAR_VERSION = "quebec-explicit-calendar-v1";
const contextSchema = z.object({ receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).strict();
export type PersonalTemporalContext = Readonly<z.infer<typeof contextSchema>>;
type Reason = "INVALID_INPUT" | "INVALID_CONTEXT" | "UNSUPPORTED_ACTION" | "UNSUPPORTED_TEMPORAL_GRAMMAR"
  | "AMBIGUOUS_TIME" | "MISSING_END_TIME" | "INVALID_DATE" | "DST_GAP" | "DST_FOLD" | "END_NOT_AFTER_START";
const questions: Record<Reason, string> = {
  INVALID_INPUT: "La demande source n’est pas vérifiable. Vérifie la demande dans ENDVERA.",
  INVALID_CONTEXT: "Le moment de réception ou le fuseau horaire doit être vérifié dans ENDVERA.",
  UNSUPPORTED_ACTION: "Cette étape ne permet pas de résoudre cette action de calendrier.",
  UNSUPPORTED_TEMPORAL_GRAMMAR: "Précise la date au format AAAA-MM-JJ et les heures au format HH:MM, ou demain avec ces heures.",
  AMBIGUOUS_TIME: "Est-ce le matin ou l’après-midi? Précise l’heure au format 24 heures, par exemple 02:00 ou 14:00.",
  MISSING_END_TIME: "À quelle heure le rendez-vous se termine-t-il? Aucune durée par défaut n’a été ajoutée.",
  INVALID_DATE: "Cette date ou cette heure n’existe pas. Précise une date et une heure valides.",
  DST_GAP: "Cette heure locale n’existe pas à cause du changement d’heure. Choisis une autre heure.",
  DST_FOLD: "Cette heure locale se produit deux fois au changement d’heure. Choisis une heure non ambiguë.",
  END_NOT_AFTER_START: "La fin doit être après le début. Pour un autre jour, précise aussi la date de fin.",
};
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
function parseWall(raw: string, today: CalendarDate, endDate?: CalendarDate): Wall | Failure {
  const quote = normalize(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:t| | à )(\d{2}:\d{2})$/.exec(quote);
  if (iso) {
    const date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    if (!dateValid(date)) return clarify("INVALID_DATE");
    const parsed = time(iso[4]); return "status" in parsed ? parsed : { ...date, ...parsed };
  }
  const dated = /^(aujourd'hui|demain|\d{4}-\d{2}-\d{2}) à\s*(.+)$/.exec(quote);
  if (dated) {
    const [year, month, day] = dated[1].split("-").map(Number);
    const date = dated[1] === "demain" ? nextDate(today) : dated[1] === "aujourd'hui" ? today : { year, month, day };
    if (!dateValid(date)) return clarify("INVALID_DATE");
    const parsed = time(dated[2]); return "status" in parsed ? parsed : { ...date, ...parsed };
  }
  if (endDate) {
    const parsed = time(quote); return "status" in parsed ? parsed : { ...endDate, ...parsed };
  }
  return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
}

/** Pure inspection only. Revalidates the full source-bound proposal before using
 * any field. The caller must later authenticate/reload context and exact approval. */
export function resolvePersonalCalendarTemporal(input: PersonalIntentInput, rawProposal: string, actionId: string,
  untrustedContext: PersonalTemporalContext): PersonalTemporalResult {
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
  let starts: Wall | Failure; let ends: Wall | Failure;
  if (action.kind === "READ_CALENDAR") {
    const quote = normalize(action.period.quote).replace(/^pour /, "").replace(/^toute la journée /, "").replace(/ toute la journée$/, "");
    if (quote !== "demain" && quote !== "aujourd'hui") return clarify("UNSUPPORTED_TEMPORAL_GRAMMAR");
    const date = quote === "demain" ? nextDate(today) : today;
    starts = { ...date, hour: 0, minute: 0 }; ends = { ...nextDate(date), hour: 0, minute: 0 };
  } else if (action.kind === "PREPARE_CALENDAR_EVENT") {
    starts = parseWall(action.starts.quote, today);
    if ("status" in starts) return starts;
    ends = parseWall(action.ends.quote, today, starts);
  } else return clarify("UNSUPPORTED_ACTION");
  if ("status" in ends) return ends;
  const start = uniqueUtc(starts, format); if ("status" in start) return start;
  const end = uniqueUtc(ends, format); if ("status" in end) return end;
  if (Date.parse(end.instant) <= Date.parse(start.instant)) return clarify("END_NOT_AFTER_START");
  return Object.freeze({ status: "RESOLVED_NOT_AUTHORIZED", executionAuthorized: false, preview: null,
    kind: action.kind, requestFingerprint: inspected.requestFingerprint, actionId: action.id,
    startsAtUtc: start.instant, endsAtUtc: end.instant, timezone: context.timezone, anchorReceivedAt: context.receivedAt,
    grammarVersion: PERSONAL_TEMPORAL_GRAMMAR_VERSION, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_RESOLVER",
    ...(action.kind === "PREPARE_CALENDAR_EVENT" ? { title: action.title.quote } : {}) });
}
