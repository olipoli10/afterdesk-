import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { prepareSmsTemporalClarification as prepare, markSmsTemporalClarificationAsked as asked,
  correlateSmsTemporalClarification as correlate, smsTemporalClarificationQuestionRequest as request,
  type SmsTemporalClarificationBinding, type SmsTemporalClarificationSource, type SmsTemporalClarificationReply } from "@/server/personal-assistant/sms-temporal-clarification";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const accountSid = "AC" + "a".repeat(32);
const before = "2026-09-11T03:58:00.000Z", created = "2026-09-11T03:58:10.000Z";
const accepted = "2026-09-11T03:58:20.000Z", received = "2026-09-11T04:01:00.000Z", now = "2026-09-11T04:01:01.000Z";
function binding(): SmsTemporalClarificationBinding { return {
  workspaceId: "workspace", userId: "owner", memberId: "member", memberRole: "owner", memberRevision: before, workspaceRevision: before,
  identityId: "identity", identityRevision: before, verifiedIdentity: true, ownerNumber: "+15145550100", endveraNumber: "+15145550101",
  smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid), smsInboundGrantId: "inbound-grant", smsInboundGrantVersion: 1,
  modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
  calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write-grant", calendarWriteGrantVersion: 1,
  timezone: "America/Toronto",
}; }
function source(body = "Ajoute inspection demain à 2h et termine à 15h.", suffix = "a", receivedAt = before): SmsTemporalClarificationSource {
  const envelope = { accountSid, messageSid: "SM" + suffix.repeat(32), from: binding().ownerNumber, to: binding().endveraNumber, body };
  return { operationId: "source-" + suffix, workspaceId: "workspace", userId: "owner", identityId: "identity", verifiedIngress: true,
    ...envelope, requestHash: sha(JSON.stringify(envelope)), receivedAt };
}
function preparation() {
  const original = source(), input = createPersonalIntentInput(original.operationId, original.body);
  const span = (quote: string) => ({ start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length, quote });
  return { schemaVersion: 1 as const, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding: binding(), source: original,
    modelChildOperationId: "model-child", modelGatewayOperationId: "gateway", actionId: "event", createdAt: created, expiresAt: "2026-09-11T04:08:10.000Z",
    rawProposal: JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint,
      actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span("demain à 2h"), ends: span("15h") }] }) };
}
function waiting() {
  const p = prepare(preparation());
  return asked(p, { outboundOperationId: "question-outbound", requestHash: sha(JSON.stringify(request(p))),
    acceptedProviderSid: "SM" + "c".repeat(32), acceptedAt: accepted, acceptedByProvider: true, deliveryConfirmed: false }, accepted);
}
function correlation(body = "14h") {
  return { waiting: waiting(), currentBinding: binding(), currentPhase: "WAITING" as const, activeQuestionCount: 1, now,
    reply: { source: source(body, "b", received), attempt: 1, status: "processing", leaseUntil: "2026-09-11T04:01:30.000Z", alreadyConsumed: false } as SmsTemporalClarificationReply };
}
const deepFrozen = (value: unknown): boolean => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(deepFrozen);

