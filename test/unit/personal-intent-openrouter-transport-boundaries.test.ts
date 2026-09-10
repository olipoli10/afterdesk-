import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { createPersonalOpenRouterTransport } from "@/server/model-gateway/personal-intent/openrouter-transport";
import { personalIntentMessages, personalIntentResponseFormat } from "@/server/model-gateway/personal-intent/prompt";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { PERSONAL_INTENT_ADAPTER_LIMITS } from "@/server/model-gateway/personal-intent/openrouter-adapter";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
  const source = createPersonalIntentInput("synthetic-wire-boundary", "Montre mon horaire demain.");
  const request = { model: "synthetic/model", stream: false as const, temperature: 0 as const, max_completion_tokens: 512,
    messages: personalIntentMessages(source), response_format: personalIntentResponseFormat(),
    provider: { only: ["synthetic-endpoint"] as [string], allow_fallbacks: false as const, require_parameters: true as const, data_collection: "deny" as const, zdr: true as const } };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const getApiKey = vi.fn(async () => "synthetic-only-local-api-key");
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
  const controller = new AbortController();
  const wire = createPersonalOpenRouterTransport({ enabled: true, source, modelKey: request.model,
    providerEndpointSlug: "synthetic-endpoint", maxOutputTokens: 512, getApiKey }, env, fetcher);
  return { request, env, getApiKey, fetcher, controller, wire };
}

describe("independent OpenRouter wire boundary regressions (no network)", () => {
  it("fences concurrent invocation before either lazy credential promise resolves", async () => {
    const f = fixture(); let resolveKey!: (key: string) => void;
    f.getApiKey.mockImplementation(() => new Promise(resolve => { resolveKey = resolve; }));
    const first = f.wire(f.request, f.controller.signal);
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.getApiKey).toHaveBeenCalledTimes(1); expect(f.fetcher).not.toHaveBeenCalled();
    resolveKey("synthetic-only-local-api-key");
    await expect(first).resolves.toEqual({ httpStatus: 200, body: "{}" });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it("never dispatches HTTP after cancellation during credential loading", async () => {
    const f = fixture();
    f.getApiKey.mockImplementation(async () => { f.controller.abort(); return "synthetic-only-local-api-key"; });
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("rejects a response if authority is revoked while reading its body", async () => {
    const f = fixture();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      delete f.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED;
      controller.enqueue(new TextEncoder().encode("{}")); controller.close();
    } }, { highWaterMark: 0 });
    f.fetcher.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts exactly the byte limit and rejects one extra byte across chunks despite a false content-length", async () => {
    for (const excess of [0, 1]) {
      const f = fixture();
      const stream = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array(PERSONAL_INTENT_ADAPTER_LIMITS.wireUtf8Bytes / 2).fill(32));
        controller.enqueue(new Uint8Array(PERSONAL_INTENT_ADAPTER_LIMITS.wireUtf8Bytes / 2 + excess).fill(32));
        controller.close();
      } });
      f.fetcher.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json", "content-length": "2" } }));
      const pending = f.wire(f.request, f.controller.signal);
      if (excess) await expect(pending).rejects.toThrow("TRANSPORT_UNAVAILABLE");
      else expect((await pending).body).toHaveLength(PERSONAL_INTENT_ADAPTER_LIMITS.wireUtf8Bytes);
    }
  });

  it("decodes UTF-8 characters split across stream chunks without corruption", async () => {
    const f = fixture(); const bytes = new TextEncoder().encode('{"text":"Québec"}');
    const split = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close();
    } });
    f.fetcher.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    await expect(f.wire(f.request, f.controller.signal)).resolves.toEqual({ httpStatus: 200, body: '{"text":"Québec"}' });
  });

  it.each([{ property: "redirected", value: true }, { property: "url", value: "https://different.invalid/api" }])("rejects unexpected response origin metadata: $property", async ({ property, value }) => {
    const f = fixture(); const response = new Response("{}", { headers: { "content-type": "application/json" } });
    Object.defineProperty(response, property, { value }); f.fetcher.mockResolvedValue(response);
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful HTTP response without a body and consumes the attempt", async () => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response(null, { status: 204, headers: { "content-type": "application/json" } }));
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    await expect(f.wire(f.request, f.controller.signal)).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
});
