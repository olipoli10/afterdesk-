import { z } from "zod";

import { r37aFingerprint } from "@/lib/construction-operating-assistant-r37a/contracts";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions" as const;
export const R37_CREDENTIAL_ENV = "R37_OPENROUTER_CONTROLLER_API_KEY" as const;
export const R37_MODELS = ["openai/gpt-5.4", "openai/gpt-5.4-mini"] as const;
export const R37_MAX_RESPONSE_BYTES = 262_144;
export const R37_MAX_OUTPUT_TOKENS = 512;
export const R37_ATTEMPT_RESERVATION_MICROS = 100_000n;

export const R37_AUTHORITY = Object.freeze({
  schemaVersion: 1 as const,
  gateway: "OPENROUTER" as const,
  syntheticOnly: true as const,
  founderCeilingCadMicros: 10_000_000n,
  applicationCeilingUsdMicros: 5_000_000n,
  maxPaidCalls: 6,
  externalCommunicationAuthorized: false as const,
  externalToolAuthorized: false as const,
  deploymentAuthorized: false as const,
});

export const R37_EXCHANGE_EVIDENCE = Object.freeze({
  source: "BANK_OF_CANADA_DAILY_EXCHANGE_RATES" as const,
  observedAt: "2026-09-03T00:00:00.000Z",
  cadMicrosPerUsd: 1_378_900n,
  maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
});

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const factIdSchema = z.string().regex(/^F-[0-9]{3}$/u);

export const controllerCapabilitySchema = z.enum([
  "ANSWER_FROM_STATE",
  "PREPARE_COMMUNICATION",
  "CLARIFY",
  "REFUSE",
]);

export const controllerOutputSchema = z.object({
  answer: z.string().trim().min(1).max(4_000),
  citedFactIds: z.array(factIdSchema).max(20),
  proposedCapability: controllerCapabilitySchema,
  limitations: z.array(z.string().trim().min(1).max(500)).max(10),
}).strict();

