import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const COMMERCIAL_REGISTRY_VERSION = 1 as const;
export const COMMERCIAL_PLAN_KEYS = ["EARLY_ACCESS"] as const;
export const COMMERCIAL_FEATURE_KEYS = [
  "PERSISTENT_PROJECT_MEMORY",
  "SCHEDULE_AND_FOLLOW_UP",
  "EVIDENCE_AND_INVOICE_READINESS",
  "PREPARED_COMMUNICATIONS",
  "HUMAN_EXCEPTION_ROUTING",
  "ROLE_SAFE_COCKPIT",
] as const;
export const COMMERCIAL_USAGE_METRIC_KEYS = [
  "ACTIVE_PROJECTS",
  "ACTIVE_MEMBERS",
  "INGESTED_MESSAGES",
  "EVIDENCE_REFERENCES",
  "PREPARED_ACTIONS",
  "OPEN_FOLLOW_UPS",
  "HUMAN_ESCALATIONS",
] as const;

const earlyAccessWithoutHash = {
  planKey: "EARLY_ACCESS" as const,
  version: 1 as const,
  registryVersion: COMMERCIAL_REGISTRY_VERSION,
  nameKey: "plan.EARLY_ACCESS.name",
  descriptionKey: "plan.EARLY_ACCESS.description",
  includedFeatures: [...COMMERCIAL_FEATURE_KEYS],
  usageMetrics: [...COMMERCIAL_USAGE_METRIC_KEYS],
  priceState: "PRICE_NOT_SET" as const,
  monthlyPriceMinor: null,
  currency: "CAD" as const,
  billingProvider: "DISABLED_LOCAL" as const,
  status: "AVAILABLE_LOCAL" as const,
};

export const COMMERCIAL_PLAN_REGISTRY = [
  {
    ...earlyAccessWithoutHash,
    canonicalHash: sha256Canonical(earlyAccessWithoutHash),
  },
] as const;

export type CommercialPlanDefinition = (typeof COMMERCIAL_PLAN_REGISTRY)[number];

export function commercialPlan(planKey: string, version: number): CommercialPlanDefinition {
  const plan = COMMERCIAL_PLAN_REGISTRY.find(
    (candidate) => candidate.planKey === planKey && candidate.version === version,
  );
  if (!plan) throw new Error("COMMERCIAL_PLAN_UNKNOWN_OR_UNAVAILABLE");
  return plan;
}

export function assertCommercialRegistryHonest(): void {
  for (const plan of COMMERCIAL_PLAN_REGISTRY) {
    if (plan.priceState !== "PRICE_NOT_SET" || plan.monthlyPriceMinor !== null) {
      throw new Error("COMMERCIAL_PRICE_NOT_AUTHORIZED");
    }
    if (plan.billingProvider !== "DISABLED_LOCAL" || plan.status !== "AVAILABLE_LOCAL") {
      throw new Error("COMMERCIAL_PROVIDER_STATE_INVALID");
    }
    const { canonicalHash: _canonicalHash, ...canonical } = plan;
    if (plan.canonicalHash !== sha256Canonical(canonical)) {
      throw new Error("COMMERCIAL_PLAN_HASH_MISMATCH");
    }
  }
}
