import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { inspectCorrelatedPersonalTemporalEvidence as inspect } from "@/server/model-gateway/personal-intent/correlated-temporal-evidence";
import { classifyPersonalCalendarTemporalSlot as classify } from "@/server/model-gateway/personal-intent/temporal";
import { prepareSmsTemporalClarification as prepare, markSmsTemporalClarificationAsked as asked,
  smsTemporalClarificationQuestionRequest as request, type SmsTemporalClarificationBinding } from "@/server/personal-assistant/sms-temporal-clarification";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const accountSid = "AC" + "a".repeat(32), anchor = "2026-09-11T03:58:00.000Z";
function fixture(options: { start?: string; end?: string; prefix?: string; clarify?: boolean; anchor?: string; answer?: string } = {}) {
  const originalTime = options.anchor ?? anchor, at = (ms: number) => new Date(Date.parse(originalTime) + ms).toISOString();
  const binding: SmsTemporalClarificationBinding = { workspaceId: "workspace", userId: "owner", memberId: "member", memberRole: "owner",
    memberRevision: originalTime, workspaceRevision: originalTime, identityId: "identity", identityRevision: originalTime, verifiedIdentity: true,
    ownerNumber: "+15145550100", endveraNumber: "+15145550101", smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid),
    smsInboundGrantId: "inbound", smsInboundGrantVersion: 1, modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
    calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: "America/Toronto" };
  const source = (body: string, suffix: string, receivedAt: string) => {
    const envelope = { accountSid, messageSid: "SM" + suffix.repeat(32), from: binding.ownerNumber, to: binding.endveraNumber, body };
    return { operationId: "source-" + suffix, workspaceId: binding.workspaceId, userId: binding.userId, identityId: binding.identityId,
      verifiedIngress: true as const, ...envelope, requestHash: sha(JSON.stringify(envelope)), receivedAt };
  };
  const start = options.start ?? "demain à 2h", end = options.end ?? "15h";
  const original = source(`${options.prefix ?? "Ajoute"} inspection ${start}, fin ${end}.`, "a", originalTime);
  const span = (quote: string) => ({ start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length, quote });
  const input = createPersonalIntentInput(original.operationId, original.body);
  const action = options.clarify ? { id: "event", kind: "CLARIFY", dependsOn: [], reason: "MISSING_END_TIME" }
    : { id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span(start), ends: span(end) };
  const prepared = prepare({ schemaVersion: 1, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding, source: original,
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", actionId: "event", createdAt: at(10000), expiresAt: at(600000),
    rawProposal: JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [action] }) });
  const waiting = asked(prepared, { outboundOperationId: "question", requestHash: sha(JSON.stringify(request(prepared))), acceptedProviderSid: "SM" + "c".repeat(32),
    acceptedAt: at(20000), acceptedByProvider: true, deliveryConfirmed: false }, at(20000));
  return { waiting, currentBinding: binding, currentPhase: "WAITING" as const, activeQuestionCount: 1, now: at(181000),
    reply: { source: source(options.answer ?? "14h", "b", at(180000)), attempt: 1 as const, status: "processing" as const, leaseUntil: at(210000), alreadyConsumed: false as const } };
}
const frozen = (value: unknown): boolean => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(frozen);

