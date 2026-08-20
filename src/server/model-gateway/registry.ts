import "server-only";
import type { CertifiedAdapterKey, GatewayOperationType } from "./types";

const OPERATIONS = {
  classification: { key: "classification", outputContractKey: "classification-v1" },
  intake_voice_transcription: {
    key: "intake_voice_transcription",
    outputContractKey: "voice-transcript-v1",
  },
} as const satisfies Record<GatewayOperationType, { key: GatewayOperationType; outputContractKey: string }>;

const ADAPTERS = {
  synthetic: { key: "synthetic", external: false },
  "anthropic-direct": { key: "anthropic-direct", external: true },
  "gateway-candidate": { key: "gateway-candidate", external: true },
  "voice-synthetic-direct": { key: "voice-synthetic-direct", external: false },
  "openrouter-stt-candidate": { key: "openrouter-stt-candidate", external: true },
} as const satisfies Record<CertifiedAdapterKey, { key: CertifiedAdapterKey; external: boolean }>;

export const GATEWAY_POLICY_KEYS = [
  "classification-v1",
  "intake-voice-transcription-v1",
] as const;
export const GATEWAY_ROUTE_KEYS = [
  "classification-synthetic-v1",
  "classification-anthropic-direct-v1",
  "classification-gateway-candidate-v1",
  "intake-voice-synthetic-direct-v1",
  "intake-voice-openrouter-candidate-v1",
] as const;

export function requireOperationDefinition(key: string) {
  const value = OPERATIONS[key as keyof typeof OPERATIONS];
  if (!value) throw new Error(`UNKNOWN_GATEWAY_OPERATION:${key}`);
  return value;
}

export function requireAdapterDefinition(key: string) {
  const value = ADAPTERS[key as keyof typeof ADAPTERS];
  if (!value) throw new Error(`UNKNOWN_GATEWAY_ADAPTER:${key}`);
  return value;
}

export function requirePolicyKey(key: string): (typeof GATEWAY_POLICY_KEYS)[number] {
  if (!(GATEWAY_POLICY_KEYS as readonly string[]).includes(key)) {
    throw new Error(`UNKNOWN_GATEWAY_POLICY:${key}`);
  }
  return key as (typeof GATEWAY_POLICY_KEYS)[number];
}

export function requireRouteKey(key: string): (typeof GATEWAY_ROUTE_KEYS)[number] {
  if (!(GATEWAY_ROUTE_KEYS as readonly string[]).includes(key)) {
    throw new Error(`UNKNOWN_GATEWAY_ROUTE:${key}`);
  }
  return key as (typeof GATEWAY_ROUTE_KEYS)[number];
}
