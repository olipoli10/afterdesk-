import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

// Pure candidate contract only. Registration/admission is handled separately by
// the OFF-default store-reloading gateway wrapper, not by this parser. That wrapper
// reserves current-authority spend; downstream effects still need exact approvals.
// No recipient address, credential, calendar identifier, approval or tool executor
// is accepted from a model. Do not reinterpret this result as permission to act.
const id = z.string().min(1).max(191);
const fingerprint = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const sourceSchema = z.string().min(1).max(10_000).refine(value => value.trim().length > 0);
const inputSchema = z.object({
  schemaVersion: z.literal(1), operation: z.literal("personal_intent_candidate_v1"),
  sourceOperationId: id, source: sourceSchema, requestFingerprint: fingerprint,
}).strict();
export type PersonalIntentInput = Readonly<z.infer<typeof inputSchema>>;
const sha = (value: string) => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
const invalidUnicode = (value: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

function alignExactSourceSpan(source: string, quoted: z.infer<typeof span>) {
  if (invalidUnicode(quoted.quote)) throw new Error("PERSONAL_INTENT_SOURCE_SPAN_MISMATCH");
  if (quoted.end > quoted.start && quoted.end <= source.length
    && source.slice(quoted.start, quoted.end) === quoted.quote) return;

  // Models are unreliable UTF-16 counters. The quote remains untrusted, but a
  // unique byte-for-byte occurrence lets the server derive its coordinates
  // without fuzzy matching, normalization, invention, or semantic authority.
  const start = source.indexOf(quoted.quote);
  if (start < 0 || source.indexOf(quoted.quote, start + 1) >= 0) {
    throw new Error("PERSONAL_INTENT_SOURCE_SPAN_MISMATCH");
  }
  quoted.start = start;
  quoted.end = start + quoted.quote.length;
}

export function createPersonalIntentInput(sourceOperationId: string, source: string): PersonalIntentInput {
  id.parse(sourceOperationId); sourceSchema.parse(source);
  if (invalidUnicode(source)) throw new Error("PERSONAL_INTENT_SOURCE_UNICODE_INVALID");
  const base = { schemaVersion: 1 as const, operation: "personal_intent_candidate_v1" as const, sourceOperationId, source };
  return Object.freeze({ ...base, requestFingerprint: sha(JSON.stringify(base)) });
}

const span = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(4_000) }).strict();
const base = { id, dependsOn: z.array(id).max(9) };
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("READ_CALENDAR"), period: span }).strict(),
  z.object({ ...base, kind: z.literal("PREPARE_CALENDAR_EVENT"), title: span, starts: span, ends: span }).strict(),
  z.object({ ...base, kind: z.literal("PREPARE_SELF_SMS"), message: span }).strict(),
  z.object({ ...base, kind: z.literal("PREPARE_SELF_CALL"), message: span }).strict(),
  z.object({ ...base, kind: z.literal("CLARIFY"), reason: z.enum([
    "AMBIGUOUS_TIME", "MISSING_END_TIME", "AMBIGUOUS_CONTACT", "UNSUPPORTED_RECIPIENT", "UNSUPPORTED_REQUEST", "MISSING_CONTEXT",
  ]) }).strict(),
]);
export const personalIntentProposalSchema = z.object({
  schemaVersion: z.literal(1), requestFingerprint: fingerprint, actions: z.array(actionSchema).min(1).max(10),
}).strict();
export type PersonalIntentProposal = z.infer<typeof personalIntentProposalSchema>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export function inspectPersonalIntentCandidate(raw: string, untrustedInput: PersonalIntentInput) {
  const input = inputSchema.parse(untrustedInput);
  const expected = createPersonalIntentInput(input.sourceOperationId, input.source);
  if (input.requestFingerprint !== expected.requestFingerprint) throw new Error("PERSONAL_INTENT_INPUT_TAMPERED");
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65_536) throw new Error("PERSONAL_INTENT_RESPONSE_LIMIT");
  const candidate = personalIntentProposalSchema.parse(JSON.parse(raw));
  if (candidate.requestFingerprint !== expected.requestFingerprint) throw new Error("PERSONAL_INTENT_REQUEST_MISMATCH");
  const prior = new Set<string>();
  for (const action of candidate.actions) {
    if (prior.has(action.id) || new Set(action.dependsOn).size !== action.dependsOn.length || action.dependsOn.some(dependency => !prior.has(dependency))) {
      throw new Error("PERSONAL_INTENT_ACTION_ORDER_INVALID");
    }
    const quotes = action.kind === "READ_CALENDAR" ? [action.period]
      : action.kind === "PREPARE_CALENDAR_EVENT" ? [action.title, action.starts, action.ends]
      : action.kind === "CLARIFY" ? [] : [action.message];
    for (const quoted of quotes) {
      alignExactSourceSpan(input.source, quoted);
    }
    prior.add(action.id);
  }
  return freeze({
    status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED" as const,
    executionAuthorized: false as const, preview: null,
    requestFingerprint: expected.requestFingerprint, proposal: candidate,
    sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const,
  });
}
