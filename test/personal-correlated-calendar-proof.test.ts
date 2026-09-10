import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolveCorrelatedPersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/correlated-temporal-resolution";
import { prepareSmsTemporalClarification, markSmsTemporalClarificationAsked, smsTemporalClarificationQuestionRequest } from "@/server/personal-assistant/sms-temporal-clarification";
import { buildCorrelatedCalendarReferenceProof, inspectCorrelatedCalendarReferenceProof, PERSONAL_CORRELATED_CALENDAR_PROOF_MAX_BYTES } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { correlatedReceiptFixture as fixture } from "./fixtures/personal-correlated-receipt.fixture";

const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const build = (f = fixture()) => buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
const frozen = (value: unknown): boolean => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(frozen);
const rawSha = (value: string) => createHash("sha256").update(value).digest("hex");
function retitledFixture(title: string) {
  const f = fixture(), p = f.durable.waiting.prepared;
  const original = { ...p.source, body: `Ajoute ${title} demain à 2h, fin 15h.` };
  original.requestHash = rawSha(JSON.stringify({ accountSid: original.accountSid, messageSid: original.messageSid, from: original.from, to: original.to, body: original.body }));
  const span = (quote: string) => ({ quote, start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length });
  const rawProposal = JSON.stringify({ schemaVersion: 1, requestFingerprint: createPersonalIntentInput(original.operationId, original.body).requestFingerprint,
    actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span(title), starts: span("demain à 2h"), ends: span("15h") }] });
  const prepared = prepareSmsTemporalClarification({ schemaVersion: 1, clarificationId: p.clarificationId, binding: p.binding, source: original,
    modelChildOperationId: p.modelChildOperationId, modelGatewayOperationId: p.modelGatewayOperationId, actionId: p.actionId,
    createdAt: p.createdAt, expiresAt: p.expiresAt, rawProposal });
  const receipt = { ...f.durable.waiting.questionReceipt, requestHash: rawSha(JSON.stringify(smsTemporalClarificationQuestionRequest(prepared))) };
  const waiting = markSmsTemporalClarificationAsked(prepared, receipt, receipt.acceptedAt);
  f.live.waiting = waiting; f.durable.waiting = waiting; f.durable.original.source = original;
  f.packet = resolveCorrelatedPersonalCalendarTemporal(f.live); f.packetHash = sha(f.packet);
  return f;
}

