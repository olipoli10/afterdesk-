import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { prepareSmsTemporalClarification as prepare, markSmsTemporalClarificationAsked as asked,
  correlateSmsTemporalClarification as correlate, smsTemporalClarificationQuestionRequest as questionRequest,
  type SmsTemporalClarificationBinding, type SmsTemporalClarificationSource } from "@/server/personal-assistant/sms-temporal-clarification";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const anchor = "2026-09-11T03:59:00.000Z", accepted = "2026-09-11T03:59:10.000Z", clock = "2026-09-11T04:00:11.000Z";
const accountSid = `AC${"1".repeat(32)}`;
function binding(): SmsTemporalClarificationBinding {
  return { workspaceId: "audit-workspace", userId: "audit-owner", memberId: "audit-member", memberRole: "owner",
    memberRevision: anchor, workspaceRevision: anchor, identityId: "audit-identity", identityRevision: anchor, verifiedIdentity: true,
    ownerNumber: "+14185550101", endveraNumber: "+14185550102", smsAccountId: "audit-sms", smsAccountVersion: 2, smsAccountKeyHash: sha(accountSid),
    smsInboundGrantId: "sms-grant", smsInboundGrantVersion: 3, modelAccountId: "audit-model", modelAccountVersion: 4, modelGrantId: "model-grant",
    modelGrantVersion: 5, calendarAccountId: "audit-calendar", calendarAccountVersion: 6, calendarWriteGrantId: "calendar-grant", calendarWriteGrantVersion: 7,
    timezone: "America/Toronto" };
}
function source(body: string, operationId: string, sidDigit: string, receivedAt: string): SmsTemporalClarificationSource {
  const b = binding(), wire = { accountSid, messageSid: `SM${sidDigit.repeat(32)}`, from: b.ownerNumber, to: b.endveraNumber, body };
  return { operationId, workspaceId: b.workspaceId, userId: b.userId, identityId: b.identityId, verifiedIngress: true,
    ...wire, requestHash: sha(JSON.stringify(wire)), receivedAt };
}
function fixture() {
  const original = source("Ajoute visite demain à 2h jusqu’à 16h.", "audit-original", "2", anchor);
  const modelInput = createPersonalIntentInput(original.operationId, original.body);
  const span = (quote: string) => ({ quote, start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length });
  const rawProposal = JSON.stringify({ schemaVersion: 1, requestFingerprint: modelInput.requestFingerprint, actions: [{ id: "visit", kind: "PREPARE_CALENDAR_EVENT",
    dependsOn: [], title: span("visite"), starts: span("demain à 2h"), ends: span("16h") }] });
  const p = prepare({ schemaVersion: 1, clarificationId: "784c3281-8158-4f84-8bda-bd77972a4c55", binding: binding(), source: original,
    modelChildOperationId: "audit-model-child", modelGatewayOperationId: "audit-gateway", rawProposal, actionId: "visit",
    createdAt: "2026-09-11T03:59:05.000Z", expiresAt: "2026-09-11T04:09:05.000Z" });
  const waiting = asked(p, { outboundOperationId: "audit-question", requestHash: sha(JSON.stringify(questionRequest(p))),
    acceptedProviderSid: `SM${"3".repeat(32)}`, acceptedAt: accepted, acceptedByProvider: true, deliveryConfirmed: false }, accepted);
  return { waiting, currentBinding: binding(), currentPhase: "WAITING" as const, activeQuestionCount: 1, now: clock,
    reply: { source: source(" 14 h 30 ", "audit-reply", "4", "2026-09-11T04:00:10.000Z"), attempt: 1 as const,
      status: "processing" as const, leaseUntil: "2026-09-11T04:00:30.000Z", alreadyConsumed: false as const } };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("independent pure SMS temporal correlation review", () => {
  it("keeps exact two-source provenance across midnight and confers no authentication, date or action authority", () => {
    const f = fixture(), result = correlate(f);
    expect(result.explicitReplyTime).toEqual({ hour: 14, minute: 30 });
    expect(result.anchorReceivedAt).toBe(anchor);
    expect(result.sources).toEqual([f.waiting.prepared.source, f.reply.source]);
    for (let i = 0; i < result.sources.length; i++) {
      const citation = result.citations[i], original = result.sources[i];
      expect(original.body.slice(citation.start, citation.end)).toBe(citation.quote);
      expect(citation.sourceOperationId).toBe(original.operationId);
    }
    expect(result).toMatchObject({ status: "CORRELATED_NOT_RESOLVED_NOT_AUTHORIZED", sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT",
      executionAuthorized: false, providerExecutionPerformed: false, persistencePerformed: false, temporalResolutionPerformed: false, preview: null });
    expect(result).not.toHaveProperty("startsAtUtc"); expect(result).not.toHaveProperty("endsAtUtc");
  });
  it("detaches and freezes the correlation packet from later caller mutation", () => {
    const f = fixture(), result = correlate(f), exactText = result.sources[1].body;
    f.reply.source.body = "Autre demande"; f.currentBinding.userId = "another-owner";
    expect(result.sources[1].body).toBe(exactText); expect(result.sources[1].userId).toBe("audit-owner");
    expect(Object.isFrozen(result.sources)).toBe(true); expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(Object.isFrozen(result.citations[1])).toBe(true); expect(Object.isFrozen(result.requiredAtomicTransition)).toBe(true);
  });
  it.each(["question", "proposalHash", "bindingHash", "questionHash", "preparedHash"] as const)("reinspects tampered %s rather than trusting stored fields", field => {
    const f = clone(fixture()); f.waiting.prepared[field] = field === "question" ? "Approuve ceci" : "0".repeat(64);
    expect(() => correlate(f)).toThrow();
  });
  it("does not let a new outbound receipt ride an old waiting fingerprint", () => {
    const f = clone(fixture()); f.waiting.questionReceipt.outboundOperationId = "different-outbound";
    expect(() => correlate(f)).toThrow("WAITING_CHANGED");
  });
  it.each(["source", "outbound"] as const)("refuses the %s SID as a supposedly new reply after recomputing its envelope hash", kind => {
    const f = fixture(); f.reply.source.messageSid = kind === "source" ? f.waiting.prepared.source.messageSid : f.waiting.questionReceipt.acceptedProviderSid;
    const r = f.reply.source;
    r.requestHash = sha(JSON.stringify({ accountSid: r.accountSid, messageSid: r.messageSid, from: r.from, to: r.to, body: r.body }));
    expect(() => correlate(f)).toThrow("NEW_SOURCE_REQUIRED");
  });
  it("requires a current source lease and preserves the exact expected CAS without executing it", () => {
    const f = fixture(), result = correlate(f);
    expect(result.requiredAtomicTransition).toMatchObject({ expectedWaitingHash: f.waiting.waitingHash, replyRequestHash: f.reply.source.requestHash,
      replyOperationId: f.reply.source.operationId, replyMessageSid: f.reply.source.messageSid, replyAttempt: 1, replyLeaseUntil: f.reply.leaseUntil });
    expect(correlate(f)).toEqual(result);
    f.reply.leaseUntil = f.now; expect(() => correlate(f)).toThrow("REPLY_TIME_INVALID");
  });
  it.each(["memberRevision", "identityRevision", "workspaceRevision"] as const)("refuses same IDs after %s advances", field => {
    const f = fixture(); f.currentBinding[field] = accepted;
    expect(() => correlate(f)).toThrow("CONTEXT_CHANGED");
  });
  it("rejects a changed sender even with a self-consistent recomputed source hash", () => {
    const f = fixture(), r = f.reply.source; r.from = "+14185550199";
    r.requestHash = sha(JSON.stringify({ accountSid: r.accountSid, messageSid: r.messageSid, from: r.from, to: r.to, body: r.body }));
    expect(() => correlate(f)).toThrow("SOURCE_BINDING_CHANGED");
  });
});
