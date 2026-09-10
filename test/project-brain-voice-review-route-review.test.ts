import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/model-gateway/voice/project-brain-transcript-review", () => ({ readProjectBrainVoiceTranscriptReview: m.read }));
import { GET } from "@/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route";
const flag = "ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED";
const url = "https://local.example/api/endvera/v1/mobile/project-brain-intake/voice-review?workspaceId=w&sessionId=s";
function projection() {
  return { status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", workspaceId: "w", sessionId: "s",
    executionAuthorized: false, externalTransportPerformed: false, automaticConfirmationPerformed: false,
    transcriptionQualityVerified: false, realTranscriptionAvailable: false, projectFactConfirmed: false,
    processingMode: "SYNTHETIC_LOCAL", contentIntegrityVerified: true, semanticAccuracyVerified: false,
    mediaDecodingVerified: false, syntheticReviewAvailable: true, text: "SYNTHETIC_LOCAL\n\"exact\" 😃\r\n  " };
}
const get = () => GET(new Request(url));
async function refusal(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.text()).not.toMatch(/SYNTHETIC_LOCAL|exact|private-error/);
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv(flag, "true");
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true });
  m.limit.mockResolvedValue(true); m.read.mockResolvedValue(projection()); });
afterEach(() => vi.unstubAllEnvs());
describe("PB voice GET cross-review, direct handler with synthetic service mocks", () => {
  it("does not authenticate from caller-supplied identity headers", async () => {
    m.auth.mockResolvedValue(null);
    await refusal(await GET(new Request(url, { headers: { "x-user-id": "owner", "x-user-role": "CLIENT", "x-email-verified": "true" } })), 401);
    expect(m.read).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled();
  });
  it.each([1, "true", {}, null, undefined])("rate result %j cannot replace explicit true", async value => {
    m.limit.mockResolvedValue(value); await refusal(await get(), 429); expect(m.read).not.toHaveBeenCalled();
  });
  it("does not disclose through a previous successful request after logout", async () => {
    expect((await get()).status).toBe(200); m.auth.mockResolvedValue(null);
    await refusal(await get(), 401); expect(m.auth).toHaveBeenCalledTimes(2); expect(m.read).toHaveBeenCalledOnce();
  });
  it("query identity is captured before asynchronous limiter work", async () => {
    const request = { url };
    m.limit.mockImplementation(async () => { request.url = url.replace("workspaceId=w", "workspaceId=other"); return true; });
    expect((await GET(request as Request)).status).toBe(200);
    expect(m.read).toHaveBeenCalledExactlyOnceWith({ actorUserId: "owner", workspaceId: "w", sessionId: "s" }, { enabled: true });
  });
  it.each(["automaticConfirmationPerformed", "transcriptionQualityVerified", "semanticAccuracyVerified", "mediaDecodingVerified"])("missing %s is not a negative authority receipt", async key => {
    const result: Record<string, unknown> = projection(); delete result[key]; m.read.mockResolvedValue(result);
    await refusal(await get(), 503);
  });
  it("JSON preserves protected whitespace without treating it as executable content", async () => {
    const response = await get(); expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual(projection()); expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("OFF accompanying a rejected protected read still returns opaque 404, no fallback", async () => {
    m.read.mockImplementation(async () => { vi.stubEnv(flag, "false"); throw new Error("private-error"); });
    await refusal(await get(), 404); expect(m.read).toHaveBeenCalledOnce();
  });
});