describe("pure correlated calendar reference proof", () => {
  it("uses the real durable receipt inspector and preserves its exact hashes without mutation", () => {
    const f = fixture(), before = canonicalJson(f), actual = build(f);
    const prior = inspectCorrelatedPersonalReceiptProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
    expect(actual.proof.inspectedReceiptProofHash).toBe(prior.proofHash);
    expect(actual.packetHash).toBe(f.packetHash); expect(actual.receiptId).toBe("receipt");
    expect(actual.proof.draft).toEqual({ title: "inspection 🛠️", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" });
    expect(actual).toMatchObject({ status: "CORRELATED_CALENDAR_REFERENCE_INSPECTED_NOT_AUTHORIZED", requestId: "a912443d-1e19-8185-ba4d-3cbfbb315066",
      calendarOperationId: null, executionAuthorized: false, persistencePerformed: false, providerExecutionPerformed: false, approvalAvailable: false });
    expect(actual.proof.semanticInterpretationVerified).toBe(false);
    expect(canonicalJson(f)).toBe(before); expect(frozen(actual)).toBe(true);
    expect(actual.proofHash).toBe(sha(actual.proof));
  });
  it("omits SMS bodies, quote copies, phones, SIDs, raw proposal and historical lease", () => {
    const f = fixture(), actual = build(f), text = canonicalJson(actual);
    for (const forbidden of [f.durable.original.source.body, f.durable.original.source.from, f.durable.original.source.to,
      f.durable.original.source.accountSid, f.durable.answer.source.messageSid, f.durable.receipt.sourceClaim.leaseUntil,
      '"body":', '"quote":', '"rawProposal":', '"sourceClaim":']) expect(text).not.toContain(forbidden);
    expect(Object.keys(actual.proof).sort()).toEqual(["draft", "executionAuthorized", "inspectedReceiptProofHash", "receiptProofVersion",
      "semanticInterpretationVerified", "sourceAuthority", "titleNormalization", "version"]);
    for (const key of ["sources", "citations", "preparedHash", "bindingHash", "evidenceHash", "resolutionHash", "anchorReceivedAt", "timezone", "receiptId", "packetHash"])
      expect(actual.proof).not.toHaveProperty(key);
    expect(Buffer.byteLength(canonicalJson(actual.proof))).toBeLessThan(PERSONAL_CORRELATED_CALENDAR_PROOF_MAX_BYTES);
  });
  it("uses original anchor across midnight and UTF16 citations without copying them", () => {
    const f = fixture(), actual = build(f), before = canonicalJson(f.packet);
    expect(actual.proof.draft.startsAt).toBe("2026-09-11T18:00:00.000Z");
    expect(actual.proof.draft.title).toBe("inspection 🛠️"); expect(canonicalJson(f.packet)).toBe(before);
  });
  it.each(["\u00a0inspection 🛠️\u00a0", "\ufeffinspection 🛠️\ufeff", "\tinspection 🛠️\n", "\u2028inspection 🛠️\u2029"])("uses the existing producer's exact title trim without rewriting sources %#", title => {
    const f = retitledFixture(title), original = canonicalJson(f), value = build(f);
    expect(value.proof.draft.title).toBe("inspection 🛠️"); expect(canonicalJson(f)).toBe(original);
    expect(value.proof.titleNormalization).toBe("EXISTING_SCHEMA_TRIM_ONLY");
  });
  it("accepts JSONB-style key reordering, never schema normalization of stored proof", () => {
    const actual = build(), reordered = JSON.parse(canonicalJson(actual.proof));
    expect(inspectCorrelatedCalendarReferenceProof(reordered, actual.proofHash).proof).toEqual(actual.proof);
    reordered.draft.title = " " + reordered.draft.title;
    expect(() => inspectCorrelatedCalendarReferenceProof(reordered, sha(reordered))).toThrow("REFERENCE_CHANGED");
  });
  it("labels standalone validation as unauthenticated even if a caller computes a new valid hash", () => {
    const proof = structuredClone(build().proof); proof.inspectedReceiptProofHash = "0".repeat(64);
    const result = inspectCorrelatedCalendarReferenceProof(proof, sha(proof));
    expect(result.proof.sourceAuthority).toBe("NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT");
    expect(result.executionAuthorized).toBe(false);
    // Reconstruct-and-compare from authenticated DB facts remains required.
    expect(result.proofHash).not.toBe(build().proofHash);
  });
  it.each([
    (p: ReturnType<typeof build>["proof"]) => { p.executionAuthorized = true as false; },
    (p: ReturnType<typeof build>["proof"]) => { p.semanticInterpretationVerified = true as false; },
    (p: ReturnType<typeof build>["proof"]) => { p.draft.endsAt = p.draft.startsAt; },
    (p: ReturnType<typeof build>["proof"]) => { p.draft.endsAt = "2020-01-01T00:00:00Z"; },
  ])("refuses inconsistent reference %#", mutate => {
    const p = structuredClone(build().proof); mutate(p); expect(() => inspectCorrelatedCalendarReferenceProof(p, sha(p))).toThrow();
  });
  it.each(["\0", "\ud800", "\udc00"])("rejects PostgreSQL-incompatible strings %#", bad => {
    const p = structuredClone(build().proof); p.draft.title = bad;
    expect(() => inspectCorrelatedCalendarReferenceProof(p, sha(p))).toThrow("STRING_INVALID");
  });
  it("refuses unknown nested fields, coercion and hash tampering", () => {
    const p = build().proof;
    for (const v of [{ ...p, body: "copied text" }, { ...p, draft: { ...p.draft, approved: true } },
      { ...p, draft: { ...p.draft, title: 42 } }, { ...p, receiptId: "receipt" }, { ...p, preparedHash: "0".repeat(64) }]) {
      expect(() => inspectCorrelatedCalendarReferenceProof(v, sha(v))).toThrow();
    }
    expect(() => inspectCorrelatedCalendarReferenceProof(p, "0".repeat(64))).toThrow("REFERENCE_CHANGED");
  });
  it("bounds serialized UTF8 bytes before strict schema and rejects cycles/accessors", () => {
    const p = build().proof, huge = { ...p, draft: { ...p.draft, title: "é".repeat(9000) } };
    expect(() => inspectCorrelatedCalendarReferenceProof(huge, sha(huge))).toThrow("BOUND_EXCEEDED");
    const cyclic: Record<string, unknown> = {}; cyclic.value = cyclic;
    expect(() => inspectCorrelatedCalendarReferenceProof(cyclic, "0".repeat(64))).toThrow("JSON_REQUIRED");
    let reads = 0; const accessor = { get value() { reads++; return 1; } };
    expect(() => inspectCorrelatedCalendarReferenceProof(accessor, "0".repeat(64))).toThrow("JSON_REQUIRED"); expect(reads).toBe(0);
  });
  it("rejects invalid historical claims, live-phase substitution or changed packet before deriving a proof", () => {
    const f = fixture();
    expect(() => buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: "0".repeat(64) })).toThrow("PACKET_CHANGED");
    f.durable.receipt.sourceClaim.operationId = "other"; expect(() => build(f)).toThrow("CLAIM_CHANGED");
    const g = fixture(); g.durable.original.status = "processing" as "completed"; expect(() => build(g)).toThrow();
  });
  it("refuses validly hashed but altered semantic output using the canonical inspector", () => {
    const f = fixture(), packet = { ...f.packet, startsAtUtc: "2026-09-15T18:00:00.000Z" };
    expect(() => buildCorrelatedCalendarReferenceProof(f.durable, { packet, packetHash: sha(packet) })).toThrow("RESOLUTION_CHANGED");
  });
});
