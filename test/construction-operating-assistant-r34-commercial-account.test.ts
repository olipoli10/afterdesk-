import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  commercialAccountSnapshotSchema,
  commercialCommandSchema,
  commercialUsageProjectionSchema,
  ownerCommercialProjectionSchema,
} from "@/lib/construction-operating-assistant-r34/contracts";
import {
  COMMERCIAL_FEATURE_KEYS,
  COMMERCIAL_PLAN_REGISTRY,
  COMMERCIAL_USAGE_METRIC_KEYS,
  assertCommercialRegistryHonest,
  commercialPlan,
} from "@/lib/construction-operating-assistant-r34/registry";
import { publicConstructionOffer } from "@/lib/construction-operating-assistant-r34/public-offer";

const snapshot = {
  accountId: "account-a", workspaceId: "workspace-a", planKey: "EARLY_ACCESS", planVersion: 1,
  planHash: COMMERCIAL_PLAN_REGISTRY[0].canonicalHash, state: "PREPARED",
  periodStartsAt: "2026-09-01T00:00:00.000Z", periodEndsAt: "2026-10-01T00:00:00.000Z",
  accountVersion: 1, includedFeatures: [...COMMERCIAL_FEATURE_KEYS], usageMetricKeys: [...COMMERCIAL_USAGE_METRIC_KEYS],
  priceState: "PRICE_NOT_SET", monthlyPriceMinor: null, currency: "CAD", billingProvider: "DISABLED_LOCAL",
} as const;

