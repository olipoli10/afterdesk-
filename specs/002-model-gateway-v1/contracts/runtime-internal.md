# Runtime Internal Contract

This is a server-internal contract. It is not a public HTTP API.

## GatewayOperationRequest

```ts
type GatewayOperationRequest = {
  logicalOperationKey: string;
  tenantId: string;
  taskId: string;
  operationType: "classification";
  requestFingerprint: string;
  outputContractHash: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  policyKey: string;
  maxTotalCostMicros: bigint;
  contentRef: ProtectedContentRef;
  createdAt: Date;
};
```

The request is built only from authorized facts. `contentRef` identifies protected content without copying raw content into ordinary gateway audit records. Once admitted, decision-bearing fields are immutable.

## AttemptDecision

```ts
type AttemptDecision =
  | {
      disposition: "route_authorized";
      attempt: number;
      policyVersionId: string;
      policyHash: string;
      routeProfileId: string;
      routeHash: string;
      privacyEvidenceHash: string;
      breakerGeneration: bigint;
      remainingCostMicros: bigint;
      decisionFingerprint: string;
    }
  | {
      disposition: "refused";
      attempt: number;
      policyVersionId: string;
      policyHash: string;
      reasonClass: GatewayRefusalClass;
      decisionFingerprint: string;
    };
```

Every decision is persisted before dispatch. A fallback is never an adapter continuation: it creates a new ordinal, decision, route authorization and reservation.

## AdapterAttemptEnvelope

```ts
type AdapterAttemptEnvelope = {
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
```

The envelope contains exactly one certified route. It contains no alternative route list, fallback rule, mutable budget or free-form provider configuration.

## AdapterAttemptResult

```ts
type AdapterAttemptResult = {
  dispatchKnowledge:
    | "not_dispatched"
    | "response_received"
    | "dispatched_unknown";
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
```

Missing usage is `null`, never invented as zero. A timeout or local abort after dispatch is `dispatched_unknown` unless provider evidence proves a stronger state.

## Logical result

```ts
type GatewayOperationResult =
  | { status: "succeeded"; value: CertifiedClassification; finalAttemptId: string }
  | { status: "failed"; failureClass: GatewayTerminalFailureClass }
  | { status: "uncertain"; reasonClass: GatewayUncertainClass }
  | { status: "refused"; reasonClass: GatewayRefusalClass };
```

Provider HTTP success is insufficient. A successful result requires the certified output contract to pass and the fenced logical operation close to commit.

## Refusal and failure classes

Classes are closed code enums. At minimum they distinguish unsupported operation, missing/expired privacy evidence, unpublished policy, ineligible route, open breaker, insufficient spend headroom, malformed provider response, provider refusal, rate limit, authentication, timeout, provider server failure and unknown dispatched outcome. Free-form provider text is never a policy input.
