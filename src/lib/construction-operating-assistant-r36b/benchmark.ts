import { z } from "zod";
import {
  candidateObservationSchema,
  candidateObservationUnsignedSchema,
  r36bFingerprint,
  sandboxCeilingsSchema,
  type CandidateObservation,
} from "./contracts";

const comparisonReportSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceLabel: z.literal("SYNTHETIC"),
  verdict: z.literal("NO_PROVIDER_SELECTION"),
  caseFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  ceilingFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  observationFingerprints: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/u)).min(2).max(8),
  totalCostMicros: z.number().int().nonnegative(),
  validObservationCount: z.number().int().nonnegative(),
  providerExecutionCount: z.literal(0),
  externalDispatchCount: z.literal(0),
  reportFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
}).strict();

export function createSyntheticObservation(input: Readonly<{
  providerKey: "PERPLEXITY_SEARCH" | "OPENROUTER_CONTROLLER" | "DIRECT_CONTROLLER_CONTROL";
  packetFingerprint: string;
  caseFingerprint: string;
  ceilingFingerprint: string;
  responseFixture: unknown;
  normalizedOutput: unknown;
  latencyMs: number;
  costMicros: number;
  contractValid: boolean;
  citationCoverageBps: number;
  unsupportedClaimCount: number;
  ceilings: unknown;
}>): CandidateObservation {
  const ceilings = sandboxCeilingsSchema.parse(input.ceilings);
  const failureClass = !input.contractValid
    ? "CONTRACT_INVALID"
    : input.unsupportedClaimCount > 0
      ? "UNSUPPORTED_CLAIM"
      : input.costMicros > ceilings.maxCostMicros
        ? "BUDGET_EXCEEDED"
        : input.latencyMs > ceilings.maxLatencyMs
          ? "LATENCY_EXCEEDED"
          : "NONE";
  const unsigned = candidateObservationUnsignedSchema.parse({
    schemaVersion: 1,
    providerKey: input.providerKey,
    packetFingerprint: input.packetFingerprint,
    caseFingerprint: input.caseFingerprint,
    ceilingFingerprint: input.ceilingFingerprint,
    responseFixtureFingerprint: r36bFingerprint(input.responseFixture),
    evidenceLabel: "SYNTHETIC",
    latencyMs: input.latencyMs,
    costMicros: input.costMicros,
    contractValid: input.contractValid,
    citationCoverageBps: input.citationCoverageBps,
    unsupportedClaimCount: input.unsupportedClaimCount,
    failureClass,
    normalizedOutputFingerprint: r36bFingerprint(input.normalizedOutput),
  });
  return candidateObservationSchema.parse({ ...unsigned, observationFingerprint: r36bFingerprint(unsigned) });
}

export function compareSyntheticCandidates(
  observations: readonly CandidateObservation[],
  maximumCampaignCostMicros: number,
) {
  if (observations.length < 2) throw new Error("R36B_COMPARISON_REQUIRES_MULTIPLE_CANDIDATES");
  const caseFingerprint = observations[0].caseFingerprint;
  const ceilingFingerprint = observations[0].ceilingFingerprint;
  if (observations.some((item) => item.caseFingerprint !== caseFingerprint)) throw new Error("R36B_UNEQUAL_CASE_INPUT");
  if (observations.some((item) => item.ceilingFingerprint !== ceilingFingerprint)) throw new Error("R36B_UNEQUAL_CEILINGS");
  if (new Set(observations.map((item) => item.providerKey)).size !== observations.length) throw new Error("R36B_DUPLICATE_CANDIDATE_OBSERVATION");
  const invalid = observations.find((item) => item.failureClass !== "NONE" || !item.contractValid || item.unsupportedClaimCount > 0);
  if (invalid) throw new Error(`R36B_INVALID_CANDIDATE_OBSERVATION:${invalid.providerKey}:${invalid.failureClass}`);
  const totalCostMicros = observations.reduce((sum, item) => sum + item.costMicros, 0);
  if (totalCostMicros > maximumCampaignCostMicros) throw new Error("R36B_CAMPAIGN_BUDGET_EXCEEDED");
  const unsigned = {
    schemaVersion: 1 as const,
    evidenceLabel: "SYNTHETIC" as const,
    verdict: "NO_PROVIDER_SELECTION" as const,
    caseFingerprint,
    ceilingFingerprint,
    observationFingerprints: observations.map((item) => item.observationFingerprint).sort(),
    totalCostMicros,
    validObservationCount: observations.length,
    providerExecutionCount: 0 as const,
    externalDispatchCount: 0 as const,
  };
  return comparisonReportSchema.parse({ ...unsigned, reportFingerprint: r36bFingerprint(unsigned) });
}
