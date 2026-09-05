import { z } from "zod";

import {
  OPENROUTER_ENDPOINT,
  R37_ATTEMPT_RESERVATION_MICROS,
  R37_CREDENTIAL_ENV,
  R37_MAX_RESPONSE_BYTES,
  assertExchangeCeiling,
  controllerOutputSchema,
  createOpenRouterRequest,
  r37Fingerprint,
  roundUsdCostToMicros,
  type R37ObservedCase,
  R37_MODELS,
} from "@/lib/construction-operating-assistant-r37/contracts";
import { buildCorrectedOpenRouterRequest } from "@/lib/construction-operating-assistant-r37bb/contracts";

const rawResponseSchema = z.object({
  id: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  choices: z.array(z.object({
    index: z.number().int(),
    finish_reason: z.string().nullable(),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().min(1).max(32_000),
    }).passthrough(),
  }).passthrough()).length(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().positive(),
    cost: z.number().finite().nonnegative(),
  }).passthrough(),
}).passthrough();

export type OpenRouterFetch = typeof fetch;

export type DispatchOpenRouterInput = Readonly<{
  modelId: (typeof R37_MODELS)[number];
  observedCase: R37ObservedCase;
  fetchImpl?: OpenRouterFetch;
  credentialResolver?: () => string | undefined;
  now?: () => Date;
  requestVersion?: "R37" | "R37BB_CORRECTED";
}>;

function resolveLocalCredential() {
  return process.env[R37_CREDENTIAL_ENV];
}

export function hasLocalOpenRouterCredential() {
  const value = process.env[R37_CREDENTIAL_ENV];
  return typeof value === "string" && value.trim().length >= 20;
}

function requireCredential(resolver: () => string | undefined) {
  const credential = resolver();
  if (
    typeof credential !== "string" ||
    credential.trim().length < 20 ||
    /\s/u.test(credential) ||
    /^(?:replace|placeholder|example|changeme)/iu.test(credential)
  ) {
    throw new Error("R37_CREDENTIAL_REQUIRED");
  }
  return credential;
}

async function readBoundedBody(response: Response) {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > R37_MAX_RESPONSE_BYTES) {
    throw new Error("R37_RESPONSE_BODY_TOO_LARGE");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > R37_MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("R37_RESPONSE_BODY_TOO_LARGE");
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}

export async function dispatchOpenRouterRequest(input: DispatchOpenRouterInput) {
  const trustedNow = input.now?.() ?? new Date();
  assertExchangeCeiling(trustedNow);
  const request = input.requestVersion === "R37BB_CORRECTED"
    ? buildCorrectedOpenRouterRequest(input.modelId, input.observedCase)
    : createOpenRouterRequest(input.modelId, input.observedCase);
  const credential = requireCredential(input.credentialResolver ?? resolveLocalCredential);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(OPENROUTER_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch {
    throw new Error(controller.signal.aborted ? "R37_PROVIDER_TIMEOUT" : "R37_PROVIDER_TRANSPORT_FAILURE");
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Math.max(0, Math.ceil(performance.now() - startedAt));
  if (!response.ok) throw new Error(`R37_PROVIDER_HTTP_${response.status}`);
  const rawText = await readBoundedBody(response);
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    throw new Error("R37_PROVIDER_RESPONSE_NOT_JSON");
  }
  const parsedResult = rawResponseSchema.safeParse(rawJson);
  if (!parsedResult.success) {
    const hasUsage = typeof rawJson === "object" && rawJson !== null && "usage" in rawJson;
    const usage = hasUsage ? (rawJson as { usage?: unknown }).usage : undefined;
    if (typeof usage === "object" && usage !== null && !("cost" in usage)) {
      throw new Error("R37_RESPONSE_COST_REQUIRED");
    }
    throw new Error("R37_PROVIDER_RESPONSE_INVALID");
  }
  const parsed = parsedResult.data;
  if (parsed.model !== input.modelId) throw new Error("R37_RESPONSE_MODEL_DRIFT");
  const choice = parsed.choices[0]!;
  if (choice.index !== 0 || choice.finish_reason !== "stop") {
    throw new Error("R37_RESPONSE_CHOICE_INVALID");
  }
  if ("tool_calls" in choice.message) throw new Error("R37_RESPONSE_TOOL_CALL_REFUSED");

  let outputJson: unknown;
  try {
    outputJson = JSON.parse(choice.message.content);
  } catch {
    throw new Error("R37_CONTROLLER_OUTPUT_NOT_JSON");
  }
  const outputResult = controllerOutputSchema.safeParse(outputJson);
  if (!outputResult.success) throw new Error("R37_CONTROLLER_OUTPUT_INVALID");
  const costMicros = roundUsdCostToMicros(parsed.usage.cost);
  if (costMicros > R37_ATTEMPT_RESERVATION_MICROS) {
    throw new Error("R37_ATTEMPT_COST_CEILING_EXCEEDED");
  }
  const evidenceCore = {
    responseId: parsed.id,
    modelId: input.modelId,
    output: outputResult.data,
    usage: {
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
      totalTokens: parsed.usage.total_tokens,
    },
    costMicros: costMicros.toString(),
    latencyMs,
    evidenceLabel: "OBSERVED_PROVIDER_SYNTHETIC_INPUT" as const,
  };
  return {
    ...evidenceCore,
    costMicros,
    responseFingerprint: r37Fingerprint(evidenceCore),
  };
}
