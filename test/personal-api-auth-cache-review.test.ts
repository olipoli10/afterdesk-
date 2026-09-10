import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/endvera/v1/personal/phone/route";

const fake = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), status: vi.fn(), pair: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: fake.session, consumeRateLimit: fake.rate }));
vi.mock("@/server/personal-assistant/phone-pairing", () => ({ personalPhoneStatus: fake.status, startPhonePairing: fake.pair, disconnectPersonalPhone: fake.disconnect }));
// The phone route and personalApiUser are real modules. Only authz and phone effects are mocked.
const owner = { id: "peer-synthetic-owner", role: "CLIENT", emailVerified: true };
function request(method = "GET", origin?: string) {
  return new Request("https://pilot.example.invalid/api/endvera/v1/personal/phone?workspaceId=peer-workspace", {
    method, headers: origin ? { origin } : undefined,
    ...(method === "POST" ? { body: JSON.stringify({ action: "PAIR", workspaceId: "peer-workspace", allowSelfSms: false, allowSelfVoice: false }) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("BETTER_AUTH_URL", "https://pilot.example.invalid");
  fake.session.mockResolvedValue(owner); fake.rate.mockResolvedValue(true);
  fake.status.mockResolvedValue({ synthetic: true, paired: false }); fake.pair.mockResolvedValue({ synthetic: true, sent: false });
  fake.disconnect.mockResolvedValue({ synthetic: true, disconnected: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function noPhoneEffects() { expect(fake.status).not.toHaveBeenCalled(); expect(fake.pair).not.toHaveBeenCalled(); expect(fake.disconnect).not.toHaveBeenCalled(); }

describe("actual personal phone route -> actual auth helper cache header boundary", () => {
  it.each([null, { ...owner, role: "ADMIN" }, { ...owner, emailVerified: false }])("returns unchanged 401 with private no-store before phone lookup for %j", async user => {
    fake.session.mockResolvedValue(user);
    const response = await GET(request());
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Connecte-toi pour continuer." });
    expect(fake.rate).not.toHaveBeenCalled(); noPhoneEffects();
  });
  it("refuses unauthenticated POST before parsing its body", async () => {
    fake.session.mockResolvedValue(null); const req = request("POST"), parse = vi.spyOn(req, "json");
    const response = await POST(req);
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(parse).not.toHaveBeenCalled(); expect(fake.rate).not.toHaveBeenCalled(); noPhoneEffects();
  });
  it("wrong-origin POST returns 403 without rate, body parsing or pairing", async () => {
    const req = request("POST", "https://refused.example.invalid"), parse = vi.spyOn(req, "json");
    const response = await POST(req);
    expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Demande refusée." });
    expect(parse).not.toHaveBeenCalled(); expect(fake.rate).not.toHaveBeenCalled(); noPhoneEffects();
  });
  it.each(["GET", "POST"])("returns no-store429 for %s with unchanged owner-specific rate policy", async method => {
    fake.rate.mockResolvedValue(false); const req = request(method, "endvera://"), parse = vi.spyOn(req, "json");
    const response = await (method === "GET" ? GET : POST)(req);
    expect(response.status).toBe(429); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Réessaie dans une minute." });
    expect(fake.rate).toHaveBeenCalledExactlyOnceWith("personal-connectors:peer-synthetic-owner", { window: 60, max: 20 });
    expect(parse).not.toHaveBeenCalled(); noPhoneEffects();
  });
  it("preserves authenticated GET status projection and existing no-store header", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ synthetic: true, paired: false });
    expect(fake.status).toHaveBeenCalledExactlyOnceWith(owner.id, "peer-workspace");
    expect(fake.pair).not.toHaveBeenCalled(); expect(fake.disconnect).not.toHaveBeenCalled();
  });
  it.each(["https://pilot.example.invalid", "endvera://"])("preserves accepted origin %s and identity for mocked pairing", async origin => {
    const response = await POST(request("POST", origin));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ synthetic: true, sent: false });
    expect(fake.pair).toHaveBeenCalledExactlyOnceWith({ action: "PAIR", workspaceId: "peer-workspace", allowSelfSms: false, allowSelfVoice: false, userId: owner.id });
    expect(fake.disconnect).not.toHaveBeenCalled(); expect(fake.status).not.toHaveBeenCalled();
  });
});
