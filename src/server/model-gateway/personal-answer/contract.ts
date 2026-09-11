import "server-only";
import { z } from "zod";
import { canonicalFingerprint } from "../evidence";
import { assistantRequestSchema, routeSmsAssistant } from "@/lib/sms-assistant/routing";

export const ANSWER_OPERATION = "personal_answer_candidate_v1" as const;
export const RESEARCH_OPERATION = "personal_public_research_v1" as const;
export const answerHistorySchema = z.array(z.object({ sourceId: z.string().min(1).max(191),
  question: z.string().min(1).max(1000), answer: z.string().min(1).max(1000),
  receivedAt: z.string().datetime({ offset: true }), evidence: z.literal("MODEL_ANSWER_UNVERIFIED"),
}).strict()).max(3);
export const answerSourceSchema = assistantRequestSchema.extend({
  receivedAt: z.string().datetime({ offset: true }),
  history: answerHistorySchema.optional(),
}).strict();
export type AnswerSource = z.infer<typeof answerSourceSchema>;

export function createAnswerInput(raw: unknown) {
  const source = answerSourceSchema.parse(raw);
  const request = { requestId: source.requestId, workspaceId: source.workspaceId, body: source.body,
    senderVerified: source.senderVerified, workspaceBound: source.workspaceBound };
  const route = routeSmsAssistant(request);
  if (route.disposition !== "ROUTE" || !["GENERAL_ANSWER", "PUBLIC_RESEARCH"].includes(route.lane ?? "")) {
    throw new Error("ANSWER_LANE_REFUSED");
  }
  const operation = route.lane === "PUBLIC_RESEARCH" ? RESEARCH_OPERATION : ANSWER_OPERATION;
  if (operation === RESEARCH_OPERATION && source.history?.length) throw new Error("RESEARCH_HISTORY_DISCLOSURE_REFUSED");
  return Object.freeze({ schemaVersion: 1 as const, operation,
    source: Object.freeze(source), requestFingerprint: canonicalFingerprint({ operation, source }) });
}
export type AnswerInput = ReturnType<typeof createAnswerInput>;

// Citation URLs are displayed, never fetched here. Restrict them to public HTTPS
// hosts to avoid clickable local resources and embedded credentials.
export function publicCitationUrl(raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || host.includes(":") || /^[\d.]+$/u.test(host) || !host.includes(".")
    || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/u.test(host)
    || url.href.length > 2048) throw new Error("CITATION_URL_REFUSED");
  url.hash = "";
  return url.href;
}

export const citationSchema = z.object({
  id: z.string().regex(/^s[1-5]$/u), url: z.string().max(2048).transform(publicCitationUrl),
  title: z.string().trim().min(1).max(300), excerpt: z.string().trim().min(1).max(10_000),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type AnswerCitation = z.infer<typeof citationSchema>;

export const candidateAnswerSchema = z.object({
  requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  answer: z.string().trim().min(1).max(1000),
  needsCurrentSources: z.boolean(),
  // Only exact source extracts can become a researched SMS. A model-generated
  // URL or a model's paraphrase is not independent factual verification.
  extracts: z.array(z.object({ sourceId: z.string().regex(/^s[1-5]$/u), quote: z.string().trim().min(1).max(450) }).strict()).max(3),
}).strict();

export function inspectAnswer(raw: unknown, input: AnswerInput, citations: AnswerCitation[]) {
  const candidate = candidateAnswerSchema.parse(raw);
  if (candidate.requestFingerprint !== input.requestFingerprint) throw new Error("ANSWER_SOURCE_CHANGED");
  const sources = z.array(citationSchema).max(5).parse(citations);
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error("DUPLICATE_CITATION");
  if (input.operation === ANSWER_OPERATION) {
    if (sources.length || candidate.extracts.length || candidate.needsCurrentSources) throw new Error("ANSWER_REQUIRES_RESEARCH");
    return Object.freeze({ text: candidate.answer, evidence: "MODEL_ANSWER_UNVERIFIED" as const, citations: [], actionAuthority: false as const });
  }
  if (!candidate.extracts.length) throw new Error("RESEARCH_WITHOUT_SOURCES");
  const cited = candidate.extracts.map(extract => {
    const source = sources.find(s => s.id === extract.sourceId);
    if (!source || !source.excerpt.includes(extract.quote)) throw new Error("UNSUPPORTED_RESEARCH_EXTRACT");
    return { source, quote: extract.quote };
  });
  // The unconstrained answer field is deliberately NOT published on research.
  // These are public-source excerpts, not proof of ownership or current truth.
  const text = "Voici ce que les sources consultées indiquent :\n" + cited.map(({ source, quote }) => `« ${quote} » [${source.id}]`).join("\n");
  return Object.freeze({ text, evidence: "PUBLIC_SOURCE_EXCERPTS" as const,
    citations: [...new Map(cited.map(c => [c.source.id, c.source])).values()], actionAuthority: false as const });
}
