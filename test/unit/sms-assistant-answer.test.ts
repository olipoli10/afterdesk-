import { describe, expect, it, vi } from "vitest";
import { createAnswerInput, inspectAnswer, publicCitationUrl } from "../../src/server/model-gateway/personal-answer/contract";
import { answerWireRequest, createOpenRouterAnswerAdapter, type AnswerAdapterConfig, type AnswerTransport } from "../../src/server/model-gateway/personal-answer/openrouter-adapter";
import { personalAnswerReinspectionTimeoutMs } from "../../src/server/personal-assistant/answer-worker";

const source = (body = "Explique-moi le béton") => ({ requestId: "sms-1", workspaceId: "ws-1", senderVerified: true, workspaceBound: true, body, receivedAt: "2026-09-11T15:00:00Z" });
const config: AnswerAdapterConfig = { enabled: true, allowedModels: ["synthetic/model-a", "synthetic/model-b"], providerEndpoints: ["synthetic/provider"], timeoutMs: 1000 };
const input = createAnswerInput(source());
const candidate = (forInput = input) => ({ requestFingerprint: forInput.requestFingerprint, answer: "Le béton contient du ciment et des granulats.", needsCurrentSources: false, extracts: [] });
const wire = (forInput = input) => ({ id: "synthetic-receipt", model: "synthetic/model-b", usage: { prompt_tokens: 80, completion_tokens: 30 },
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(candidate(forInput)) } }] });
const response = (body: unknown) => ({ httpStatus: 200, body: JSON.stringify(body) });
const signal = () => new AbortController().signal;

