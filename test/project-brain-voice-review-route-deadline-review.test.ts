import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn(), publication: vi.fn(),
  proofs: new WeakMap<object, number>(), ttl: 60000, now: (): number => 0 }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/model-gateway/voice/project-brain-transcript-review", () => ({
  readProjectBrainVoiceTranscriptReview: async (...args: unknown[]) => {
    const value = await m.read(...args);
    if (value && typeof value === "object") m.proofs.set(value, m.now() + m.ttl);
    return value;
  },
  assertProjectBrainVoiceTranscriptReviewPublication: m.publication,
}));
import { GET } from "@/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route";

const flag = "ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED", start = 1_800_000_000_000;
const url = "https://local.example/api/endvera/v1/mobile/project-brain-intake/voice-review?workspaceId=w&sessionId=s";
let wall: number, mono: number;
const projection = () => ({ status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", workspaceId: "w", sessionId: "s",
  executionAuthorized: false, externalTransportPerformed: false, automaticConfirmationPerformed: false,
  transcriptionQualityVerified: false, realTranscriptionAvailable: false, projectFactConfirmed: false,
  processingMode: "SYNTHETIC_LOCAL", contentIntegrityVerified: true, semanticAccuracyVerified: false,
  mediaDecodingVerified: false, syntheticReviewAvailable: true, text: "PROTECTED_SYNTHETIC_TEXT\n exact 😀 ",
  expiresAt: new Date(start + 60_000).toISOString() });
async function opaque(response: Response) {
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.json()).toEqual({ error: "Voice review is unavailable." });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true"); wall = start; mono = 100;
  m.proofs = new WeakMap(); m.ttl = 60000; m.now = () => mono;
  // Explicit fake reader-private TTL proof, not a Date.now/DB comparison.
  m.publication.mockImplementation((value: unknown) => {
    const deadline = value && typeof value === "object" ? m.proofs.get(value) : undefined;
    if (deadline === undefined || mono >= deadline) throw new Error("SYNTHETIC_PUBLICATION_REFUSED");
  });
  vi.spyOn(Date, "now").mockImplementation(() => wall); vi.spyOn(performance, "now").mockImplementation(() => mono);
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.read.mockResolvedValue(projection());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("PB voice disclosure deadline peer — actual GET with synthetic reader, no SQL or provider", () => {
  it("positive returns exact protected text and current grammar", async () => {
    const response = await GET(new Request(url)); expect(response.status).toBe(200); expect(await response.json()).toEqual(projection());
    expect(m.publication).toHaveBeenCalledTimes(2);
    expect(m.publication.mock.calls[0][0]).toBe(m.publication.mock.calls[1][0]);
    expect(m.proofs.has(m.publication.mock.calls[0][0])).toBe(true);
  });
  it("context fields cannot be replaced by a reader dependency to extend the original budget", async () => {
    m.read.mockImplementation(async (_subject, _options, context) => {
      expect(Object.isFrozen(context)).toBe(true);
      expect(Reflect.set(context, "deadlineAt", start + 999999)).toBe(false);
      expect(Reflect.set(context, "monotoneDeadlineAt", 999999)).toBe(false);
      mono = 10100; return projection();
    });
    await opaque(await GET(new Request(url))); expect(m.read).toHaveBeenCalledOnce();
  });
  it("replacement request signal abort does not replace the captured original signal", async () => {
    const first = new AbortController(), second = new AbortController(), req = { url, signal: first.signal };
    m.limit.mockImplementation(async () => { req.signal = second.signal; second.abort(); return true; });
    const response = await GET(req as Request); expect(response.status).toBe(200);
    expect(m.read.mock.calls[0][2].signal).toBe(first.signal);
  });
  it.each(["wall", "mono"])("partial %s rollback during serialization is refused even above the original start", async clock => {
    m.read.mockImplementation(async () => {
      wall += 100; mono += 100; const value = projection();
      return { ...value, toJSON() { if (clock === "wall") wall--; else mono--; return value; } };
    });
    await opaque(await GET(new Request(url)));
  });
  it("nonfinite wall after reader suppresses exact text without retry", async () => {
    m.read.mockImplementation(async () => { wall = Infinity; return projection(); });
    await opaque(await GET(new Request(url))); expect(m.read).toHaveBeenCalledOnce();
  });
  it("unresolved reader is not falsely claimed cancelled, and settling after abort cannot disclose", async () => {
    let finish!: (value: unknown) => void, published = false; const controller = new AbortController();
    m.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = GET(new Request(url, { signal: controller.signal })).then(value => { published = true; return value; });
    await vi.waitFor(() => expect(m.read).toHaveBeenCalledOnce()); controller.abort();
    await Promise.resolve(); expect(published).toBe(false); finish(projection()); await opaque(await pending);
  });
  it("content expiring during serialization is not disclosed merely because the request still has budget", async () => {
    let serialized = false; m.ttl = 1; const value = { ...projection(), expiresAt: new Date(start + 1).toISOString() };
    m.read.mockResolvedValue({ ...value, toJSON() { serialized = true; wall += 2; mono += 2; return value; } });
    const response = await GET(new Request(url)); expect(serialized).toBe(true);
    await opaque(response); expect(m.read).toHaveBeenCalledOnce();
  });
});
