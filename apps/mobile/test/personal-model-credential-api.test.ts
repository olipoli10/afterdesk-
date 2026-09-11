import { describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";

const commandId = "12345678-1234-4234-8234-123456789abc";
const apiKey = "synthetic_key_12345678901234567890";

describe("personal model credential native transport", () => {
  it("posts once to the fixed first-party path with the native session cookie", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ commandId, credentialPrepared: true,
      providerVerified: false, executionAuthorized: false }));
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "synthetic-session", fetchImpl });
    await expect(api.provisionPersonalModelCredential("synthetic-workspace", commandId, apiKey)).resolves.toMatchObject({ credentialPrepared: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://synthetic.invalid/api/endvera/v1/personal/model/credential");
    expect(init).toMatchObject({ method: "POST", credentials: "omit",
      headers: { Cookie: "synthetic-session", "X-ENDVERA-Mobile-Client": "android-v1", "Content-Type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ version: "personal-model-mobile-credential-v1", commandId,
      workspaceId: "synthetic-workspace", confirmation: "personal-model-credential-v1", apiKey });
  });
  it("refuses a mismatched receipt and never retries the secret-bearing POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ commandId: "12345678-1234-4234-8234-123456789abd",
      credentialPrepared: true, providerVerified: false, executionAuthorized: false }));
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "synthetic-session", fetchImpl });
    await expect(api.provisionPersonalModelCredential("synthetic-workspace", commandId, apiKey)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
