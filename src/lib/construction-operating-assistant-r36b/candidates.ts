import {
  providerCandidatePacketSchema,
  providerCandidatePacketUnsignedSchema,
  r36bFingerprint,
  sandboxCaseSchema,
  sandboxCaseUnsignedSchema,
  type ProviderCandidatePacket,
  type SandboxCase,
} from "./contracts";

function sealPacket(raw: unknown): ProviderCandidatePacket {
  const unsigned = providerCandidatePacketUnsignedSchema.parse(raw);
  return providerCandidatePacketSchema.parse({ ...unsigned, packetFingerprint: r36bFingerprint(unsigned) });
}

export function sealSandboxCase(raw: unknown): SandboxCase {
  const unsigned = sandboxCaseUnsignedSchema.parse(raw);
  return sandboxCaseSchema.parse({
    ...unsigned,
    caseFingerprint: r36bFingerprint(unsigned),
    ceilingFingerprint: r36bFingerprint(unsigned.ceilings),
  });
}

export const R36B_CANDIDATE_PACKETS = Object.freeze({
  PERPLEXITY_SEARCH: sealPacket({
    schemaVersion: 1,
    packetVersion: "r36b-v1",
    providerKey: "PERPLEXITY_SEARCH",
    capabilityKey: "PUBLIC_WEB_RESEARCH",
    endpointFamily: "PERPLEXITY_SEARCH_API",
    allowedDataClasses: ["public"],
    forbiddenDataClasses: ["business_confidential", "personal_data", "restricted_sensitive"],
    requiredPrivacyRules: ["PUBLIC_SOURCES_ONLY", "PROFESSIONAL_CONTEXT_ONLY"],
    perAttemptCostCeilingMicros: 500_000,
    outputContractKey: "normalized-public-source-evidence-v1",
    verificationContractKey: "source-supported-claims-v1",
    officialEvidence: [
      { url: "https://docs.perplexity.ai/api-reference/search-post", title: "Perplexity Search API", reviewedAt: "2026-09-02", expiresAt: "2026-10-02" },
      { url: "https://docs.perplexity.ai/docs/search/filters/people-search", title: "Perplexity People Search", reviewedAt: "2026-09-02", expiresAt: "2026-10-02" },
    ],
    evidenceLabel: "INFERRED",
    candidateOnly: true,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  }),
  OPENROUTER_CONTROLLER: sealPacket({
    schemaVersion: 1,
    packetVersion: "r36b-v1",
    providerKey: "OPENROUTER_CONTROLLER",
    capabilityKey: "CONTROLLER_REASONING",
    endpointFamily: "OPENROUTER_CHAT_COMPLETIONS",
    allowedDataClasses: ["public", "business_confidential"],
    forbiddenDataClasses: ["personal_data", "restricted_sensitive"],
    requiredPrivacyRules: ["NO_TRAINING", "ZERO_DATA_RETENTION", "DATA_COLLECTION_DENIED", "SUPPORTED_PARAMETERS_REQUIRED", "PROVIDER_FALLBACK_DISABLED"],
    perAttemptCostCeilingMicros: 1_000_000,
    outputContractKey: "assistant-controller-result-v1",
    verificationContractKey: "assistant-controller-verification-v1",
    officialEvidence: [
      { url: "https://openrouter.ai/docs/guides/routing/provider-selection", title: "OpenRouter Provider Routing", reviewedAt: "2026-09-02", expiresAt: "2026-10-02" },
      { url: "https://openrouter.ai/docs/guides/features/zdr", title: "OpenRouter Zero Data Retention", reviewedAt: "2026-09-02", expiresAt: "2026-10-02" },
    ],
    evidenceLabel: "INFERRED",
    candidateOnly: true,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  }),
  DIRECT_CONTROLLER_CONTROL: sealPacket({
    schemaVersion: 1,
    packetVersion: "r36b-v1",
    providerKey: "DIRECT_CONTROLLER_CONTROL",
    capabilityKey: "CONTROLLER_REASONING",
    endpointFamily: "DIRECT_CHAT_COMPLETIONS_CONTROL",
    allowedDataClasses: ["public", "business_confidential"],
    forbiddenDataClasses: ["personal_data", "restricted_sensitive"],
    requiredPrivacyRules: ["NO_TRAINING", "ZERO_DATA_RETENTION", "SUPPORTED_PARAMETERS_REQUIRED"],
    perAttemptCostCeilingMicros: 1_000_000,
    outputContractKey: "assistant-controller-result-v1",
    verificationContractKey: "assistant-controller-verification-v1",
    officialEvidence: [{ url: "https://openrouter.ai/docs/guides/routing/model-fallbacks", title: "Gateway fallback control comparison basis", reviewedAt: "2026-09-02", expiresAt: "2026-10-02" }],
    evidenceLabel: "INFERRED",
    candidateOnly: true,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  }),
} satisfies Record<string, ProviderCandidatePacket>);

export function requireCurrentCandidatePacket(providerKey: keyof typeof R36B_CANDIDATE_PACKETS, asOf = "2026-09-02"): ProviderCandidatePacket {
  const packet = R36B_CANDIDATE_PACKETS[providerKey];
  if (packet.officialEvidence.some((item) => item.expiresAt < asOf)) throw new Error(`R36B_EVIDENCE_EXPIRED:${providerKey}`);
  return packet;
}
