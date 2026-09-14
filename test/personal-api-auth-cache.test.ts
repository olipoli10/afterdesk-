import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalApiUser } from "@/server/personal-assistant/api-auth";

const fake = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: fake.session, consumeRateLimit: fake.rate }));
const owner = { id: "synthetic-owner", role: "CLIENT", emailVerified: true };
beforeEach(() => { vi.clearAllMocks(); fake.session.mockResolvedValue(owner); fake.rate.mockResolvedValue(true); });

describe("personal auth refusal caching — synthetic unit checks", () => {
  it.each([null, { ...owner, role: "ADMIN" }, { ...owner, emailVerified: false }])("keeps401 noncacheable and does not proceed for %j", async user => {
    fake.session.mockResolvedValue(user);
    const result = await personalApiUser(new Request("https://pilot.example.invalid/api/personal"));
    expect(result.response?.status).toBe(401);
    expect(result.response?.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.response?.json()).toEqual({ error: "Connecte-toi pour continuer." });
    expect(fake.rate).not.toHaveBeenCalled();
  });
  it("keeps wrong-origin403 noncacheable without consuming the owner rate budget", async () => {
    const result = await personalApiUser(new Request("https://pilot.example.invalid/api/personal", {
      method: "POST", headers: { origin: "https://refused-origin.example.invalid" },
    }));
    expect(result.response?.status).toBe(403);
    expect(result.response?.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.response?.json()).toEqual({ error: "Demande refusée." });
    expect(fake.rate).not.toHaveBeenCalled();
  });
  it("keeps per-owner429 noncacheable and preserves the existing rate limit", async () => {
    fake.rate.mockResolvedValue(false);
    const result = await personalApiUser(new Request("https://pilot.example.invalid/api/personal"));
    expect(result.response?.status).toBe(429);
    expect(result.response?.headers.get("cache-control")).toBe("private, no-store");
    expect(result.response?.headers.get("retry-after")).toBe("60");
    expect(fake.rate).toHaveBeenCalledExactlyOnceWith("personal-connectors:synthetic-owner", { window: 60, max: 20 });
    expect(await result.response?.json()).toEqual({ error: "Réessaie dans une minute." });
  });
  it("supports an isolated rate budget for a critical authenticated route", async () => {
    const result = await personalApiUser(
      new Request("https://pilot.example.invalid/api/endvera/v1/mobile/device-bridge"),
      { namespace: "personal-device-bridge", window: 60, max: 60 },
    );
    expect(result.user).toBe(owner);
    expect(result.response).toBeUndefined();
    expect(fake.rate).toHaveBeenCalledExactlyOnceWith("personal-device-bridge:synthetic-owner", { window: 60, max: 60 });
  });
  it("does not manufacture a response or change the authenticated principal on success", async () => {
    const result = await personalApiUser(new Request("https://pilot.example.invalid/api/personal"));
    expect(result.user).toBe(owner); expect(result.response).toBeUndefined();
  });
  it("retains the existing native-origin acceptance without granting a different identity", async () => {
    const result = await personalApiUser(new Request("https://pilot.example.invalid/api/personal", { method: "POST", headers: { origin: "endvera://" } }));
    expect(result.user).toBe(owner); expect(result.response).toBeUndefined();
  });
});
