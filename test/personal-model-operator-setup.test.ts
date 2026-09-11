import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { createHash } from "node:crypto";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { applyPersonalModelOperatorSetupInTransaction, inspectPersonalModelSetupManifest, personalAnswerRuntimeFromOperatorConfiguration,
  reconcilePersonalModelOperatorSetupInTransaction } from "../src/server/model-gateway/personal-intent/operator-setup";
import { provisionInitialPersonalModelCredentialInTransaction } from "../src/server/personal-assistant/model-connection";
import { openConnectorSecret } from "../src/server/personal-assistant/credential-cipher";
vi.mock("@/lib/db", () => ({ prisma: {} }));

const now = new Date("2026-09-11T01:00:00Z");
const authority = "ENDVERA-PERSONAL-20260910-100CAD";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const doc = { reviewRef: "synthetic-only", contentHash: `sha256:${"a".repeat(64)}` };
  const rate = { authorityId: authority, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: now.toISOString(),
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000,
    outputUsdMicrosPerMillionTokens: 2000000, additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000,
    headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "synthetic-reviewer", reviewedAt: now.toISOString(), rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: authority, expiresAt: "2026-10-10T01:18:26Z" }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: authority, reviewRef: "synthetic", reviewedAt: now.toISOString(), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "synthetic-not-certified", effectiveAt: now.toISOString(), expiresAt: "2026-09-13T01:00:00Z",
      endpointKey: rate.providerEndpoint, intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"],
      pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: "synthetic-route", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 }, policy: { id: "synthetic-policy", version: 1 },
    answer: { operatorReview: { reviewerRef: "synthetic-answer-reviewer", reviewedAt: now.toISOString(),
      compatibility: doc, privacy: doc, promptAndOutputContract: doc },
      privacyEvidence: { adapterKey: "openrouter-personal-answer-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
        certificationOwner: "synthetic-not-certified", effectiveAt: now.toISOString(), expiresAt: "2026-09-13T01:00:00Z",
        endpointKey: rate.providerEndpoint, intermediary: "openrouter", modelKey: "openrouter/auto", operationTypes: ["personal_answer_candidate_v1"],
        pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
      route: { id: "synthetic-answer-route", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 },
      policy: { id: "synthetic-answer-policy", version: 1 } },
  } }, now);
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("FIXTURE_INVALID");
  return { version: "personal-model-operator-setup-v1", setupId: "12345678-1234-4234-8234-123456789abc",
    expectedHead: "a".repeat(40), expectedSchemaCatalogSha256: "b".repeat(64), authorityId: authority,
    pilotExpiresAt: "2026-10-10T01:18:26Z", workspaceId: "synthetic-workspace", ownerUserId: "synthetic-owner", artifact };
}

