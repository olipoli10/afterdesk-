import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/endvera/v1/personal/model/status/route";
import { POST as consent } from "@/app/api/endvera/v1/personal/model/consent/route";
import { POST as disconnect } from "@/app/api/endvera/v1/personal/model/disconnect/route";
const shared = vi.hoisted(() => ({ auth: vi.fn(), status: vi.fn(), prepare: vi.fn(), consent: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/server/personal-assistant/api-auth", () => ({ personalApiUser: shared.auth }));
vi.mock("@/server/personal-assistant/model-connection", () => ({ personalModelConnectionStatus: shared.status,
  preparePersonalModelConnection: shared.prepare, consentPersonalModelConnection: shared.consent, disconnectPersonalModelConnection: shared.disconnect,
  PERSONAL_MODEL_CONSENT_VERSION: "personal-model-consent-v1" }));
const post = (body: unknown) => new Request("http://localhost/api/personal/model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); shared.auth.mockResolvedValue({ user: { id: "synthetic-session-owner" } });
  shared.status.mockResolvedValue({ liveObserved: false, executionAuthorized: false });
  shared.prepare.mockResolvedValue({ prepared: true, executionAuthorized: false });
  shared.consent.mockResolvedValue({ consentGranted: true, executionAuthorized: false }); shared.disconnect.mockResolvedValue({ disconnected: true });
});
describe("personal model HTTP boundary", () => {
  it.each([GET, consent, disconnect])("requires authenticated user before work and disables response caching", async route => {
    shared.auth.mockResolvedValue({ response: Response.json({ error: "Login required" }, { status: 401 }) });
    const response = await route(post({})); expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(shared.status).not.toHaveBeenCalled(); expect(shared.consent).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=a&workspaceId=b", "?workspaceId=a&userId=forged", "?workspaceId="])("rejects ambiguous status query %s", async query => {
    expect((await GET(new Request(`http://localhost/status${query}`))).status).toBe(400); expect(shared.status).not.toHaveBeenCalled();
  });
  it("gets status only for session owner and explicit workspace", async () => {
    const response = await GET(new Request("http://localhost/status?workspaceId=synthetic-workspace"));
    expect(shared.status).toHaveBeenCalledWith("synthetic-session-owner", "synthetic-workspace");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([
    { workspaceId: "w", action: "CONSENT" }, { workspaceId: "w", action: "CONSENT", confirmation: "yes" },
    { workspaceId: "w", action: "PREPARE", apiKey: "synthetic-key" }, { workspaceId: "w", action: "PREPARE", prices: {} },
    { workspaceId: "w", action: "PREPARE", userId: "forged-owner" },
  ])("refuses keys, prices, forged identity and missing explicit confirmation", async input => {
    expect((await consent(post(input))).status).toBe(400); expect(shared.prepare).not.toHaveBeenCalled(); expect(shared.consent).not.toHaveBeenCalled();
  });
  it("keeps preparation distinct from explicit consent", async () => {
    await consent(post({ workspaceId: "w", action: "PREPARE" })); expect(shared.prepare).toHaveBeenCalledOnce(); expect(shared.consent).not.toHaveBeenCalled();
    await consent(post({ workspaceId: "w", action: "CONSENT", confirmation: "personal-model-consent-v1" }));
    expect(shared.consent).toHaveBeenCalledWith({ userId: "synthetic-session-owner", workspaceId: "w", confirmation: "personal-model-consent-v1" });
  });
  it("bounds streamed bodies without Content-Length", async () => {
    const response = await consent(post({ workspaceId: "w", action: "PREPARE", padding: "x".repeat(5000) }));
    expect(response.status).toBe(400); expect(shared.prepare).not.toHaveBeenCalled();
  });
  it("disconnect accepts no arbitrary operation or account identifier", async () => {
    expect((await disconnect(post({ workspaceId: "w", accountId: "other-account" }))).status).toBe(400);
    await disconnect(post({ workspaceId: "w" })); expect(shared.disconnect).toHaveBeenCalledWith({ userId: "synthetic-session-owner", workspaceId: "w" });
  });
  it("redacts service errors instead of serializing internal key-like values", async () => {
    shared.consent.mockRejectedValue(new Error("synthetic-secret-marker"));
    const response = await consent(post({ workspaceId: "w", action: "CONSENT", confirmation: "personal-model-consent-v1" }));
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("synthetic-secret-marker");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
