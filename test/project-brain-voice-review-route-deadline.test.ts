import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn(), publication: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
// Explicit publication stub: these tests prove route sequencing, not the reader's private DB-TTL map.
vi.mock("@/server/model-gateway/voice/project-brain-transcript-review", () => ({ readProjectBrainVoiceTranscriptReview: m.read,
  assertProjectBrainVoiceTranscriptReviewPublication: m.publication }));
import { GET } from "@/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route";

const flag = "ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED", wallStart = 1_800_000_000_000, monoStart = 1000;
const url = "https://local.example/api/endvera/v1/mobile/project-brain-intake/voice-review?workspaceId=w&sessionId=s";
let wall: number, mono: number, controller: AbortController;
const user = () => ({ id: "owner", role: "CLIENT", emailVerified: true });
const projection = () => ({ status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", workspaceId: "w", sessionId: "s",
  executionAuthorized: false, externalTransportPerformed: false, automaticConfirmationPerformed: false,
  transcriptionQualityVerified: false, realTranscriptionAvailable: false, projectFactConfirmed: false,
  processingMode: "SYNTHETIC_LOCAL", contentIntegrityVerified: true, semanticAccuracyVerified: false,
  mediaDecodingVerified: false, syntheticReviewAvailable: true, text: "PRIVATE_SYNTHETIC_TEXT\n exact 😃  " });
