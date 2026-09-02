import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export function percentileNearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error("RELIABILITY_GATE_LATENCIES_REQUIRED");
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) throw new Error("RELIABILITY_GATE_PERCENTILE_INVALID");
  const sorted = [...values].map((value) => Math.max(0, Math.round(value))).sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1]!;
}

export function evaluateReliabilityGate(input: {
  operationCount: number;
  concurrency: number;
  canonicalEffectCount: number;
  duplicateCount: number;
  durationMs: number;
  latenciesMs: readonly number[];
  thresholdMs: number;
}) {
  if (!Number.isInteger(input.operationCount) || input.operationCount < 1 || input.operationCount > 10_000) throw new Error("RELIABILITY_GATE_OPERATION_COUNT_INVALID");
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 200) throw new Error("RELIABILITY_GATE_CONCURRENCY_INVALID");
  if (input.latenciesMs.length !== input.operationCount) throw new Error("RELIABILITY_GATE_DENOMINATOR_MISMATCH");
  const p50LatencyMs = percentileNearestRank(input.latenciesMs, 50);
  const p95LatencyMs = percentileNearestRank(input.latenciesMs, 95);
  const status = input.canonicalEffectCount === input.operationCount && p95LatencyMs <= input.thresholdMs ? "PASSED" as const : "FAILED" as const;
  const measured = { ...input, latenciesMs: undefined, p50LatencyMs, p95LatencyMs, status };
  return { ...measured, resultFingerprint: sha256Canonical(measured) };
}
