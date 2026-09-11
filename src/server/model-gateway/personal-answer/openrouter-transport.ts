import "server-only";
import { canonicalFingerprint } from "../evidence";
import { PERSONAL_MODEL_AUTHORITY } from "../personal-intent/budget-policy";
import type { AnswerTransport, AnswerWireRequest } from "./openrouter-adapter";
const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const fail = (): never => { throw new Error("ANSWER_TRANSPORT_UNAVAILABLE"); };

/** Lazy one-use HTTP capability. Only the committed gateway dispatcher invokes
 * it. No configuration, key or endpoint is accepted from SMS/model content. */
export function createAnswerTransport(input: { enabled?: boolean; expectedRequest: AnswerWireRequest; getApiKey: () => Promise<string> },
  env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): AnswerTransport {
  const enabled = input.enabled === true, expectedHash = canonicalFingerprint(input.expectedRequest), getKey = input.getApiKey;
  let used = false;
  function active(signal: AbortSignal) {
    if (!enabled || signal.aborted || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED"
      || env.ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED !== "true" || env.ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED !== "true"
      || input.expectedRequest.tools !== undefined && env.ENDVERA_PERSONAL_PUBLIC_RESEARCH_ENABLED !== "true"
      || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z"
      || Date.now() < Date.parse("2026-09-10T01:18:26Z") || Date.now() >= Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT)) fail();
  }
  return async (request, signal) => {
    active(signal);
    if (used || canonicalFingerprint(request) !== expectedHash) fail();
    used = true;
    const body = JSON.stringify(request);
    if (Buffer.byteLength(body, "utf8") > 65_536) fail();
    let response: Response | undefined;
    try {
      const key = await getKey(); active(signal);
      if (typeof key !== "string" || !/^[A-Za-z0-9_-]{24,512}$/u.test(key)) fail();
      response = await fetcher(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body });
      if (!response.ok) { await response.body?.cancel(); return { httpStatus: response.status, body: "" }; }
      if (response.redirected || response.url && response.url !== endpoint || !/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) fail();
      const length = response.headers.get("content-length");
      if (length && (!/^\d+$/u.test(length) || Number(length) > 131_072)) fail();
      if (!response.body) return fail();
      const reader = response.body.getReader();
      let bytes = 0; const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          active(signal); const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength; if (bytes > 131_072) fail(); chunks.push(part.value);
        }
        active(signal);
        return { httpStatus: response.status, body: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)) };
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } catch { return fail(); }
    finally { if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined); }
  };
}