describe("pure initial personal model setup mapping", () => {
  it("maps a real prepared artifact without inventing columns or claiming publication", () => {
    const input = fixture(), result = inspectPersonalModelSetupManifest(input);
    expect(result.status).toBe("MAPPED_NOT_AUTHORIZED");
    expect(result.route).not.toHaveProperty("reviewedHashes");
    expect(result.policy).not.toHaveProperty("reviewedHashes");
    expect(result.policy).not.toHaveProperty("routeHash");
    expect(result.route.canonicalHash).toBe(input.artifact.draftRoute.canonicalHash);
    expect(result.policy.canonicalHash).toBe(input.artifact.draftPolicy.canonicalHash);
    expect(result.policy.maxTotalCostMicros).toBe(BigInt(input.artifact.draftPolicy.maxTotalCostMicros));
    expect(result.executionAuthorized).toBe(false);
    expect(result.answer?.route).toMatchObject({ routeKey: "personal-answer-openrouter-v1", modelKey: "openrouter/auto" });
    expect(result.answer?.route).not.toHaveProperty("reviewedHashes");
    expect(personalAnswerRuntimeFromOperatorConfiguration(input)).toMatchObject({ policyVersionId: "synthetic-answer-policy" });
  });
  it("binds the entire canonical manifest and preserves immutable copies", () => {
    const raw = fixture(), mapped = inspectPersonalModelSetupManifest(raw);
    const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)])) : v;
    expect(mapped.manifestHash).toBe(`sha256:${createHash("sha256").update(JSON.stringify(canonical(raw))).digest("hex")}`);
    raw.workspaceId = "different";
    expect(mapped.manifest.workspaceId).toBe("synthetic-workspace");
    expect(inspectPersonalModelSetupManifest(raw).manifestHash).not.toBe(mapped.manifestHash);
    expect(Object.isFrozen(mapped.route.pricingEvidence)).toBe(true);
  });
  it.each(["extra", "apiKey", "databaseUrl"])("rejects unknown manifest key %s", key => {
    expect(() => inspectPersonalModelSetupManifest({ ...fixture(), [key]: "not-accepted" })).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
  });
  it.each(["artifactHash", "canonicalHash", "policyHash"])("rejects mutated %s", key => {
    const raw = structuredClone(fixture());
    if (key === "artifactHash") raw.artifact.artifactHash = `sha256:${"0".repeat(64)}`;
    else if (key === "canonicalHash") raw.artifact.draftRoute.canonicalHash = `sha256:${"0".repeat(64)}`;
    else raw.artifact.draftPolicy.canonicalHash = `sha256:${"0".repeat(64)}`;
    expect(() => inspectPersonalModelSetupManifest(raw)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
  });
  it("rejects a substituted answer proof before SQL", () => {
    const raw = structuredClone(fixture());
    const answer = raw.artifact.answerSetup as { draftRoute: { privacyEvidence: Record<string, unknown> } };
    answer.draftRoute.privacyEvidence.modelKey = "substituted/model";
    expect(() => inspectPersonalModelSetupManifest(raw)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
  });
  it("refuses accessors without invoking them", () => {
    const raw = fixture(), getter = vi.fn(() => "unexpected");
    Object.defineProperty(raw, "workspaceId", { enumerable: true, get: getter });
    expect(() => inspectPersonalModelSetupManifest(raw)).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
  it("refuses nested Proxy reflection before executing traps", () => {
    const raw = structuredClone(fixture()), trap = vi.fn(() => Object.prototype);
    raw.artifact.configuration = new Proxy(raw.artifact.configuration, { getPrototypeOf: trap });
    expect(() => inspectPersonalModelSetupManifest(raw)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(trap).not.toHaveBeenCalled();
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(), new Map(), Object.create({ inherited: true })])("rejects non-JSON %s", value => {
    expect(() => inspectPersonalModelSetupManifest({ ...fixture(), extra: value })).toThrow();
  });
  it("rejects dangerous keys, nonenumerable keys and sparse arrays", () => {
    for (const raw of [JSON.parse('{"__proto__":{}}'), Object.defineProperty({}, "x", { value: 1 }), Array(257)]) {
      expect(() => inspectPersonalModelSetupManifest(raw)).toThrow();
    }
  });
});

type Manifest = ReturnType<typeof fixture>;
type Row = Record<string, unknown>;
function database() {
  const manifest = fixture();
  const mapped = inspectPersonalModelSetupManifest(manifest);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: authority, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: manifest.pilotExpiresAt,
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const context = { expectedHead: manifest.expectedHead, expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256,
    expectedArtifactHash: manifest.artifact.artifactHash, expectedManifestHash: mapped.manifestHash,
    deadlineAt: Date.now() + 15000, monotoneDeadlineAt: performance.now() + 15000 };
  const state = { route: null as Row | null, answerRoute: null as Row | null,
    policy: null as Row | null, answerPolicy: null as Row | null, credential: null as Row | null,
    account: {} as Row, owner: true, readback: true, prior: false, isolation: "serializable", dbNow: now,
    routeCollision: false, policyCollision: false, calls: [] as string[], hook: (_point: string) => { void _point; }, failAt: "" };
  function point(p: string) { state.calls.push(p); state.hook(p); if (state.failAt === p) throw new Error("SYNTHETIC_SECRET_MUST_NOT_ESCAPE"); }
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql === "SHOW transaction_isolation") { point("isolation"); return [{ transaction_isolation: state.isolation }]; }
      if (sql.includes("set_config")) { point("timeouts"); return []; }
      if (sql.includes("pg_advisory")) { point(`lock:${args[0]}`); return []; }
      if (sql.includes("clock_timestamp() AS now")) { point("clock"); return [{ now: state.dbNow }]; }
      if (sql.startsWith('SELECT id FROM "ModelGateway')) { point("rowlock"); return [{ id: args[0] }]; }
      if (sql.includes('c.ciphertext=$5')) { point("credential-readback"); return state.readback ? [{ id: "account" }] : []; }
      if (sql.includes('g.id AS "grantId"')) { point("owner-grant"); return state.owner ? [{ id: "account", grantId: "grant", grantVersion: 1 }] : []; }
      if (sql.includes('SELECT id FROM "ConstructionConnectorAccount"')) { point("account-lock"); return state.owner ? [{ id: "account" }] : []; }
      if (sql.includes('c.id=$3')) { point("historical-owner"); return state.owner && state.credential ? [{ id: "account" }] : []; }
      throw new Error("UNEXPECTED_SQL");
    }),
    constructionConnectorCredential: {
      findFirst: vi.fn(async () => { point("prior-credential"); return state.prior ? { id: "old" } : null; }),
      create: vi.fn(async ({ data }: { data: Row }) => { point("credential-create"); state.credential = structuredClone(data); return state.credential; }),
      updateMany: vi.fn(() => { throw new Error("NO_ROTATION"); }),
    },
    constructionConnectorAccount: { update: vi.fn(async ({ data }: { data: Row }) => { point("account-update"); state.account = structuredClone(data); return state.account; }) },
    constructionConnectorGrant: { upsert: vi.fn(() => { throw new Error("NO_CONSENT_WRITE"); }) },
    modelGatewayRouteProfile: {
      findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ id?: string }> } }) => {
        point("route-collision");
        const ids = where.OR.flatMap(candidate => candidate.id ? [candidate.id] : []);
        return state.routeCollision || [state.route, state.answerRoute].some(row => row && ids.includes(row.id as string)) ? { id: "existing" } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        point("route-create");
        const row = { ...structuredClone(data), retiredAt: null };
        if (data.id === mapped.route.id) state.route = row; else state.answerRoute = row;
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        point("route-readback");
        return [state.route, state.answerRoute].find(row => row?.id === where.id) ?? null;
      }),
    },
    modelGatewayPolicyVersion: {
      findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ id?: string }> } }) => {
        point("policy-collision");
        const ids = where.OR.flatMap(candidate => candidate.id ? [candidate.id] : []);
        return state.policyCollision || [state.policy, state.answerPolicy].some(row => row && ids.includes(row.id as string)) ? { id: "existing" } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        point("policy-create");
        const row = { ...structuredClone(data), retiredAt: null };
        if (data.id === mapped.policy.id) state.policy = row; else state.answerPolicy = row;
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        point("policy-readback");
        return [state.policy, state.answerPolicy].find(row => row?.id === where.id) ?? null;
      }),
    },
  };
  const transaction = tx as unknown as Prisma.TransactionClient;
  const apply = (m: Manifest = manifest) => applyPersonalModelOperatorSetupInTransaction(transaction, m, "synthetic_key_12345678901234567890", env, context);
  return { tx, transaction, manifest, mapped, env, context, state, apply };
}

