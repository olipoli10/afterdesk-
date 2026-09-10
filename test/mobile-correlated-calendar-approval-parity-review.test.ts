import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), gate: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: m.gate }));
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";
import { readCorrelatedCalendarApprovalOffer, correlatedCalendarApprovalOfferSchema } from "@/server/personal-assistant/correlated-calendar-approval-offer";
import { correlatedCalendarApprovalResultSchema } from "@/server/personal-assistant/correlated-calendar-approval-result";
import { correlatedCalendarApprovalResponseSchema } from "@/server/personal-assistant/correlated-calendar-approval";
import { inspectCorrelatedCalendarApprovalCommand } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { parsePersonalCorrelatedCalendarApprovalOffer as mobileOffer, personalCorrelatedCalendarApprovalCommand as commandFromOffer,
  parsePersonalCorrelatedCalendarApprovalResult as mobileResult, parsePersonalCorrelatedCalendarApprovalResponse as mobileResponse,
  snapshotCorrelatedApprovalJson } from "../apps/mobile/src/lib/personal-correlated-calendar-approval";

let f: ReturnType<typeof correlatedCalendarOfferFixture>;
beforeEach(() => { vi.resetAllMocks(); f = correlatedCalendarOfferFixture(); vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.now)); vi.spyOn(performance, "now").mockReturnValue(1000);
  m.gate.mockImplementation(async () => f.gate); m.query.mockResolvedValue([{ now: new Date(f.now) }]); m.transaction.mockImplementation(work => work({ $queryRawUnsafe: m.query })); });
afterEach(() => vi.restoreAllMocks());
const read = () => readCorrelatedCalendarApprovalOffer(f.input, f.env, { deadlineAt: Date.parse(f.now) + 5000 });
const parsed = () => mobileOffer(f.dto, "workspace", "review");
function receipt() { return { confirmed: true as const, providerEventId: deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: f.gate.request.requestId, idempotencyKey: f.gate.request.requestId }) }; }
function history(outcome: "NOT_ATTEMPTED" | "PENDING_RESULT" | "UNKNOWN" | "CONFIRMED", reason = "WRITE_OUTCOME_UNKNOWN") {
  return correlatedCalendarApprovalResultSchema.parse({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: f.now,
    readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false, outcome,
    ...(outcome === "NOT_ATTEMPTED" ? {} : { approvedAt: "2026-09-11T04:01:10.000Z" }), ...(outcome === "UNKNOWN" ? { reason } : {}),
    ...(outcome === "CONFIRMED" ? { confirmationBasis: "DURABLE_RECORDED_RESULT", receipt: receipt() } : {}) });
}
function responseBase() { return { ...commandFromOffer(parsed()), version: "personal-correlated-calendar-approval-response-v1", automaticRetry: false, executionAuthorized: false, providerStateVerified: false }; }

