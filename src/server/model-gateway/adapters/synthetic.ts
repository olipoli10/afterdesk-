import "server-only";
import { canonicalFingerprint } from "../evidence";
import type { AdapterAttemptEnvelope, AdapterAttemptResult } from "../types";
import type { ModelGatewayAdapter } from "./contract";

export type SyntheticTransportResult = {
  response: unknown;
  inputTokens: number;
  outputTokens: number;
  measuredCostMicros?: bigint;
  providerRequestRef?: string;
  httpStatus?: number;
};

export function createSyntheticAdapter(input: {
  endpointKey: string;
  modelKey: string;
  transport: (envelope: AdapterAttemptEnvelope) => Promise<SyntheticTransportResult>;
}): ModelGatewayAdapter {
  return Object.freeze({
    key: "synthetic",
    async dispatch(envelope: AdapterAttemptEnvelope): Promise<AdapterAttemptResult> {
      if (
        envelope.adapterKey !== "synthetic" ||
        envelope.billingProvider !== "synthetic" ||
        envelope.intermediary !== null ||
        envelope.endpointKey !== input.endpointKey ||
        envelope.modelKey !== input.modelKey
      ) {
        return {
          dispatchKnowledge: "not_dispatched",
          providerRequestRef: null,
          response: null,
          usage: null,
          errorClass: "malformed_request",
          httpStatus: null,
          responseEvidenceRef: null,
        };
      }
      try {
        const result = await input.transport(envelope);
        return {
          dispatchKnowledge: "response_received",
          providerRequestRef: result.providerRequestRef ?? `synthetic:${envelope.attemptId}`,
          response: result.response,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            measuredCostMicros: result.measuredCostMicros ?? 0n,
          },
          errorClass: null,
          httpStatus: result.httpStatus ?? 200,
          responseEvidenceRef: canonicalFingerprint({
            providerRequestRef: result.providerRequestRef ?? `synthetic:${envelope.attemptId}`,
            httpStatus: result.httpStatus ?? 200,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          }),
        };
      } catch {
        return {
          dispatchKnowledge: "dispatched_unknown",
          providerRequestRef: `synthetic:${envelope.attemptId}`,
          response: null,
          usage: null,
          errorClass: "unknown_dispatched_outcome",
          httpStatus: null,
          responseEvidenceRef: null,
        };
      }
    },
  });
}
