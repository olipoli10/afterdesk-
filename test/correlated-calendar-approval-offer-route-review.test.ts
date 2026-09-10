import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-offer", async original => ({ ...await original<object>(), readCorrelatedCalendarApprovalOffer: m.read }));
import { GET } from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer/route";
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";
let f: ReturnType<typeof correlatedCalendarOfferFixture>, tick: number;
const request = (signal?: AbortSignal) => new Request("https://local.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer?workspaceId=workspace&reviewId=review", { signal });
async function opaque(response: Response, status: number) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.text()).not.toMatch(/source-a|source-b|packetHash|expectedReviewFingerprint|private|SELECT|credential/);
}
beforeEach(() => {
  vi.resetAllMocks(); f = correlatedCalendarOfferFixture(); tick = 100;
  for (const [key, value] of Object.entries(f.env)) vi.stubEnv(key, value);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.now)); vi.spyOn(performance, "now").mockImplementation(() => tick);
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.read.mockImplementation(async () => f.dto);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("offer HTTP peer: actual GET and schemas, mocked identity/rate/reader", () => {
  it("refuses cancellation triggered during the strict final DTO parse", async () => {
    const ac = new AbortController();
    Object.defineProperty(f.dto.approvalOffer, "executionAuthorized", { enumerable: true, get: () => { ac.abort(); return false; } });
    await opaque(await GET(request(ac.signal)), 503); expect(m.read).toHaveBeenCalledOnce();
  });
  it("returns opaque404 if the switch disappears during strict output parsing", async () => {
    Object.defineProperty(f.dto.approvalOffer, "executionAuthorized", { enumerable: true, get: () => { vi.stubEnv("ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "false"); return false; } });
    await opaque(await GET(request()), 404);
  });
  it("keeps the original entry deadline after auth and limiter consume most of it", async () => {
    m.auth.mockImplementation(async () => { tick += 2000; return { id: "owner", role: "CLIENT", emailVerified: true }; });
    m.limit.mockImplementation(async () => { tick += 2000; return true; });
    m.read.mockImplementation(async (_input, _env, context) => { expect(context.deadlineAt).toBe(Date.parse(f.now) + 5000); tick += 1000; vi.mocked(Date.now).mockReturnValue(Date.parse(f.now) - 10000); return f.dto; });
    await opaque(await GET(request()), 503);
  });
  it("accepts the exact DTO but refuses only an added nested action property", async () => {
    const positive = await GET(request()); expect(positive.status).toBe(200); expect(await positive.json()).toEqual(f.dto);
    Object.assign(f.dto.review.evidence, { approve: true });
    await opaque(await GET(request()), 503);
  });
  it("authentication precedes even a malformed private query", async () => {
    m.auth.mockResolvedValue(null);
    await opaque(await GET(new Request("https://local.invalid/?workspaceId=x&reviewId=a&review%49d=b")), 401);
    expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each([NaN, -1])("refuses invalid elapsed time %s after a valid reader output", async value => {
    m.read.mockImplementation(async () => { tick = value; return f.dto; });
    await opaque(await GET(request()), 503);
  });
});