export const r37ObservedCaseSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.enum(["INVOICE_READINESS", "MAINTAINED_STATE", "PREPARED_COMMUNICATION"]),
  caseVersion: z.literal(1),
  locale: z.literal("en-CA"),
  facts: z.array(z.object({
    id: factIdSchema,
    value: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(20),
  task: z.string().trim().min(1).max(1_000),
  requiredFactIds: z.array(factIdSchema).min(1).max(20),
  allowedCapabilities: z.array(controllerCapabilitySchema).min(1).max(4),
  requiredAnswerTerms: z.array(z.array(z.string().trim().min(1).max(80)).min(1).max(8)).max(10),
  forbiddenAnswerTerms: z.array(z.string().trim().min(1).max(120)).max(20),
  expectedLimitations: z.array(z.string().trim().min(1).max(120)).max(10),
  caseFingerprint: fingerprintSchema,
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

export const openRouterRequestSchema = z.object({
  model: z.enum(R37_MODELS),
  messages: z.tuple([
    z.object({ role: z.literal("system"), content: z.string().min(1).max(8_000) }).strict(),
    z.object({ role: z.literal("user"), content: z.string().min(1).max(12_000) }).strict(),
  ]),
  max_tokens: z.literal(R37_MAX_OUTPUT_TOKENS),
  temperature: z.literal(0),
  stream: z.literal(false),
  response_format: z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
      name: z.literal("endvera_controller_result_v1"),
      strict: z.literal(true),
      schema: z.custom<typeof responseJsonSchema>(
        (value) => JSON.stringify(value) === responseJsonSchemaSerialized,
        { message: "R37_RESPONSE_SCHEMA_DRIFT" },
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

export const r37ObservedEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  campaignId: z.string().trim().min(1).max(200),
  provider: z.literal("OPENROUTER"),
  modelId: z.enum(R37_MODELS),
  caseId: z.enum(["INVOICE_READINESS", "MAINTAINED_STATE", "PREPARED_COMMUNICATION"]),
  caseFingerprint: fingerprintSchema,
  responseId: z.string().trim().min(1).max(200),
  responseFingerprint: fingerprintSchema,
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().positive(),
  }).strict(),
  costMicros: z.string().regex(/^[0-9]+$/u),
  latencyMs: z.number().int().nonnegative(),
  output: controllerOutputSchema,
  oracle: z.object({
    passed: z.boolean(),
    inventedFactCount: z.number().int().nonnegative(),
    reasonCodes: z.array(z.string().regex(/^R37_[A-Z0-9_]+$/u)).max(20),
  }).strict(),
  evidenceLabel: z.literal("OBSERVED_PROVIDER_SYNTHETIC_INPUT"),
}).strict();

export const r37CampaignReportSchema = z.object({
  schemaVersion: z.literal(1),
  campaignId: z.string().trim().min(1).max(200),
  provider: z.literal("OPENROUTER"),
  evidenceLabel: z.literal("OBSERVED_PROVIDER_SYNTHETIC_INPUT"),
  expectedCallCount: z.literal(6),
  dispatchedCallCount: z.number().int().nonnegative().max(6),
  canonicalObservationCount: z.number().int().nonnegative().max(6),
  replayedDispatchCount: z.literal(0),
  settledSpendMicros: z.string().regex(/^[0-9]+$/u),
  founderCeilingCadMicros: z.literal("10000000"),
  applicationCeilingUsdMicros: z.literal("5000000"),
  observations: z.array(r37ObservedEvidenceSchema).max(6),
  selectedR38Candidate: z.enum(R37_MODELS).nullable(),
  failureCodes: z.array(z.string().regex(/^R37_[A-Z0-9_:-]+$/u)).max(20),
  grantsRevoked: z.boolean(),
  providerLaneDisabled: z.boolean(),
  externalCommunicationPerformed: z.literal(false),
  externalToolWritePerformed: z.literal(false),
  deploymentPerformed: z.literal(false),
  verdict: z.enum(["OPENROUTER_SANDBOX_OBSERVED_PASS", "REWORK"]),
}).strict();

const SYSTEM_PROMPT = [
  "You are ENDVERA's bounded construction controller.",
  "Use only the ordered synthetic facts supplied below.",
  "Every factual statement must be supported by citedFactIds.",
  "You may answer from state, prepare but never send a communication, ask for clarification, or refuse.",
  "Never claim that you sent, called, emailed, paid, deployed, or changed an external system.",
  "Return only the requested JSON object.",
].join("\n");

export function createOpenRouterRequest(
  modelId: (typeof R37_MODELS)[number],
  observedCase: R37ObservedCase,
) {
  const parsedCase = r37ObservedCaseSchema.parse(observedCase);
  const request = {
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
        }),
      },
    ] as const,
    max_tokens: R37_MAX_OUTPUT_TOKENS,
    temperature: 0 as const,
    stream: false as const,
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "endvera_controller_result_v1" as const,
        strict: true as const,
        schema: responseJsonSchema,
      },
    },
    provider: {
      allow_fallbacks: false as const,
      require_parameters: true as const,
      data_collection: "deny" as const,
      zdr: true as const,
    },
  };
  return openRouterRequestSchema.parse(request);
}

export function assertExchangeCeiling(now: Date) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("R37_TRUSTED_CLOCK_INVALID");
  }
  const observedAt = new Date(R37_EXCHANGE_EVIDENCE.observedAt);
  const age = now.getTime() - observedAt.getTime();
  if (age < 0 || age > R37_EXCHANGE_EVIDENCE.maxAgeMs) {
    throw new Error("R37_EXCHANGE_EVIDENCE_EXPIRED");
  }
  const converted = divCeil(
    R37_AUTHORITY.applicationCeilingUsdMicros * R37_EXCHANGE_EVIDENCE.cadMicrosPerUsd,
    1_000_000n,
  );
  if (converted >= R37_AUTHORITY.founderCeilingCadMicros) {
    throw new Error("R37_FOUNDER_CAD_CEILING_NOT_PROVEN");
  }
  return converted;
}

function divCeil(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

export function roundUsdCostToMicros(cost: number) {
  if (!Number.isFinite(cost) || cost < 0) throw new Error("R37_RESPONSE_COST_INVALID");
  return BigInt(Math.ceil(cost * 1_000_000));
}

export function r37Fingerprint(value: unknown) {
  return r37aFingerprint(value);
}

export type ControllerOutput = z.infer<typeof controllerOutputSchema>;
export type R37ObservedCase = z.infer<typeof r37ObservedCaseSchema>;
export type OpenRouterRequest = z.infer<typeof openRouterRequestSchema>;
export type R37CampaignReport = z.infer<typeof r37CampaignReportSchema>;
