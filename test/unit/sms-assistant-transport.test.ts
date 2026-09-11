import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnswerInput } from "@/server/model-gateway/personal-answer/contract";
import { answerWireRequest } from "@/server/model-gateway/personal-answer/openrouter-adapter";
import { createAnswerTransport } from "@/server/model-gateway/personal-answer/openrouter-transport";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

const request = (research = false) => answerWireRequest(createAnswerInput({ requestId: "sms-synthetic", workspaceId: "ws-synthetic",
  senderVerified: true, workspaceBound: true, receivedAt: "2026-09-11T16:00:00Z", body: research ? "Prix actuel du béton?" : "Explique-moi le béton" }),
{ enabled: true, allowedModels: ["synthetic/model"], providerEndpoints: ["synthetic/provider"], timeoutMs: 1000 });
const environment = (): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
  ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED: "true", ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED: "true",
  ENDVERA_PERSONAL_PUBLIC_RESEARCH_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" });
const sig = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());
function setup() { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T16:00:00Z")); }
describe("fixed one-use answer HTTP capability, injected fetch only", () => {
  it("does not read a key or fetch while disabled or for a changed request", async () => {
    setup(); const key = vi.fn(async () => "synthetic-key-not-a-real-secret"), fetcher = vi.fn<typeof fetch>(); const r = request();
    await expect(createAnswerTransport({ expectedRequest: r, getApiKey: key }, environment(), fetcher)(r, sig())).rejects.toThrow("ANSWER_TRANSPORT_UNAVAILABLE");
    await expect(createAnswerTransport({ enabled: true, expectedRequest: r, getApiKey: key }, environment(), fetcher)({ ...r, model: "changed" } as typeof r, sig())).rejects.toThrow();
    expect(key).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the fixed endpoint once and never returns headers or credentials", async () => {
    setup(); const r = request(), key = vi.fn(async () => "synthetic-key-not-a-real-secret");
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    const transport = createAnswerTransport({ enabled: true, expectedRequest: r, getApiKey: key }, environment(), fetcher);
    expect(await transport(r, sig())).toEqual({ httpStatus: 200, body: "{}" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", cache: "no-store" });
    await expect(transport(r, sig())).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rechecks the research switch after asynchronous credential access", async () => {
    setup(); const r = request(true), env = environment(); const fetcher = vi.fn<typeof fetch>();
    const transport = createAnswerTransport({ enabled: true, expectedRequest: r, getApiKey: async () => {
      env.ENDVERA_PERSONAL_PUBLIC_RESEARCH_ENABLED = "false"; return "synthetic-key-not-a-real-secret";
    } }, env, fetcher);
    await expect(transport(r, sig())).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["text/html", "application/json"])("refuses invalid or oversized response %s", async contentType => {
    setup(); const r = request();
    const transport = createAnswerTransport({ enabled: true, expectedRequest: r, getApiKey: async () => "synthetic-key-not-a-real-secret" }, environment(),
      async () => new Response("x".repeat(131073), { headers: { "content-type": contentType } }));
    await expect(transport(r, sig())).rejects.toThrow("ANSWER_TRANSPORT_UNAVAILABLE");
  });
});
