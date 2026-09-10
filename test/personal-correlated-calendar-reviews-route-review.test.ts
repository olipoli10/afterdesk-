import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: mocks.auth, consumeRateLimit: mocks.limit }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-review-list", async original => ({
  ...await original<object>(), readCorrelatedPersonalCalendarReviewList: mocks.read,
}));
import { GET } from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/route";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

const flag = "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED";
const url = "https://local.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews?workspaceId=workspace";
function payload() {
  const f = correlatedReceiptFixture();
  if (f.packet.status !== "RESOLVED_NOT_AUTHORIZED") throw new Error("FIXTURE_MUST_RESOLVE");
  const ref = buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
  return { version: "personal-correlated-calendar-review-list-v1", workspaceId: "workspace", readOnly: true,
    approvalAvailable: false, executionAuthorized: false, hasMore: false, reviews: [{
      version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: "2026-09-11T04:02:00.000Z",
      preparedAt: "2026-09-11T04:01:02.000Z", preparationExpiresAt: "2026-09-11T04:08:00.000Z", currentStatus: "pending",
      readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
      evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
        sources: f.packet.sources.map((s, index) => ({ role: index === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY",
          operationId: s.operationId, requestHash: s.requestHash, text: s.body, receivedAt: s.receivedAt })),
        citations: f.packet.citations, anchorReceivedAt: f.packet.anchorReceivedAt, clarifiedSlot: f.packet.evidence.slot, draft: ref.proof.draft },
    }] };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true");
  mocks.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true });
  mocks.limit.mockResolvedValue(true); mocks.read.mockResolvedValue(payload());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function response(status: number, request = new Request(url)) {
  const result = await GET(request);
  expect(result.status).toBe(status); expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("vary")).toBe("Cookie, Authorization");
  expect(result.headers.has("access-control-allow-origin")).toBe(false);
  return result;
}

describe("independent strict correlated-calendar GET boundaries", () => {
  it("returns a real-shaped nonempty two-source DTO with no action handles", async () => {
    const result = await response(200); expect(await result.json()).toEqual(payload());
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("identity-like headers never replace the session actor", async () => {
    await response(200, new Request(url, { headers: { "x-user-id": "intruder", "x-workspace-id": "foreign", authorization: "Bearer synthetic-not-authority" } }));
    expect(mocks.read.mock.calls[0][0]).toEqual({ enabled: true, actor: { userId: "owner", workspaceId: "workspace" } });
  });
  it.each([1, "true", {}, undefined])("truthy/nonboolean rate result %j is not permission", async rate => {
    mocks.limit.mockResolvedValue(rate); await response(429); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("a second request after logout cannot reuse the earlier collection", async () => {
    await response(200); mocks.auth.mockResolvedValue(null); await response(401);
    expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.auth).toHaveBeenCalledTimes(2);
  });
  it("auth and limiter consume the same absolute deadline, not a fresh budget each", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:02:00Z"));
    mocks.auth.mockImplementation(async () => { vi.setSystemTime(Date.now() + 4900); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    mocks.limit.mockImplementation(async () => { vi.setSystemTime(Date.now() + 100); return true; });
    await response(503); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("abort while rate limiting prevents the protected read despite allowed=true", async () => {
    const abort = new AbortController(); mocks.limit.mockImplementation(async () => { abort.abort(); return true; });
    await response(503, new Request(url, { signal: abort.signal })); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("unknown nested action handle is rejected rather than silently stripped", async () => {
    const raw = payload(); Object.assign(raw.reviews[0], { calendarOperationId: "private-action-id" }); mocks.read.mockResolvedValue(raw);
    const result = await response(503); expect(await result.text()).not.toContain("private-action-id");
  });
  it("six items cannot exceed the strict transport bound", async () => {
    const raw = payload(); raw.reviews = Array.from({ length: 6 }, (_, i) => ({ ...raw.reviews[0], reviewId: `review-${i}` }));
    mocks.read.mockResolvedValue(raw); await response(503);
  });
  it("duplicate review identities cannot be exposed as a successful list", async () => {
    const raw = payload(); raw.reviews.push(structuredClone(raw.reviews[0])); mocks.read.mockResolvedValue(raw); await response(503);
  });
  it("nested authority flags must remain literal false", async () => {
    const raw = payload(); raw.reviews[0].executionAuthorized = true; mocks.read.mockResolvedValue(raw); await response(503);
  });
  it("service exceptions and invalid DTOs yield the same opaque failure body", async () => {
    mocks.read.mockRejectedValue(new Error("SELECT private SMS and secret stack")); const first = await response(503);
    mocks.read.mockResolvedValue({ privateText: "different protected text" }); const second = await response(503);
    expect(await first.text()).toBe(await second.text());
  });
});
