import { z } from "zod";

import {
  R37_MAX_OUTPUT_TOKENS,
  controllerCapabilitySchema,
  r37ObservedCaseSchema,
  type R37ObservedCase,
} from "@/lib/construction-operating-assistant-r37/contracts";

export const R37BB_MODELS = ["openai/gpt-5.4", "openai/gpt-5.4-mini"] as const;
const R37BB_MAX_METADATA_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const requiredParametersSchema = z.tuple([
  z.literal("max_completion_tokens"),
  z.literal("response_format"),
  z.literal("structured_outputs"),
]);

const incompatibleParametersSchema = z.tuple([
  z.literal("max_tokens"),
  z.literal("temperature"),
]);

const zdrEndpointSchema = z.object({
  providerName: z.string().trim().min(1).max(100),
  tag: z.string().trim().min(1).max(100),
  status: z.number().int(),
  supportedParameters: z.array(z.string().trim().min(1).max(100)).min(1),
}).strict();

const modelSnapshotSchema = z.object({
  modelId: z.enum(R37BB_MODELS),
  totalEndpointCount: z.number().int().positive(),
  zdrEndpoints: z.array(zdrEndpointSchema),
}).strict();

export const openRouterEndpointSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAtUtc: z.string().datetime({ offset: true }),
  evidenceLabel: z.literal("OBSERVED_PUBLIC_METADATA"),
  sourceUrls: z.tuple([
    z.literal("https://openrouter.ai/api/v1/models/openai/gpt-5.4/endpoints"),
    z.literal("https://openrouter.ai/api/v1/models/openai/gpt-5.4-mini/endpoints"),
    z.literal("https://openrouter.ai/api/v1/endpoints/zdr"),
  ]),
  requiredParameters: requiredParametersSchema,
  incompatibleR37Parameters: incompatibleParametersSchema,
  correctedParameter: z.literal("max_completion_tokens"),
  models: z.tuple([
    modelSnapshotSchema.extend({ modelId: z.literal("openai/gpt-5.4") }),
    modelSnapshotSchema.extend({ modelId: z.literal("openai/gpt-5.4-mini") }),
  ]),
}).strict();

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "citedFactIds", "proposedCapability", "limitations"],
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 4_000 },
    citedFactIds: { type: "array", maxItems: 20, items: { type: "string", pattern: "^F-[0-9]{3}$" } },
    proposedCapability: { type: "string", enum: controllerCapabilitySchema.options },
    limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
  },
} as const;

const responseJsonSchemaSerialized = JSON.stringify(responseJsonSchema);

export const correctedOpenRouterRequestSchema = z.object({
  model: z.enum(R37BB_MODELS),
  messages: z.tuple([
    z.object({ role: z.literal("system"), content: z.string().min(1).max(8_000) }).strict(),
    z.object({ role: z.literal("user"), content: z.string().min(1).max(12_000) }).strict(),
  ]),
  max_completion_tokens: z.literal(R37_MAX_OUTPUT_TOKENS),
  stream: z.literal(false),
  response_format: z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
      name: z.literal("endvera_controller_result_v1"),
      strict: z.literal(true),
      schema: z.custom<typeof responseJsonSchema>(
        (value) => JSON.stringify(value) === responseJsonSchemaSerialized,
        { message: "R37BB_RESPONSE_SCHEMA_DRIFT" },
      ),
    }).strict(),
  }).strict(),
  provider: z.object({
    allow_fallbacks: z.literal(false),
    require_parameters: z.literal(true),
    data_collection: z.literal("deny"),
    zdr: z.literal(true),
  }).strict(),
}).strict();

const SYSTEM_PROMPT = [
  "You are ENDVERA's bounded construction controller.",
  "Use only the ordered synthetic facts supplied below.",
  "Every factual statement must be supported by citedFactIds.",
  "You may answer from state, prepare but never send a communication, ask for clarification, or refuse.",
  "Use only a capability listed in allowedCapabilities.",
  "Include every expectedLimitations concept in the limitations array.",
  "Never claim that you sent, called, emailed, paid, deployed, or changed an external system.",
  "Return only the requested JSON object.",
].join("\n");

export function evaluateZdrCompatibility(
  input: unknown,
  now = new Date(),
) {
  const parsed = openRouterEndpointSnapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error("R37BB_METADATA_INVALID");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("R37BB_TRUSTED_CLOCK_INVALID");
  }

  const capturedAt = new Date(parsed.data.capturedAtUtc);
  const age = now.getTime() - capturedAt.getTime();
  if (age < 0 || age > R37BB_MAX_METADATA_AGE_MS) {
    throw new Error("R37BB_METADATA_STALE");
  }

  return parsed.data.models.map((model) => {
    const parameterCompatibleEndpoints = model.zdrEndpoints
      .filter((endpoint) => endpoint.status === 0)
      .filter((endpoint) => parsed.data.requiredParameters.every(
        (parameter) => endpoint.supportedParameters.includes(parameter),
      ));
    const unsupportedAcrossCompatibleEndpoints = parsed.data.incompatibleR37Parameters.filter(
      (parameter) => parameterCompatibleEndpoints.every(
        (endpoint) => !endpoint.supportedParameters.includes(parameter),
      ),
    );
    const eligibleEndpointTags = parameterCompatibleEndpoints.map((endpoint) => endpoint.tag);

    if (eligibleEndpointTags.length === 0) {
      throw new Error("R37BB_NO_COMPATIBLE_ZDR_ENDPOINT");
    }
    if (unsupportedAcrossCompatibleEndpoints.length !== parsed.data.incompatibleR37Parameters.length) {
      throw new Error("R37BB_METADATA_CONTRADICTS_DIAGNOSIS");
    }

    return Object.freeze({
      modelId: model.modelId,
      modelExists: model.totalEndpointCount > 0,
      eligibleEndpointTags,
      requiredParameters: [...parsed.data.requiredParameters],
      incompatibleR37Parameters: [...parsed.data.incompatibleR37Parameters],
      correctedParameter: parsed.data.correctedParameter,
      evidenceLabel: "OBSERVED_PUBLIC_METADATA + CODE + INFERRED" as const,
    });
  });
}

export function buildCorrectedOpenRouterRequest(
  modelId: (typeof R37BB_MODELS)[number],
  observedCase: R37ObservedCase,
  providerOverride?: unknown,
) {
  const parsedCase = r37ObservedCaseSchema.parse(observedCase);
  const provider = providerOverride ?? {
    allow_fallbacks: false as const,
    require_parameters: true as const,
    data_collection: "deny" as const,
    zdr: true as const,
  };

  return correctedOpenRouterRequestSchema.parse({
    model: modelId,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: JSON.stringify({
          caseId: parsedCase.caseId,
          locale: parsedCase.locale,
          facts: parsedCase.facts,
          task: parsedCase.task,
          allowedCapabilities: parsedCase.allowedCapabilities,
          expectedLimitations: parsedCase.expectedLimitations,
        }),
      },
    ],
    max_completion_tokens: R37_MAX_OUTPUT_TOKENS,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "endvera_controller_result_v1",
        strict: true,
        schema: responseJsonSchema,
      },
    },
    provider,
  });
}

export type OpenRouterEndpointSnapshot = z.infer<typeof openRouterEndpointSnapshotSchema>;
export type CorrectedOpenRouterRequest = z.infer<typeof correctedOpenRouterRequestSchema>;
