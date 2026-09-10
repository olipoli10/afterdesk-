import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

// Pure configuration inspection, NOT spend authorization. The authenticated
// wrapper must reserve this amount atomically in the current pilot's ledger.
// An account balance, model usage field or historic R37 grant is not a budget.
export const PERSONAL_MODEL_AUTHORITY = "ENDVERA-PERSONAL-20260910-100CAD";
const pilotStart = Date.parse("2026-09-10T01:18:26Z");
const pilotEnd = Date.parse("2026-10-10T01:18:26Z");
const integer = z.number().int().safe().positive();
const rateSchema = z.object({
  authorityId: z.literal(PERSONAL_MODEL_AUTHORITY),
  model: z.string().min(1).max(160), providerEndpoint: z.string().min(1).max(160),
  reviewedAt: z.string().datetime({ offset: true }),
  // Conservative token ceiling for this exact model/endpoint, including hidden
  // reasoning/output tokens. A provider-specific tokenizer estimate is NOT used.
  totalContextTokens: integer.max(10_000_000),
  maxOutputTokens: integer.max(1_000_000),
  inputUsdMicrosPerMillionTokens: integer,
  outputUsdMicrosPerMillionTokens: integer,
  // Charges other than token rates must be included here from reviewed terms.
  additionalUsdMicrosPerCall: z.number().int().safe().nonnegative(),
  cadMicrosPerUsd: integer.min(1_000_000).max(10_000_000),
  // Server-reviewed fee/FX headroom; never infer actual card charges from this.
  headroomBasisPoints: integer.min(1_000).max(10_000),
  ceilingCadMicros: integer.max(20_000_000),
  perCallCeilingCadMicros: integer.max(20_000_000),
}).strict();
export type PersonalModelRateConfiguration = z.infer<typeof rateSchema>;
const ceilDivide = (n: bigint, d: bigint) => (n + d - 1n) / d;

export function inspectPersonalModelBudget(configuration: unknown, now: Date) {
  const rate = rateSchema.parse(configuration);
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp) || timestamp < pilotStart || timestamp >= pilotEnd) {
    throw new Error("PERSONAL_MODEL_AUTHORITY_INACTIVE");
  }
  const reviewedAt = Date.parse(rate.reviewedAt);
  if (reviewedAt > timestamp || timestamp - reviewedAt > 86_400_000) throw new Error("PERSONAL_MODEL_RATE_REVIEW_STALE");
  if (rate.maxOutputTokens > rate.totalContextTokens || rate.perCallCeilingCadMicros > rate.ceilingCadMicros) {
    throw new Error("PERSONAL_MODEL_BUDGET_CONFIGURATION_INVALID");
  }
  // Reserve full input context PLUS output ceiling, deliberately overestimating
  // shared-context models. No credit release based on untrusted model usage.
  const usdMicros = ceilDivide(BigInt(rate.totalContextTokens) * BigInt(rate.inputUsdMicrosPerMillionTokens), 1_000_000n)
    + ceilDivide(BigInt(rate.maxOutputTokens) * BigInt(rate.outputUsdMicrosPerMillionTokens), 1_000_000n)
    + BigInt(rate.additionalUsdMicrosPerCall);
  const cadMicros = ceilDivide(usdMicros * BigInt(rate.cadMicrosPerUsd), 1_000_000n);
  const reservationCadMicros = ceilDivide(cadMicros * BigInt(10_000 + rate.headroomBasisPoints), 10_000n);
  if (reservationCadMicros > BigInt(rate.perCallCeilingCadMicros)) throw new Error("PERSONAL_MODEL_PER_CALL_CEILING_EXCEEDED");
  return Object.freeze({
    status: "BUDGET_POLICY_INSPECTED_NOT_RESERVED" as const,
    executionAuthorized: false as const,
    budgetId: `${PERSONAL_MODEL_AUTHORITY}:openrouter`,
    model: rate.model, providerEndpoint: rate.providerEndpoint,
    maxOutputTokens: rate.maxOutputTokens, totalContextTokens: rate.totalContextTokens,
    // Separate currencies: existing provider-account holds use USD micros;
    // personal pilot holds use CAD micros. Neither is a settled invoice.
    reservationUsdMicros: usdMicros,
    reviewedRateFingerprint: `sha256:${createHash("sha256").update(JSON.stringify(rate)).digest("hex")}`,
    ceilingCadMicros: BigInt(rate.ceilingCadMicros), reservationCadMicros,
    expiresAt: new Date(pilotEnd).toISOString(), reviewedAt: rate.reviewedAt,
    automaticRetry: false as const, retainReservationOnUncertainOutcome: true as const,
    // Infrastructure and Twilio prepaid funding are reconciled separately. This
    // policy does not prove the remaining total100CAD or actual invoice cost.
    aggregatePilotBillingVerified: false as const,
  });
}
