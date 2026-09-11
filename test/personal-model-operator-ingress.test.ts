import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { applyPersonalModelOperatorIngress, assertPersonalModelOperatorIngressPublication, readPersonalModelOperatorIngress } from "../src/server/model-gateway/personal-intent/operator-ingress";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { inspectPersonalModelIngressConfiguration, PERSONAL_MODEL_INGRESS_TARGET } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), apply: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("../src/server/model-gateway/personal-intent/operator-setup", async importOriginal => ({
  ...await importOriginal<typeof import("../src/server/model-gateway/personal-intent/operator-setup")>(),
  applyPersonalModelOperatorSetupInTransaction: mocks.apply, reconcilePersonalModelOperatorSetupInTransaction: mocks.reconcile,
}));
afterEach(() => { vi.restoreAllMocks(); mocks.transaction.mockReset(); mocks.apply.mockReset(); mocks.reconcile.mockReset(); });

const instant = Date.parse("2026-09-11T01:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
function configuration() {
  const authority = "ENDVERA-PERSONAL-20260910-100CAD", expiresAt = "2026-10-10T01:18:26Z";
  const doc = { reviewRef: "synthetic-only", contentHash: `sha256:${"a".repeat(64)}` };
  const rate = { authorityId: authority, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: iso(instant),
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000, outputUsdMicrosPerMillionTokens: 2000000,
    additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000, headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "synthetic-reviewer", reviewedAt: iso(instant), rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: authority, expiresAt }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: authority, reviewRef: "synthetic", reviewedAt: iso(instant), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "synthetic-not-certified", effectiveAt: iso(instant), expiresAt: iso(instant + 600000),
      endpointKey: rate.providerEndpoint, intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"],
      pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: "synthetic-route", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 }, policy: { id: "synthetic-policy", version: 1 },
  } }, new Date(instant));
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("INVALID_SYNTHETIC_FIXTURE");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: "12345678-1234-4234-8234-123456789abc", expectedHead: "a".repeat(40),
    expectedSchemaCatalogSha256: "b".repeat(64), authorityId: authority, pilotExpiresAt: expiresAt, workspaceId: "workspace", ownerUserId: "owner", artifact };
  const manifestUtf8 = JSON.stringify(manifest);
  return JSON.stringify({ version: "personal-model-operator-ingress-configuration-v1", mode: "ENABLED", setupRef: manifest.setupId,
    notBefore: iso(instant), expiresAt: iso(instant + 600000), manifestUtf8, manifestSha256: createHash("sha256").update(manifestUtf8).digest("hex"),
    expectedSourceHead: manifest.expectedHead, expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256, controllerReceiptRef: "synthetic-only", targetProfile: "PERSONAL_PILOT" });
}

