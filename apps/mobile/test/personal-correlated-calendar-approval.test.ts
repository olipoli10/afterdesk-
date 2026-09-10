import { describe, expect, it } from "vitest";
import { correlatedApprovalId, parsePersonalCorrelatedCalendarApprovalOffer as offer, personalCorrelatedCalendarApprovalCommand as command,
  parsePersonalCorrelatedCalendarApprovalResult as result, parsePersonalCorrelatedCalendarApprovalResponse as response, snapshotCorrelatedApprovalJson } from "../src/lib/personal-correlated-calendar-approval";
import { approvalOfferFixture, approvalCommandFixture, approvalResponseFixture, approvalHistoryFixture } from "./fixtures/correlated-calendar-approval";
describe("strict correlated mobile approval contracts", () => {
  it("preserves exact two-source V1 and builds only the five command fields", () => {
    const raw = approvalOfferFixture(), parsed = offer(raw, "workspace", "review"); expect(parsed).toEqual(raw); expect(command(parsed)).toEqual(approvalCommandFixture());
    raw.review.evidence.sources[0].text = "changed"; expect(parsed.review.evidence.sources[0].text).not.toBe("changed"); expect(Object.isFrozen(parsed.review.evidence.sources[0])).toBe(true);
    expect(parsed.review.approvalAvailable).toBe(false);
  });
  it.each(["rootVersion", "scope", "review", "offerReview", "expiry", "inspected", "phase", "authority", "calendarId", "claim"])("refuses offer mismatch %s", kind => {
    const raw = approvalOfferFixture(); if (kind === "rootVersion") raw.version = "other"; else if (kind === "scope") raw.workspaceId = "other";
    else if (kind === "review") raw.review.reviewId = "other"; else if (kind === "offerReview") raw.approvalOffer.reviewId = "other";
    else if (kind === "expiry") raw.approvalOffer.approvalExpiresAt = "2026-09-11T04:09:00.000Z";
    else if (kind === "inspected") raw.approvalOffer.inspectedAt = raw.approvalOffer.approvalExpiresAt;
    else if (kind === "phase") raw.review.currentStatus = "completed"; else if (kind === "authority") raw.approvalOffer.executionAuthorized = true;
    else Object.assign(raw, { [kind]: "secret" }); expect(() => offer(raw, "workspace", "review")).toThrow();
  });
  it.each(["\ud800", "\ud801", "\udfff", "a\u0000b", " owner"])("refuses nonportable ID %j", id => expect(() => correlatedApprovalId.parse(id)).toThrow());
  it("preserves distinct well-formed Unicode without normalization", () => { expect(correlatedApprovalId.parse("é")).not.toBe(correlatedApprovalId.parse("e\u0301")); expect(correlatedApprovalId.parse("😀")).toBe("😀"); });
  it.each(["getter", "hidden", "proto", "sparse", "symbol", "cycle"])("rejects hostile JSON %s without getter execution", kind => {
    const raw = approvalOfferFixture(); let called = 0;
    if (kind === "getter") Object.defineProperty(raw.approvalOffer, "reviewId", { enumerable: true, get() { called++; return "review"; } });
    else if (kind === "hidden") Object.defineProperty(raw, "callback", { value: () => called++ });
    else if (kind === "proto") Object.defineProperty(raw, "__proto__", { value: {}, enumerable: true });
    else if (kind === "sparse") Object.assign(raw, { huge: new Array(20000) }); else if (kind === "symbol") Object.assign(raw, { [Symbol("x")]: true }); else Object.assign(raw, { cycle: raw });
    expect(() => offer(raw, "workspace", "review")).toThrow(); expect(called).toBe(0);
  });
  it("accepts exact historical read-only NOT_ATTEMPTED without conferring approval", () => { const raw = approvalHistoryFixture(); expect(result(raw, "workspace", "review")).toEqual(raw); expect(Object.isFrozen(result(raw, "workspace", "review"))).toBe(true); });
  it.each(["workspaceId", "reviewId", "approvalAvailable", "executionAuthorized", "providerStateVerified"])("rejects historical mismatch %s", key => {
    const raw = { ...approvalHistoryFixture(), [key]: key.endsWith("Id") ? "other" : true }; expect(() => result(raw, "workspace", "review")).toThrow();
  });
  it("accepts exact scoped confirmed response and freezes receipt", () => { const value = response(approvalResponseFixture(), approvalCommandFixture()); expect(value.status).toBe("CONFIRMED"); expect(Object.isFrozen(value)).toBe(true); });
  it.each(["workspaceId", "reviewId", "expectedRequestHash", "expectedReviewFingerprint", "version"])("refuses POST wrong %s", key => {
    const raw = { ...approvalResponseFixture(), [key]: key.startsWith("expected") ? "f".repeat(64) : "other" }; expect(() => response(raw, approvalCommandFixture())).toThrow();
  });
  it("refuses extra capabilities in a nested historical response", () => {
    const raw = { ...approvalResponseFixture(), status: "ALREADY_ATTEMPTED", result: { ...approvalHistoryFixture(), approvalToken: "secret" } }; delete (raw as Partial<typeof raw>).receipt;
    expect(() => response(raw, approvalCommandFixture())).toThrow();
  });
  it("bounds JSON bytes before parsing contracts", () => expect(() => snapshotCorrelatedApprovalJson({ values: Array.from({ length: 10 }, () => "é".repeat(32768)) })).toThrow());
});
