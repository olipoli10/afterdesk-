import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { reliabilitySignalInputSchema, type ReliabilitySignalInput } from "./contracts";

const FIELD_FORBIDDEN_KEYS = new Set([
  "metrics", "traceId", "spanId", "checkpointFingerprint", "manifestFingerprint",
  "sourceFingerprint", "restoredFingerprint", "credentialRef", "storageKey",
  "providerReference", "amountMinor", "financial", "connector", "recoveries",
]);

export function reliabilitySignalFingerprint(input: ReliabilitySignalInput | unknown) {
  return sha256Canonical(reliabilitySignalInputSchema.parse(input));
}

export function deriveReliabilityHealth(input: {
  critical: number;
  error: number;
  warning: number;
  metricsAvailable: boolean;
}): "HEALTHY" | "ATTENTION" | "BLOCKED" | "UNKNOWN" {
  if (!input.metricsAvailable) return "UNKNOWN";
  if (input.critical > 0 || input.error > 0) return "BLOCKED";
  if (input.warning > 0) return "ATTENTION";
  return "HEALTHY";
}

export function rejectFieldReliabilityLeaks(value: unknown): void {
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) return current.forEach(visit);
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      if (FIELD_FORBIDDEN_KEYS.has(key)) throw new Error("FIELD_RELIABILITY_LEAK_REFUSED");
      visit(nested);
    }
  };
  visit(value);
}