describe("initial-only setup transaction (SQL simulated, actual artifact/cipher/helper)", () => {
  it("writes one encrypted credential and exact published columns, with no consent/budget/activation effect", async () => {
    const d = database(), result = await d.apply();
    expect(result).toMatchObject({ committed: false, executionAuthorized: false, providerVerified: false, consentCreated: false, runtimeActivated: false, budgetAvailabilityVerified: false });
    expect(d.state.route).toMatchObject(d.mapped.route); expect(d.state.policy).toMatchObject(d.mapped.policy);
    expect(d.state.answerRoute).toMatchObject({ routeKey: "personal-answer-openrouter-v1", operationTypes: ["personal_answer_candidate_v1"] });
    expect(d.state.answerPolicy).toMatchObject({ policyKey: "personal-answer-v1", operationType: "personal_answer_candidate_v1" });
    expect(d.state.answerRoute).not.toHaveProperty("reviewedHashes"); expect(d.state.answerPolicy).not.toHaveProperty("reviewedHashes");
    expect(d.state.answerPolicy).not.toHaveProperty("routeHash");
    expect(d.state.route).not.toHaveProperty("reviewedHashes"); expect(d.state.policy).not.toHaveProperty("routeHash");
    const aad = JSON.stringify([d.manifest.workspaceId, "account", `openrouter-api-key:${d.manifest.setupId}`]);
    expect(JSON.parse(openConnectorSecret(d.state.credential!.ciphertext as string, aad, Buffer.alloc(32, 7))).apiKey).toBe("synthetic_key_12345678901234567890");
    expect(JSON.stringify(result)).not.toContain("synthetic_key"); expect(JSON.stringify(result)).not.toContain("ciphertext");
    expect(d.tx.constructionConnectorGrant.upsert).not.toHaveBeenCalled(); expect(d.tx.constructionConnectorCredential.updateMany).not.toHaveBeenCalled();
    expect(d.state.calls.indexOf("owner-grant")).toBeLessThan(d.state.calls.indexOf("credential-create"));
    expect(d.state.calls.indexOf("account-lock")).toBeLessThan(d.state.calls.indexOf("credential-create"));
    expect(d.state.calls).toContain("credential-readback");
  });
  it.each(["expectedHead", "expectedSchemaCatalogSha256", "expectedArtifactHash", "expectedManifestHash"] as const)("refuses wrong context %s before SQL", async key => {
    const d = database(); d.context[key] = `sha256:${"0".repeat(64)}`; await expect(d.apply()).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED"); expect(d.state.calls).toEqual([]);
  });
  it.each(["workspaceId", "ownerUserId", "setupId"] as const)("binds identity %s to independent manifest digest", async key => {
    const d = database(), raw = { ...d.manifest, [key]: key === "setupId" ? "22345678-1234-4234-8234-123456789abc" : "other" };
    await expect(d.apply(raw)).rejects.toThrow(); expect(d.state.calls).toEqual([]);
  });
  it("rejects root client and nonserializable transaction", async () => {
    const d = database();
    await expect(applyPersonalModelOperatorSetupInTransaction({ ...d.tx, $transaction: vi.fn() } as unknown as Prisma.TransactionClient, d.manifest, "unused", d.env, d.context)).rejects.toThrow();
    expect(d.state.calls).toEqual([]); d.state.isolation = "read committed";
    await expect(d.apply()).rejects.toThrow(); expect(d.state.calls).toEqual(["isolation"]);
  });
  it.each(["owner", "readback", "prior", "routeCollision", "policyCollision"] as const)("refuses %s boundary", async key => {
    const d = database(); d.state[key] = !["owner", "readback"].includes(key);
    await expect(d.apply()).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(d.state.route).toBeNull(); expect(d.state.policy).toBeNull();
  });
  it.each(["credential-create", "account-update", "route-create", "policy-create", "policy-readback"])("redacts failure at %s; caller owns rollback", async failAt => {
    const d = database(); d.state.failAt = failAt;
    await expect(d.apply()).rejects.toThrow(/^PERSONAL_MODEL_SETUP_REFUSED$/);
    // This mock does not claim rollback. Real caller/native tests must prove it.
    expect(d.tx.constructionConnectorCredential.updateMany).not.toHaveBeenCalled();
  });
  it("refuses missing explicit OFF and late environment activation", async () => {
    const d = database(); delete d.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED;
    await expect(d.apply()).rejects.toThrow(); expect(d.state.calls).toEqual([]);
    d.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED = "false";
    d.state.hook = p => { if (p === "policy-create") d.env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED = "true"; };
    await expect(d.apply()).rejects.toThrow();
  });
  it.each(["wall", "mono", "abort"])("preserves original %s budget", async kind => {
    const d = database(), abort = new AbortController(); Object.assign(d.context, { signal: abort.signal });
    const mono = performance.now(), wall = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(wall); vi.spyOn(performance, "now").mockReturnValue(mono);
    d.state.hook = p => { if (p === "policy-create") {
      if (kind === "abort") abort.abort();
      if (kind === "wall") vi.mocked(Date.now).mockReturnValue(d.context.deadlineAt);
      if (kind === "mono") { vi.mocked(Date.now).mockReturnValue(wall - 86400000); vi.mocked(performance.now).mockReturnValue(mono + 10000); }
    } };
    await expect(d.apply()).rejects.toThrow();
  });
  it("rejects stale reviews before any credential write", async () => {
    const d = database(); d.state.dbNow = new Date(now.getTime() + 86400001);
    await expect(d.apply()).rejects.toThrow(); expect(d.state.credential).toBeNull();
  });
  it.each(["wall-nan", "mono-nan", "mono-backwards", "wall-backwards"])("refuses %s after all writes at final core clock", async kind => {
    const d = database(), wall = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(wall); vi.spyOn(performance, "now").mockReturnValue(1000);
    let clocks = 0;
    d.state.hook = p => { if (p === "clock" && ++clocks === 4) {
      if (kind === "wall-nan") vi.mocked(Date.now).mockReturnValue(NaN);
      else if (kind === "wall-backwards") vi.mocked(Date.now).mockReturnValue(wall - 1);
      else vi.mocked(performance.now).mockReturnValue(kind === "mono-nan" ? NaN : 999);
    } };
    await expect(d.apply()).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(clocks).toBe(4); expect(d.tx.modelGatewayPolicyVersion.create).toHaveBeenCalledTimes(2);
  });
  it("refuses substituted stored data but snapshots valid data before next await", async () => {
    const d = database(); d.state.hook = p => { if (p === "route-readback") d.state.route!.modelKey = "other"; };
    await expect(d.apply()).rejects.toThrow();
    const good = database(); good.state.hook = p => { if (p === "policy-readback") (good.state.route!.publishedAt as Date).setTime(0); };
    await expect(good.apply()).resolves.toHaveProperty("committed", false);
  });
  it("does not automatically replay a prior setup", async () => {
    const d = database(); await d.apply(); await expect(d.apply()).rejects.toThrow();
    expect(d.tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
  });
  it("reconciles historical integrity after review/pilot expiry without key/env/renewal", async () => {
    const d = database(); await d.apply(); d.state.dbNow = new Date("2026-11-01T00:00:00Z");
    const result = await reconcilePersonalModelOperatorSetupInTransaction(d.transaction, d.manifest, { NODE_ENV: "test" }, d.context);
    expect(result).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED", currentEligibilityVerified: false, committed: false });
    expect(d.tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
    d.state.owner = false; await expect(reconcilePersonalModelOperatorSetupInTransaction(d.transaction, d.manifest, { NODE_ENV: "test" }, d.context)).rejects.toThrow();
  });
  it("strict initial helper refuses root, old credentials and wrong isolation", async () => {
    for (const mode of ["root", "old", "isolation"]) {
      const d = database(); if (mode === "old") d.state.prior = true; if (mode === "isolation") d.state.isolation = "read committed";
      const tx = mode === "root" ? { ...d.tx, $transaction: vi.fn() } as unknown as Prisma.TransactionClient : d.transaction;
      await expect(provisionInitialPersonalModelCredentialInTransaction(tx, { userId: d.manifest.ownerUserId, workspaceId: d.manifest.workspaceId,
        credentialId: d.manifest.setupId, apiKey: "synthetic_key_12345678901234567890" }, d.env, d.context)).rejects.toThrow("PERSONAL_MODEL_INITIAL_SETUP_REFUSED");
      expect(d.state.credential).toBeNull();
    }
  });
});
