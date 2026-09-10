import "server-only";
import { canonicalFingerprint } from "../evidence";
import type { PersonalIntentInput } from "./contract";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { PERSONAL_INTENT_ADAPTER_LIMITS, type OpenRouterPersonalIntentRequest, type OpenRouterPersonalIntentTransport } from "./openrouter-adapter";
import { personalIntentMessages, personalIntentResponseFormat } from "./prompt";

// Verified against OpenRouter's chat completion and provider-selection docs
// 2026-09-10. Fixed endpoint, Bearer auth, exact single provider, no redirects.
// https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion
// https://openrouter.ai/docs/guides/routing/provider-selection
const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const fail = (): never => { throw new Error("PERSONAL_MODEL_TRANSPORT_UNAVAILABLE"); };

/** Internal wire capability only. Construct after full gateway admission; invoke
 * ONLY inside the dispatcher's committed one-attempt CAS. This function does not
 * establish consent, reserve funds, settle charges or authenticate source input.
 * Secret access is lazy and must reload the bound credential/owner before returning.
 * No endpoint, key or wire request is accepted through a public API.
 */
export function createPersonalOpenRouterTransport(input: Readonly<{
  enabled?: boolean;
  source: PersonalIntentInput;
  modelKey: string;
  providerEndpointSlug: string;
  maxOutputTokens: number;
  getApiKey: () => Promise<string>;
}>, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): OpenRouterPersonalIntentTransport {
  const expected: OpenRouterPersonalIntentRequest = {
    model: input.modelKey, stream: false, temperature: 0, max_completion_tokens: input.maxOutputTokens,
    messages: personalIntentMessages(input.source), response_format: personalIntentResponseFormat(),
    provider: { only: [input.providerEndpointSlug], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true },
  };
  const expectedHash = canonicalFingerprint(expected);
  const enabled = input.enabled === true;
  const getApiKey = input.getApiKey;
  let used = false;
  function active(signal: AbortSignal) {
    if (!enabled || signal.aborted || env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "true"
      || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED"
      || env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "true"
      || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY
      || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z"
      || Date.now() < Date.parse("2026-09-10T01:18:26Z") || Date.now() >= Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT)) fail();
  }
  return async (request, signal) => {
    // A failed attempt cannot reuse this capability; no key/HTTP retries.
    active(signal);
    if (used || canonicalFingerprint(request) !== expectedHash) fail();
    const body = JSON.stringify(request);
    if (Buffer.byteLength(body, "utf8") > 100_000) fail();
    used = true;
    let key: string;
    try { key = await getApiKey(); } catch { return fail(); }
    active(signal);
    if (typeof key !== "string" || key.length < 20 || key.length > 512 || /[^\x21-\x7e]/.test(key)) fail();
    let response: Response | undefined;
    try {
      response = await fetcher(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body });
      // Never retain/log provider error text or forward it to the model/user.
      if (!response.ok) { await response.body?.cancel(); return { httpStatus: response.status, body: "" }; }
      if (response.redirected || response.url && response.url !== endpoint || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) fail();
      const length = response.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > PERSONAL_INTENT_ADAPTER_LIMITS.wireUtf8Bytes)) fail();
      const responseBody = response.body;
      if (!responseBody) return fail();
      const reader = responseBody.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          active(signal);
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > PERSONAL_INTENT_ADAPTER_LIMITS.wireUtf8Bytes) fail();
          chunks.push(item.value);
        }
        active(signal);
        return { httpStatus: response.status, body: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)) };
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } catch { return fail(); }
    finally { if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined); }
  };
}
