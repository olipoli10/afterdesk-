import "server-only";
import { z } from "zod";
import { createPersonalIntentInput, inspectPersonalIntentCandidate, type PersonalIntentInput } from "./contract";
import { personalIntentMessages, personalIntentResponseFormat, PERSONAL_INTENT_PROMPT_VERSION } from "./prompt";

// Wire references checked 2026-09-10:
// https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
// https://openrouter.ai/docs/guides/features/structured-outputs
// https://openrouter.ai/docs/guides/routing/provider-selection
// Local-only adapter; no credential reader, network implementation or registration.
export type OpenRouterPersonalIntentRequest = Readonly<{
  model: string; stream: false; max_completion_tokens: number;
  messages: ReturnType<typeof personalIntentMessages>;
  response_format: ReturnType<typeof personalIntentResponseFormat>;
  provider: Readonly<{ only: readonly [string]; allow_fallbacks: false; require_parameters: true; data_collection: "deny"; zdr: true }>;
}>;
export type OpenRouterPersonalIntentTransport = (
  request: OpenRouterPersonalIntentRequest, signal: AbortSignal,
) => Promise<Readonly<{ httpStatus: number; body: string }>>;
export const PERSONAL_INTENT_ADAPTER_LIMITS = Object.freeze({ sourceUtf16Units: 10_000, completionTokens: 8192,
  proposalUtf8Bytes: 65_536, wireUtf8Bytes: 131_072, maximumTimeoutMs: 120_000 });
