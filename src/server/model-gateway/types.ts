import "server-only";

export const GATEWAY_OPERATION_TYPES = [
  "classification",
  "intake_voice_transcription",
] as const;
export type GatewayOperationType = (typeof GATEWAY_OPERATION_TYPES)[number];

export const GATEWAY_DATA_CLASSES = [
  "public",
  "business_confidential",
  "personal_data",
  "restricted_sensitive",
] as const;
export type GatewayDataClass = (typeof GATEWAY_DATA_CLASSES)[number];

export const GATEWAY_PRIVACY_REQUIREMENTS = [
  "standard",
  "no_training",
  "zero_retention",
  "regional_zero_retention",
] as const;
export type GatewayPrivacyRequirement = (typeof GATEWAY_PRIVACY_REQUIREMENTS)[number];

export const GATEWAY_PROVIDER_ERROR_CLASSES = [
  "provider_refusal",
  "rate_limit",
  "authentication",
  "malformed_request",
  "timeout",
  "provider_server_failure",
  "unknown_failure",
  "unknown_dispatched_outcome",
] as const;
export type GatewayProviderErrorClass = (typeof GATEWAY_PROVIDER_ERROR_CLASSES)[number];

export const GATEWAY_REFUSAL_CLASSES = [
  "rollout_disabled",
  "unsupported_operation",
  "unpublished_policy",
  "ineligible_route",
  "missing_privacy_evidence",
  "expired_privacy_evidence",
  "open_breaker",
  "insufficient_spend_headroom",
  "invalid_request",
] as const;
export type GatewayRefusalClass = (typeof GATEWAY_REFUSAL_CLASSES)[number];

export const GATEWAY_TERMINAL_FAILURE_CLASSES = [
  "malformed_provider_response",
  "provider_refusal",
  "rate_limit",
  "authentication",
  "malformed_request",
  "timeout",
  "provider_server_failure",
  "unknown_failure",
  "attempts_exhausted",
] as const;
export type GatewayTerminalFailureClass = (typeof GATEWAY_TERMINAL_FAILURE_CLASSES)[number];

export type GatewayUncertainClass = "unknown_dispatched_outcome";
export type CertifiedAdapterKey =
  | "synthetic"
  | "anthropic-direct"
  | "gateway-candidate"
  | "voice-synthetic-direct"
  | "openrouter-stt-candidate";
export type BillingProviderKey = string;
export type GatewayIntermediaryKey = string;

export type ProtectedContentRef = {
  kind:
    | "task"
    | "classification_input"
    | "classification_output"
    | "voice_intake_input"
    | "voice_intake_output";
  id: string;
  fingerprint: `sha256:${string}`;
};

export type GatewayOperationSubject =
  | Readonly<{ kind: "task"; taskId: string }>
  | Readonly<{
      kind: "voice_intake_segment";
      sessionId: string;
      segmentId: string;
    }>;

type GatewayOperationRequestBase = {
  logicalOperationKey: string;
  tenantId: string;
  requestFingerprint: string;
  outputContractHash: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  policyKey: string;
  maxTotalCostMicros: bigint;
  contentRef: ProtectedContentRef;
  createdAt: Date;
};

export type ClassificationGatewayOperationRequest = GatewayOperationRequestBase & Readonly<{
  operationType: "classification";
  subject: Readonly<{ kind: "task"; taskId: string }>;
  /** Compatibility field for existing classification callers. */
  taskId: string;
}>;

export type VoiceGatewayOperationRequest = GatewayOperationRequestBase & Readonly<{
  operationType: "intake_voice_transcription";
  subject: Readonly<{
    kind: "voice_intake_segment";
    sessionId: string;
    segmentId: string;
  }>;
}>;

export type GatewayOperationRequest =
  | ClassificationGatewayOperationRequest
  | VoiceGatewayOperationRequest;

export type CertifiedClassificationInput = Readonly<Record<string, unknown>>;

export type AdapterAttemptEnvelope = {
  operationId: string;
  attemptId: string;
  tenantId: string;
  adapterKey: CertifiedAdapterKey;
  billingProvider: BillingProviderKey;
  intermediary: GatewayIntermediaryKey | null;
  endpointKey: string;
  modelKey: string;
  boundedInput: CertifiedClassificationInput;
  outputContractHash: string;
  requestEvidenceRef: string;
  abortSignal: AbortSignal;
};

export type AdapterAttemptResult = {
  dispatchKnowledge: "not_dispatched" | "response_received" | "dispatched_unknown";
  providerRequestRef: string | null;
  response: unknown | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    measuredCostMicros: bigint;
  } | null;
  errorClass: GatewayProviderErrorClass | null;
  httpStatus: number | null;
  responseEvidenceRef: string | null;
};

export type GatewayOperationResult<T> =
  | { status: "succeeded"; value: T; finalAttemptId: string }
  | { status: "failed"; failureClass: GatewayTerminalFailureClass }
  | { status: "uncertain"; reasonClass: GatewayUncertainClass }
  | { status: "refused"; reasonClass: GatewayRefusalClass };

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export const isGatewayOperationType = (value: unknown): value is GatewayOperationType =>
  includes(GATEWAY_OPERATION_TYPES, value);
export const isGatewayDataClass = (value: unknown): value is GatewayDataClass =>
  includes(GATEWAY_DATA_CLASSES, value);
export const isGatewayPrivacyRequirement = (
  value: unknown
): value is GatewayPrivacyRequirement => includes(GATEWAY_PRIVACY_REQUIREMENTS, value);
export const isGatewayProviderErrorClass = (
  value: unknown
): value is GatewayProviderErrorClass => includes(GATEWAY_PROVIDER_ERROR_CLASSES, value);
