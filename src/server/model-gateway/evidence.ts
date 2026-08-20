import "server-only";
import { createHash } from "node:crypto";
import {
  isGatewayProviderErrorClass,
  type GatewayProviderErrorClass,
  type ProtectedContentRef,
} from "./types";
import { classificationOutputSchema, type ClassificationOutput } from "@/lib/ai-work-engine/schemas";

type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

function canonicalValue(value: unknown): Canonical {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_CANONICAL_NUMBER");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("NON_CANONICAL_DATE");
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("NON_CANONICAL_OBJECT");
    }
    const out: Record<string, Canonical> = {};
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error(`NON_CANONICAL_VALUE:${key}`);
      out[key] = canonicalValue(child);
    }
    return out;
  }
  throw new Error("NON_CANONICAL_VALUE");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalFingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

const CONTENT_KEYS = /(raw|prompt|response|content|secret|credential|token|password)/i;

export function protectedContentRef(value: ProtectedContentRef): ProtectedContentRef {
  for (const key of Object.keys(value)) {
    if (CONTENT_KEYS.test(key)) throw new Error("PROTECTED_REFERENCE_CONTAINS_CONTENT");
  }
  if (!/^[A-Za-z0-9_.:-]{1,240}$/.test(value.id)) throw new Error("INVALID_PROTECTED_REFERENCE");
  if (!/^sha256:[a-f0-9]{64}$/.test(value.fingerprint)) {
    throw new Error("INVALID_PROTECTED_FINGERPRINT");
  }
  return Object.freeze({ ...value });
}

export function redactProviderFailure(errorClass: GatewayProviderErrorClass, httpStatus: number | null) {
  if (!isGatewayProviderErrorClass(errorClass)) throw new Error("UNKNOWN_PROVIDER_ERROR_CLASS");
  if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) {
    throw new Error("INVALID_PROVIDER_HTTP_STATUS");
  }
  return Object.freeze({ errorClass, httpStatus });
}

export type ClassificationValidation =
  | Readonly<{
      status: "valid";
      value: ClassificationOutput;
      responseEvidenceRef: `sha256:${string}`;
    }>
  | Readonly<{
      status: "invalid";
      failureClass: "malformed_provider_response";
      responseEvidenceRef: `sha256:${string}`;
    }>;

export function validateClassificationResponse(response: unknown): ClassificationValidation {
  const parsed = classificationOutputSchema.safeParse(response);
  if (!parsed.success) {
    return Object.freeze({
      status: "invalid" as const,
      failureClass: "malformed_provider_response" as const,
      responseEvidenceRef: canonicalFingerprint({
        contract: "classification-v1",
        valid: false,
        issueCodes: parsed.error.issues.map((issue) => issue.code).sort(),
      }),
    });
  }
  return Object.freeze({
    status: "valid" as const,
    value: parsed.data,
    responseEvidenceRef: canonicalFingerprint({
      contract: "classification-v1",
      valid: true,
      outputFingerprint: canonicalFingerprint(parsed.data),
    }),
  });
}

/** Content-free, operator-readable lineage for one logical gateway operation. */
export type GatewayAttemptLineageInput = Readonly<{
  attempt: number;
  routeKey: string | null;
  routeVersion: number | null;
  decision: "route_authorized" | "refused";
  reasonClass: string;
  holdStatus: "held" | "settled" | "released";
  heldMicros: bigint;
  settledMicros: bigint | null;
  dispatchState: "not_dispatched" | "settled" | "unaccounted";
  attemptStatus: string;
  errorClass: GatewayProviderErrorClass | null;
  providerRequestRef: string | null;
}>;

export type GatewayAttemptLineage = Readonly<{
  attempt: number;
  route: string | null;
  decision: string;
  reasonClass: string;
  spend: "held" | "settled" | "released";
  exposureMicros: bigint;
  dispatchState: string;
  attemptStatus: string;
  errorClass: GatewayProviderErrorClass | null;
  providerRequestRef: string | null;
}>;

export function projectGatewayAttemptLineage(
  attempts: readonly GatewayAttemptLineageInput[]
): readonly GatewayAttemptLineage[] {
  return Object.freeze(attempts.slice().sort((left, right) => left.attempt - right.attempt).map((attempt) =>
    Object.freeze({
      attempt: attempt.attempt,
      route: attempt.routeKey === null || attempt.routeVersion === null ? null : `${attempt.routeKey}@${attempt.routeVersion}`,
      decision: attempt.decision,
      reasonClass: attempt.reasonClass,
      spend: attempt.holdStatus,
      exposureMicros: attempt.holdStatus === "settled" ? (attempt.settledMicros ?? 0n) : attempt.holdStatus === "held" ? attempt.heldMicros : 0n,
      dispatchState: attempt.dispatchState,
      attemptStatus: attempt.attemptStatus,
      errorClass: attempt.errorClass,
      providerRequestRef: attempt.providerRequestRef,
    })
  ));
}