describe("R34 commercial account and public offer", () => {
  it("keeps one closed versioned plan with no invented price or provider", () => {
    expect(() => assertCommercialRegistryHonest()).not.toThrow();
    expect(COMMERCIAL_PLAN_REGISTRY).toHaveLength(1);
    expect(commercialPlan("EARLY_ACCESS", 1)).toMatchObject({ priceState: "PRICE_NOT_SET", monthlyPriceMinor: null, currency: "CAD", billingProvider: "DISABLED_LOCAL" });
    expect(() => commercialPlan("PAID", 1)).toThrow("COMMERCIAL_PLAN_UNKNOWN_OR_UNAVAILABLE");
  });

  it("accepts only closed exact admin commands", () => {
    expect(commercialCommandSchema.parse({ commandId: crypto.randomUUID(), workspaceId: "workspace-a", kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 })).toBeTruthy();
    expect(() => commercialCommandSchema.parse({ commandId: crypto.randomUUID(), workspaceId: "workspace-a", kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "PAID", planVersion: 1 })).toThrow();
    expect(() => commercialCommandSchema.parse({ commandId: crypto.randomUUID(), workspaceId: "workspace-a", kind: "CHANGE_STATE", expectedAccountVersion: 1 })).toThrow();
    expect(() => commercialCommandSchema.parse({ commandId: crypto.randomUUID(), workspaceId: "workspace-a", kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1, actorId: "caller-controlled" })).toThrow();
  });

  it("refuses paid or enabled-provider account state", () => {
    expect(commercialAccountSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(() => commercialAccountSnapshotSchema.parse({ ...snapshot, monthlyPriceMinor: 9900 })).toThrow();
    expect(() => commercialAccountSnapshotSchema.parse({ ...snapshot, billingProvider: "STRIPE" })).toThrow();
    expect(() => commercialAccountSnapshotSchema.parse({ ...snapshot, currency: "USD" })).toThrow();
  });

  it("requires seven nonnegative informational usage readings", () => {
    const readings = COMMERCIAL_USAGE_METRIC_KEYS.map((metric) => ({ metric, quantity: 0, sourceClass: "CURRENT_CANONICAL_STATE", periodStartsAt: snapshot.periodStartsAt, periodEndsAt: snapshot.periodEndsAt }));
    const usage = { schemaVersion: 1, workspaceId: "workspace-a", periodStartsAt: snapshot.periodStartsAt, periodEndsAt: snapshot.periodEndsAt, readings, aggregateFingerprint: "a".repeat(64), informationalOnly: true, amountDueMinor: null, currency: "CAD", providerObserved: false, externalEffectCount: 0 };
    expect(commercialUsageProjectionSchema.parse(usage).readings).toHaveLength(7);
    expect(() => commercialUsageProjectionSchema.parse({ ...usage, readings: readings.slice(1) })).toThrow();
    expect(() => commercialUsageProjectionSchema.parse({ ...usage, readings: readings.map((item, index) => index ? item : { ...item, quantity: -1 }) })).toThrow();
  });

  it("has complete honest bilingual public capability parity", () => {
    const french = publicConstructionOffer("fr-CA");
    const english = publicConstructionOffer("en-CA");
    expect(french.capabilities.map((item) => item.code)).toEqual([...COMMERCIAL_FEATURE_KEYS]);
    expect(english.capabilities.map((item) => item.code)).toEqual([...COMMERCIAL_FEATURE_KEYS]);
    for (const offer of [french, english]) expect(offer).toMatchObject({ stage: "LOCAL_BUILD", priceState: "PRICE_NOT_SET", providerObserved: false, customerProofAvailable: false, productMarketFitProven: false, mobileStoreAvailable: false });
  });

  it("keeps field-worker commercial serialization impossible", () => {
    const usage = commercialUsageProjectionSchema.parse({ schemaVersion: 1, workspaceId: "workspace-a", periodStartsAt: snapshot.periodStartsAt, periodEndsAt: snapshot.periodEndsAt, readings: COMMERCIAL_USAGE_METRIC_KEYS.map((metric) => ({ metric, quantity: 0, sourceClass: "CURRENT_CANONICAL_STATE", periodStartsAt: snapshot.periodStartsAt, periodEndsAt: snapshot.periodEndsAt })), aggregateFingerprint: "b".repeat(64), informationalOnly: true, amountDueMinor: null, currency: "CAD", providerObserved: false, externalEffectCount: 0 });
    expect(() => ownerCommercialProjectionSchema.parse({ schemaVersion: 1, generatedAt: snapshot.periodStartsAt, workspace: { id: "workspace-a", name: "Laval" }, role: "FIELD_WORKER", account: snapshot, planAvailable: true, plan: {}, usage, support: {}, unavailableCapabilities: [], providerObserved: false, externalEffectCount: 0 })).toThrow();
  });

  it("keeps private routes session-derived, rate-limited and no-store", () => {
    const client = readFileSync("src/app/api/endvera/v1/mobile/commercial-account/route.ts", "utf8");
    const admin = readFileSync("src/app/api/endvera/v1/admin/construction-commercial/route.ts", "utf8");
    for (const source of [client, admin]) {
      expect(source).toContain("getSessionUser");
      expect(source).toContain("consumeRateLimit");
      expect(source).toContain('"Cache-Control": "private, no-store"');
    }
    expect(admin).not.toMatch(/body\.actor|body\.role/u);
  });

  it("keeps web surfaces keyboard, narrow-layout and non-colour meaning explicit", () => {
    const client = readFileSync("src/components/construction-operating-assistant-r34/commercial-account-panel.tsx", "utf8");
    const admin = readFileSync("src/app/admin/construction-commercial/page.tsx", "utf8");
    const publicPage = readFileSync("src/app/construction/page.tsx", "utf8");
    const publicStyles = readFileSync("src/app/construction/construction.module.css", "utf8");
    expect(client).toContain("sm:grid-cols-2");
    expect(client).toContain("focus-visible:outline");
    expect(admin).toContain("flex flex-wrap");
    expect(admin).toContain("attentionReason");
    expect(publicPage).toContain("CONSTRUCTION_LANGS");
    expect(publicPage).toContain("skipLink");
    expect(publicStyles).toContain("@media (max-width: 640px)");
    expect(publicStyles).toContain(":focus-visible");
    expect(publicPage).toContain("Honest status:");
  });

  it("uses one additive forward-only migration", () => {
    const sql = readFileSync("prisma/migrations/20260902120500_construction_operating_assistant_r34_commercial_account/migration.sql", "utf8");
    expect(sql).toContain('CREATE TABLE "ConstructionCommercialAccount"');
    expect(sql).toContain('CREATE TABLE "ConstructionCommercialDecision"');
    expect(sql).not.toMatch(/DROP\s|TRUNCATE\s|DELETE\s+FROM|ALTER\s+COLUMN/u);
  });
});
