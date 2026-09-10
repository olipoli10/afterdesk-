import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { inspectCorrelatedPersonalTemporalEvidence as inspect } from "@/server/model-gateway/personal-intent/correlated-temporal-evidence";
import { prepareSmsTemporalClarification as prepare, markSmsTemporalClarificationAsked as asked,
  smsTemporalClarificationQuestionRequest as questionRequest,
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
function fixture(prefix = "Ajoute", start = "demain à 2h", end = "16h") {
  const original = source(`${prefix} visite ${start} jusqu’à ${end}.`, "audit-original", "2", anchor);
  const modelInput = createPersonalIntentInput(original.operationId, original.body);
  const span = (quote: string) => ({ quote, start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length });
  const rawProposal = JSON.stringify({ schemaVersion: 1, requestFingerprint: modelInput.requestFingerprint, actions: [{ id: "visit", kind: "PREPARE_CALENDAR_EVENT",
    dependsOn: [], title: span("visite"), starts: span(start), ends: span(end) }] });
  const p = prepare({ schemaVersion: 1, clarificationId: "784c3281-8158-4f84-8bda-bd77972a4c55", binding: binding(), source: original,
    modelChildOperationId: "audit-model-child", modelGatewayOperationId: "audit-gateway", rawProposal, actionId: "visit",
    createdAt: "2026-09-11T03:59:05.000Z", expiresAt: "2026-09-11T04:09:05.000Z" });
  const waiting = asked(p, { outboundOperationId: "audit-question", requestHash: sha(JSON.stringify(questionRequest(p))),
    acceptedProviderSid: `SM${"3".repeat(32)}`, acceptedAt: accepted, acceptedByProvider: true, deliveryConfirmed: false }, accepted);
  return { waiting, currentBinding: binding(), currentPhase: "WAITING" as const, activeQuestionCount: 1, now: clock,
    reply: { source: source(" 14 h 30 ", "audit-reply", "4", "2026-09-11T04:00:10.000Z"), attempt: 1 as const,
      status: "processing" as const, leaseUntil: "2026-09-11T04:00:30.000Z", alreadyConsumed: false as const } };
}

describe("independent correlated temporal evidence review", () => {
  it("retains distinct exact source citations and old receipt anchor, not authority or an appointment", () => {
    const f = fixture(), result = inspect(f);
    expect(result).toMatchObject({ status: "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED", slot: "START", anchorReceivedAt: anchor,
      executionAuthorized: false, temporalResolutionPerformed: false, persistencePerformed: false, providerExecutionPerformed: false, preview: null });
    if (result.status !== "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED") throw new Error("expected evidence");
    expect(result.citations.originalStart).toMatchObject({ quote: "demain à 2h", sourceOperationId: "audit-original" });
    expect(result.citations.answer).toMatchObject({ quote: " 14 h 30 ", sourceOperationId: "audit-reply", requestHash: f.reply.source.requestHash });
    expect(result).not.toHaveProperty("startsAtUtc"); expect(result).not.toHaveProperty("endsAtUtc");
  });
  it.each(["Ne rajoute plus", "Don't add"])("does not call a negated original request a sufficient template: %s", prefix => {
    expect(inspect(fixture(prefix))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "UNSAFE_SOURCE_CONTEXT" });
  });
  it.each(["Can't add", "Won’t add", "Shouldn't add", "Cannot add"])("refuses the closed additional negative marker: %s", prefix => {
    expect(inspect(fixture(prefix))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "UNSAFE_SOURCE_CONTEXT" });
  });
  it("does not assign one reply to two independently ambiguous slots", () => {
    expect(inspect(fixture("Ajoute", "demain à 2h", "4h"))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "NON_UNIQUE_AMBIGUOUS_SLOT" });
  });
  it("can identify END without inventing its date, order or duration", () => {
    expect(inspect(fixture("Ajoute", "demain à 13h", "4h"))).toMatchObject({ status: "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED", slot: "END", anchorReceivedAt: anchor, temporalResolutionPerformed: false });
  });
  it("preserves exact UTF-16 source positions after a supplementary character", () => {
    const f = fixture("📅 Ajoute"), result = inspect(f);
    if (result.status !== "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED") throw new Error("expected evidence");
    for (const name of ["title", "originalStart", "originalEnd"] as const) {
      const span = result.citations[name];
      expect(f.waiting.prepared.source.body.slice(span.start, span.end)).toBe(span.quote);
    }
  });
  it("detaches evidence from subsequent caller mutation and freezes nested citations", () => {
    const f = fixture(), result = inspect(f);
    if (result.status !== "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED") throw new Error("expected evidence");
    f.reply.source.body = "Annule"; f.currentBinding.userId = "different-owner";
    expect(result.citations.answer.quote).toBe(" 14 h 30 ");
    expect(result.correlation.sources[1].userId).toBe("audit-owner");
    expect(Object.isFrozen(result.citations.answer)).toBe(true);
    expect(Object.isFrozen(result.correlation.requiredAtomicTransition)).toBe(true);
  });
  it("fails closed on a current identity epoch even with unchanged phone numbers", () => {
    const f = fixture(); f.currentBinding.identityRevision = accepted;
    expect(() => inspect(f)).toThrow("CONTEXT_CHANGED");
  });
  it("does not accept new response instructions after recomputing their envelope hash", () => {
    const f = fixture(), r = f.reply.source; r.body = "14h et appelle Marc";
    r.requestHash = sha(JSON.stringify({ accountSid: r.accountSid, messageSid: r.messageSid, from: r.from, to: r.to, body: r.body }));
    expect(() => inspect(f)).toThrow();
  });
});
