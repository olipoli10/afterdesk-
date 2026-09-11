import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { preparePersonalModelOperatorArtifact, validatePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";
import { applyPersonalModelOperatorSetupInTransaction as apply, inspectPersonalModelSetupManifest,
  reconcilePersonalModelOperatorSetupInTransaction as reconcile } from "@/server/model-gateway/personal-intent/operator-setup";
import { loadGatewayPolicySnapshot, loadGatewayRouteSnapshots } from "@/server/model-gateway/operations";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { consentPersonalModelConnection, disconnectPersonalModelConnection, preparePersonalModelConnection,
  PERSONAL_MODEL_CONSENT_VERSION } from "@/server/personal-assistant/model-connection";
import { openConnectorSecret, requireConnectorKey } from "@/server/personal-assistant/credential-cipher";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
type Tx = Prisma.TransactionClient;
const native = prisma.$transaction.bind(prisma);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const expiry = "2026-10-10T01:18:26Z";
let sequence = randomBytes(4).readUInt32LE() % 1_000_000_000;
const txOptions = { isolationLevel: "Serializable" as const, maxWait: 2000, timeout: 10000 };

async function dbNow() {
  const [row] = await prisma.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
  return row.now;
}

// Private fixture: NO personalModelFixture(), no published routes, active keys,
// SMS source, or inferred human consent. All review facts/keys are synthetic.
async function fixture(options: { consent?: boolean; privacyLifetimeMs?: number; answer?: boolean } = {}) {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { name: "SYNTHETIC setup owner",
    email: `operator-setup-${randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "SYNTHETIC operator setup" });
  const owner = { userId: user.id, workspaceId };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: expiry, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false",
    ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "DISABLED",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
  await preparePersonalModelConnection(owner);
  if (options.consent !== false) await consentPersonalModelConnection({ ...owner, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env);
  const now = await dbNow(), version = ++sequence;
  const review = { reviewRef: "SYNTHETIC_NOT_AN_OPERATOR_REVIEW", contentHash: `sha256:${digest(randomUUID())}` };
  const rate = { authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/not-a-model", providerEndpoint: "synthetic/not-an-endpoint",
    reviewedAt: now.toISOString(), totalContextTokens: 32768, maxOutputTokens: 512,
    inputUsdMicrosPerMillionTokens: 1000000, outputUsdMicrosPerMillionTokens: 2000000, additionalUsdMicrosPerCall: 0,
    cadMicrosPerUsd: 1500000, headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const configuration = {
    operatorReview: { reviewerRef: "SYNTHETIC_REVIEWER", reviewedAt: now.toISOString(), rates: review, fxAndFees: review, privacy: review, totalEnvelope: review },
    pilotContext: { authorityId: PERSONAL_MODEL_AUTHORITY, expiresAt: expiry }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_ENVELOPE", reviewedAt: now.toISOString(),
      nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "SYNTHETIC_NOT_PROVIDER_CERTIFICATION", effectiveAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (options.privacyLifetimeMs ?? 600000)).toISOString(), endpointKey: rate.providerEndpoint,
      intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated",
      privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: `setup-route-${randomUUID()}`, version, residency: ["synthetic-region"], maxInputTokens: 32768 },
    policy: { id: `setup-policy-${randomUUID()}`, version },
    ...(options.answer ? { answer: {
      operatorReview: { reviewerRef: "SYNTHETIC_ANSWER_REVIEWER", reviewedAt: now.toISOString(),
        compatibility: review, privacy: review, promptAndOutputContract: review },
      privacyEvidence: { adapterKey: "openrouter-personal-answer-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
        certificationOwner: "SYNTHETIC_NOT_PROVIDER_CERTIFICATION", effectiveAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + (options.privacyLifetimeMs ?? 600000)).toISOString(), endpointKey: rate.providerEndpoint,
        intermediary: "openrouter", modelKey: "openrouter/auto", operationTypes: ["personal_answer_candidate_v1"], pathKind: "gateway_mediated",
        privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
      route: { id: `setup-answer-route-${randomUUID()}`, version, residency: ["synthetic-region"], maxInputTokens: 32768 },
      policy: { id: `setup-answer-policy-${randomUUID()}`, version },
    } } : {}),
  };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration }, now);
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("SYNTHETIC_SETUP_FIXTURE_INVALID");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: randomUUID(), expectedHead: "a".repeat(40),
    expectedSchemaCatalogSha256: "b".repeat(64), authorityId: PERSONAL_MODEL_AUTHORITY, pilotExpiresAt: expiry,
    workspaceId, ownerUserId: user.id, artifact };
  const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId, provider: "openrouter" } } });
  expect(account.credentialRef).toBeNull(); expect(account.status).not.toBe("connected");
  expect(await prisma.constructionConnectorCredential.count({ where: { connectorAccountId: account.id } })).toBe(0);
  expect(await prisma.modelGatewayRouteProfile.count({ where: { id: configuration.route.id } })).toBe(0);
  expect(await prisma.modelGatewayPolicyVersion.count({ where: { id: configuration.policy.id } })).toBe(0);
  return { owner, env, manifest, accountId: account.id, apiKey: `synthetic_test_only_${randomUUID().replaceAll("-", "")}` };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function context(f: Fixture) {
  return { expectedHead: f.manifest.expectedHead, expectedSchemaCatalogSha256: f.manifest.expectedSchemaCatalogSha256,
    expectedManifestHash: inspectPersonalModelSetupManifest(f.manifest).manifestHash,
    expectedArtifactHash: f.manifest.artifact.artifactHash, deadlineAt: Date.now() + 15000, monotoneDeadlineAt: performance.now() + 15000 };
}
async function transaction<T>(work: (tx: Tx) => Promise<T>, timezone = "UTC") {
  return native(async tx => { await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone); return work(tx); }, txOptions);
}
const publish = (f: Fixture, timezone = "UTC") => {
  const original = context(f); return transaction(tx => apply(tx, f.manifest, f.apiKey, f.env, original), timezone);
};
const historical = (f: Fixture) => {
  const original = context(f); return transaction(tx => reconcile(tx, f.manifest, { NODE_ENV: "test" }, original));
};
async function rows(f: Fixture) {
  const answer = f.manifest.artifact.status === "PREPARED_NOT_PUBLISHED" && "answerSetup" in f.manifest.artifact
    ? f.manifest.artifact.answerSetup as undefined | { draftRoute: { id: string }; draftPolicy: { id: string } } : undefined;
  return {
    route: await prisma.modelGatewayRouteProfile.findUnique({ where: { id: f.manifest.artifact.draftRoute.id } }),
    policy: await prisma.modelGatewayPolicyVersion.findUnique({ where: { id: f.manifest.artifact.draftPolicy.id } }),
    answerRoute: answer ? await prisma.modelGatewayRouteProfile.findUnique({ where: { id: answer.draftRoute.id } }) : null,
    answerPolicy: answer ? await prisma.modelGatewayPolicyVersion.findUnique({ where: { id: answer.draftPolicy.id } }) : null,
    account: await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: f.accountId } }),
    credentials: await prisma.constructionConnectorCredential.findMany({ where: { connectorAccountId: f.accountId }, orderBy: { id: "asc" } }),
    grants: await prisma.constructionConnectorGrant.findMany({ where: { connectorAccountId: f.accountId }, orderBy: { id: "asc" } }),
    holds: await prisma.accountProviderSpendHold.findMany({ orderBy: { id: "asc" } }),
    operations: await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.owner.workspaceId }, orderBy: { id: "asc" } }),
  };
}

// Each injected failure follows the REAL delegate write, inside the caller's
// outer transaction. SQL, database state and row counts are never mocked.
function afterRealWrite(tx: Tx, delegate: string, method: string, done: () => never): Tx {
  return new Proxy(tx, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (key !== delegate) return typeof value === "function" ? value.bind(target) : value;
    return new Proxy(value, { get(object, name) {
      const fn = Reflect.get(object, name);
      if (name !== method) return typeof fn === "function" ? fn.bind(object) : fn;
      return async (...args: unknown[]) => { await Reflect.apply(fn, object, args); return done(); };
    } });
  } });
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
async function blockedBy(pid: number, blocker: number) {
  for (let i = 0; i < 100; i++) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ blocked: boolean }>>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked", pid, blocker);
    if (row.blocked) return true;
    await prisma.$queryRawUnsafe("SELECT pg_sleep(0.01)::text");
  }
  return false;
}

describe("Stage A operator setup — real disposable PostgreSQL, synthetic reviews and credentials only", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("atomically maps published history and encrypted initial credential in %s", async timezone => {
    const f = await fixture(), before = await rows(f), started = await dbNow();
    const result = await publish(f, timezone), after = await rows(f), finished = await dbNow();
    expect(result).toMatchObject({ status: "SETUP_PREPARED_NOT_COMMITTED", committed: false, setupId: f.manifest.setupId,
      executionAuthorized: false, providerVerified: false, consentCreated: false, runtimeActivated: false, budgetAvailabilityVerified: false });
    const route = f.manifest.artifact.draftRoute, policy = f.manifest.artifact.draftPolicy;
    for (const key of ["id", "routeKey", "version", "pathKind", "adapterKey", "billingProvider", "intermediary", "endpointKey", "modelKey",
      "operationTypes", "allowedDataClasses", "privacyPosture", "residency", "pricingEvidence", "privacyEvidence", "maxInputTokens", "maxOutputTokens", "canonicalHash", "createdBy"] as const)
      expect(after.route?.[key]).toEqual(route[key]);
    for (const key of ["id", "policyKey", "version", "operationType", "routeOrder", "fallbackRules", "maxAttempts", "requiredPrivacyPosture", "canonicalHash", "createdBy"] as const)
      expect(after.policy?.[key]).toEqual(policy[key]);
    expect(after.policy?.maxTotalCostMicros).toBe(BigInt(policy.maxTotalCostMicros));
    expect(after.route?.status).toBe("published"); expect(after.policy?.status).toBe("published");
    expect(after.route?.publishedAt).toEqual(after.policy?.publishedAt);
    expect(after.route!.publishedAt!.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1);
    expect(after.route!.publishedAt!.getTime()).toBeLessThanOrEqual(finished.getTime());
    expect(after.route!.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1);
    expect(after.route!.createdAt.getTime()).toBeLessThanOrEqual(finished.getTime());
    expect(after.credentials).toHaveLength(1); const credential = after.credentials[0];
    expect(credential.id).toBe(f.manifest.setupId); expect(credential.workspaceId).toBe(f.owner.workspaceId);
    expect(credential.ciphertext.startsWith("v1.")).toBe(true); expect(credential.ciphertext.includes(f.apiKey)).toBe(false);
    const key = requireConnectorKey(f.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
    try {
      const decrypted = JSON.parse(openConnectorSecret(credential.ciphertext,
        JSON.stringify([f.owner.workspaceId, f.accountId, `openrouter-api-key:${f.manifest.setupId}`]), key));
      expect(digest(decrypted.apiKey) === digest(f.apiKey)).toBe(true);
      expect(() => openConnectorSecret(credential.ciphertext, JSON.stringify(["wrong-workspace", f.accountId, `openrouter-api-key:${f.manifest.setupId}`]), key)).toThrow("CONNECTOR_SECRET_UNAVAILABLE");
    } finally { key.fill(0); }
    expect(after.account.credentialRef).toBe(credential.id); expect(after.account.status).toBe("connected");
    expect(after.grants).toEqual(before.grants); expect(after.holds).toEqual(before.holds); expect(after.operations).toEqual(before.operations);
    await transaction(async tx => {
      expect(await loadGatewayPolicySnapshot(policy.id, tx)).toMatchObject({ id: policy.id, canonicalHash: policy.canonicalHash, maxTotalCostMicros: BigInt(policy.maxTotalCostMicros) });
      expect((await loadGatewayRouteSnapshots(tx)).find(r => r.id === route.id)).toMatchObject({ canonicalHash: route.canonicalHash, privacyEvidence: route.privacyEvidence });
    }, timezone);
    expect(JSON.stringify(result).includes(f.apiKey)).toBe(false);
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED", currentEligibilityVerified: false });
    expect(await rows(f)).toEqual(after);
  });

  it("publishes the separately reviewed answer route and policy in the same transaction", async () => {
    const f = await fixture({ answer: true }), before = await rows(f);
    expect(before.answerRoute).toBeNull(); expect(before.answerPolicy).toBeNull();
    await publish(f);
    const after = await rows(f), setup = f.manifest.artifact.answerSetup as undefined | {
      draftRoute: { canonicalHash: string }; draftPolicy: { canonicalHash: string } };
    expect(setup).toBeDefined();
    expect(after.answerRoute).toMatchObject({ routeKey: "personal-answer-openrouter-v1", adapterKey: "openrouter-personal-answer-candidate",
      modelKey: "openrouter/auto", operationTypes: ["personal_answer_candidate_v1"], canonicalHash: setup!.draftRoute.canonicalHash, status: "published" });
    expect(after.answerPolicy).toMatchObject({ policyKey: "personal-answer-v1", operationType: "personal_answer_candidate_v1",
      canonicalHash: setup!.draftPolicy.canonicalHash, status: "published" });
    expect(after.answerRoute).not.toHaveProperty("reviewedHashes"); expect(after.answerPolicy).not.toHaveProperty("routeHash");
    expect(after.answerRoute?.publishedAt).toEqual(after.route?.publishedAt);
    expect(after.answerPolicy?.publishedAt).toEqual(after.policy?.publishedAt);
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED" });
  });

  it.each([["constructionConnectorCredential", "create"], ["constructionConnectorAccount", "update"],
    ["modelGatewayRouteProfile", "create"], ["modelGatewayPolicyVersion", "create"]])("outer rollback after real %s.%s preserves all initial rows", async (delegate, method) => {
    const f = await fixture(), before = await rows(f), original = context(f); let reached = false;
    await expect(transaction(tx => apply(afterRealWrite(tx, delegate, method, () => { reached = true; throw new Error("SYNTHETIC_AFTER_REAL_WRITE"); }),
      f.manifest, f.apiKey, f.env, original))).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(reached).toBe(true); expect(await rows(f)).toEqual(before);
  });

  it("caller rollback after provisional success is not a committed setup", async () => {
    const f = await fixture(), before = await rows(f); let reached = false;
    await expect(transaction(async tx => { const value = await apply(tx, f.manifest, f.apiKey, f.env, context(f));
      expect(value.committed).toBe(false); reached = true; throw new Error("SYNTHETIC_OUTER_ROLLBACK"); })).rejects.toThrow("SYNTHETIC_OUTER_ROLLBACK");
    expect(reached).toBe(true); expect(await rows(f)).toEqual(before);
    await expect(historical(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
  });

  it.each(["no-consent", "unverified", "admin-only", "cross-account", "disconnected"])("refuses %s without setup writes", async mutation => {
    const f = await fixture({ consent: mutation !== "no-consent" });
    if (mutation === "unverified") await prisma.user.update({ where: { id: f.owner.userId }, data: { emailVerified: false } });
    if (mutation === "admin-only") await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: f.owner }, data: { role: "admin" } });
    if (mutation === "cross-account") {
      const other = await prisma.user.create({ data: { email: `other-${randomUUID()}@example.invalid`, name: "Synthetic other", role: "CLIENT", emailVerified: true } });
      await prisma.constructionConnectorAccount.update({ where: { id: f.accountId }, data: { createdByUserId: other.id } });
    }
    if (mutation === "disconnected") await disconnectPersonalModelConnection(f.owner);
    const before = await rows(f); await expect(publish(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(before);
  });

  it("refuses a root client and a real ReadCommitted transaction", async () => {
    const f = await fixture(), before = await rows(f);
    await expect(apply(prisma as unknown as Tx, f.manifest, f.apiKey, f.env, context(f))).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    await expect(native(tx => apply(tx, f.manifest, f.apiKey, f.env, context(f)), { isolationLevel: "ReadCommitted" })).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(before);
  });

  it("initial setup refuses even a revoked historical credential; never reconnects or rotates", async () => {
    const f = await fixture();
    await prisma.constructionConnectorCredential.create({ data: { connectorAccountId: f.accountId, workspaceId: f.owner.workspaceId,
      ciphertext: "revoked", revokedAt: await dbNow() } });
    const before = await rows(f); expect(before.account.credentialRef).toBeNull();
    await expect(publish(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(before);
  });

  it("original caller abort and expired deadline refuse with no writes", async () => {
    const f = await fixture(), before = await rows(f), abort = new AbortController(); abort.abort();
    await expect(transaction(tx => apply(tx, f.manifest, f.apiKey, f.env, { ...context(f), signal: abort.signal }))).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    await expect(transaction(tx => apply(tx, f.manifest, f.apiKey, f.env, { ...context(f), deadlineAt: Date.now() - 1 }))).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(before);
  });

  it.each(["route-id", "route-version", "route-hash", "policy-only"])("refuses partial/colliding %s; no adoption", async collision => {
    const f = await fixture(), mapped = inspectPersonalModelSetupManifest(f.manifest);
    if (collision === "policy-only") await prisma.modelGatewayPolicyVersion.create({ data: { ...mapped.policy, status: "draft" } });
    else await prisma.modelGatewayRouteProfile.create({ data: { ...mapped.route, status: "draft",
      pricingEvidence: mapped.route.pricingEvidence as Prisma.InputJsonObject, privacyEvidence: mapped.route.privacyEvidence as Prisma.InputJsonObject,
      ...(collision === "route-id" ? { version: ++sequence, canonicalHash: `sha256:${digest(randomUUID())}` } : {}),
      ...(collision === "route-version" ? { id: `different-${randomUUID()}`, canonicalHash: `sha256:${digest(randomUUID())}` } : {}),
      ...(collision === "route-hash" ? { id: `different-${randomUUID()}`, version: ++sequence } : {}) } });
    const before = await rows(f); await expect(publish(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(before);
  });

  it("write replay refuses; discarded committed receipt reconciles read-only without replacement key", async () => {
    const f = await fixture(); await publish(f); const before = await rows(f);
    f.apiKey = `synthetic_replacement_${randomUUID().replaceAll("-", "")}`;
    await expect(publish(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED", executionAuthorized: false, currentEligibilityVerified: false });
    expect(await rows(f)).toEqual(before);
  });

  it("injected acknowledgement failure AFTER actual commit keeps rows for historical reconciliation", async () => {
    const f = await fixture(); let committed = false;
    // Local caller fault only, not a claim to simulate a lost network packet or
    // an indeterminate PostgreSQL COMMIT. The actual transaction completes first.
    const caller = async () => { await publish(f); committed = true; throw new Error("SYNTHETIC_COMMIT_ACK_NOT_DELIVERED"); };
    await expect(caller()).rejects.toThrow("SYNTHETIC_COMMIT_ACK_NOT_DELIVERED"); expect(committed).toBe(true);
    const before = await rows(f); expect(before.credentials).toHaveLength(1);
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED" }); expect(await rows(f)).toEqual(before);
  });

  it("published route and policy decisions remain immutable", async () => {
    const f = await fixture(); await publish(f); const before = await rows(f);
    await expect(prisma.modelGatewayRouteProfile.update({ where: { id: before.route!.id }, data: { endpointKey: "changed" } })).rejects.toThrow("published ModelGatewayRouteProfile is immutable");
    await expect(prisma.modelGatewayPolicyVersion.update({ where: { id: before.policy!.id }, data: { maxAttempts: 2 } })).rejects.toThrow("published ModelGatewayPolicyVersion is immutable");
    expect(await rows(f)).toEqual(before);
  });

  it("history uses publication time after real privacy expiry and disconnect, without key or fresh authority", async () => {
    const f = await fixture({ privacyLifetimeMs: 8000 }); await publish(f);
    const until = Date.parse((f.manifest.artifact.configuration.privacyEvidence as Record<string, unknown>).expiresAt as string);
    for (let i = 0; i < 100 && (await dbNow()).getTime() < until; i++) await prisma.$queryRawUnsafe("SELECT pg_sleep(0.1)::text");
    expect((await dbNow()).getTime()).toBeGreaterThanOrEqual(until);
    expect(validatePersonalModelOperatorArtifact(f.manifest.artifact, await dbNow()).status).toBe("INCOMPLETE");
    await disconnectPersonalModelConnection(f.owner); const before = await rows(f);
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED", currentEligibilityVerified: false });
    expect(await rows(f)).toEqual(before);
    await prisma.user.update({ where: { id: f.owner.userId }, data: { emailVerified: false } });
    const revokedOwner = await rows(f); await expect(historical(f)).rejects.toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(await rows(f)).toEqual(revokedOwner);
  }, 15000);

  it("two backend setup calls contend on the real namespace, commit one tuple set, never rotate", async () => {
    const f = await fixture(), ready = deferred(), release = deferred(), secondReady = deferred();
    let pid1 = 0, pid2 = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ready.resolve(); secondReady.resolve(); release.resolve(); }, 4000);
    const first = outcome(transaction(async tx => {
      [{ pid: pid1 }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
      const value = await apply(tx, f.manifest, f.apiKey, f.env, context(f)); ready.resolve(); await release.promise; return value;
    }));
    let second: ReturnType<typeof outcome<Awaited<ReturnType<typeof publish>> >> | undefined;
    try {
      await ready.promise;
      second = outcome(transaction(async tx => {
        [{ pid: pid2 }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); secondReady.resolve();
        return apply(tx, f.manifest, f.apiKey, f.env, context(f));
      }));
      await secondReady.promise; expect(pid1).not.toBe(pid2); expect(await blockedBy(pid2, pid1)).toBe(true); expect(timedOut).toBe(false);
    } finally { clearTimeout(timer); release.resolve(); await Promise.all([first, second]); }
    expect((await first).ok).toBe(true); expect((await second!).ok).toBe(false);
    const after = await rows(f); expect(after.credentials).toHaveLength(1); expect(after.credentials[0].id).toBe(f.manifest.setupId);
    expect(after.route?.status).toBe("published"); expect(after.policy?.status).toBe("published");
  });

  it("setup/disconnect overlap uses two real backends; committed history survives and no retry is invented", async () => {
    const f = await fixture(), ready = deferred(), release = deferred(), disconnectReady = deferred();
    let pid1 = 0, pid2 = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ready.resolve(); disconnectReady.resolve(); release.resolve(); }, 4000);
    const first = outcome(transaction(async tx => {
      [{ pid: pid1 }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
      const value = await apply(tx, f.manifest, f.apiKey, f.env, context(f)); ready.resolve(); await release.promise; return value;
    }));
    let disconnect: ReturnType<typeof outcome<Awaited<ReturnType<typeof disconnectPersonalModelConnection>> >> | undefined;
    let restore = () => {};
    try {
      await ready.promise;
      // Delegate the actual legacy disconnect callback to real Prisma; only
      // observe its backend before work. No account/grant SQL is replaced.
      const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Tx) => Promise<unknown>) => native(async tx => {
        [{ pid: pid2 }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); disconnectReady.resolve();
        return work(tx);
      }, txOptions)) as typeof prisma.$transaction);
      restore = () => spy.mockRestore();
      disconnect = outcome(disconnectPersonalModelConnection(f.owner));
      await disconnectReady.promise; expect(pid1).not.toBe(pid2); expect(await blockedBy(pid2, pid1)).toBe(true); expect(timedOut).toBe(false);
    } finally { clearTimeout(timer); release.resolve(); await Promise.all([first, disconnect]); restore(); }
    expect((await first).ok).toBe(true);
    const after = await rows(f); expect(after.credentials).toHaveLength(1);
    if ((await disconnect!).ok) {
      expect(after.account.status).toBe("revoked"); expect(after.account.credentialRef).toBeNull();
      expect(after.credentials[0].ciphertext).toBe("revoked"); expect(after.grants.every(g => g.status === "revoked")).toBe(true);
    } else {
      const result = await disconnect!;
      if (result.ok) throw new Error("UNREACHABLE");
      expect(result.error).toMatchObject({ code: "P2034" });
      expect(after.account.status).toBe("connected"); expect(after.grants.every(g => g.status === "active")).toBe(true);
    }
    expect(await historical(f)).toMatchObject({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED" }); expect(await rows(f)).toEqual(after);
  });
});
