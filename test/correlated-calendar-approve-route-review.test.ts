import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), approve: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.rate }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval", async original => ({ ...await original<object>(), approveCorrelatedCalendarReview: m.approve }));
import { POST } from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approve/route";
const command = () => ({ version: "personal-correlated-calendar-approval-command-v1", workspaceId: "workspace", reviewId: "review", expectedRequestHash: "a".repeat(64), expectedReviewFingerprint: "b".repeat(64) });
const result = (input = command()) => ({ ...input, version: "personal-correlated-calendar-approval-response-v1", status: "CONFIRMED", automaticRetry: false, executionAuthorized: false, providerStateVerified: false, receipt: { confirmed: true, providerEventId: "e" + "c".repeat(31) } });
const req = (body: ReadableStream<Uint8Array> | string = JSON.stringify(command()), signal?: AbortSignal) => new Request("https://app.example/api/endvera/v1/personal/model/correlated-calendar-reviews/approve", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://app.example" }, body, signal, duplex: "half",
} as RequestInit);
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "true"); vi.stubEnv("ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "true"); vi.stubEnv("BETTER_AUTH_URL", "https://app.example");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-11T00:00:00.000Z")); vi.spyOn(performance, "now").mockReturnValue(100);
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.rate.mockResolvedValue(true); m.approve.mockImplementation(async input => result(input)); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("peer POST review — actual Request streams and exact response schema", () => {
  it("copies consumed Buffer bytes rather than retaining a slice alias across next read", async () => {
    const text = JSON.stringify(command()), prefix = Buffer.from(text.slice(0, -1)); let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      if (++pulls === 1) controller.enqueue(prefix);
      else { prefix.write("victim", prefix.indexOf('"reviewId":"') + '"reviewId":"'.length); controller.enqueue(Buffer.from("}")); controller.close(); }
    } }, { highWaterMark: 0 });
    const response = await POST(req(stream)); expect(response.status).toBe(200); expect(m.approve).toHaveBeenCalledOnce();
    expect(m.approve.mock.calls[0][0]).toEqual(command()); expect(prefix.toString()).toContain('"reviewId":"victim"'); expect(pulls).toBe(2);
  });
  it("normal Uint8Array chunks have the same private-copy semantics", async () => {
    const text = JSON.stringify(command()), prefix = new TextEncoder().encode(text.slice(0, -1)); let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (++pulls === 1) controller.enqueue(prefix); else { prefix.fill(0); controller.enqueue(new Uint8Array([125])); controller.close(); } } }, { highWaterMark: 0 });
    expect((await POST(req(stream))).status).toBe(200); expect(m.approve.mock.calls[0][0]).toEqual(command());
  });
  it("failed stream after valid-looking JSON cannot call wrapper", async () => { let pulls = 0; const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (++pulls === 1) c.enqueue(Buffer.from(JSON.stringify(command()))); else c.error(new Error("synthetic incomplete transport")); }, cancel }, { highWaterMark: 0 });
    expect((await POST(req(stream))).status).toBe(400); expect(pulls).toBe(2); expect(m.approve).not.toHaveBeenCalled();
  });
  it("waits for complete split UTF-8 before parsing, without replacement characters", async () => { const input = { ...command(), reviewId: "review😀" }, bytes = Buffer.from(JSON.stringify(input)); const index = bytes.indexOf(Buffer.from("😀"));
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, index + 1)); c.enqueue(bytes.subarray(index + 1)); c.close(); } });
    expect((await POST(req(stream))).status).toBe(200); expect(m.approve.mock.calls[0][0]).toEqual(input);
  });
  it("body exhaustion is charged against original deadline, not a new read timeout", async () => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    m.auth.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(25090); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ pull() { vi.mocked(performance.now).mockReturnValue(25100); }, cancel }, { highWaterMark: 0 });
    const pending = POST(req(stream)); await vi.advanceTimersByTimeAsync(25000); expect((await pending).status).toBe(503); expect(cancel).toHaveBeenCalledOnce(); expect(m.approve).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start another effect when a known response expires during schema inspection", async () => { const response = result(); Object.defineProperty(response, "receipt", { enumerable: true, get() { vi.mocked(performance.now).mockReturnValue(25100); return result().receipt; } }); m.approve.mockResolvedValue(response);
    const out = await POST(req()); expect(out.status).toBe(503); expect(await out.json()).toMatchObject({ status: "UNKNOWN", automaticRetry: false }); expect(m.approve).toHaveBeenCalledOnce();
  });
  it("nested history cannot add an approval capability to ALREADY_ATTEMPTED", async () => {
    m.approve.mockResolvedValue({ ...command(), version: "personal-correlated-calendar-approval-response-v1", status: "ALREADY_ATTEMPTED", automaticRetry: false, executionAuthorized: false, providerStateVerified: false,
      result: { version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: "2026-09-11T00:00:00.000Z", outcome: "NOT_ATTEMPTED", readOnly: true, approvalAvailable: true, executionAuthorized: false, automaticRetry: false, providerStateVerified: false } });
    expect((await POST(req())).status).toBe(503); expect(m.approve).toHaveBeenCalledOnce();
  });
});
