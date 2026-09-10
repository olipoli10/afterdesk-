import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { admitPersonalIntent } from "@/server/model-gateway/personal-intent/admission";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";

const shared = vi.hoisted(() => ({ transaction: vi.fn(), subject: vi.fn(), policy: vi.fn(), routes: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
vi.mock("@/server/model-gateway/personal-subject", () => ({ inspectPersonalGatewaySubject: shared.subject }));
vi.mock("@/server/model-gateway/operations", async original => ({
  ...await original<object>(), loadGatewayPolicySnapshot: shared.policy, loadGatewayRouteSnapshots: shared.routes,
}));

const now = new Date("2026-09-10T12:00:00Z");
const subject = { kind: "personal_assistant_operation" as const, workspaceId: "synthetic-workspace", operationId: "synthetic-inbound" };
const rate = {
  authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: now.toISOString(),
  totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1_000_000,
  outputUsdMicrosPerMillionTokens: 2_000_000, additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_500_000,
  headroomBasisPoints: 1000, ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 100_000,
};
const review = { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "synthetic-control-review-not-real-billing-proof",
  reviewedAt: now.toISOString(), nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 };
const input = { subject, policyVersionId: "synthetic-policy", rateConfiguration: rate, pilotEnvelopeReview: review, enabled: true };
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
function fixture(changed: Record<string, unknown> = {}) {
  const account = { accountId: "synthetic-model-account", accountStatus: "connected", createdByUserId: "synthetic-owner", accountVersion: 1,
    accountRevokedAt: null, credentialsPrepared: true, credentialRef: "opaque-synthetic-reference", externalAccountKeyHash: null,
    grantId: "synthetic-model-grant", grantStatus: "active", grantVersion: 1, grantRevokedAt: null, grantedAt: now,
    grantedScopes: ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`], ...changed };
  const query = vi.fn(async (sql: string) => sql.includes("CURRENT_TIMESTAMP") ? [{ now }] : [account]);
  const execute = vi.fn();
  shared.transaction.mockImplementation(work => work({ $queryRawUnsafe: query, $executeRawUnsafe: execute }));
  shared.subject.mockResolvedValue({ subject, actorUserId: "synthetic-owner", tenantKey: "construction-workspace:synthetic-workspace",
    input: createPersonalIntentInput(subject.operationId, "Qu’est-ce que j’ai demain?"), receivedAt: now.toISOString() });
  return { query, execute };
}
beforeEach(() => { vi.clearAllMocks(); shared.policy.mockResolvedValue(null); shared.routes.mockResolvedValue([]); });

describe("personal intent admission fail-closed boundary (synthetic DB only)", () => {
  it.each([false, undefined])("is OFF without explicit caller and server enablement: %s", async enabled => {
    fixture();
    expect(await admitPersonalIntent({ ...input, enabled }, env)).toMatchObject({ status: "DISABLED", executionAuthorized: false });
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("is OFF without server enablement even if requested", async () => {
    fixture(); expect(await admitPersonalIntent(input, { NODE_ENV: "test" })).toMatchObject({ status: "DISABLED" });
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it.each([
    undefined, {}, { ...review, authorityId: "R37" }, { ...review, totalCeilingCadMicros: 110_000_000 },
    { ...review, nonModelExposureCeilingCadMicros: 0 }, { ...review, reviewedAt: "2026-09-09T11:59:59Z" },
    { ...review, reviewedAt: "2026-09-10T12:00:01Z" }, { ...review, reviewRef: " " },
    { ...review, aggregatePilotBillingVerified: true },
  ])("refuses missing, stale, enlarged or fabricated envelope review", async pilotEnvelopeReview => {
    const f = fixture();
    expect(await admitPersonalIntent({ ...input, pilotEnvelopeReview }, env)).toMatchObject({
      status: "REFUSED", reason: "PERSONAL_MODEL_TOTAL_ENVELOPE_REVIEW_REQUIRED", executionAuthorized: false,
    });
    expect(shared.subject).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([
    { createdByUserId: "different-owner" }, { accountStatus: "revoked" }, { accountRevokedAt: now },
    { credentialsPrepared: false }, { grantId: null }, { grantStatus: "requested" }, { grantRevokedAt: now },
    { grantedAt: new Date("2026-09-09T12:00:00Z") }, { grantedAt: new Date("2026-09-10T12:00:01Z") },
    { grantedAt: new Date("invalid") },
    { grantedScopes: ["sms_inbound"] }, { grantedScopes: ["personal_data:inference"] },
  ])("refuses non-current owner AI consent independently of valid SMS source", async changed => {
    const f = fixture(changed);
    expect(await admitPersonalIntent(input, env)).toMatchObject({ status: "REFUSED", reason: "PERSONAL_MODEL_OWNER_GRANT_REQUIRED" });
    expect(shared.subject).toHaveBeenCalledOnce(); expect(shared.policy).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("still requires canonical gateway policy after current owner consent and reviews", async () => {
    const f = fixture();
    expect(await admitPersonalIntent(input, env)).toMatchObject({ status: "REFUSED" });
    expect(shared.policy).toHaveBeenCalledOnce(); expect(shared.routes).toHaveBeenCalledOnce(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("preserves the latest legacy closed sets while extending only explicit personal model values", () => {
    const next = readFileSync("prisma/migrations/20260910040000_personal_model_gateway_admission/migration.sql", "utf8");
    const prior = readFileSync("prisma/migrations/20260910002000_personal_outbound_budget/migration.sql", "utf8");
    const providers = readFileSync("prisma/migrations/20260902014500_construction_operating_assistant_r23_calendar_connectors/migration.sql", "utf8");
    for (const sql of [prior, providers]) {
      for (const clause of sql.matchAll(/CHECK\s*\(\s*"(?:kind|capability|provider)"\s+IN\s*\(([^)]+)\)/g)) {
        for (const value of clause[1].matchAll(/'([^']+)'/g)) expect(next).toContain(`'${value[1]}'`);
      }
    }
    expect(next).toContain("'personal_model_inference'"); expect(next).toContain("'openrouter'");
    expect(next).not.toMatch(/INSERT\s+INTO/i);
  });
});