describe("actual server DTO/schema to mobile parser parity — synthetic pure producer, mocked gate/DB", () => {
  it("reads the real server offer projection then preserves exact two SMS/UTF16 evidence and five-field command", async () => {
    const dto = await read(); expect(dto).toEqual(f.dto); expect(correlatedCalendarApprovalOfferSchema.parse(dto)).toEqual(dto);
    const mobile = mobileOffer(dto, "workspace", "review"); expect(mobile).toEqual(dto);
    const command = commandFromOffer(mobile); expect(Object.keys(command).sort()).toEqual(["expectedRequestHash", "expectedReviewFingerprint", "reviewId", "version", "workspaceId"]);
    expect(inspectCorrelatedCalendarApprovalCommand(command, f.gate.view).command).toEqual(command);
    expect(mobile.review.evidence.sources[0].text).toContain("🛠️"); expect(mobile.review.evidence.citations).toEqual(f.dto.review.evidence.citations);
    expect(mobile.review.approvalAvailable).toBe(false); expect(mobile.executionAuthorized).toBe(false); expect(m.transaction).toHaveBeenCalledOnce();
  });
  it.each(["workspaceId", "review", "reviewId"])("command construction refuses %s accessor without invoking it", key => {
    const raw = structuredClone(f.dto); let calls = 0;
    if (key === "workspaceId") Object.defineProperty(raw, key, { enumerable: true, get() { calls++; return "workspace"; } });
    else if (key === "review") { const review = raw.review; Object.defineProperty(raw, key, { enumerable: true, get() { calls++; return review; } }); }
    else Object.defineProperty(raw.review, key, { enumerable: true, get() { calls++; return "review"; } });
    expect(() => commandFromOffer(raw as unknown as ReturnType<typeof mobileOffer>)).toThrow(); expect(calls).toBe(0);
  });
  it("rejects an aggregate over byte budget before serializing its composite tree", () => {
    // ~160KiB safe fixture, not a maximal allocation or OOM experiment.
    const raw = { values: Array.from({ length: 5 }, () => "x".repeat(32768)) }, original = JSON.stringify; let composites = 0;
    vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => { if (value && typeof value === "object") composites++; return original(value, replacer, space); });
    expect(() => snapshotCorrelatedApprovalJson(raw)).toThrow("CORRELATED_APPROVAL_INVALID"); expect(composites).toBe(0);
  });
  it("real server source and proof identities are not copied into executable handles", async () => {
    const offer = mobileOffer(await read(), "workspace", "review"), command = commandFromOffer(offer);
    expect(JSON.stringify(command)).not.toMatch(/private-|source-a|source-b|approvalToken|operationId|credential/);
    const raw = structuredClone(f.dto), snap = mobileOffer(raw, "workspace", "review"); raw.review.evidence.sources[0].text = "replaced"; raw.approvalOffer.expectedRequestHash = "f".repeat(64);
    expect(commandFromOffer(snap).expectedRequestHash).toBe(f.dto.approvalOffer.expectedRequestHash); expect(snap.review.evidence.sources[0].text).toEqual(f.dto.review.evidence.sources[0].text);
    expect(Object.isFrozen(snap.review.evidence.citations.title)).toBe(true);
  });
  it("offer does not widen server UNKNOWN provenance to the local-only synthetic preview variant", () => {
    const raw = structuredClone(f.dto); raw.review.evidence.provenance = "SYNTHETIC_LOCAL";
    expect(correlatedCalendarApprovalOfferSchema.safeParse(raw).success).toBe(false);
    expect(() => mobileOffer(raw, "workspace", "review")).toThrow();
  });
  it("accepts a real-schema CONFIRMED response with deterministic event binding and false authority", () => {
    const command = commandFromOffer(parsed()), response = correlatedCalendarApprovalResponseSchema.parse({ ...responseBase(), status: "CONFIRMED", receipt: receipt() });
    const parsedResponse = mobileResponse(response, command); expect(parsedResponse).toEqual(response);
    if (parsedResponse.status !== "CONFIRMED") throw new Error("EXPECTED_CONFIRMED_RESPONSE");
    expect(Object.isFrozen(parsedResponse.receipt)).toBe(true);
  });
  it.each(["NOT_ATTEMPTED", "PENDING_RESULT", "UNKNOWN", "CONFIRMED"] as const)("preserves exact historical %s across both server/mobile contracts", outcome => {
    const result = history(outcome); expect(mobileResult(result, "workspace", "review")).toEqual(result);
    const response = correlatedCalendarApprovalResponseSchema.parse({ ...responseBase(), status: "ALREADY_ATTEMPTED", result });
    expect(mobileResponse(response, commandFromOffer(parsed()))).toEqual(response);
  });
  it.each(["WRITE_OUTCOME_UNKNOWN", "CLAIM_LEASE_EXPIRED", "CLAIM_COMMIT_OUTCOME_UNKNOWN", "DISPATCH_COMMIT_OUTCOME_UNKNOWN", "TERMINAL_COMMIT_OUTCOME_UNKNOWN"])("preserves reason %s without inferring a retry", reason => {
    const result = mobileResult(history("UNKNOWN", reason), "workspace", "review"); expect(result).toMatchObject({ outcome: "UNKNOWN", reason, automaticRetry: false, approvalAvailable: false, executionAuthorized: false });
  });
  it("old historical confirmation needs no unexpired evidence and no local clock inference", () => {
    const result = history("CONFIRMED"); vi.mocked(Date.now).mockReturnValue(Date.parse(f.now) + 365 * 86400000);
    expect(mobileResult(result, "workspace", "review")).toEqual(result); expect(mobileResult(result, "workspace", "review")).toHaveProperty("providerStateVerified", false);
  });
  it.each(["workspaceId", "reviewId"])("closed nested historical %s rejects even when the outer POST matches", key => {
    const raw = { ...responseBase(), status: "ALREADY_ATTEMPTED", result: { ...history("CONFIRMED"), [key]: "foreign" } };
    expect(correlatedCalendarApprovalResponseSchema.safeParse(raw).success).toBe(false); expect(() => mobileResponse(raw, commandFromOffer(parsed()))).toThrow();
  });
  it.each(["executionAuthorized", "providerStateVerified", "automaticRetry"])("both response schemas reject %s=true", key => {
    const raw = { ...responseBase(), status: "CONFIRMED", receipt: receipt(), [key]: true };
    expect(correlatedCalendarApprovalResponseSchema.safeParse(raw).success).toBe(false); expect(() => mobileResponse(raw, commandFromOffer(parsed()))).toThrow();
  });
  it.each(["reviewId", "workspaceId", "expectedRequestHash", "expectedReviewFingerprint"])("mobile binds %s to the displayed command, not any well-shaped server response", key => {
    const raw = { ...responseBase(), status: "CONFIRMED", receipt: receipt(), [key]: key.startsWith("expected") ? "f".repeat(64) : "foreign" };
    const structurallyValid = correlatedCalendarApprovalResponseSchema.parse(raw); expect(() => mobileResponse(structurallyValid, commandFromOffer(parsed()))).toThrow();
  });
});
