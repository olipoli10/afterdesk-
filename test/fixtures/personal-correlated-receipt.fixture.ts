import { createHash } from "node:crypto";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolveCorrelatedPersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/correlated-temporal-resolution";
import { prepareSmsTemporalClarification, markSmsTemporalClarificationAsked, smsTemporalClarificationQuestionRequest,
  type SmsTemporalClarificationBinding } from "@/server/personal-assistant/sms-temporal-clarification";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export function correlatedReceiptFixture(options: { start?: string; end?: string; answer?: string; timezone?: string } = {}) {
  const anchor = "2026-09-11T03:58:00.000Z", accountSid = "AC" + "a".repeat(32);
  const binding: SmsTemporalClarificationBinding = { workspaceId: "workspace", userId: "owner", memberId: "member", memberRole: "owner", memberRevision: anchor,
    workspaceRevision: anchor, identityId: "identity", identityRevision: anchor, verifiedIdentity: true, ownerNumber: "+15145550100", endveraNumber: "+15145550101",
    smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid), smsInboundGrantId: "inbound", smsInboundGrantVersion: 1,
    modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
    calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: options.timezone ?? "America/Toronto" };
  const source = (body: string, suffix: string, receivedAt: string) => {
    const envelope = { accountSid, messageSid: "SM" + suffix.repeat(32), from: binding.ownerNumber, to: binding.endveraNumber, body };
    return { operationId: "source-" + suffix, workspaceId: "workspace", userId: "owner", identityId: "identity", verifiedIngress: true as const,
      ...envelope, requestHash: sha(JSON.stringify(envelope)), receivedAt };
  };
  const start = options.start ?? "demain à 2h", end = options.end ?? "15h", original = source(`Ajoute inspection 🛠️ ${start}, fin ${end}.`, "a", anchor);
  const span = (quote: string) => ({ start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length, quote });
  const modelInput = createPersonalIntentInput(original.operationId, original.body);
  const prepared = prepareSmsTemporalClarification({ schemaVersion: 1, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding, source: original,
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", actionId: "event", createdAt: "2026-09-11T03:58:10.000Z", expiresAt: "2026-09-11T04:08:00.000Z",
    rawProposal: JSON.stringify({ schemaVersion: 1, requestFingerprint: modelInput.requestFingerprint, actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT",
      dependsOn: [], title: span("inspection 🛠️"), starts: span(start), ends: span(end) }] }) });
  const waiting = markSmsTemporalClarificationAsked(prepared, { outboundOperationId: "question", requestHash: sha(JSON.stringify(smsTemporalClarificationQuestionRequest(prepared))),
    acceptedProviderSid: "SM" + "c".repeat(32), acceptedAt: "2026-09-11T03:58:20.000Z", acceptedByProvider: true, deliveryConfirmed: false }, "2026-09-11T03:58:20.000Z");
  const answer = source(options.answer ?? "14h", "b", "2026-09-11T04:01:00.000Z"), leaseUntil = "2026-09-11T04:01:30.000Z";
  // This fixture first performs the old live pure calculation, then records its
  // distinct completed facts. It does not make a completed source look live.
  const live = { waiting, currentBinding: binding, currentPhase: "WAITING" as const, activeQuestionCount: 1, now: "2026-09-11T04:01:01.000Z",
    reply: { source: answer, attempt: 1 as const, status: "processing" as const, leaseUntil, alreadyConsumed: false as const } };
  const packet = resolveCorrelatedPersonalCalendarTemporal(live);
  const durable = { waiting, currentBinding: binding, questionPhase: "CONSUMED" as const, consumedReplyId: "receipt",
    receipt: { id: "receipt", outcome: "ACCEPTED" as const, receivedAt: answer.receivedAt, createdAt: "2026-09-11T04:01:02.000Z",
      sourceClaim: { operationId: answer.operationId, workspaceId: binding.workspaceId, userId: binding.userId, attempt: 1 as const, leaseUntil } },
    original: { source: original, status: "completed" as const, attempt: 1 as const, leaseUntil: null },
    answer: { source: answer, status: "completed" as const, attempt: 1 as const, leaseUntil: null }, now: "2026-09-11T04:02:00.000Z" };
  return { live, durable, packet, packetHash: sha(canonicalJson(packet)) };
}
