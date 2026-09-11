import "server-only";
import type { Prisma } from "@prisma-client";
import { createHash } from "node:crypto";
import { canonicalFingerprint } from "../evidence";
import { answerHistorySchema } from "./contract";

/** At most three earlier answer-only exchanges, same owner/workspace/verified
 * SMS identity, less than 24 hours old. No project documents, recipients,
 * research records or action receipts are added to the model conversation. */
export async function loadBoundedAnswerHistory(tx: Prisma.TransactionClient, input: { sourceId: string; workspaceId: string; userId: string }) {
  const rows = await tx.$queryRawUnsafe<Array<{ sourceId: string; question: string; request: unknown; requestHash: string; result: unknown; resultEvidenceRef: string; receivedAt: Date }>>(`
    SELECT p.id "sourceId",p.request->>'body' question,p.request,p."requestHash",c.result,g."resultEvidenceRef",p."createdAt" "receivedAt"
    FROM "PersonalAssistantOperation" current
    JOIN "PersonalAssistantOperation" p ON p."workspaceId"=current."workspaceId" AND p."createdByUserId"=current."createdByUserId"
      AND p.request->>'identityId'=current.request->>'identityId' AND p."createdAt"<current."createdAt"
      AND p."createdAt">=current."createdAt"-interval '24 hours'
    JOIN "PersonalAssistantOperation" c ON c."sourcePersonalOperationId"=p.id AND c."workspaceId"=p."workspaceId" AND c."createdByUserId"=p."createdByUserId"
    JOIN "ModelGatewayOperation" g ON g.id=c."modelGatewayOperationId" AND g."tenantId"='construction-workspace:'||p."workspaceId"
    WHERE current.id=$1 AND current."workspaceId"=$2 AND current."createdByUserId"=$3 AND current.kind='personal_sms_inbound'
      AND p.kind='personal_sms_inbound' AND p.status='completed' AND length(p.request->>'body') BETWEEN 1 AND 1000
      AND c.kind='personal_answer_v1' AND c.status='completed' AND g.status='succeeded' AND g."operationType"='personal_answer_candidate_v1'
    ORDER BY p."createdAt" DESC,p.id DESC LIMIT 3`, input.sourceId, input.workspaceId, input.userId);
  const history = [];
  for (const row of rows.reverse()) {
    if (!row.request || typeof row.request !== "object" || Array.isArray(row.request)) throw new Error("ANSWER_HISTORY_SOURCE_CHANGED");
    const original = row.request as Record<string, unknown>;
    const sourceHash = createHash("sha256").update(JSON.stringify({ accountSid: original.accountSid, messageSid: original.messageSid,
      from: original.from, to: original.to, body: original.body })).digest("hex");
    if (sourceHash !== row.requestHash || sourceHash !== original.contentHash || original.body !== row.question) throw new Error("ANSWER_HISTORY_SOURCE_CHANGED");
    if (!row.result || typeof row.result !== "object" || Array.isArray(row.result) || canonicalFingerprint(row.result) !== row.resultEvidenceRef) throw new Error("ANSWER_HISTORY_EVIDENCE_CHANGED");
    const result = row.result as { answer?: { text?: unknown; evidence?: unknown } };
    const [entry] = answerHistorySchema.parse([{ sourceId: row.sourceId, question: row.question, answer: result.answer?.text,
      receivedAt: row.receivedAt.toISOString(), evidence: result.answer?.evidence }]);
    history.push(entry);
  }
  return answerHistorySchema.parse(history);
}