const stageValue = (stage: "auth" | "limit" | "read") => stage === "auth" ? user() : stage === "limit" ? true : projection();
const request = () => new Request(url, { signal: controller.signal });
const get = () => GET(request());
async function refused(response: Response, status = 503) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.json()).toEqual({ error: status === 404 ? "Not found." : "Voice review is unavailable." });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv(flag, "true"); wall = wallStart; mono = monoStart; controller = new AbortController();
  vi.spyOn(Date, "now").mockImplementation(() => wall); vi.spyOn(performance, "now").mockImplementation(() => mono);
  m.auth.mockResolvedValue(user()); m.limit.mockResolvedValue(true); m.read.mockResolvedValue(projection()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("PB voice GET original disclosure budget — mocked services, no DB or transport", () => {
  it("positive keeps exact existing body and single calls", async () => {
    const response = await get(); expect(response.status).toBe(200); expect(await response.json()).toEqual(projection());
    expect(m.auth).toHaveBeenCalledOnce(); expect(m.limit).toHaveBeenCalledOnce(); expect(m.read).toHaveBeenCalledOnce();
  });
  it.each(["auth", "limit", "read"] as const)("refuses %s settling at the original 10s wall deadline", async stage => {
    m[stage].mockImplementation(async () => { wall += 10000; return stageValue(stage); });
    await refused(await get()); if (stage !== "read") expect(m.read).not.toHaveBeenCalled();
    if (stage === "auth") expect(m.limit).not.toHaveBeenCalled();
  });
  it.each(["auth", "limit", "read"] as const)("refuses %s settling at the original monotone deadline with wall frozen", async stage => {
    m[stage].mockImplementation(async () => { mono += 10000; return stageValue(stage); });
    await refused(await get()); if (stage !== "read") expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["auth", "limit", "read"] as const)("refuses abort during %s and never starts a later protected stage", async stage => {
    m[stage].mockImplementation(async () => { controller.abort(); return stageValue(stage); });
    await refused(await get()); if (stage !== "read") expect(m.read).not.toHaveBeenCalled();
  });
  it("pre-aborted request does not authenticate", async () => { controller.abort(); await refused(await get()); expect(m.auth).not.toHaveBeenCalled(); });
  it.each(["wall", "mono"] as const)("refuses %s clock falling below original start", async kind => {
    m.auth.mockImplementation(async () => { if (kind === "wall") wall--; else mono--; return user(); });
    await refused(await get()); expect(m.limit).not.toHaveBeenCalled();
  });
  it.each(["wall", "mono"] as const)("refuses %s rollback between later stages even above entry", async kind => {
    m.auth.mockImplementation(async () => { wall += 100; mono += 100; return user(); });
    m.limit.mockImplementation(async () => { if (kind === "wall") wall--; else mono--; return true; });
    await refused(await get()); expect(m.read).not.toHaveBeenCalled();
  });
  it("does not renew budget after auth or rate lookup", async () => {
    m.auth.mockImplementation(async () => { wall += 6000; mono += 6000; return user(); });
    m.limit.mockImplementation(async () => { wall += 4000; mono += 4000; return true; });
    await refused(await get()); expect(m.read).not.toHaveBeenCalled();
  });
  it("passes immutable original deadlines and the captured request signal to reader", async () => {
    const req = request(); m.auth.mockImplementation(async () => { wall += 3000; mono += 3000; return user(); });
    m.limit.mockImplementation(async () => { wall += 2000; mono += 2000; return true; });
    expect((await GET(req)).status).toBe(200);
    expect(m.read).toHaveBeenCalledExactlyOnceWith({ actorUserId: "owner", workspaceId: "w", sessionId: "s" }, { enabled: true },
      { deadlineAt: wallStart + 10000, monotoneDeadlineAt: monoStart + 10000, signal: req.signal });
    expect(Object.isFrozen(m.read.mock.calls[0][2])).toBe(true);
  });
  it("request signal replacement cannot erase original abort", async () => {
    const req = { url, signal: controller.signal };
    m.auth.mockImplementation(async () => { req.signal = new AbortController().signal; controller.abort(); return user(); });
    await refused(await GET(req as Request)); expect(m.limit).not.toHaveBeenCalled();
  });
  it("allows an otherwise valid result at 9999ms, retaining original body", async () => {
    m.read.mockImplementation(async () => { wall += 9999; mono += 9999; return projection(); });
    const response = await get(); expect(response.status).toBe(200); expect(await response.json()).toEqual(projection());
  });
  it.each(["expiry", "abort", "off"] as const)("suppresses content if %s occurs during JSON serialization", async kind => {
    const value = projection(); m.read.mockResolvedValue({ ...value, toJSON() {
      if (kind === "expiry") mono += 10000; else if (kind === "abort") controller.abort(); else vi.stubEnv(flag, "false"); return value;
    } });
    await refused(await get(), kind === "off" ? 404 : 503);
  });
  it.each([NaN, Infinity, -Infinity])("nonfinite entry clock %s refuses before auth", async value => {
    mono = value; await refused(await get()); expect(m.auth).not.toHaveBeenCalled();
  });
  it("OFF stays first even for preabort/invalid clocks", async () => {
    vi.stubEnv(flag, "false"); mono = NaN; controller.abort(); await refused(await get(), 404);
    expect(m.auth).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("does not claim force cancellation of unresolved auth; refuses only when it settles", async () => {
    let resolve!: (value: ReturnType<typeof user>) => void; m.auth.mockReturnValue(new Promise(r => { resolve = r; }));
    let settled = false; const pending = get().then(response => { settled = true; return response; });
    mono += 20000; await Promise.resolve(); expect(settled).toBe(false); expect(m.read).not.toHaveBeenCalled();
    resolve(user()); await refused(await pending);
  });
  it("checks the exact result identity on both sides of JSON serialization", async () => {
    const value = projection(); m.read.mockResolvedValue(value); const order: string[] = [];
    m.publication.mockImplementation(received => { expect(received).toBe(value); order.push("guard"); });
    const toJSON = vi.fn(() => { order.push("json"); return projection(); }); Object.assign(value, { toJSON });
    expect((await get()).status).toBe(200); expect(order).toEqual(["guard", "json", "guard"]);
  });
  it("unregistered/private publication refusal suppresses text before serialization", async () => {
    const toJSON = vi.fn(projection); m.read.mockResolvedValue({ ...projection(), toJSON });
    m.publication.mockImplementation(() => { throw new Error("PRIVATE_PUBLICATION_REFUSED"); });
    await refused(await get()); expect(toJSON).not.toHaveBeenCalled(); expect(m.publication).toHaveBeenCalledOnce();
  });
  it("second private publication refusal discards serialized response without retry", async () => {
    const toJSON = vi.fn(projection); m.read.mockResolvedValue({ ...projection(), toJSON });
    m.publication.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("PRIVATE_PUBLICATION_REFUSED"); });
    await refused(await get()); expect(toJSON).toHaveBeenCalledOnce(); expect(m.publication).toHaveBeenCalledTimes(2); expect(m.read).toHaveBeenCalledOnce();
  });
});
