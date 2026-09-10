import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolveCorrelatedPersonalCalendarTemporal as resolve } from "@/server/model-gateway/personal-intent/correlated-temporal-resolution";
import { resolvePersonalCalendarTemporal as legacy, resolvePersonalCalendarTemporalClarifiedSlot as primitive } from "@/server/model-gateway/personal-intent/temporal";
import { prepareSmsTemporalClarification as prepare, markSmsTemporalClarificationAsked as asked,
  smsTemporalClarificationQuestionRequest as request, type SmsTemporalClarificationBinding } from "@/server/personal-assistant/sms-temporal-clarification";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const anchor = "2026-09-11T03:58:00.000Z", accountSid = "AC" + "a".repeat(32);
function fixture(options: { start?: string; end?: string; answer?: string; timezone?: string; clarify?: boolean; prefix?: string } = {}) {
  const binding: SmsTemporalClarificationBinding = { workspaceId: "workspace", userId: "owner", memberId: "member", memberRole: "owner",
    memberRevision: anchor, workspaceRevision: anchor, identityId: "identity", identityRevision: anchor, verifiedIdentity: true,
    ownerNumber: "+15145550100", endveraNumber: "+15145550101", smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid),
    smsInboundGrantId: "inbound", smsInboundGrantVersion: 1, modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
    calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: options.timezone ?? "America/Toronto" };
  const source = (body: string, suffix: string, receivedAt: string) => {
    const envelope = { accountSid, messageSid: "SM" + suffix.repeat(32), from: binding.ownerNumber, to: binding.endveraNumber, body };
    return { operationId: "source-" + suffix, workspaceId: "workspace", userId: "owner", identityId: "identity", verifiedIngress: true as const,
      ...envelope, requestHash: sha(JSON.stringify(envelope)), receivedAt };
  };
  const start = options.start ?? "demain à 2h", end = options.end ?? "15h";
  const original = source(`${options.prefix ?? "Ajoute"} inspection ${start}, fin ${end}.`, "a", anchor);
  const span = (quote: string) => ({ start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length, quote });
  const input = createPersonalIntentInput(original.operationId, original.body);
  const action = options.clarify ? { id: "event", kind: "CLARIFY", dependsOn: [], reason: "MISSING_END_TIME" }
    : { id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span(start), ends: span(end) };
  const prepared = prepare({ schemaVersion: 1, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding, source: original,
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", actionId: "event", createdAt: "2026-09-11T03:58:10.000Z", expiresAt: "2026-09-11T04:08:00.000Z",
    rawProposal: JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [action] }) });
  const waiting = asked(prepared, { outboundOperationId: "question", requestHash: sha(JSON.stringify(request(prepared))), acceptedProviderSid: "SM" + "c".repeat(32),
    acceptedAt: "2026-09-11T03:58:20.000Z", acceptedByProvider: true, deliveryConfirmed: false }, "2026-09-11T03:58:20.000Z");
  return { waiting, currentBinding: binding, currentPhase: "WAITING" as const, activeQuestionCount: 1, now: "2026-09-11T04:01:01.000Z",
    reply: { source: source(options.answer ?? "14h", "b", "2026-09-11T04:01:00.000Z"), attempt: 1 as const, status: "processing" as const,
      leaseUntil: "2026-09-11T04:01:30.000Z", alreadyConsumed: false as const } };
}
const frozen = (value: unknown): boolean => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(frozen);

