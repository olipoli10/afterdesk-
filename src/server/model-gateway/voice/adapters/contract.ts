import "server-only";
import { createHash } from "node:crypto";
import type { GatewayProviderErrorClass } from "../../types";
import type { VoiceSegmentProjection } from "../projection";

export type VoiceAdapterEnvelope = Readonly<{
  operationId: string;
  attemptId: string;
  tenantId: string;
  sessionId: string;
  segmentId: string;
  adapterKey: "voice-synthetic-direct" | "openrouter-stt-candidate";
  billingProvider: string;
  intermediary: string | null;
  endpointKey: string;
  modelKey: string;
  projection: VoiceSegmentProjection;
  outputContractHash: `sha256:${string}`;
  requestEvidenceRef: `sha256:${string}`;
  abortSignal: AbortSignal;
}>;

export type VoiceAdapterUsage = Readonly<{
  audioSeconds: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  measuredCostMicros: bigint | null;
}>;

export type VoiceAdapterResult = Readonly<{
  dispatchKnowledge: "not_dispatched" | "response_received" | "dispatched_unknown";
  providerRequestRef: string | null;
  transcriptText: string | null;
  usage: VoiceAdapterUsage | null;
  errorClass: GatewayProviderErrorClass | null;
  httpStatus: number | null;
  responseEvidenceRef: `sha256:${string}` | null;
}>;

export interface VoiceModelGatewayAdapter {
  readonly key: VoiceAdapterEnvelope["adapterKey"];
  dispatch(envelope: VoiceAdapterEnvelope): Promise<VoiceAdapterResult>;
}

export function validateVoiceAdapterEnvelope(envelope: VoiceAdapterEnvelope): boolean {
  const projection = envelope.projection;
  const fingerprint = `sha256:${createHash("sha256").update(projection.audioBytes).digest("hex")}`;
  return (
    envelope.operationId.length > 0 &&
    envelope.attemptId.length > 0 &&
    envelope.tenantId.length > 0 &&
    envelope.sessionId === projection.sessionId &&
    envelope.segmentId === projection.segmentId &&
    projection.operationType === "intake_voice_transcription" &&
    projection.byteCount === projection.audioBytes.byteLength &&
    projection.audioFingerprint === fingerprint &&
    /^sha256:[a-f0-9]{64}$/.test(envelope.outputContractHash) &&
    /^sha256:[a-f0-9]{64}$/.test(envelope.requestEvidenceRef)
  );
}

export function isBoundedVoiceUsage(value: VoiceAdapterUsage): boolean {
  const optionalNonNegative = (item: number | null) =>
    item === null || (Number.isFinite(item) && item >= 0);
  const optionalInteger = (item: number | null) =>
    item === null || (Number.isSafeInteger(item) && item >= 0);
  return optionalNonNegative(value.audioSeconds) && optionalInteger(value.inputTokens) &&
    optionalInteger(value.outputTokens) &&
    (value.measuredCostMicros === null || value.measuredCostMicros >= 0n);
}