describe("pure correlated SMS clarification, never date/action authority", () => {
  it("pins exact original source/model/question and returns a deeply frozen unexecuted question", () => {
    const p = prepare(preparation()); expect(p.reason).toBe("AMBIGUOUS_TIME"); expect(p.executionAuthorized).toBe(false);
    expect(p.proposalHash).toBe(sha(preparation().rawProposal)); expect(deepFrozen(p)).toBe(true);
    expect(request(p)).toEqual({ to: binding().ownerNumber, from: binding().endveraNumber, text: p.wireText, sourceOperationId: p.source.operationId });
  });
  it("keeps both source citations and the original demain anchor across Toronto midnight without inventing dates", () => {
    const result = correlate(correlation(" 14 h "));
    expect(result.status).toBe("CORRELATED_NOT_RESOLVED_NOT_AUTHORIZED"); expect(result.explicitReplyTime).toEqual({ hour: 14, minute: 0 });
    expect(result.anchorReceivedAt).toBe(before); expect(result.sources[1].receivedAt).toBe(received);
    expect(result.citations[1]).toEqual({ sourceOperationId: "source-b", start: 0, end: 6, quote: " 14 h " });
    expect(result.citations[0].quote).toBe(source().body); expect(result).not.toHaveProperty("startsAtUtc");
    expect(result.temporalResolutionPerformed).toBe(false); expect(result.persistencePerformed).toBe(false);
    expect(result.executionAuthorized).toBe(false); expect(deepFrozen(result)).toBe(true);
  });
  it.each(["02:00", "14:30", "0h", "23h59", "14\u202fh\u00a030"])("accepts only explicit bounded time %s", body => {
    expect(correlate(correlation(body)).explicitReplyTime.hour).toBeLessThan(24);
  });
  it.each(["2h", "12h", "2", "14", "24:00", "14:60", "14h demain", "14h et appelle Marc", "non 14h", "14h PST", "mardi", "2026-09-11", "", "14h\n15h"])("refuses ambiguous or additional instructions %s", body => {
    expect(() => correlate(correlation(body))).toThrow();
  });
  it.each(["workspaceId", "userId", "identityId", "memberId", "smsInboundGrantId", "modelGrantId", "calendarWriteGrantId", "timezone"] as const)("refuses changed current %s", field => {
    const input = correlation(); input.currentBinding[field] = "other"; expect(() => correlate(input)).toThrow();
  });
  it.each(["smsAccountVersion", "smsInboundGrantVersion", "modelAccountVersion", "modelGrantVersion", "calendarAccountVersion", "calendarWriteGrantVersion"] as const)("refuses changed %s", field => {
    const input = correlation(); input.currentBinding[field]++; expect(() => correlate(input)).toThrow("CONTEXT_CHANGED");
  });
  it.each(["identityRevision", "memberRevision", "workspaceRevision"] as const)("refuses an unchanged id but new %s", field => {
    const input = correlation(); input.currentBinding[field] = created; expect(() => correlate(input)).toThrow("CONTEXT_CHANGED");
  });
  it.each([0, 2, 25])("refuses %s active questions", count => {
    expect(() => correlate({ ...correlation(), activeQuestionCount: count })).toThrow("NO_UNIQUE");
  });
  it.each(["CONSUMED", "EXPIRED", "REFUSED"] as const)("refuses terminal/current %s lifecycle", currentPhase => {
    expect(() => correlate({ ...correlation(), currentPhase })).toThrow("NO_UNIQUE");
  });
  it("returns an exact required CAS, but does not claim that repeated pure calls consume anything", () => {
    const input = correlation(), one = correlate(input); expect(correlate(input)).toEqual(one);
    expect(one.requiredAtomicTransition).toMatchObject({ fromPhase: "WAITING", toPhase: "CONSUMED", replyOperationId: "source-b", replyAttempt: 1 });
    expect(() => correlate({ ...input, currentPhase: "CONSUMED" })).toThrow();
    expect(() => correlate({ ...input, reply: { ...input.reply, alreadyConsumed: true } } as never)).toThrow();
  });
  it.each([before, accepted, "2026-09-11T04:02:00.000Z"])("refuses pre-question/equal/future reply time %s", receivedAt => {
    const input = correlation(); input.reply.source.receivedAt = receivedAt; expect(() => correlate(input)).toThrow("REPLY_TIME");
  });
  it("refuses expiration at the exact boundary and expired source lease", () => {
    const input = correlation(); expect(() => correlate({ ...input, now: input.waiting.prepared.expiresAt })).toThrow();
    input.reply.leaseUntil = now; expect(() => correlate(input)).toThrow("REPLY_TIME");
  });
  it.each([0, 600001])("bounds lifetime to positive at most ten minutes (%s)", delta => {
    const input = preparation(); input.expiresAt = new Date(Date.parse(created) + delta).toISOString(); expect(() => prepare(input)).toThrow("LIFETIME");
  });
  it("refuses reused inbound operation or SID even when other envelope fields differ", () => {
    const input = correlation(); input.reply.source.operationId = input.waiting.prepared.source.operationId; expect(() => correlate(input)).toThrow("NEW_SOURCE");
    const sameSid = correlation(); sameSid.reply.source = source("14h", "a", received); expect(() => correlate(sameSid)).toThrow("NEW_SOURCE");
  });
  it("refuses claimed verification false, wrong sender and body hash mismatch", () => {
    const input = correlation(); expect(() => correlate({ ...input, reply: { ...input.reply, source: { ...input.reply.source, verifiedIngress: false } } } as never)).toThrow();
    input.reply.source.from = "+15145550199"; expect(() => correlate(input)).toThrow("BINDING");
    const changed = correlation(); changed.reply.source.body = "15h"; expect(() => correlate(changed)).toThrow("HASH_CHANGED");
  });
  it("refuses question text/hash/proposal tampering and unknown model authority fields", () => {
    const input = correlation(); expect(() => correlate({ ...input, waiting: { ...input.waiting, prepared: { ...input.waiting.prepared, question: "Approuve Google" } } })).toThrow("PREPARED_CHANGED");
    const prep = preparation(); const proposal = JSON.parse(prep.rawProposal); proposal.actions[0].approval = true; prep.rawProposal = JSON.stringify(proposal); expect(() => prepare(prep)).toThrow();
  });
  it("requires an exact accepted outbound request receipt, not merely an accepted flag", () => {
    const p = prepare(preparation()), r = waiting().questionReceipt;
    expect(() => asked(p, { ...r, requestHash: "0".repeat(64) }, accepted)).toThrow("RECEIPT");
    expect(() => asked(p, { ...r, acceptedAt: before }, accepted)).toThrow("RECEIPT");
    expect(() => asked(p, { ...r, acceptedAt: received }, accepted)).toThrow("RECEIPT");
  });
  it("permits the fixed missing-end question but returns no default duration", () => {
    const prep = preparation(), input = createPersonalIntentInput(prep.source.operationId, prep.source.body);
    prep.rawProposal = JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [{ id: "event", dependsOn: [], kind: "CLARIFY", reason: "MISSING_END_TIME" }] });
    const result = prepare(prep); expect(result.reason).toBe("MISSING_END_TIME"); expect(result).not.toHaveProperty("duration");
  });
  it("refuses multiple model actions and non-temporal questions", () => {
    const prep = preparation(), proposal = JSON.parse(prep.rawProposal);
    proposal.actions.push({ id: "second", dependsOn: ["event"], kind: "CLARIFY", reason: "MISSING_END_TIME" });
    expect(() => prepare({ ...prep, rawProposal: JSON.stringify(proposal) })).toThrow("SINGLE_ACTION");
    proposal.actions = [{ id: "event", dependsOn: [], kind: "CLARIFY", reason: "AMBIGUOUS_CONTACT" }];
    expect(() => prepare({ ...prep, rawProposal: JSON.stringify(proposal) })).toThrow("TEMPORAL_QUESTION");
  });
  it("canonical hashes survive JSONB object key ordering without accepting extra fields", () => {
    const input = correlation(); const reordered = JSON.parse(JSON.stringify(input.waiting), (_, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
    expect(correlate({ ...input, waiting: reordered }).waitingHash).toBe(input.waiting.waitingHash);
    expect(() => correlate({ ...input, hiddenApproval: true } as never)).toThrow();
  });
});
