import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { citationSchema, publicCitationUrl } from "@/server/model-gateway/personal-answer/contract";

const answerSchema = z.object({ text: z.string().min(1).max(1500),
  evidence: z.enum(["MODEL_ANSWER_UNVERIFIED", "PUBLIC_SOURCE_EXCERPTS"]), citations: z.array(citationSchema).max(5), actionAuthority: z.literal(false),
}).strict();
const reportSchema = z.object({ status: z.literal("ANSWER_INSPECTED"), actionAuthority: z.literal(false),
  requestedModel: z.literal("openrouter/auto"), servedModel: z.string().min(1).max(200),
  observedAt: z.string().datetime({ offset: true }), answer: answerSchema,
});

export function assistantReportLink(reportId: string, env: NodeJS.ProcessEnv): string | null {
  if (!/^[A-Za-z0-9_-]{1,191}$/u.test(reportId)) return null;
  try {
    const origin = new URL(publicCitationUrl(env.BETTER_AUTH_URL ?? "")).origin;
    return new URL(`/personal/assistant-reports/${reportId}`, origin).href;
  } catch { return null; }
}
export function formatAssistantAnswerSms(raw: unknown, reportUrl: string | null): string {
  const answer = answerSchema.parse(raw);
  const sources = answer.citations.map(c => `${c.id} : ${c.url}`).join("\n");
  const inline = `${answer.text}${sources ? `\n${sources}` : ""}`;
  if (inline.length <= 1500) return inline;
  const fallback = reportUrl ? `Sources et rapport complet : ${publicCitationUrl(reportUrl)}` : "Le rapport complet et ses sources sont conservés dans ENDVERA.";
  // Do not cut a source quotation mid-sentence or silently omit a citation.
  if (`${answer.text}\n${fallback}`.length <= 1500) return `${answer.text}\n${fallback}`;
  return fallback;
}
export async function personalAnswerReportForOwner(userId: string, reportId: string) {
  if (!/^[A-Za-z0-9_-]{1,191}$/u.test(reportId) || !userId) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ result: unknown; resultEvidenceRef: string }>>(`SELECT c.result,g."resultEvidenceRef"
    FROM "PersonalAssistantOperation" c JOIN "ConstructionWorkspace" w ON w.id=c."workspaceId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$1
    JOIN "ModelGatewayOperation" g ON g.id=c."modelGatewayOperationId"
    WHERE c.id=$2 AND c."createdByUserId"=$1 AND w."ownerUserId"=$1 AND w.status='active'
      AND m.status='active' AND m.role='owner' AND c.kind='personal_answer_v1' AND c.status='completed'
      AND g."tenantId"='construction-workspace:'||c."workspaceId" AND g.status='succeeded'
      AND g."operationType" IN ('personal_answer_candidate_v1','personal_public_research_v1')`, userId, reportId);
  if (rows.length !== 1 || canonicalFingerprint(rows[0].result) !== rows[0].resultEvidenceRef) return null;
  const parsed = reportSchema.safeParse(rows[0].result);
  if (!parsed.success) return null;
  return { id: reportId, text: parsed.data.answer.text, citations: parsed.data.answer.citations,
    evidence: parsed.data.answer.evidence, observedAt: parsed.data.observedAt };
}
