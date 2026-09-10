import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@/server/model-gateway/evidence", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/model-gateway/evidence")>();
  return { ...actual, canonicalJson: vi.fn(actual.canonicalJson) };
});
import { canonicalJson } from "@/server/model-gateway/evidence";
import { buildCorrelatedCalendarReferenceProof as build, inspectCorrelatedCalendarReferenceProof as inspect } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { personalCorrelatedCalendarRequestId as requestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";
const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
let result: ReturnType<typeof build>;
beforeEach(() => { const f = correlatedReceiptFixture(); result = build(f.durable, { packet: f.packet, packetHash: f.packetHash }); vi.mocked(canonicalJson).mockClear(); });

describe("pure reference proof boundary cross-review, no DB authority", () => {
  it("refuses a nonenumerable expected-field accessor before invoking it", () => {
    const proof = structuredClone(result.proof); let reads = 0;
    Object.defineProperty(proof.draft, "title", { enumerable: false, configurable: true, get() { reads++; return result.proof.draft.title; } });
    expect(() => inspect(proof, result.proofHash)).toThrow();
    expect(reads).toBe(0);
  });
  it("refuses hidden nonJSON data instead of accepting only its visible projection", () => {
    const proof = structuredClone(result.proof);
    Object.defineProperty(proof, "hiddenCallback", { value: () => "not JSON", enumerable: false });
    expect(() => inspect(proof, result.proofHash)).toThrow();
  });
  it("refuses a sparse array by shape before canonicalizing it (small bounded reproduction)", () => {
    const proof = { ...result.proof, extra: new Array(20_000) };
    expect(() => inspect(proof, result.proofHash)).toThrow();
    expect(canonicalJson).not.toHaveBeenCalled();
  });
  it("keeps the exact eight-field projection and false authority after reordering", () => {
    const proof = JSON.parse(canonicalJson(result.proof));
    const checked = inspect(proof, result.proofHash);
    expect(Object.keys(checked.proof)).toHaveLength(8); expect(checked.proof).toEqual(result.proof);
    expect(checked).toMatchObject({ executionAuthorized: false, persistencePerformed: false });
    expect(checked.proof).toMatchObject({ semanticInterpretationVerified: false, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" });
    expect(Object.isFrozen(checked.proof.draft)).toBe(true);
  });
  it.each(["\0", "\udbff", "\udfff", "a\ud800b"])("refuses incompatible Unicode in a nested timezone and receipt %#", value => {
    const proof = structuredClone(result.proof); proof.draft.timezone = value;
    expect(() => inspect(proof, sha(proof))).toThrow("STRING_INVALID");
    expect(() => requestId(value)).toThrow();
  });
  it("never silently trims a stored proof even when caller rehashes whitespace", () => {
    const proof = structuredClone(result.proof); proof.draft.title = `\ufeff${proof.draft.title}\u00a0`;
    expect(() => inspect(proof, sha(proof))).toThrow("REFERENCE_CHANGED");
  });
  it("does not authenticate invented inspector hashes or arbitrary interval semantics", () => {
    const proof = structuredClone(result.proof); proof.inspectedReceiptProofHash = "f".repeat(64);
    proof.draft.startsAt = "2030-01-01T10:00:00Z"; proof.draft.endsAt = "2030-01-01T11:00:00Z";
    const checked = inspect(proof, sha(proof));
    expect(checked.executionAuthorized).toBe(false); expect(checked.proof.semanticInterpretationVerified).toBe(false);
    expect(checked.proof.sourceAuthority).toBe("NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT");
  });
  it("retains namespace UUIDv8 compatibility for UTF16-bound exact IDs", () => {
    const inputs = ["a".repeat(189) + "🛠", "é", "e\u0301", "receipt "];
    const ids = inputs.map(requestId); expect(new Set(ids).size).toBe(inputs.length);
    for (const id of ids) { expect(z.string().uuid().safeParse(id).success).toBe(true); expect(id[14]).toBe("8"); expect("89ab").toContain(id[19]); }
    expect(() => requestId("a".repeat(190) + "🛠")).toThrow();
    expect(requestId("receipt")).toBe("a912443d-1e19-8185-ba4d-3cbfbb315066");
  });
  it("does not accept the pure builder as a bypass around a changed historical source", () => {
    const f = correlatedReceiptFixture(); f.durable.answer.source.body = "18h";
    expect(() => build(f.durable, { packet: f.packet, packetHash: f.packetHash })).toThrow();
  });
});
