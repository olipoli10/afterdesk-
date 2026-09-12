import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { createPersonalOpenRouterTransport } from "@/server/model-gateway/personal-intent/openrouter-transport";
import { personalIntentMessages, personalIntentResponseFormat } from "@/server/model-gateway/personal-intent/prompt";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
  const source = createPersonalIntentInput("synthetic-global-kill", "Mon agenda demain");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
    ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const request = { model: "synthetic/model", stream: false as const, max_completion_tokens: 512,
    messages: personalIntentMessages(source), response_format: personalIntentResponseFormat(),
    provider: { only: ["synthetic-endpoint"] as [string], allow_fallbacks: false as const, require_parameters: true as const, data_collection: "deny" as const, zdr: true as const } };
  const key = vi.fn(async () => "synthetic-generated-local-key-not-provider");
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ synthetic: true }));
  const wire = createPersonalOpenRouterTransport({ enabled: true, source, modelKey: request.model, providerEndpointSlug: "synthetic-endpoint", maxOutputTokens: 512, getApiKey: key }, env, fetcher);
  return { env, key, fetcher, wire, request, signal: new AbortController().signal };
}
describe("independent global OpenRouter transport revocation regressions, no network", () => {
  it.each([undefined, "DISABLED", "true"])("refuses non-enabled global value %s before lazy key access", async value => {
    const f = fixture(); if (value === undefined) delete f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED; else f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = value;
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.key).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("global revoke during lazy key loading prevents HTTP and consumes the one-use capability", async () => {
    const f = fixture(); f.key.mockImplementation(async () => { delete f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED; return "synthetic-generated-local-key-not-provider"; });
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE"); expect(f.fetcher).not.toHaveBeenCalled();
    f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "ENABLED";
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE"); expect(f.key).toHaveBeenCalledTimes(1);
  });
  it("global revoke during response latency withholds a successful body and never retries", async () => {
    const f = fixture(); let response: Response | undefined;
    f.fetcher.mockImplementation(async () => { f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "DISABLED"; response = Response.json({ synthetic: true }); return response; });
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1); expect(response?.body?.locked).toBe(false);
    f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "ENABLED";
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE"); expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["chunk", "done"])("global revoke on midstream %s never returns accumulated response bytes", async phase => {
    const f = fixture(); let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      pulls++;
      if (pulls === 1) controller.enqueue(new TextEncoder().encode('{"synthetic":'));
      else { f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "DISABLED"; if (phase === "chunk") controller.enqueue(new TextEncoder().encode("true}")); controller.close(); }
    } }, { highWaterMark: 0 });
    f.fetcher.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    await expect(f.wire(f.request, f.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1); expect(stream.locked).toBe(false); expect(pulls).toBe(2);
  });
});
