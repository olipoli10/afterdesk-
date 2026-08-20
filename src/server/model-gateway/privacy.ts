import "server-only";
import { CLASSIFICATION_JSON_SCHEMA } from "@/lib/ai-work-engine/schemas";
import { canonicalFingerprint, protectedContentRef } from "./evidence";
import {
  isGatewayDataClass,
  isGatewayPrivacyRequirement,
  type GatewayDataClass,
  type ClassificationGatewayOperationRequest,
  type GatewayPrivacyRequirement,
  type VoiceGatewayOperationRequest,
} from "./types";
import type { VoiceSegmentProjection } from "./voice/projection";

export type ClassificationSourceInput = Readonly<{
  title: string;
  description: string;
  quantity: string | null;
  attachmentLines: readonly string[];
  categories: readonly Readonly<{
    slug: string;
    name: string;
    disputeCriteria: string | null;
  }>[];
}>;

export type ClassificationProjection = Readonly<{
  title: string;
  description: string;
  quantity: string | null;
  attachmentLines: readonly string[];
  categories: readonly Readonly<{
    slug: string;
    name: string;
    disputeCriteria: string | null;
  }>[];
}>;

const INPUT_KEYS = ["attachmentLines", "categories", "description", "quantity", "title"];

function boundedString(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`INVALID_CLASSIFICATION_INPUT:${name}`);
  }
  return value;
}

export function minimumClassificationProjection(input: ClassificationSourceInput): ClassificationProjection {
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    throw new Error("CLASSIFICATION_INPUT_CONTAINS_UNAUTHORIZED_FIELDS");
  }
  if (input.quantity !== null && (typeof input.quantity !== "string" || input.quantity.length > 120)) {
    throw new Error("INVALID_CLASSIFICATION_INPUT:quantity");
  }
  if (!Array.isArray(input.attachmentLines) || input.attachmentLines.length > 50) {
    throw new Error("INVALID_CLASSIFICATION_INPUT:attachmentLines");
  }
  if (!Array.isArray(input.categories) || input.categories.length > 100) {
    throw new Error("INVALID_CLASSIFICATION_INPUT:categories");
  }
  const projection = {
    title: boundedString(input.title, "title", 500),
    description: boundedString(input.description, "description", 20_000),
    quantity: input.quantity,
    attachmentLines: Object.freeze(
      input.attachmentLines.map((line) => boundedString(line, "attachmentLine", 1_000))
    ),
    categories: Object.freeze(
      input.categories.map((category) =>
        Object.freeze({
          slug: boundedString(category.slug, "category.slug", 200),
          name: boundedString(category.name, "category.name", 500),
          disputeCriteria:
            category.disputeCriteria === null
              ? null
              : boundedString(category.disputeCriteria, "category.disputeCriteria", 2_000),
        })
      )
    ),
  };
  return Object.freeze(projection);
}

export function buildClassificationGatewayRequest(input: {
  logicalOperationKey: string;
  tenantId: string;
  taskId: string;
  policyKey: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  maxTotalCostMicros: bigint;
  source: ClassificationSourceInput;
  createdAt?: Date;
}): { request: ClassificationGatewayOperationRequest; projection: ClassificationProjection } {
  if (input.maxTotalCostMicros < 0n) throw new Error("INVALID_GATEWAY_COST_BOUND");
  if (!isGatewayDataClass(input.dataClass) || !isGatewayPrivacyRequirement(input.privacyRequirement)) {
    throw new Error("INVALID_GATEWAY_DATA_BOUNDARY");
  }
  const projection = minimumClassificationProjection(input.source);
  const requestFingerprint = canonicalFingerprint(projection);
  const outputContractHash = canonicalFingerprint(CLASSIFICATION_JSON_SCHEMA);
  const request: ClassificationGatewayOperationRequest = Object.freeze({
    logicalOperationKey: input.logicalOperationKey,
    tenantId: input.tenantId,
    taskId: input.taskId,
    operationType: "classification",
    subject: Object.freeze({ kind: "task" as const, taskId: input.taskId }),
    requestFingerprint,
    outputContractHash,
    dataClass: input.dataClass,
    privacyRequirement: input.privacyRequirement,
    policyKey: input.policyKey,
    maxTotalCostMicros: input.maxTotalCostMicros,
    contentRef: protectedContentRef({
      kind: "classification_input",
      id: input.taskId,
      fingerprint: requestFingerprint,
    }),
    createdAt: input.createdAt ?? new Date(),
  });
  return Object.freeze({ request, projection });
}

const VOICE_TRANSCRIPT_OUTPUT_CONTRACT = Object.freeze({
  contract: "voice-transcript-v1",
  text: { type: "string", minLength: 1, maxLength: 20_000 },
  usage: {
    audioSeconds: "non_negative_number_or_null",
    inputTokens: "non_negative_integer_or_null",
    outputTokens: "non_negative_integer_or_null",
    measuredCostMicros: "non_negative_integer_or_null",
  },
});

export function buildVoiceGatewayRequest(input: {
  logicalOperationKey: string;
  tenantId: string;
  policyKey: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  maxTotalCostMicros: bigint;
  projection: VoiceSegmentProjection;
  createdAt?: Date;
}): VoiceGatewayOperationRequest {
  if (input.maxTotalCostMicros <= 0n) throw new Error("INVALID_GATEWAY_COST_BOUND");
  if (!isGatewayDataClass(input.dataClass) || !isGatewayPrivacyRequirement(input.privacyRequirement)) {
    throw new Error("INVALID_GATEWAY_DATA_BOUNDARY");
  }
  const minimumProjection = Object.freeze({
    operationType: input.projection.operationType,
    sessionId: input.projection.sessionId,
    segmentId: input.projection.segmentId,
    ordinal: input.projection.ordinal,
    languageHint: input.projection.languageHint,
    mediaFormat: input.projection.mediaFormat,
    mimeType: input.projection.mimeType,
    durationMs: input.projection.durationMs,
    byteCount: input.projection.byteCount,
    audioFingerprint: input.projection.audioFingerprint,
  });
  const requestFingerprint = canonicalFingerprint(minimumProjection);
  return Object.freeze({
    logicalOperationKey: input.logicalOperationKey,
    tenantId: input.tenantId,
    operationType: "intake_voice_transcription" as const,
    subject: Object.freeze({
      kind: "voice_intake_segment" as const,
      sessionId: input.projection.sessionId,
      segmentId: input.projection.segmentId,
    }),
    requestFingerprint,
    outputContractHash: canonicalFingerprint(VOICE_TRANSCRIPT_OUTPUT_CONTRACT),
    dataClass: input.dataClass,
    privacyRequirement: input.privacyRequirement,
    policyKey: input.policyKey,
    maxTotalCostMicros: input.maxTotalCostMicros,
    contentRef: protectedContentRef({
      kind: "voice_intake_input",
      id: input.projection.segmentId,
      fingerprint: input.projection.audioFingerprint,
    }),
    createdAt: input.createdAt ?? new Date(),
  });
}