type Inspected = ReturnType<typeof inspectPersonalIntentCandidate>;
export type OpenRouterPersonalIntentResult =
  | Readonly<{ status: "NOT_DISPATCHED"; reason: "DISABLED" | "INVALID_INPUT" | "ABORTED"; dispatched: false; executionAuthorized: false }>
  | Readonly<{ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED"; dispatched: true; executionAuthorized: false; accounting: "UNSETTLED"; providerRequestId: string; inspected: Inspected }>
  | Readonly<{ status: "DISPATCH_OUTCOME_UNCERTAIN"; reason: "TIMEOUT" | "ABORTED" | "TRANSPORT_ERROR" | "HTTP_ERROR" | "INVALID_RESPONSE"; diagnosticCode?: string; dispatched: true; executionAuthorized: false; accounting: "UNSETTLED" }>;

// Non-authoritative envelope metadata is discarded. Tool calls/refusals cannot
// enter through alternate message fields; even otherwise-valid content is refused.
const wireSchema = z.object({
  id: z.string().min(1).max(191), model: z.string().min(1).max(200),
  choices: z.array(z.object({ index: z.literal(0), finish_reason: z.literal("stop"),
    message: z.object({ role: z.literal("assistant"), content: z.string().min(1),
      model: z.string().min(1).max(200).optional(),
      refusal: z.null().optional(), tool_calls: z.array(z.never()).max(0).optional(),
      reasoning: z.string().max(65_536).nullable().optional(),
      reasoning_details: z.array(z.unknown()).max(100).optional(),
    }).strict(),
  })).length(1),
});
const notDispatched = (reason: "DISABLED" | "INVALID_INPUT" | "ABORTED"): OpenRouterPersonalIntentResult => Object.freeze({ status: "NOT_DISPATCHED", reason, dispatched: false, executionAuthorized: false });
const uncertain = (reason: "TIMEOUT" | "ABORTED" | "TRANSPORT_ERROR" | "HTTP_ERROR" | "INVALID_RESPONSE", diagnosticCode?: string): OpenRouterPersonalIntentResult => Object.freeze({ status: "DISPATCH_OUTCOME_UNCERTAIN", reason, ...(diagnosticCode ? { diagnosticCode } : {}), dispatched: true, executionAuthorized: false, accounting: "UNSETTLED" });

// Closed diagnostic vocabulary only: never return provider text, quotes or keys.
function proposalDiagnostic(error: unknown): string {
  if (error instanceof SyntaxError) return "PROPOSAL_JSON_INVALID";
  if (error instanceof z.ZodError) return "PROPOSAL_SCHEMA_INVALID";
  const allowed = new Set(["PERSONAL_INTENT_RESPONSE_LIMIT", "PERSONAL_INTENT_REQUEST_MISMATCH",
    "PERSONAL_INTENT_ACTION_ORDER_INVALID", "PERSONAL_INTENT_SOURCE_SPAN_MISMATCH"]);
  return error instanceof Error && allowed.has(error.message) ? error.message : "PROPOSAL_INVALID";
}

export function createOpenRouterPersonalIntentAdapter(config: Readonly<{
  enabled?: boolean; modelKey: string; providerEndpointSlug: string; timeoutMs: number;
  maxOutputTokens?: number;
  // This is a trusted construction label, not proof that an arbitrary injected
  // callback performs no I/O. Production wiring must explicitly declare real I/O.
  transportMode?: "SYNTHETIC_LOCAL" | "EXTERNAL_PROVIDER";
  transport: OpenRouterPersonalIntentTransport;
}>) {
  const maxOutputTokens = config.maxOutputTokens ?? PERSONAL_INTENT_ADAPTER_LIMITS.completionTokens;
  if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(config.modelKey)
    || !/^[A-Za-z0-9._:@/-]{1,200}$/.test(config.providerEndpointSlug)
    || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 120_000
    || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > PERSONAL_INTENT_ADAPTER_LIMITS.completionTokens
    || (config.transportMode !== undefined && !["SYNTHETIC_LOCAL", "EXTERNAL_PROVIDER"].includes(config.transportMode))
    || typeof config.transport !== "function") throw new Error("PERSONAL_INTENT_ADAPTER_CONFIG_INVALID");
  // Snapshot configuration: a caller cannot enable or reroute an existing adapter
  // by mutating its original config while a request is awaiting completion.
  const { modelKey, providerEndpointSlug, timeoutMs, transport } = config;
  const enabled = config.enabled === true;
  const transportMode = config.transportMode ?? "SYNTHETIC_LOCAL";
  return Object.freeze({
    key: "openrouter-personal-intent-candidate" as const,
    promptVersion: PERSONAL_INTENT_PROMPT_VERSION,
    modelKey, providerEndpointSlug, maxOutputTokens, transportMode, limits: PERSONAL_INTENT_ADAPTER_LIMITS,
    async dispatch(untrustedInput: PersonalIntentInput, signal: AbortSignal): Promise<OpenRouterPersonalIntentResult> {
      if (!enabled) return notDispatched("DISABLED");
      let input: PersonalIntentInput;
      try {
        const allowed = ["schemaVersion", "operation", "sourceOperationId", "source", "requestFingerprint"];
        if (!untrustedInput || Object.keys(untrustedInput).some(key => !allowed.includes(key))) throw new Error();
        input = createPersonalIntentInput(untrustedInput.sourceOperationId, untrustedInput.source);
        if (untrustedInput.schemaVersion !== 1 || untrustedInput.operation !== input.operation
          || untrustedInput.requestFingerprint !== input.requestFingerprint) throw new Error();
      } catch { return notDispatched("INVALID_INPUT"); }
      if (signal.aborted) return notDispatched("ABORTED");
      const request: OpenRouterPersonalIntentRequest = Object.freeze({
        // Reasoning endpoints do not universally support sampling controls.
        // Deterministic backend validation, not temperature, guards actions.
        model: modelKey, stream: false, max_completion_tokens: maxOutputTokens,
        messages: personalIntentMessages(input), response_format: personalIntentResponseFormat(),
        provider: Object.freeze({ only: Object.freeze([providerEndpointSlug]) as readonly [string],
          allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true }),
      });
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: () => void = () => undefined;
      type Completed = { kind: "response"; value: Awaited<ReturnType<OpenRouterPersonalIntentTransport>> } | { kind: "error" } | { kind: "abort" } | { kind: "timeout" };
      const interrupted = new Promise<Completed>(resolve => {
        onAbort = () => { controller.abort(); resolve({ kind: "abort" }); };
        signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); resolve({ kind: "timeout" }); }, timeoutMs);
      });
      try {
        // Exactly one transport invocation per dispatch. No retry, alternate model,
        // fallback, response healing, billing release or action execution here.
        let pending: Promise<Completed>;
        try { pending = transport(request, controller.signal).then(value => ({ kind: "response" as const, value }), () => ({ kind: "error" as const })); }
        catch { return uncertain("TRANSPORT_ERROR"); }
        const outcome = await Promise.race([pending, interrupted]);
        if (outcome.kind === "timeout") return uncertain("TIMEOUT");
        if (outcome.kind === "abort" || signal.aborted) return uncertain("ABORTED");
        if (outcome.kind === "error") return uncertain("TRANSPORT_ERROR");
        if (outcome.value?.httpStatus !== 200) return uncertain("HTTP_ERROR");
        try {
          const raw = outcome.value.body;
          if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 131_072) return uncertain("INVALID_RESPONSE", "WIRE_RESPONSE_LIMIT");
          let decoded: unknown;
          try { decoded = JSON.parse(raw); } catch { return uncertain("INVALID_RESPONSE", "WIRE_JSON_INVALID"); }
          const parsed = wireSchema.safeParse(decoded);
          if (!parsed.success) return uncertain("INVALID_RESPONSE", parsed.error.issues.some(issue => issue.path.includes("finish_reason"))
            ? "OUTPUT_NOT_FINISHED" : "WIRE_SCHEMA_INVALID");
          const wire = parsed.data;
          if (wire.model !== modelKey) return uncertain("INVALID_RESPONSE", "SERVED_MODEL_MISMATCH");
          if (wire.choices[0].message.model !== undefined && wire.choices[0].message.model !== wire.model) return uncertain("INVALID_RESPONSE", "MESSAGE_MODEL_MISMATCH");
          let inspected: Inspected;
          try { inspected = inspectPersonalIntentCandidate(wire.choices[0].message.content, input); }
          catch (error) { return uncertain("INVALID_RESPONSE", proposalDiagnostic(error)); }
          return Object.freeze({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED", dispatched: true, executionAuthorized: false,
            accounting: "UNSETTLED", providerRequestId: wire.id, inspected });
        } catch { return uncertain("INVALID_RESPONSE"); }
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
  });
}