// Real B1 parser/builders and artifact validator; explicit simulated DB transactions
// and Stage A effects. These unit tests do not prove PostgreSQL commit/rollback.
function fixture() {
  const wall = vi.spyOn(Date, "now").mockReturnValue(instant + 86400000);
  const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
  const config = configuration(), inspected = inspectPersonalModelIngressConfiguration(config), signal = new AbortController();
  const input = { actor: { userId: "owner", role: "CLIENT", emailVerified: true }, setupRef: inspected.configuration.setupRef,
    apiKey: "synthetic_key_12345678901234567890" };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION: config,
    DATABASE_URL: `postgresql://neondb_owner:synthetic_password@${PERSONAL_MODEL_INGRESS_TARGET.pooledHostname}/neondb?sslmode=require`,
    DIRECT_URL: `postgresql://neondb_owner:synthetic_password@${PERSONAL_MODEL_INGRESS_TARGET.directHostname}/neondb?sslmode=require`,
    ENDVERA_EXTERNAL_AUTHORITY_REF: inspected.manifest.authorityId, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: inspected.manifest.pilotExpiresAt,
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
  const context = { deadlineAt: Date.now() + 15000, monotoneDeadlineAt: 16000, signal: signal.signal };
  const state = { events: new Map<string, Record<string, unknown>>(), commits: 0, calls: 0, coreWrites: 0, owner: true,
    dbNow: instant, publishedAt: instant, isolation: "serializable", loseAck: 0, failInsert: "", hook: (_point: string) => { void _point; },
    afterCommit: async (_call: number) => { void _call; } };
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql === "SHOW transaction_isolation") return [{ transaction_isolation: state.isolation }];
      if (sql.includes("set_config")) return [];
      if (sql.includes('SELECT w.id FROM "ConstructionWorkspace"')) { state.hook("owner"); return state.owner ? [{ id: "workspace" }] : []; }
      if (sql === "SELECT clock_timestamp() AS now") { state.hook("clock"); return [{ now: new Date(state.dbNow) }]; }
      if (sql.includes('FROM "ConstructionAuditEvent"')) { state.hook("event-read"); const row = state.events.get(args[0] as string); return row ? [structuredClone(row)] : []; }
      if (sql.includes('SELECT "publishedAt"')) return [{ publishedAt: new Date(state.publishedAt) }];
      throw new Error("UNEXPECTED_SQL");
    }),
    constructionAuditEvent: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.events.has(where.id) ? { id: where.id } : null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const kind = (data.id as string).endsWith(":claim") ? "claim" : "applied";
        if (state.failInsert === kind) throw new Error("SYNTHETIC_SECRET_DATABASE_ERROR");
        if (state.events.has(data.id as string)) throw new Error("DUPLICATE");
        state.events.set(data.id as string, { ...structuredClone(data), reasonCode: null, createdAt: new Date(state.dbNow) });
        state.hook(`${kind}-insert`); return {};
      }),
    },
  };
  mocks.transaction.mockImplementation(async (work: (value: typeof tx) => Promise<unknown>) => {
    const call = ++state.calls, before = structuredClone(state.events), effects = state.coreWrites;
    let result: unknown;
    try { result = await work(tx); } catch (error) { state.events = before; state.coreWrites = effects; throw error; }
    state.commits++; state.hook(`commit-${call}`);
    await state.afterCommit(call);
    if (state.loseAck === call) throw new Error("SYNTHETIC_COMMIT_ACK_LOST");
    return result;
  });
  mocks.apply.mockImplementation(async () => { state.coreWrites++; state.hook("core"); return { status: "SETUP_PREPARED_NOT_COMMITTED", committed: false, manifestHash: inspected.manifestHash }; });
  mocks.reconcile.mockImplementation(async () => { state.hook("reconcile"); return { status: "STORED_SETUP_MATCH_NOT_ACTIVATED", manifestHash: inspected.manifestHash }; });
  return { state, tx, config, inspected, input, env, context, signal, wall, mono,
    apply: () => applyPersonalModelOperatorIngress(input, env, context),
    read: () => readPersonalModelOperatorIngress({ actor: input.actor, setupRef: input.setupRef }, env, context) };
}
describe("operator ingress has no implicit activation", () => {
  it("refuses absent setup configuration before any transaction", async () => {
    await expect(applyPersonalModelOperatorIngress({ actor: { userId: "owner", role: "CLIENT", emailVerified: true },
      setupRef: "12345678-1234-4234-8234-123456789abc", apiKey: "synthetic_key_12345678901234567890" },
    { NODE_ENV: "test" }, { deadlineAt: Date.now() + 15000, monotoneDeadlineAt: performance.now() + 15000 })).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("two-phase local operator ingress orchestration", () => {
  it("uses the real B1 archive and receipt only after two known commits", async () => {
    const f = fixture(), receipt = await f.apply();
    expect(f.state.commits).toBe(2); expect(mocks.apply).toHaveBeenCalledTimes(1); expect(f.state.events.size).toBe(2);
    expect(receipt).toMatchObject({ status: "APPLIED_NOT_ACTIVATED", setupRef: f.input.setupRef, automaticRetry: false, executionAuthorized: false });
    expect(() => assertPersonalModelOperatorIngressPublication(receipt)).not.toThrow();
    expect(() => assertPersonalModelOperatorIngressPublication({ ...receipt })).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(JSON.stringify([...f.state.events.values()])).not.toContain(f.input.apiKey);
    expect(JSON.stringify(receipt)).not.toContain("synthetic_password");
    expect(mocks.apply.mock.calls[0][4]).toMatchObject({ deadlineAt: f.context.deadlineAt, monotoneDeadlineAt: f.context.monotoneDeadlineAt,
      expectedManifestHash: f.inspected.manifestHash, expectedArtifactHash: f.inspected.artifactHash });
    expect(mocks.transaction.mock.calls.map(c => c[1])).toEqual([
      { isolationLevel: "Serializable", maxWait: 1000, timeout: 2000 }, { isolationLevel: "Serializable", maxWait: 1000, timeout: 9000 }]);
  });
  it.each(["role", "verification", "owner", "setupRef", "key", "proxy"])("refuses bad %s before TX", async kind => {
    const f = fixture();
    if (kind === "role") f.input.actor.role = "ADMIN";
    if (kind === "verification") f.input.actor.emailVerified = false;
    if (kind === "owner") f.input.actor.userId = "other";
    if (kind === "setupRef") f.input.setupRef = "22345678-1234-4234-8234-123456789abc";
    if (kind === "key") f.input.apiKey = "bad";
    if (kind === "proxy") f.input.actor = new Proxy(f.input.actor, { get: () => { throw new Error("MUST_NOT_RUN"); } });
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(f.state.calls).toBe(0);
  });
  it.each(["host", "role", "database", "tls", "extra", "duplicate", "direct", "engine"])("refuses server target/gate %s", async kind => {
    const f = fixture();
    if (kind === "host") f.env.DATABASE_URL = f.env.DATABASE_URL!.replace(PERSONAL_MODEL_INGRESS_TARGET.pooledHostname, "example.invalid");
    if (kind === "role") f.env.DATABASE_URL = f.env.DATABASE_URL!.replace("neondb_owner", "other");
    if (kind === "database") f.env.DATABASE_URL = f.env.DATABASE_URL!.replace("/neondb?", "/other?");
    if (kind === "tls") f.env.DATABASE_URL = f.env.DATABASE_URL!.replace("require", "disable");
    if (kind === "extra") f.env.DATABASE_URL += "&options=-csearch_path%3Devil";
    if (kind === "duplicate") f.env.DATABASE_URL += "&sslmode=require";
    if (kind === "direct") f.env.DIRECT_URL = f.env.DATABASE_URL;
    if (kind === "engine") f.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED = "true";
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(f.state.calls).toBe(0);
  });
  it("requires current DB owner/consent and isolation before claim", async () => {
    const f = fixture(); f.state.owner = false;
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(f.state.events.size).toBe(0);
    expect(mocks.apply).not.toHaveBeenCalled(); f.state.owner = true; f.state.isolation = "read committed";
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(f.state.events.size).toBe(0);
  });
  it.each([1, 2])("never retries after lost commit acknowledgement in TX%s", async tx => {
    const f = fixture(); f.state.loseAck = tx;
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(f.state.events.size).toBe(tx); expect(mocks.apply).toHaveBeenCalledTimes(tx === 1 ? 0 : 1);
    f.state.loseAck = 0;
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(mocks.apply).toHaveBeenCalledTimes(tx === 1 ? 0 : 1);
  });
  it("preserves TX1 when applied insert fails; no claim deletion or second core", async () => {
    const f = fixture(); f.state.failInsert = "applied";
    await expect(f.apply()).rejects.toThrow(/^PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN$/);
    expect(f.state.events.size).toBe(1); expect(f.state.coreWrites).toBe(0); expect(f.state.commits).toBe(1);
    await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(mocks.apply).toHaveBeenCalledTimes(1);
  });
  it.each(["claim-insert", "commit-1", "core", "applied-insert", "commit-2"])("abort at %s never discloses late success", async phase => {
    const f = fixture(); f.state.hook = p => { if (p === phase) f.signal.abort(); };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    if (phase === "commit-1" || phase === "claim-insert") expect(mocks.apply).not.toHaveBeenCalled();
    if (phase === "commit-2") expect(f.state.events.size).toBe(2);
  });
  it.each(["configuration", "database", "encryption", "engine"])("changed %s after known claim stops before core", async kind => {
    const f = fixture(); f.state.hook = p => { if (p !== "commit-1") return;
      if (kind === "configuration") f.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION += " ";
      if (kind === "database") f.env.DATABASE_URL += "&connection_limit=1";
      if (kind === "encryption") f.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
      if (kind === "engine") f.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED = "true";
    };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(mocks.apply).not.toHaveBeenCalled();
    expect(f.state.events.size).toBe(1);
  });
  it("rejects malformed claim readback and preserves the original abort signal", async () => {
    const f = fixture(); f.state.hook = p => { if (p === "claim-insert") {
      const row = [...f.state.events.values()][0]; row.fingerprint = "0".repeat(64);
    } };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(mocks.apply).not.toHaveBeenCalled();
    const good = fixture(); good.state.hook = p => { if (p === "commit-1") { good.context.signal = new AbortController().signal; good.signal.abort(); } };
    await expect(good.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it.each(["nan", "wall-back", "mono-back", "deadline"])("rejects %s after known core commit without rewriting it", async kind => {
    const f = fixture(); f.state.hook = p => { if (p === "commit-2") {
      if (kind === "nan") f.wall.mockReturnValue(NaN);
      if (kind === "wall-back") f.wall.mockReturnValue(instant);
      if (kind === "mono-back") f.mono.mockReturnValue(999);
      if (kind === "deadline") f.mono.mockReturnValue(16000);
    } };
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(f.state.events.size).toBe(2); expect(f.state.commits).toBe(2);
  });
  it("uses DB expiry plus monotone duration even with app clock a day ahead", async () => {
    const f = fixture(); f.state.dbNow = instant + 599000;
    f.state.publishedAt = f.state.dbNow;
    const receipt = await f.apply(); expect(f.state.commits).toBe(2);
    f.mono.mockReturnValue(1999); expect(() => assertPersonalModelOperatorIngressPublication(receipt)).not.toThrow();
    f.mono.mockReturnValue(2000);
    expect(() => assertPersonalModelOperatorIngressPublication(receipt)).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(f.state.events.size).toBe(2);
  });
  it("reconciles after expiry and lost acknowledgement without key or another write", async () => {
    const f = fixture(); f.state.loseAck = 2;
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); f.state.loseAck = 0;
    f.state.dbNow = Date.parse("2026-11-01T00:00:00Z"); delete f.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY;
    f.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED = "true";
    const result = await f.read(); expect(result.status).toBe("APPLIED_NOT_ACTIVATED");
    expect(mocks.apply).toHaveBeenCalledTimes(1); expect(mocks.reconcile).toHaveBeenCalledTimes(1); expect(f.state.events.size).toBe(2);
    f.state.owner = false; await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED");
  });
  it("history rejects a stored receipt disconnected from actual publication timestamp", async () => {
    const f = fixture(); await f.apply(); f.state.publishedAt++;
    await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(f.state.events.size).toBe(2);
  });
  it("a concurrent matching claim observer never adopts the inserter's private continuation", async () => {
    const f = fixture(); let ready!: () => void, release!: () => void;
    const observed = new Promise<void>(r => { ready = r; }), gate = new Promise<void>(r => { release = r; });
    f.state.afterCommit = async call => { if (call === 1) { ready(); await gate; } };
    const winner = f.apply();
    await observed;
    try {
      await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
      expect(mocks.apply).not.toHaveBeenCalled();
    } finally { release(); }
    await expect(winner).resolves.toHaveProperty("status", "APPLIED_NOT_ACTIVATED");
    expect(mocks.apply).toHaveBeenCalledTimes(1); expect(f.state.events.size).toBe(2);
  });
  it("phase maxWait and timeout share the original remaining budget", async () => {
    const f = fixture(); f.context.deadlineAt = Date.now() + 600; f.context.monotoneDeadlineAt = 1600;
    await f.apply();
    for (const call of mocks.transaction.mock.calls) expect(call[1].maxWait + call[1].timeout).toBeLessThanOrEqual(600);
    expect(f.state.commits).toBe(2);
  });
});