describe("existing gateway two-source evidence, never a reconstructed SMS or event", () => {
  it("pins the START slot and both exact hashes/citations across midnight without resolving dates", () => {
    const input = fixture(), result = inspect(input);
    expect(result.status).toBe("EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED");
    if (result.status !== "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED") throw new Error("expected evidence");
    expect(result.slot).toBe("START"); expect(result.anchorReceivedAt).toBe(anchor);
    expect(result.citations.originalStart.quote).toBe("demain à 2h"); expect(result.citations.answer.quote).toBe("14h");
    expect(result.citations.answer.requestHash).toBe(input.reply.source.requestHash);
    expect(result.citations.originalStart.sourceOperationId).not.toBe(result.citations.answer.sourceOperationId);
    expect(result.correlation.sources.map(s => s.body)).toEqual([input.waiting.prepared.source.body, "14h"]);
    expect(result.temporalResolutionPerformed).toBe(false); expect(result.executionAuthorized).toBe(false); expect(result.preview).toBeNull();
    expect(result).not.toHaveProperty("startsAtUtc"); expect(result).not.toHaveProperty("draft"); expect(frozen(result)).toBe(true);
  });
  it("pins only END for a demonstrated explicit start and ambiguous end", () => {
    const result = inspect(fixture({ start: "demain à 14h", end: "3h", answer: "15h" }));
    expect(result).toMatchObject({ status: "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED", slot: "END" });
  });
  it("reuses existing grammar for dayparts rather than a second time parser", () => {
    expect(inspect(fixture({ end: "3h de l’après-midi" }))).toMatchObject({ status: "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED", slot: "START" });
  });
  it("refuses two ambiguous slots", () => {
    expect(inspect(fixture({ end: "3h" }))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "NON_UNIQUE_AMBIGUOUS_SLOT" });
  });
  it("CLARIFY-only cannot supply a title/start/end even when prose appears informative", () => {
    const result = inspect(fixture({ clarify: true }));
    expect(result).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "INCOMPLETE_ORIGINAL_TEMPLATE" });
    expect(result).not.toHaveProperty("citations.title"); expect(result).not.toHaveProperty("startsAtUtc");
  });
  it.each(["N’ajoute pas", "Si possible ajoute", "Ajoute puis appelle Marc pour", "Annule", "Never add", "Ajoute ensuite"])("refuses source context %s", prefix => {
    expect(inspect(fixture({ prefix }))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "UNSAFE_SOURCE_CONTEXT" });
  });
  it("an unsupported second field cannot be called a complete template", () => {
    expect(inspect(fixture({ end: "quand Marc arrive" }))).toMatchObject({ status: "INSUFFICIENT_ORIGINAL_TEMPLATE", reason: "UNSUPPORTED_SLOT_GRAMMAR" });
  });
  it.each([
    ["2026-03-07T20:00:00.000Z", "02:30"], // tomorrow's Toronto gap
    ["2026-10-31T20:00:00.000Z", "01:30"], // tomorrow's Toronto fold
  ])("retains DST-adjacent evidence %s without claiming an instant", (receivedAt, answer) => {
    const result = inspect(fixture({ anchor: receivedAt, answer }));
    expect(result.temporalResolutionPerformed).toBe(false); expect(result.anchorReceivedAt).toBe(receivedAt);
    expect(result.correlation.explicitReplyTime.minute).toBe(30); expect(result).not.toHaveProperty("startsAtUtc");
  });
  it.each(["calendarAccountVersion", "smsInboundGrantVersion", "modelGrantVersion"] as const)("rechecks current %s", key => {
    const input = fixture(); input.currentBinding[key]++; expect(() => inspect(input)).toThrow("CONTEXT_CHANGED");
  });
  it.each(["14h demain", "14h et appelle Marc", "14h PST", "non 14h", "2h", "14h\ud800"])("rejects unbound/ambiguous answer %s", answer => {
    expect(() => inspect(fixture({ answer }))).toThrow();
  });
  it("rejects proposal and source hash mutation", () => {
    const input = fixture();
    expect(() => inspect({ ...input, waiting: { ...input.waiting, prepared: { ...input.waiting.prepared, rawProposal: input.waiting.prepared.rawProposal + " " } } })).toThrow();
    input.reply.source.requestHash = "0".repeat(64); expect(() => inspect(input)).toThrow("SOURCE_HASH_CHANGED");
  });
  it("rejects altered UTF-16 quotation indices, not merely a matching substring", () => {
    const input = fixture(), candidate = JSON.parse(input.waiting.prepared.rawProposal); candidate.actions[0].starts.start++;
    expect(() => inspect({ ...input, waiting: { ...input.waiting, prepared: { ...input.waiting.prepared, rawProposal: JSON.stringify(candidate) } } })).toThrow();
  });
  it("rejects consumed state, reused SID, expiry and multiple questions", () => {
    const input = fixture();
    expect(() => inspect({ ...input, currentPhase: "CONSUMED" })).toThrow();
    expect(() => inspect({ ...input, activeQuestionCount: 2 })).toThrow();
    expect(() => inspect({ ...input, now: input.waiting.prepared.expiresAt })).toThrow();
    input.reply.source.messageSid = input.waiting.prepared.source.messageSid;
    const s = input.reply.source;
    s.requestHash = sha(JSON.stringify({ accountSid: s.accountSid, messageSid: s.messageSid, from: s.from, to: s.to, body: s.body }));
    expect(() => inspect(input)).toThrow("NEW_SOURCE_REQUIRED");
  });
  it("retains UTF-16 source positions after a valid surrogate pair", () => {
    const input = fixture({ prefix: "Ajoute 👷" }), result = inspect(input);
    if (result.status !== "EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED") throw new Error("expected evidence");
    expect(input.waiting.prepared.source.body.slice(result.citations.title.start, result.citations.title.end)).toBe("inspection");
    expect(result.citations.title.start).toBe(input.waiting.prepared.source.body.indexOf("inspection"));
  });
  it("evidence hashes survive reordered JSONB-shaped packet objects", () => {
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)])) : value;
    const input = fixture(); expect(inspect(reorder(input) as typeof input)).toEqual(inspect(input));
  });
  it("question receipt causality cannot be replaced with reply time", () => {
    const input = fixture(); input.reply.source.receivedAt = input.waiting.questionReceipt.acceptedAt;
    expect(() => inspect(input)).toThrow("REPLY_TIME_INVALID");
  });
  it("is deterministic evidence only: repeated pure inspection performs no global CAS", () => {
    const input = fixture(); expect(inspect(input)).toEqual(inspect(input)); expect(inspect(input).persistencePerformed).toBe(false);
  });
  it("shared classifier refuses invalid context and exposes no calendar date", () => {
    expect(classify("demain à 2h", "START", { receivedAt: anchor, timezone: "bad/zone" })).toBe("UNSUPPORTED");
    expect(classify("demain à 14h", "START", { receivedAt: anchor, timezone: "America/Toronto" })).toBe("EXPLICIT");
    expect(classify("25h", "END", { receivedAt: anchor, timezone: "America/Toronto" })).toBe("UNSUPPORTED");
  });
});
