import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { createPersonalOpenRouterTransport } from "@/server/model-gateway/personal-intent/openrouter-transport";
import { personalIntentMessages, personalIntentResponseFormat } from "@/server/model-gateway/personal-intent/prompt";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
  const source = createPersonalIntentInput("synthetic-inbound", "Qu’est-ce que j’ai demain?");
  const request = { model: "synthetic/model", stream: false as const, temperature: 0 as const, max_completion_tokens: 512,
    messages: personalIntentMessages(source), response_format: personalIntentResponseFormat(),
    provider: { only: ["synthetic-endpoint"] as [string], allow_fallbacks: false as const, require_parameters: true as const, data_collection: "deny" as const, zdr: true as const } };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const getApiKey = vi.fn(async () => "synthetic-only-local-api-key");
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
  const config = { enabled: true, source, modelKey: request.model, providerEndpointSlug: "synthetic-endpoint", maxOutputTokens: 512, getApiKey };
  return { request, env, getApiKey, fetcher, config, signal: new AbortController().signal };
}
describe("personal OpenRouter bounded wire, injected local HTTP only", () => {
  it("defaults off and does not read credentials or issue HTTP", async () => {
    const f = fixture(); const config = { ...f.config, enabled: undefined };
    await expect(createPersonalOpenRouterTransport(config, f.env, f.fetcher)(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.getApiKey).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("obeys the global transport kill switch even when the model-specific lane is enabled", async () => {
    const f = fixture(); f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "DISABLED";
    await expect(createPersonalOpenRouterTransport(f.config, f.env, f.fetcher)(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.getApiKey).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("fails closed without current %s", async key => {
    const f = fixture(); delete f.env[key];
    await expect(createPersonalOpenRouterTransport(f.config, f.env, f.fetcher)(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.getApiKey).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("pins exact request, endpoint and no-redirect auth; capability is single-use", async () => {
    const f = fixture(); const wire = createPersonalOpenRouterTransport(f.config, f.env, f.fetcher);
    expect(await wire(f.request, f.signal)).toEqual({ httpStatus: 200, body: "{}" });
    expect(f.fetcher).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions", expect.objectContaining({
      method: "POST", redirect: "error", cache: "no-store", signal: f.signal,
      headers: { authorization: "Bearer synthetic-only-local-api-key", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(f.request),
    }));
    await expect(wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1); expect(f.getApiKey).toHaveBeenCalledTimes(1);
  });
  it("refuses request rerouting before accessing its credential", async () => {
    const f = fixture();
    await expect(createPersonalOpenRouterTransport(f.config, f.env, f.fetcher)({ ...f.request, model: "different/model" }, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.getApiKey).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("refuses cancellation or authority change during lazy credential loading", async () => {
    const f = fixture(); f.getApiKey.mockImplementation(async () => { delete f.env.ENDVERA_EXTERNAL_AUTHORITY_REF; return "synthetic-only-local-api-key"; });
    await expect(createPersonalOpenRouterTransport(f.config, f.env, f.fetcher)(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("does not retry, expose a thrown credential/HTTP error or retain provider error text", async () => {
    const f = fixture(); f.fetcher.mockRejectedValueOnce(new Error("synthetic-only-local-api-key"));
    const wire = createPersonalOpenRouterTransport(f.config, f.env, f.fetcher);
    await expect(wire(f.request, f.signal)).rejects.toThrow(/^PERSONAL_MODEL_TRANSPORT_UNAVAILABLE$/);
    await expect(wire(f.request, f.signal)).rejects.toThrow(/^PERSONAL_MODEL_TRANSPORT_UNAVAILABLE$/);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const g = fixture(); g.fetcher.mockResolvedValueOnce(new Response("synthetic-private-error", { status: 401 }));
    expect(await createPersonalOpenRouterTransport(g.config, g.env, g.fetcher)(g.request, g.signal)).toEqual({ httpStatus: 401, body: "" });
  });
  it.each([
    { body: "{}", headers: { "content-type": "text/html" } },
    { body: "{}", headers: { "content-type": "application/json", "content-length": "999999" } },
    { body: "x".repeat(131073), headers: { "content-type": "application/json" } },
    { body: new Uint8Array([0xff]), headers: { "content-type": "application/json" } },
  ])("bounds and validates response bytes before parsing", async value => {
    const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(value.body, { headers: value.headers as HeadersInit }));
    await expect(createPersonalOpenRouterTransport(f.config, f.env, f.fetcher)(f.request, f.signal)).rejects.toThrow(/^PERSONAL_MODEL_TRANSPORT_UNAVAILABLE$/);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
});
