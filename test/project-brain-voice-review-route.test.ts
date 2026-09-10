import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/model-gateway/voice/project-brain-transcript-review", () => ({ readProjectBrainVoiceTranscriptReview: m.read }));
import * as route from "@/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route";
const flag = "ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED";
const path = "https://local.example/api/endvera/v1/mobile/project-brain-intake/voice-review";
const valid = "?workspaceId=workspace-a&sessionId=session-a";
function result() {
  return { status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false,
    automaticConfirmationPerformed: false, transcriptionQualityVerified: false, realTranscriptionAvailable: false,
    projectFactConfirmed: false, processingMode: "SYNTHETIC_LOCAL", workspaceId: "workspace-a", sessionId: "session-a",
    contentIntegrityVerified: true, semanticAccuracyVerified: false, syntheticReviewAvailable: true, mediaDecodingVerified: false,
    text: "SYNTHETIC_LOCAL — no speech was transcribed.", reviewFingerprint: `sha256:${"a".repeat(64)}` };
}
const get = (query = valid) => route.GET(new Request(path + query));
async function opaque(response: Response, status: number) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.text()).not.toMatch(/SYNTHETIC_LOCAL|private-error|SELECT|secret|stack|transcriptId/);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true");
  m.auth.mockResolvedValue({ id: "owner-a", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.read.mockResolvedValue(result());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("OFF-by-default PB protected voice GET route", () => {
  it("exports only a Node dynamic GET, no mutation or dispatch", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]); expect(route.runtime).toBe("nodejs"); expect(route.dynamic).toBe("force-dynamic");
    const source = readFileSync("src/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route.ts", "utf8");
    expect(source).not.toMatch(/dispatchVoice|admitGateway|reserveAccount|createProjectBrain|fetch\(|prisma|console\./);
  });
  it.each([undefined, "", "false", "1", "TRUE", "enabled", " true "])("switch %s is OFF without auth/rate/reader access", async value => {
    vi.stubEnv(flag, value); await opaque(await get("?actorUserId=attacker"), 404);
    expect(m.auth).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("uses the authenticated actor, exact bounded per-user rate key, and untouched synthetic projection", async () => {
    const response = await get(); expect(response.status).toBe(200); expect(await response.json()).toEqual(result());
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(m.limit).toHaveBeenCalledExactlyOnceWith("construction-mobile-project-brain-voice-review:owner-a", { window: 60, max: 60 });
    expect(m.read).toHaveBeenCalledExactlyOnceWith({ actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" }, { enabled: true });
  });
  it("unauthenticated does not reach rate limiter or protected reader", async () => {
    m.auth.mockResolvedValue(null); await opaque(await get(), 401); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each([{ role: "ADMIN", emailVerified: true }, { role: "VA", emailVerified: true }, { role: "CLIENT", emailVerified: false },
    { role: "CLIENT", emailVerified: "true" }, { role: "unknown", emailVerified: true }])("fails role/verification closed for %j", async user => {
    m.auth.mockResolvedValue({ id: "owner-a", ...user }); await opaque(await get(), 404); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=workspace-a", "?sessionId=session-a", "?workspaceId=&sessionId=session-a", "?workspaceId=workspace-a&sessionId=",
    "?workspaceId=a&workspaceId=a&sessionId=b", "?workspaceId=a&sessionId=b&sessionId=b", `${valid}&actorUserId=other`, `${valid}&text=evil`,
    "?workspaceId=%20&sessionId=a", "?workspaceId=%20a&sessionId=b", "?workspaceId=a&sessionId=b%20", `?workspaceId=${"a".repeat(201)}&sessionId=b`,
    `?workspaceId=a&sessionId=${"b".repeat(201)}`, `${valid}&session%49d=other`])("rejects malformed/unknown/duplicate query %s", async query => {
    await opaque(await get(query), 400); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("200-character IDs remain exact, without implicit trimming", async () => {
    const workspaceId = "a".repeat(200), sessionId = "b".repeat(200); m.read.mockResolvedValue({ ...result(), workspaceId, sessionId });
    expect((await get(`?workspaceId=${workspaceId}&sessionId=${sessionId}`)).status).toBe(200);
    expect(m.read).toHaveBeenCalledWith({ actorUserId: "owner-a", workspaceId, sessionId }, { enabled: true });
  });
  it("opaque malformed URL, not a thrown stack", async () => {
    await opaque(await route.GET({ url: "not a url" } as Request), 400); expect(m.read).not.toHaveBeenCalled();
  });
  it("rate refusal does not read text", async () => {
    m.limit.mockResolvedValue(false); await opaque(await get(), 429); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["auth", "limit", "read"] as const)("%s exception is opaque/no-store with no fallback", async which => {
    m[which].mockRejectedValue(new Error("private-error SELECT secret transcriptId stack")); await opaque(await get(), 503);
    if (which !== "read") expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["auth", "limit", "read"] as const)("switch withdrawn during %s suppresses disclosure", async which => {
    m[which].mockImplementation(async () => { vi.stubEnv(flag, "false"); return which === "auth" ? { id: "owner-a", role: "CLIENT", emailVerified: true } : which === "limit" ? true : result(); });
    await opaque(await get(), 404); if (which !== "read") expect(m.read).not.toHaveBeenCalled();
  });
  it("snapshots authenticated identity before limiter latency", async () => {
    const user = { id: "owner-a", role: "CLIENT", emailVerified: true }; m.auth.mockResolvedValue(user);
    m.limit.mockImplementation(async () => { user.id = "other"; return true; });
    expect((await get()).status).toBe(200); expect(m.read.mock.calls[0][0].actorUserId).toBe("owner-a");
  });
  it.each([{ status: "DISABLED", executionAuthorized: false }, null, { ...result(), executionAuthorized: true }, { ...result(), workspaceId: "other" },
    { ...result(), sessionId: "other" }, { ...result(), realTranscriptionAvailable: true }, { ...result(), projectFactConfirmed: true },
    { ...result(), externalTransportPerformed: true }, { ...result(), processingMode: "EXTERNAL_PROVIDER" },
    { ...result(), contentIntegrityVerified: false }, { ...result(), semanticAccuracyVerified: true },
    { ...result(), mediaDecodingVerified: true }, { ...result(), syntheticReviewAvailable: false }])("does not expose incompatible reader result %j", async value => {
    m.read.mockResolvedValue(value); await opaque(await get(), 503);
  });
  it("response serialization failure is opaque", async () => {
    m.read.mockResolvedValue({ ...result(), corrupt: 1n }); await opaque(await get(), 503);
  });
});
