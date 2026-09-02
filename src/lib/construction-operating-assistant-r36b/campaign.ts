import { z } from "zod";
import { r36bFingerprint, type ProviderCandidatePacket, type SandboxCase } from "./contracts";

const secretReferenceSchema = z.enum([
  "R37_PERPLEXITY_SEARCH_API_KEY",
  "R37_OPENROUTER_CONTROLLER_API_KEY",
  "R37_DIRECT_CONTROLLER_API_KEY",
]);

const r37CampaignManifestSchema = z.object({
  schemaVersion: z.literal(1),
  campaignKey: z.literal("endvera-r37-provider-sandbox-v1"),
  state: z.literal("PREPARED_NOT_AUTHORIZED"),
  evidenceLabel: z.literal("INFERRED"),
  packetFingerprints: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/u)).length(3),
  caseIds: z.array(z.string().regex(/^R36B-[A-Z0-9-]+$/u)).min(1).max(4),
  caseFingerprints: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/u)).min(1).max(4),
  secretReferenceNames: z.array(secretReferenceSchema).length(3),
  maximumCallCount: z.literal(12),
  maximumTotalSpendMicros: z.literal(5_000_000),
  stopConditions: z.tuple([
    z.literal("ANY_SECRET_VALUE_IN_ARTIFACT"),
    z.literal("ANY_NON_SYNTHETIC_INPUT"),
    z.literal("ANY_PRIVACY_INVARIANT_FAILURE"),
    z.literal("ANY_UNSUPPORTED_CLAIM"),
    z.literal("BUDGET_OR_CALL_CEILING_REACHED"),
  ]),
  providerExecutionAuthorized: z.literal(false),
  externalDispatchPerformed: z.literal(false),
  manifestFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
}).strict();

function assertReferenceOnly(value: string): void {
  if (/^(?:sk-|pplx-|Bearer\s)|[A-Za-z0-9+/]{32,}={0,2}$/u.test(value)) throw new Error("R36B_SECRET_VALUE_REFUSED");
  secretReferenceSchema.parse(value);
}

export function createR37CampaignManifest(input: Readonly<{
  packets: readonly ProviderCandidatePacket[];
  cases: readonly SandboxCase[];
  secretReferenceNames?: readonly string[];
}>) {
  if (input.packets.length !== 3 || new Set(input.packets.map((item) => item.providerKey)).size !== 3) {
    throw new Error("R36B_EXACT_THREE_CANDIDATES_REQUIRED");
  }
  if (input.packets.some((item) => !item.candidateOnly || item.providerExecutionAuthorized || item.externalDispatchPerformed)) {
    throw new Error("R36B_CANDIDATE_BOUNDARY_VIOLATION");
  }
  if (input.cases.some((item) => !item.syntheticOnly)) throw new Error("R36B_SYNTHETIC_CASES_ONLY");
  const secretReferenceNames = [...(input.secretReferenceNames ?? [
    "R37_PERPLEXITY_SEARCH_API_KEY",
    "R37_OPENROUTER_CONTROLLER_API_KEY",
    "R37_DIRECT_CONTROLLER_API_KEY",
  ])];
  secretReferenceNames.forEach(assertReferenceOnly);
  const unsigned = {
    schemaVersion: 1 as const,
    campaignKey: "endvera-r37-provider-sandbox-v1" as const,
    state: "PREPARED_NOT_AUTHORIZED" as const,
    evidenceLabel: "INFERRED" as const,
    packetFingerprints: input.packets.map((item) => item.packetFingerprint).sort(),
    caseIds: input.cases.map((item) => item.caseId).sort(),
    caseFingerprints: input.cases.map((item) => item.caseFingerprint).sort(),
    secretReferenceNames,
    maximumCallCount: 12 as const,
    maximumTotalSpendMicros: 5_000_000 as const,
    stopConditions: [
      "ANY_SECRET_VALUE_IN_ARTIFACT",
      "ANY_NON_SYNTHETIC_INPUT",
      "ANY_PRIVACY_INVARIANT_FAILURE",
      "ANY_UNSUPPORTED_CLAIM",
      "BUDGET_OR_CALL_CEILING_REACHED",
    ] as const,
    providerExecutionAuthorized: false as const,
    externalDispatchPerformed: false as const,
  };
  return r37CampaignManifestSchema.parse({ ...unsigned, manifestFingerprint: r36bFingerprint(unsigned) });
}