describe("pure correlated calendar resolution via existing temporal primitives", () => {
  it("resolves START on original tomorrow across midnight, without merging either SMS", () => {
    const input = fixture(), result = resolve(input);
    expect(result).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", startsAtUtc: "2026-09-11T18:00:00.000Z", endsAtUtc: "2026-09-11T19:00:00.000Z",
      anchorReceivedAt: anchor, timezone: "America/Toronto", temporalResolutionPerformed: true, executionAuthorized: false, persistencePerformed: false, providerExecutionPerformed: false, preview: null });
    if (result.status !== "RESOLVED_NOT_AUTHORIZED") throw new Error("resolution expected");
    expect(result.sources.map(s => s.body)).toEqual([input.waiting.prepared.source.body, "14h"]);
    expect(result.citations.originalStart.quote).toBe("demain à 2h"); expect(result.citations.answer.quote).toBe("14h");
    expect(result).not.toHaveProperty("draft"); expect(result.resolutionHash).toMatch(/^[a-f0-9]{64}$/); expect(frozen(result)).toBe(true);
  });
  it("resolves END while preserving explicit start exactly", () => {
    expect(resolve(fixture({ start: "demain à 14h", end: "3h", answer: "15h" }))).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED",
      startsAtUtc: "2026-09-11T18:00:00.000Z", endsAtUtc: "2026-09-11T19:00:00.000Z" });
  });
  it("retains a separately specified original end date", () => {
    expect(resolve(fixture({ end: "2026-09-12 à 01:00" }))).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", endsAtUtc: "2026-09-12T05:00:00.000Z" });
  });
  it.each([
    ["2026-03-08 à 2h", "04:00", "02:30", "America/Toronto", "DST_GAP"],
    ["2026-11-01 à 1h", "03:00", "01:30", "America/Toronto", "DST_FOLD"],
    ["2026-04-05 à 1h", "03:00", "01:45", "Australia/Lord_Howe", "DST_FOLD"],
    ["2026-10-04 à 2h", "03:00", "02:15", "Australia/Lord_Howe", "DST_GAP"],
  ])("uses the existing exhaustive DST check for %s in %s", (start, end, answer, timezone, reason) => {
    const result = resolve(fixture({ start, end, answer, timezone }));
    expect(result).toMatchObject({ status: "CLARIFY", reason, temporalResolutionPerformed: false, executionAuthorized: false });
    expect(result).not.toHaveProperty("startsAtUtc");
  });
  it("checks DST on unchanged END too", () => {
    expect(resolve(fixture({ start: "2026-03-08 à 1h", end: "02:30", answer: "01:00" }))).toMatchObject({ status: "CLARIFY", reason: "DST_GAP" });
  });
  it("does not roll an earlier end into tomorrow or invent duration", () => {
    expect(resolve(fixture({ answer: "16h" }))).toMatchObject({ status: "CLARIFY", reason: "END_NOT_AFTER_START" });
    expect(resolve(fixture({ answer: "15h" }))).toMatchObject({ status: "CLARIFY", reason: "END_NOT_AFTER_START" });
  });
  it("two ambiguous slots and missing template remain insufficient", () => {
    expect(resolve(fixture({ end: "3h" })).status).toBe("INSUFFICIENT_ORIGINAL_TEMPLATE");
    expect(resolve(fixture({ clarify: true })).status).toBe("INSUFFICIENT_ORIGINAL_TEMPLATE");
  });
  it.each(["Ne rajoute plus", "Don't add", "Ajoute puis appelle Marc pour"])("refuses unsafe original source %s", prefix => {
    expect(resolve(fixture({ prefix }))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "UNSAFE_SOURCE_CONTEXT" });
  });
  it("refuses context change, replay, proposal mutation and extra answer instruction", () => {
    const input = fixture(); input.currentBinding.calendarWriteGrantVersion++;
    expect(() => resolve(input)).toThrow("CONTEXT_CHANGED");
    expect(() => resolve({ ...fixture(), currentPhase: "CONSUMED" })).toThrow();
    expect(() => resolve(fixture({ answer: "14h demain" }))).toThrow();
    const changed = fixture(); expect(() => resolve({ ...changed, waiting: { ...changed.waiting, prepared: { ...changed.waiting.prepared, rawProposal: changed.waiting.prepared.rawProposal + " " } } })).toThrow();
  });
  it("legacy single-source resolver still asks the original question", () => {
    const p = fixture().waiting.prepared, input = createPersonalIntentInput(p.source.operationId, p.source.body), context = { receivedAt: anchor, timezone: p.binding.timezone };
    expect(legacy(input, p.rawProposal, p.actionId, context)).toMatchObject({ status: "CLARIFY", reason: "AMBIGUOUS_TIME" });
    expect(primitive(input, p.rawProposal, p.actionId, context, { slot: "END", hour: 14, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "UNSUPPORTED_ACTION" });
    expect(primitive(input, p.rawProposal, p.actionId, context, { slot: "START", hour: 24, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "INVALID_INPUT" });
  });
});