describe("answer-only OpenRouter candidate", () => {
  it("allows bounded remote DB reinspection beyond the former two-second cutoff", () => {
    expect(personalAnswerReinspectionTimeoutMs(20_000, 10_000)).toBe(6_000);
    expect(personalAnswerReinspectionTimeoutMs(30_000, 10_000)).toBe(8_000);
    expect(() => personalAnswerReinspectionTimeoutMs(13_999, 10_000)).toThrow("ANSWER_REINSPECTION_DEADLINE");
  });
  it("defaults OFF and never calls transport", async () => {
    const transport = vi.fn<AnswerTransport>(async () => response(wire()));
    expect(await createOpenRouterAnswerAdapter({ ...config, enabled: undefined }, transport).dispatch(input, signal())).toMatchObject({ status: "NOT_DISPATCHED", reason: "DISABLED" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("records requested and served model separately, without action tools", async () => {
    const transport = vi.fn<AnswerTransport>(async () => response(wire()));
    const result = await createOpenRouterAnswerAdapter(config, transport).dispatch(input, signal());
    expect(result).toMatchObject({ status: "ANSWER_INSPECTED", requestedModel: "openrouter/auto", servedModel: "synthetic/model-b", accounting: "UNSETTLED", actionAuthority: false });
    expect(transport.mock.calls[0]?.[0]).toMatchObject({ max_completion_tokens: 1024 });
    expect(transport.mock.calls[0]?.[0]).not.toHaveProperty("max_tokens");
    expect(transport.mock.calls[0]?.[0]).not.toHaveProperty("tools");
  });
  it("refuses an out-of-policy served model even after a successful HTTP response", async () => {
    const result = await createOpenRouterAnswerAdapter(config, async () => response({ ...wire(), model: "unknown/model" })).dispatch(input, signal());
    expect(result).toMatchObject({ status: "UNCERTAIN", reason: "SERVED_MODEL_NOT_ALLOWED" });
  });
  it("accepts OpenRouter's matching per-message model but rejects a disagreement", async () => {
    const matching = wire(); Object.assign(matching.choices[0].message, { model: matching.model });
    expect(await createOpenRouterAnswerAdapter(config, async () => response(matching)).dispatch(input, signal()))
      .toMatchObject({ status: "ANSWER_INSPECTED", servedModel: matching.model });
    const changed = wire(); Object.assign(changed.choices[0].message, { model: "synthetic/model-a" });
    expect(await createOpenRouterAnswerAdapter(config, async () => response(changed)).dispatch(input, signal()))
      .toMatchObject({ status: "UNCERTAIN", reason: "MESSAGE_MODEL_MISMATCH" });
  });
  it("retains safe HTTP and contract diagnostics without provider body content", async () => {
    const privateMarker = "private-upstream-body-must-not-be-retained";
    const rejected = await createOpenRouterAnswerAdapter(config, async () => ({ httpStatus: 429, body: privateMarker })).dispatch(input, signal());
    expect(rejected).toMatchObject({ status: "UNCERTAIN", reason: "HTTP_ERROR", httpStatus: 429, resultContractStatus: "not_evaluated" });
    expect(JSON.stringify(rejected)).not.toContain(privateMarker);
    expect(await createOpenRouterAnswerAdapter(config, async () => ({ httpStatus: 200, body: "not-json" })).dispatch(input, signal()))
      .toMatchObject({ status: "UNCERTAIN", reason: "INVALID_RESPONSE_NOT_JSON", httpStatus: 200, resultContractStatus: "invalid" });
    expect(await createOpenRouterAnswerAdapter(config, async () => response({ ...wire(), usage: null })).dispatch(input, signal()))
      .toMatchObject({ status: "UNCERTAIN", reason: "INVALID_WIRE_USAGE_INVALID_TYPE", httpStatus: 200, resultContractStatus: "invalid" });
    const extra = wire(); Object.assign(extra.choices[0].message, { provider_private_text: privateMarker });
    const extraResult = await createOpenRouterAnswerAdapter(config, async () => response(extra)).dispatch(input, signal());
    expect(extraResult).toMatchObject({ status: "UNCERTAIN", reason: "INVALID_WIRE_CHOICES_ITEM_MESSAGE_UNRECOGNIZED_KEYS_PROVIDER_PRIVATE_TEXT" });
    expect(JSON.stringify(extraResult)).not.toContain(privateMarker);
  });
  it("cannot interpret action or identity requests through answer-only dispatch", () => {
    for (const body of ["Appelle Marc", "mon horaire"]) expect(() => createAnswerInput(source(body))).toThrow("ANSWER_LANE_REFUSED");
    expect(createAnswerInput(source("Trouve le propriétaire du lot 123")).operation).toBe("personal_public_research_v1");
    expect(() => createAnswerInput({ ...source(), senderVerified: false })).toThrow();
  });
  it("rejects changed inputs, function calls and unverified source claims", async () => {
    const adapter = createOpenRouterAnswerAdapter(config, async () => response(wire()));
    expect(await adapter.dispatch({ ...input, requestFingerprint: `sha256:${"0".repeat(64)}` }, signal())).toMatchObject({ dispatched: false });
    const w = wire();
    const bad = { ...w, choices: [{ ...w.choices[0], message: { ...w.choices[0].message, tool_calls: [{ name: "send_sms" }] } }] };
    expect(await createOpenRouterAnswerAdapter(config, async () => response(bad)).dispatch(input, signal())).toMatchObject({ status: "UNCERTAIN" });
    expect(() => inspectAnswer({ ...candidate(), needsCurrentSources: true }, input, [])).toThrow("ANSWER_REQUIRES_RESEARCH");
  });
  it("uses one attempt per source within the adapter, with durable admission still required", async () => {
    const transport = vi.fn(async () => response(wire()));
    const adapter = createOpenRouterAnswerAdapter(config, transport);
    await adapter.dispatch(input, signal());
    expect(await adapter.dispatch(input, signal())).toMatchObject({ reason: "ATTEMPT_ALREADY_USED", dispatched: false });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("binds limited untrusted conversation history and excludes it from public search", () => {
    const history = [{ sourceId: "prior", question: "Une question", answer: "Une réponse", receivedAt: "2026-09-11T14:00:00Z", evidence: "MODEL_ANSWER_UNVERIFIED" }];
    const withHistory = createAnswerInput({ ...source(), history });
    expect(withHistory.requestFingerprint).not.toBe(input.requestFingerprint);
    expect(answerWireRequest(withHistory, config).messages[1].content).toContain("conversationHistoryUntrusted");
    expect(() => createAnswerInput({ ...source(), history: [...history, ...history, ...history, ...history] })).toThrow();
    expect(() => createAnswerInput({ ...source("Prix actuel du béton?"), history })).toThrow("RESEARCH_HISTORY_DISCLOSURE_REFUSED");
    expect(() => createAnswerInput({ ...source("Trouve le propriétaire du lot 123"), history })).toThrow("RESEARCH_HISTORY_DISCLOSURE_REFUSED");
  });
  it("times out transports that ignore AbortSignal and retains unknown cost", async () => {
    vi.useFakeTimers();
    try {
      const transport = vi.fn<AnswerTransport>(() => new Promise(() => {}));
      const pending = createOpenRouterAnswerAdapter({ ...config, timeoutMs: 50 }, transport).dispatch(input, signal());
      await vi.advanceTimersByTimeAsync(51);
      expect(await pending).toMatchObject({ status: "UNCERTAIN", reason: "TIMEOUT", accounting: "UNSETTLED" });
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe("cited public research", () => {
  const research = createAnswerInput(source("Quel est le prix actuel du béton?"));
  const citation = { id: "s1", title: "Fournisseur synthétique", url: "https://supplier.example/prix", excerpt: "Le devis est établi sur demande.", observedAt: "2026-09-11T15:01:00Z" };
  it("caps search count, result count and size, with no action tool", () => {
    const request = answerWireRequest(research, config);
    expect(request.max_tool_calls).toBe(1);
    expect(request.tools).toEqual([{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast", max_results: 5, max_total_results: 5, max_uses: 1, max_characters: 2000 } }]);
  });
  it("publishes source extracts rather than an unsupported model assertion", () => {
    const result = inspectAnswer({ ...candidate(research), answer: "Le prix est garanti à 1 CAD", extracts: [{ sourceId: "s1", quote: citation.excerpt }] }, research, [citation]);
    expect(result.text).toContain(citation.excerpt);
    expect(result.text).not.toContain("garanti");
    expect(result.evidence).toBe("PUBLIC_SOURCE_EXCERPTS");
  });
  it("rejects absent sources and forged supporting excerpts", () => {
    expect(() => inspectAnswer(candidate(research), research, [])).toThrow("RESEARCH_WITHOUT_SOURCES");
    expect(() => inspectAnswer({ ...candidate(research), extracts: [{ sourceId: "s1", quote: "Un prix inventé" }] }, research, [citation])).toThrow("UNSUPPORTED_RESEARCH_EXTRACT");
  });
  it("requires observed search usage and provider citation metadata", async () => {
    const w = wire(research);
    const good = { ...w, usage: { ...w.usage, server_tool_use: { web_search_requests: 1 } },
      choices: [{ ...w.choices[0], message: { ...w.choices[0].message,
        content: JSON.stringify({ ...candidate(research), extracts: [{ sourceId: "s1", quote: citation.excerpt }] }),
        annotations: [{ type: "url_citation", url_citation: { url: citation.url, title: citation.title, content: citation.excerpt } }],
      } }] };
    expect(await createOpenRouterAnswerAdapter(config, async () => response(good)).dispatch(research, signal())).toMatchObject({ status: "ANSWER_INSPECTED", answer: { evidence: "PUBLIC_SOURCE_EXCERPTS" } });
    expect(await createOpenRouterAnswerAdapter(config, async () => response(w)).dispatch(research, signal())).toMatchObject({ reason: "SEARCH_NOT_OBSERVED" });
  });
  it.each(["http://example.com", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://example.com:8443/a", "https://user:pass@example.com/a", "javascript:alert(1)"])("rejects unsafe citation %s", url => {
    expect(() => publicCitationUrl(url)).toThrow();
  });
});
