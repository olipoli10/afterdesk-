import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { correlateSmsTemporalClarification, inspectDurableSmsTemporalCorrelation, type DurableSmsTemporalCorrelationInput } from "@/server/personal-assistant/sms-temporal-clarification";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { correlatedReceiptFixture as fixture } from "./fixtures/personal-correlated-receipt.fixture";

const isFrozen = (value: unknown): boolean => value === null || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(isFrozen);
const inspect = (input: DurableSmsTemporalCorrelationInput, stored: { packet: unknown; packetHash: string }) => inspectCorrelatedPersonalReceiptProof(input, { packet: stored.packet, packetHash: stored.packetHash });
describe("pure durable completed temporal receipt, no fabricated live claim", () => {
  it("reproduces exactly the historical live packet after its actual lease is expired", () => {
    const f = fixture(), before = canonicalJson(f);
    expect(Date.parse(f.durable.now)).toBeGreaterThan(Date.parse(f.durable.receipt.sourceClaim.leaseUntil));
    const proof = inspect(f.durable, f);
    expect(proof).toMatchObject({ status: "CORRELATED_RECEIPT_PROOF_INSPECTED_NOT_AUTHORIZED", subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" },
      draft: null, executionAuthorized: false, persistencePerformed: false, providerExecutionPerformed: false });
    expect(canonicalJson(proof.originalPacket)).toBe(canonicalJson(f.packet));
    expect(canonicalJson(proof.resolution)).toBe(canonicalJson(f.packet));
    expect(proof.packetHash).toBe(f.packetHash); expect(canonicalJson(f)).toBe(before); expect(isFrozen(proof)).toBe(true);
    expect(proof.resolution.sources.map(source => source.body)).toEqual([f.durable.original.source.body, "14h"]);
    expect(proof.resolution.startsAtUtc).toBe("2026-09-11T18:00:00.000Z");
    expect(proof.resolution.anchorReceivedAt).toBe("2026-09-11T03:58:00.000Z");
  });
  it("live API still refuses the consumed state and expired live lease", () => {
    const f = fixture();
    expect(() => correlateSmsTemporalClarification({ ...f.live, currentPhase: "CONSUMED" })).toThrow("NO_UNIQUE_PENDING");
    expect(() => correlateSmsTemporalClarification({ ...f.live, now: f.durable.now })).toThrow("REPLY_TIME_INVALID");
    expect(inspectDurableSmsTemporalCorrelation(f.durable).historicalCorrelation).toEqual(correlateSmsTemporalClarification(f.live));
  });
  it.each(["original", "answer"] as const)("requires %s completed, attempt1, lease-null without rewriting the input", field => {
    for (const change of [{ status: "processing" }, { attempt: 2 }, { leaseUntil: "2099-01-01T00:00:00.000Z" }]) {
      const f = fixture(), input = { ...f.durable, [field]: { ...f.durable[field], ...change } } as DurableSmsTemporalCorrelationInput;
      expect(() => inspect(input, f)).toThrow();
    }
  });
  it.each(["CONSUMED-other", "WAITING", "EXPIRED"])("refuses current phase %s rather than substituting WAITING", phase => {
    const f = fixture(); expect(() => inspect({ ...f.durable, questionPhase: phase } as DurableSmsTemporalCorrelationInput, f)).toThrow();
  });
  it.each(["userId", "workspaceId", "identityId", "timezone", "modelGrantVersion", "calendarWriteGrantVersion"] as const)("refuses current binding changed at %s", field => {
    const f = fixture(), currentBinding = { ...f.durable.currentBinding, [field]: typeof f.durable.currentBinding[field] === "number" ? 2 : "other" };
    expect(() => inspect({ ...f.durable, currentBinding }, f)).toThrow();
  });
  it.each(["operationId", "workspaceId", "userId"] as const)("historical claim %s cannot be transplanted", field => {
    const f = fixture(); f.durable.receipt.sourceClaim[field] = "other"; expect(() => inspect(f.durable, f)).toThrow("CLAIM_CHANGED");
  });
  it("refuses another consumed receipt, answer id/SID and changed original source", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.durable.consumedReplyId = "other"; },
      (f: ReturnType<typeof fixture>) => { f.durable.answer.source.operationId = f.durable.original.source.operationId; },
      (f: ReturnType<typeof fixture>) => { f.durable.original.source.body += " demain"; },
    ]) { const f = fixture(); mutate(f); expect(() => inspect(f.durable, f)).toThrow(); }
  });
  it.each(["2026-09-11T04:00:59.000Z", "2026-09-11T04:01:30.000Z", "2026-09-11T04:03:00.000Z"])("refuses noncausal receipt recording time %s", recorded => {
    const f = fixture(); f.durable.receipt.createdAt = recorded; expect(() => inspect(f.durable, f)).toThrow("RECEIPT_TIME_INVALID");
  });
  it("refuses exact expiry instead of extending the review window", () => {
    const f = fixture(); f.durable.now = f.durable.waiting.prepared.expiresAt; expect(() => inspect(f.durable, f)).toThrow("QUESTION_RECEIPT_INVALID");
  });
  it("refuses changed packet bytes/hash and additional fields even with recomputed hash", () => {
    const f = fixture();
    expect(() => inspect(f.durable, { packet: f.packet, packetHash: "0".repeat(64) })).toThrow("PACKET_CHANGED");
    for (const packet of [{ ...f.packet, schemaVersion: 2 }, { ...f.packet, executionAuthorized: true }, { ...f.packet, startsAtUtc: "2030-01-01T00:00:00Z" }, { ...f.packet, additional: true }])
      expect(() => inspect(f.durable, { packet, packetHash: temporalSha(canonicalJson(packet)) })).toThrow("RESOLUTION_CHANGED");
  });
  it("does not turn historical insufficiency or DST clarification into an accepted resolution", () => {
    for (const options of [{ end: "3h" }, { start: "2026-11-01 à 1h", end: "03:00", answer: "01:30" }, { answer: "16h" }]) {
      const f = fixture(options); expect(() => inspect(f.durable, f)).toThrow("RESOLUTION_CHANGED");
    }
  });
  it("version, Unicode quote or raw proposal mutation cannot be hidden by a new packet hash", () => {
    const f = fixture(), packet = JSON.parse(canonicalJson(f.packet));
    packet.citations.title.quote = "inspection 🛠";
    expect(() => inspect(f.durable, { packet, packetHash: temporalSha(canonicalJson(packet)) })).toThrow("RESOLUTION_CHANGED");
    const input = structuredClone(f.durable); input.waiting.prepared.rawProposal += " "; expect(() => inspect(input, f)).toThrow("PREPARED_CHANGED");
  });
});
