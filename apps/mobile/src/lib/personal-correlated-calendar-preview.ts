import { z } from "zod";
import { personalCalendarDisplay } from "./personal-calendar-display";

/** Local presentation envelope, NOT a backend DTO or an authenticated proof. No production caller yet. */
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z.string().min(1).max(191).refine(value => value.trim() === value);
const utcInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const source = z.object({
  operationId: id, requestHash: hash, text: z.string().min(1).max(10_000), receivedAt: utcInstant,
}).strict();
const citation = z.object({
  sourceOperationId: id, requestHash: hash,
  start: z.number().int().min(0).max(10_000), end: z.number().int().min(1).max(10_000),
  quote: z.string().min(1).max(10_000),
}).strict();
const envelope = z.object({
  version: z.literal("personal-correlated-calendar-local-preview-v1"),
  approvalAvailable: z.literal(false),
  provenance: z.enum(["SYNTHETIC_LOCAL", "UNKNOWN"]),
  sources: z.tuple([
    source.extend({ role: z.literal("ORIGINAL_REQUEST") }).strict(),
    source.extend({ role: z.literal("CLARIFICATION_REPLY") }).strict(),
  ]),
  citations: z.object({ title: citation, originalStart: citation, originalEnd: citation, answer: citation }).strict(),
  anchorReceivedAt: utcInstant,
  clarifiedSlot: z.enum(["START", "END"]),
  draft: z.object({
    title: z.string().min(1).max(240).refine(value => value.trim() === value),
    startsAt: utcInstant, endsAt: utcInstant, timezone: z.string().min(1).max(80),
  }).strict(),
}).strict();

type Envelope = z.infer<typeof envelope>;
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// Existing gateway citations use UTF-16 offsets, not Unicode code-point offsets.
// Do not permit cutting an emoji/supplementary character into isolated surrogate halves.
function boundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true;
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
function citationMatches(item: Envelope["citations"]["title"], textSource: Envelope["sources"][number]): boolean {
  return item.sourceOperationId === textSource.operationId && item.requestHash === textSource.requestHash
    && item.start < item.end && item.end <= textSource.text.length
    && boundary(textSource.text, item.start) && boundary(textSource.text, item.end)
    && textSource.text.slice(item.start, item.end) === item.quote;
}

const unavailable = Object.freeze({
  status: "UNAVAILABLE" as const, readOnly: true as const, approvalAvailable: false as const,
  executionAuthorized: false as const, sourceAuthenticityVerified: false as const,
  hashCryptographicallyVerified: false as const, semanticInterpretationVerified: false as const,
});

/**
 * Validates presentation structure/quote equality only. Self-declared hashes, full-text
 * completeness, provenance, receipt scope and event semantics require the future server
 * projection. This function never produces an approval ID, command, request or callback.
 */
export function personalCorrelatedCalendarPreview(raw: unknown) {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return unavailable;
  const value = parsed.data;
  const [original, answer] = value.sources;
  if (original.operationId === answer.operationId
    || value.anchorReceivedAt !== original.receivedAt
    || Date.parse(answer.receivedAt) <= Date.parse(original.receivedAt)
    || Date.parse(value.draft.endsAt) <= Date.parse(value.draft.startsAt)
    || !citationMatches(value.citations.title, original)
    || !citationMatches(value.citations.originalStart, original)
    || !citationMatches(value.citations.originalEnd, original)
    || !citationMatches(value.citations.answer, answer)
    || value.draft.title !== value.citations.title.quote.trim()) return unavailable;
  const localTimes = personalCalendarDisplay({ startsAt: value.draft.startsAt, endsAt: value.draft.endsAt, timezone: value.draft.timezone });
  // Retain exact raw evidence when the installed Intl cannot render it; never pick the phone zone.
  return freeze({
    ...unavailable,
    status: "STRUCTURE_CHECKED_NOT_AUTHENTICATED" as const,
    evidence: value,
    localTimes,
    provenanceLabel: value.provenance === "SYNTHETIC_LOCAL" ? "SYNTHETIC_LOCAL" as const : "UNKNOWN" as const,
  });
}
