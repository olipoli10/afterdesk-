import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { inspectPersonalModelIngressConfiguration, PERSONAL_MODEL_INGRESS_TARGET as target } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
import { applyPersonalModelOperatorIngress, readPersonalModelOperatorIngress, assertPersonalModelOperatorIngressPublication } from "../src/server/model-gateway/personal-intent/operator-ingress";

const mock = vi.hoisted(() => ({ transaction: vi.fn(), apply: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("../src/server/model-gateway/personal-intent/operator-setup", async original => ({
  ...await original<typeof import("../src/server/model-gateway/personal-intent/operator-setup")>(),
  applyPersonalModelOperatorSetupInTransaction: mock.apply, reconcilePersonalModelOperatorSetupInTransaction: mock.reconcile,
}));
afterEach(() => { vi.restoreAllMocks(); mock.transaction.mockReset(); mock.apply.mockReset(); mock.reconcile.mockReset(); });
const start = Date.parse("2026-09-11T01:00:00Z"), iso = (n: number) => new Date(n).toISOString();

// Private fixture from real pure artifact/B1 producers. SQL and core effects are
// simulated: no assertion here certifies actual PostgreSQL locks or commits.
function fixture() {
  const authority = "ENDVERA-PERSONAL-20260910-100CAD", expiry = "2026-10-10T01:18:26Z";
  const doc = { reviewRef: "reviewer-synthetic-only", contentHash: `sha256:${"d".repeat(64)}` };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "reviewer-synthetic", reviewedAt: iso(start), rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: authority, expiresAt: expiry },
    rateConfiguration: { authorityId: authority, model: "review/model", providerEndpoint: "review-endpoint", reviewedAt: iso(start),
      totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000, outputUsdMicrosPerMillionTokens: 2000000,
      additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000, headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 },
    pilotEnvelopeReview: { authorityId: authority, reviewRef: "reviewer-synthetic", reviewedAt: iso(start), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", billingProvider: "openrouter", intermediary: "openrouter",
      endpointKey: "review-endpoint", modelKey: "review/model", certificationOwner: "SYNTHETIC_NOT_CERTIFIED", effectiveAt: iso(start), expiresAt: iso(start + 600000),
      operationTypes: ["personal_intent_candidate_v1"], allowedDataClasses: ["personal_data"], pathKind: "gateway_mediated", privacyPosture: "zero_retention",
      residency: ["review-region"], tenancyMode: "route_isolated" },
    route: { id: "review-route", version: 1, residency: ["review-region"], maxInputTokens: 32768 }, policy: { id: "review-policy", version: 1 },
  } }, new Date(start));
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("PEER_FIXTURE_INVALID");
  const manifestUtf8 = JSON.stringify({ version: "personal-model-operator-setup-v1", setupId: "12345678-1234-4234-8234-123456789abc",
    expectedHead: "a".repeat(40), expectedSchemaCatalogSha256: "b".repeat(64), authorityId: authority, pilotExpiresAt: expiry,
    workspaceId: "review-workspace", ownerUserId: "review-owner", artifact });
  const config = JSON.stringify({ version: "personal-model-operator-ingress-configuration-v1", mode: "ENABLED", setupRef: "12345678-1234-4234-8234-123456789abc",
    notBefore: iso(start), expiresAt: iso(start + 10000), manifestUtf8, manifestSha256: createHash("sha256").update(manifestUtf8).digest("hex"),
    expectedSourceHead: "a".repeat(40), expectedSchemaCatalogSha256: "b".repeat(64), controllerReceiptRef: "PEER_SYNTHETIC", targetProfile: "PERSONAL_PILOT" });
  const inspected = inspectPersonalModelIngressConfiguration(config);
  const wall = vi.spyOn(Date, "now").mockReturnValue(start - 86400000), mono = vi.spyOn(performance, "now").mockReturnValue(1000);
  const context = { deadlineAt: wall() + 15000, monotoneDeadlineAt: 16000 };
  const input = { actor: { userId: "review-owner", role: "CLIENT", emailVerified: true }, setupRef: inspected.configuration.setupRef,
    apiKey: "synthetic_peer_key_12345678901234567890" };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION: config,
    DATABASE_URL: `postgresql://neondb_owner:unused@${target.pooledHostname}/neondb?sslmode=require&sslaccept=strict`,
    DIRECT_URL: `postgresql://neondb_owner:unused@${target.directHostname}/neondb?sslmode=require&sslaccept=strict`,
    ENDVERA_EXTERNAL_AUTHORITY_REF: authority, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: expiry,
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") };
  const state = { dbNow: start + 9900, published: start + 9900, events: new Map<string, Record<string, unknown>>(),
    calls: 0, commits: 0, writes: 0, clockQueries: 0, afterCommit: (_n: number) => { void _n; }, afterClock: (_n: number) => { void _n; } };
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql === "SHOW transaction_isolation") return [{ transaction_isolation: "serializable" }];
      if (sql.includes("set_config")) return [];
      if (sql.includes('SELECT w.id FROM "ConstructionWorkspace"')) return [{ id: "review-workspace" }];
      if (sql === "SELECT clock_timestamp() AS now") { state.afterClock(++state.clockQueries); return [{ now: new Date(state.dbNow) }]; }
      if (sql.includes('FROM "ConstructionAuditEvent"')) { const e = state.events.get(args[0] as string); return e ? [structuredClone(e)] : []; }
      if (sql.includes('SELECT "publishedAt"')) return [{ publishedAt: new Date(state.published) }];
      throw new Error("PEER_UNEXPECTED_QUERY");
    }),
    constructionAuditEvent: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.events.has(where.id) ? { id: where.id } : null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (state.events.has(data.id as string)) throw new Error("PEER_DUPLICATE");
        state.events.set(data.id as string, { ...structuredClone(data), reasonCode: null, createdAt: new Date(state.dbNow) });
      }),
    },
  };
  mock.transaction.mockImplementation(async (work: (t: typeof tx) => Promise<unknown>) => {
    const call = ++state.calls, before = structuredClone(state.events), writes = state.writes;
    let result: unknown;
    try { result = await work(tx); } catch (error) { state.events = before; state.writes = writes; throw error; }
    state.commits++; state.afterCommit(call); return result;
  });
  mock.apply.mockImplementation(async () => { state.writes++; return { status: "SETUP_PREPARED_NOT_COMMITTED", manifestHash: inspected.manifestHash, committed: false }; });
  mock.reconcile.mockResolvedValue({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED", manifestHash: inspected.manifestHash });
  return { input, env, context, state, mono, config, tx, apply: () => applyPersonalModelOperatorIngress(input, env, context),
    read: () => readPersonalModelOperatorIngress({ actor: input.actor, setupRef: input.setupRef }, env, context) };
}

describe("peer: known-commit continuation and DB-derived disclosure TTL", () => {
  it.each([1, 2])("expiry during TX%s acknowledgement never discloses success or retries", async phase => {
    const f = fixture(); f.state.afterCommit = n => { if (n === phase) f.mono.mockReturnValue(1100); };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(f.state.events.size).toBe(phase); expect(f.state.commits).toBe(phase);
    expect(mock.apply).toHaveBeenCalledTimes(phase - 1);
    expect(f.state.writes).toBe(phase - 1);
  });
  it("query latency consumes the first DB TTL before any claim insert", async () => {
    const f = fixture(); f.state.afterClock = n => { if (n === 1) f.mono.mockReturnValue(1100); };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED");
    expect(f.state.events.size).toBe(0); expect(f.tx.constructionAuditEvent.create).not.toHaveBeenCalled(); expect(mock.apply).not.toHaveBeenCalled();
  });
  it("a known stored applied receipt survives its original publication guard expiry only through fresh historical read", async () => {
    const f = fixture(), receipt = await f.apply();
    expect(f.state.commits).toBe(2); expect(f.state.writes).toBe(1);
    expect(() => assertPersonalModelOperatorIngressPublication(receipt)).not.toThrow();
    f.mono.mockReturnValue(1100);
    expect(() => assertPersonalModelOperatorIngressPublication(receipt)).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    f.state.dbNow = start + 20000;
    const historical = await f.read();
    expect(historical).toEqual(receipt); expect(historical).not.toBe(receipt);
    expect(() => assertPersonalModelOperatorIngressPublication(historical)).not.toThrow();
    expect(() => assertPersonalModelOperatorIngressPublication(receipt)).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(f.state.events.size).toBe(2); expect(mock.apply).toHaveBeenCalledTimes(1); expect(mock.reconcile).toHaveBeenCalledTimes(1);
  });
  it("does not adopt a mutated caller actor/key after TX1 or archive the supplied secret", async () => {
    const f = fixture(), originalKey = f.input.apiKey;
    f.state.afterCommit = n => { if (n === 1) { f.input.actor.userId = "foreign"; f.input.apiKey = "replacement_key_12345678901234567890"; } };
    const receipt = await f.apply();
    expect(mock.apply.mock.calls[0][1].ownerUserId).toBe("review-owner"); expect(mock.apply.mock.calls[0][2]).toBe(originalKey);
    expect(JSON.stringify([...f.state.events.values()])).not.toContain(originalKey); expect(JSON.stringify(receipt)).not.toContain(originalKey);
    expect(receipt.executionAuthorized).toBe(false); expect(f.state.commits).toBe(2);
  });
});
