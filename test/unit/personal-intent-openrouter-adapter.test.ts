import { describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { createOpenRouterPersonalIntentAdapter, type OpenRouterPersonalIntentTransport } from "@/server/model-gateway/personal-intent/openrouter-adapter";

const input = createPersonalIntentInput("synthetic-inbound", "Hey demain j’ai quoi?");
const value = { schemaVersion: 1, requestFingerprint: input.requestFingerprint,
  actions: [{ id: "a", dependsOn: [], kind: "READ_CALENDAR", period: { start: 4, end: 10, quote: "demain" } }] };
const wire = () => ({ id: "syn-generation-1", model: "synthetic/model", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(value) } }] });
const response = () => ({ httpStatus: 200, body: JSON.stringify(wire()) });
const signal = () => new AbortController().signal;
const create = (transport: OpenRouterPersonalIntentTransport, options: { enabled?: boolean; timeoutMs?: number } = { enabled: true }) =>
  createOpenRouterPersonalIntentAdapter({ modelKey: "synthetic/model", providerEndpointSlug: "synthetic/provider", timeoutMs: 1000, ...options, transport });

describe("OFF-by-default personal OpenRouter transport adapter", () => {
  it("does not dispatch unless explicitly enabled", async () => {
    const transport = vi.fn(async () => response());
    expect(await create(transport, {}).dispatch(input, signal())).toMatchObject({ status: "NOT_DISPATCHED", reason: "DISABLED" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("pins routing/privacy, includes the actual strict schema, never tools or credentials", async () => {
    const transport = vi.fn(async () => response());
    const adapter = create(transport);
    const result = await adapter.dispatch(input, signal());
    expect(result).toMatchObject({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED", executionAuthorized: false, accounting: "UNSETTLED", inspected: { preview: null, executionAuthorized: false } });
    expect(transport).toHaveBeenCalledTimes(1);
    const request = transport.mock.calls[0] as unknown as Parameters<OpenRouterPersonalIntentTransport>;
    expect(request[0]).toMatchObject({ model: "synthetic/model", stream: false, max_completion_tokens: 8192,
      provider: { only: ["synthetic/provider"], allow_fallbacks: false, data_collection: "deny", zdr: true, require_parameters: true },
      response_format: { type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false } } } });
    expect(request[0]).not.toHaveProperty("tools");
    expect(request[0]).not.toHaveProperty("apiKey");
    expect(request[0].messages[1].content).toBe(JSON.stringify({ requestFingerprint: input.requestFingerprint, source: input.source }));
    expect(adapter.modelKey).toBe("synthetic/model");
  });
  it("rejects mutated or extra-field input before transport", async () => {
    const transport = vi.fn(async () => response());
    for (const bad of [{ ...input, source: "lundi" }, { ...input, executionAuthorized: true }, { ...input, schemaVersion: 2 }]) {
      expect(await create(transport).dispatch(bad as typeof input, signal())).toMatchObject({ dispatched: false, reason: "INVALID_INPUT" });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not dispatch an already-aborted request", async () => {
    const controller = new AbortController(); controller.abort();
    const transport = vi.fn(async () => response());
    expect(await create(transport).dispatch(input, controller.signal)).toMatchObject({ dispatched: false, reason: "ABORTED" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("timeouts even when transport ignores abort, retains uncertainty and does not retry", async () => {
    vi.useFakeTimers();
    try {
      let receivedSignal: AbortSignal | undefined;
      const transport = vi.fn((request, s) => { receivedSignal = s; return new Promise<Awaited<ReturnType<OpenRouterPersonalIntentTransport>>>(() => undefined); });
      const pending = create(transport, { enabled: true, timeoutMs: 50 }).dispatch(input, signal());
      await vi.advanceTimersByTimeAsync(51);
      expect(await pending).toMatchObject({ dispatched: true, status: "DISPATCH_OUTCOME_UNCERTAIN", reason: "TIMEOUT", accounting: "UNSETTLED" });
      expect(receivedSignal?.aborted).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("marks cancellation after dispatch uncertain rather than undispatched", async () => {
    const controller = new AbortController();
    const transport = vi.fn(() => new Promise<Awaited<ReturnType<OpenRouterPersonalIntentTransport>>>(() => undefined));
    const pending = create(transport).dispatch(input, controller.signal); controller.abort();
    expect(await pending).toMatchObject({ dispatched: true, reason: "ABORTED", accounting: "UNSETTLED" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(["throw", "reject", "http"])("preserves unknown settlement for %s without exposing error bodies", async mode => {
    const transport: OpenRouterPersonalIntentTransport = () => {
      if (mode === "throw") throw new Error("secret-provider-body");
      if (mode === "reject") return Promise.reject(new Error("secret-provider-body"));
      return Promise.resolve({ httpStatus: 429, body: "secret-provider-body" });
    };
    const result = await create(transport).dispatch(input, signal());
    expect(result).toMatchObject({ status: "DISPATCH_OUTCOME_UNCERTAIN", accounting: "UNSETTLED" });
    expect(JSON.stringify(result)).not.toContain("secret-provider-body");
  });
  it.each(["model", "finish", "choices", "tools", "refusal", "span", "json", "wireLimit", "contentLimit"])("rejects malformed %s responses", async kind => {
    const body = wire();
    if (kind === "model") body.model = "another/model";
    if (kind === "finish") body.choices[0].finish_reason = "length";
    if (kind === "choices") body.choices.push(body.choices[0]);
    if (kind === "tools") Object.assign(body.choices[0].message, { tool_calls: [{ function: { name: "send_sms" } }] });
    if (kind === "refusal") Object.assign(body.choices[0].message, { refusal: "no" });
    if (kind === "span") body.choices[0].message.content = JSON.stringify(value).replace('"demain"', '"lundi"');
    if (kind === "contentLimit") body.choices[0].message.content = " ".repeat(65_537);
    const raw = kind === "json" ? "[" : kind === "wireLimit" ? " ".repeat(131_073) : JSON.stringify(body);
    expect(await create(async () => ({ httpStatus: 200, body: raw })).dispatch(input, signal())).toMatchObject({ status: "DISPATCH_OUTCOME_UNCERTAIN", reason: "INVALID_RESPONSE" });
  });
  it("snapshots config so it cannot be enabled or rerouted by mutation", async () => {
    const transport = vi.fn(async () => response());
    const config = { enabled: false, modelKey: "synthetic/model", providerEndpointSlug: "synthetic/provider", timeoutMs: 1000, transport };
    const adapter = createOpenRouterPersonalIntentAdapter(config); config.enabled = true; config.modelKey = "other/model";
    expect(await adapter.dispatch(input, signal())).toMatchObject({ reason: "DISABLED" }); expect(transport).not.toHaveBeenCalled();
  });
  it("refuses invalid timeout and provider configuration", () => {
    expect(() => create(async () => response(), { timeoutMs: 0 })).toThrow("PERSONAL_INTENT_ADAPTER_CONFIG_INVALID");
  });
  it("pins the exact configured output ceiling for matching the budget reservation", async () => {
    const transport = vi.fn<OpenRouterPersonalIntentTransport>(async () => response());
    const config = { enabled: true, modelKey: "synthetic/model", providerEndpointSlug: "synthetic/provider", timeoutMs: 1000, maxOutputTokens: 2048, transport };
    const adapter = createOpenRouterPersonalIntentAdapter(config); config.maxOutputTokens = 8192;
    await adapter.dispatch(input, signal());
    expect(adapter.maxOutputTokens).toBe(2048);
    expect(transport.mock.calls[0][0].max_completion_tokens).toBe(2048);
    for (const maxOutputTokens of [0, -1, 8193, 2.5, NaN, Infinity]) {
      expect(() => createOpenRouterPersonalIntentAdapter({ ...config, maxOutputTokens })).toThrow("PERSONAL_INTENT_ADAPTER_CONFIG_INVALID");
    }
  });
  it("recursively freezes the wire schema so a transport cannot relax it", async () => {
    const transport: OpenRouterPersonalIntentTransport = async request => {
      const format = request.response_format;
      const assertFrozen = (value: unknown): void => {
        if (value !== null && typeof value === "object") {
          expect(Object.isFrozen(value)).toBe(true);
          Object.values(value).forEach(assertFrozen);
        }
      };
      assertFrozen(format);
      expect(() => { (format.json_schema as { strict: boolean }).strict = false; }).toThrow(TypeError);
      expect(() => { format.json_schema.schema.additionalProperties = true; }).toThrow(TypeError);
      expect(format.json_schema.strict).toBe(true);
      expect(format.json_schema.schema.additionalProperties).toBe(false);
      return response();
    };
    expect(await create(transport).dispatch(input, signal())).toMatchObject({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED" });
  });
});
