import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { preparePersonalModelConnection, consentPersonalModelConnection, disconnectPersonalModelConnection, PERSONAL_MODEL_CONSENT_VERSION } from "@/server/personal-assistant/model-connection";
import { preparePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";
import { applyPersonalModelOperatorIngress as apply, readPersonalModelOperatorIngress as read,
  assertPersonalModelOperatorIngressPublication as publication } from "@/server/model-gateway/personal-intent/operator-ingress";
import { inspectPersonalModelIngressConfiguration, inspectPersonalModelSetupClaim, inspectPersonalModelSetupApplied,
  PERSONAL_MODEL_INGRESS_TARGET } from "@/server/model-gateway/personal-intent/operator-ingress-contract";
import { openConnectorSecret, requireConnectorKey } from "@/server/personal-assistant/credential-cipher";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { readPersonalModelOperatorFormView as readForm } from "@/server/model-gateway/personal-intent/operator-form";

// This test-only module injection exports an ACTUAL PrismaClient, with its
// datasource explicitly pinned before any synthetic profile env is installed.
// Duplicate the tiny disposable guard here because importing personal-model.fixture
// inside this hoisted factory would cycle through that fixture's @/lib/db import.
const localConnection = vi.hoisted(() => {
  const datasourceUrl = process.env.DATABASE_URL;
  const url = new URL(datasourceUrl ?? "http://invalid");
  const database = process.env.ENDVERA_210_DATABASE_NAME ?? "";
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname)
    || !/^endvera_personal_210_[a-f0-9]{32}$/.test(database) || url.pathname !== `/${database}`
    || process.env.DIRECT_URL !== datasourceUrl || !url.port || !url.username || !url.password) {
    throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
  }
  return { datasourceUrl: datasourceUrl!, database, port: Number(url.port), session: vi.fn() };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma-client");
  return { prisma: new PrismaClient({ datasourceUrl: localConnection.datasourceUrl }) };
});
vi.mock("@/lib/authz", () => ({ getSessionUser: localConnection.session }));

requirePersonalDisposableDatabase();
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); localConnection.session.mockReset(); });
afterAll(() => prisma.$disconnect());
type Tx = Prisma.TransactionClient;
const native = prisma.$transaction.bind(prisma);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let sequence = randomBytes(4).readUInt32LE() % 1_000_000_000;
const iso = (time: number) => new Date(time).toISOString();
async function now() {
  const [row] = await prisma.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
  return row.now;
}
function context() { return { deadlineAt: Date.now() + 15000, monotoneDeadlineAt: performance.now() + 15000 }; }

// Actual Prisma is explicitly pinned to the harness' guarded LOOPBACK datasource.
// The supplied env below contains ONLY synthetic fixed-profile URL strings for
// the B2 shape validator. B2 passes it separately; it never selects a connection.
// Thus B2 proves local SQL/orchestration, NOT remote endpoint/TLS binding.
// B4 cases below temporarily install only synthetic profile fields; the explicit
// datasourceUrl above, never those fields, selects the actual local connection.
async function fixture(options: { consent?: boolean; windowMs?: number } = {}) {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { name: "Synthetic ingress owner", role: "CLIENT", emailVerified: true,
    email: `ingress-${randomUUID()}@example.invalid` } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic initial ingress" });
  const owner = { userId: user.id, workspaceId };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false",
    ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "DISABLED",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DATABASE_URL: `postgresql://neondb_owner:synthetic_unused@${PERSONAL_MODEL_INGRESS_TARGET.pooledHostname}/neondb?sslmode=require`,
    DIRECT_URL: `postgresql://neondb_owner:synthetic_unused@${PERSONAL_MODEL_INGRESS_TARGET.directHostname}/neondb?sslmode=require` };
  await preparePersonalModelConnection(owner);
  if (options.consent !== false) await consentPersonalModelConnection({ ...owner, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env);
  const current = (await now()).getTime(), version = ++sequence, end = current + (options.windowMs ?? 600000);
  const doc = { reviewRef: "SYNTHETIC_NOT_VERIFIED", contentHash: `sha256:${hash(randomUUID())}` };
  const rate = { authorityId: env.ENDVERA_EXTERNAL_AUTHORITY_REF, model: "synthetic/not-a-model", providerEndpoint: "synthetic/not-a-provider",
    reviewedAt: iso(current), totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000,
    outputUsdMicrosPerMillionTokens: 2000000, additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000,
    headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "SYNTHETIC_REVIEWER", reviewedAt: iso(current), rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: env.ENDVERA_EXTERNAL_AUTHORITY_REF, expiresAt: env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: env.ENDVERA_EXTERNAL_AUTHORITY_REF, reviewRef: "SYNTHETIC_ENVELOPE", reviewedAt: iso(current),
      nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "SYNTHETIC_NOT_CERTIFIED", effectiveAt: iso(current), expiresAt: iso(end), endpointKey: rate.providerEndpoint,
      intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated",
      privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: `ingress-route-${randomUUID()}`, version, residency: ["synthetic-region"], maxInputTokens: 32768 },
    policy: { id: `ingress-policy-${randomUUID()}`, version },
  } }, new Date(current));
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("INVALID_SYNTHETIC_INGRESS_FIXTURE");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: randomUUID(), expectedHead: "a".repeat(40),
    expectedSchemaCatalogSha256: "b".repeat(64), authorityId: env.ENDVERA_EXTERNAL_AUTHORITY_REF,
    pilotExpiresAt: env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT, workspaceId, ownerUserId: user.id, artifact };
  const manifestUtf8 = JSON.stringify(manifest);
  const configuration = { version: "personal-model-operator-ingress-configuration-v1", mode: "ENABLED", setupRef: manifest.setupId,
    notBefore: iso(current), expiresAt: iso(end), manifestUtf8, manifestSha256: hash(manifestUtf8), expectedSourceHead: manifest.expectedHead,
    expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256, controllerReceiptRef: "SYNTHETIC_NOT_DEPLOYMENT_ATTESTATION", targetProfile: "PERSONAL_PILOT" };
  env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION = JSON.stringify(configuration);
  inspectPersonalModelIngressConfiguration(env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION);
  const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId, provider: "openrouter" } } });
  expect(account.credentialRef).toBeNull();
  const input = { actor: { userId: user.id, role: "CLIENT", emailVerified: true }, setupRef: manifest.setupId,
    apiKey: `synthetic_only_${randomUUID().replaceAll("-", "")}` };
  return { owner, accountId: account.id, env, input, manifest, configuration,
    apply: () => apply(input, env, context()), read: () => read({ actor: input.actor, setupRef: input.setupRef }, env, context()) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function rows(f: Fixture) {
  return { events: await prisma.constructionAuditEvent.findMany({ where: { entityType: "personal_model_operator_setup", entityId: f.input.setupRef }, orderBy: { id: "asc" } }),
    route: await prisma.modelGatewayRouteProfile.findUnique({ where: { id: f.manifest.artifact.draftRoute.id } }),
    policy: await prisma.modelGatewayPolicyVersion.findUnique({ where: { id: f.manifest.artifact.draftPolicy.id } }),
    account: await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: f.accountId } }),
    credentials: await prisma.constructionConnectorCredential.findMany({ where: { connectorAccountId: f.accountId }, orderBy: { id: "asc" } }),
    grants: await prisma.constructionConnectorGrant.findMany({ where: { connectorAccountId: f.accountId }, orderBy: { id: "asc" } }),
    holds: await prisma.accountProviderSpendHold.findMany({ orderBy: { id: "asc" } }) };
}
function insertedEvent(row: Awaited<ReturnType<typeof rows>>["events"][number]) {
  return { id: row.id, workspaceId: row.workspaceId, actorUserId: row.actorUserId, entityType: row.entityType,
    entityId: row.entityId, action: row.action, fingerprint: row.fingerprint, metadata: row.metadata };
}
type TxOptions = { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number };
function transactions(options: { timezone?: string; transform?: (tx: Tx, call: number) => Tx; afterCommit?: (call: number) => Promise<void> | void } = {}) {
  const observed = { calls: 0, commits: 0, pids: [] as number[] };
  vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Tx) => Promise<unknown>, txOptions: TxOptions) => {
    const call = ++observed.calls;
    const value = await native(async tx => {
      const [pid] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); observed.pids[call - 1] = pid.pid;
      await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", options.timezone ?? "UTC");
      return work(options.transform?.(tx, call) ?? tx);
    }, txOptions);
    observed.commits++; await options.afterCommit?.(call); return value;
  }) as typeof prisma.$transaction);
  return observed;
}
function afterWrite(tx: Tx, delegate: string, method: string, callback: (data: Record<string, unknown>) => Promise<void> | void): Tx {
  return new Proxy(tx, { get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (property !== delegate) return typeof value === "function" ? value.bind(target) : value;
    return new Proxy(value, { get(object, name) {
      const fn = Reflect.get(object, name);
      if (name !== method) return typeof fn === "function" ? fn.bind(object) : fn;
      return async (args: { data: Record<string, unknown> }) => { const result = await Reflect.apply(fn, object, [args]); await callback(args.data); return result; };
    } });
  } });
}
const outcome = <T>(p: Promise<T>) => p.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function blocked(pid: number, blocker: number) {
  for (let n = 0; n < 50; n++) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ blocked: boolean }>>("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked", pid, blocker);
    if (row.blocked) return true;
    await prisma.$queryRawUnsafe("SELECT pg_sleep(0.01)::text");
  }
  return false;
}

describe("B2 real local PostgreSQL transactions; synthetic configuration/reviews/key/session only", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("persists complete claim + exact core/applied tuple in %s", async timezone => {
    const f = await fixture(), before = await rows(f), calls = transactions({ timezone });
    const receipt = await f.apply(), after = await rows(f);
    expect(calls.calls).toBe(2); expect(calls.commits).toBe(2);
    expect(receipt.status).toBe("APPLIED_NOT_ACTIVATED"); expect(() => publication(receipt)).not.toThrow();
    expect(() => publication({ ...receipt })).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(after.events).toHaveLength(2); expect(after.credentials).toHaveLength(1);
    const claimRow = after.events.find(e => e.action === "personal_model_setup_claimed_v1")!;
    const appliedRow = after.events.find(e => e.action === "personal_model_setup_applied_v1")!;
    const claim = inspectPersonalModelSetupClaim(f.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION, insertedEvent(claimRow));
    const applied = inspectPersonalModelSetupApplied(f.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION, claim, insertedEvent(appliedRow));
    expect(claim.metadata.manifestUtf8).toBe(f.configuration.manifestUtf8);
    expect(applied.metadata.receipt).toEqual(receipt);
    expect(receipt.publishedAt).toBe(after.route!.publishedAt!.toISOString());
    expect(after.policy!.publishedAt).toEqual(after.route!.publishedAt);
    expect(after.account.credentialRef).toBe(f.input.setupRef); expect(after.account.status).toBe("connected");
    expect(after.grants).toEqual(before.grants); expect(after.holds).toEqual(before.holds);
    const key = requireConnectorKey(f.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
    try {
      const decrypted = JSON.parse(openConnectorSecret(after.credentials[0].ciphertext,
        JSON.stringify([f.owner.workspaceId, f.accountId, `openrouter-api-key:${f.input.setupRef}`]), key));
      expect(hash(decrypted.apiKey) === hash(f.input.apiKey)).toBe(true);
    } finally { key.fill(0); }
    expect(JSON.stringify(after.events).includes(f.input.apiKey)).toBe(false);
    expect(await f.read()).toEqual(receipt); expect(await rows(f)).toEqual(after);
  });

  it.each([1, 2])("local acknowledgement fault AFTER real TX%d commit is never retried", async lose => {
    const f = await fixture(), calls = transactions({ afterCommit: call => { if (call === lose) throw new Error("SYNTHETIC_ACK_NOT_DELIVERED_AFTER_KNOWN_DB_COMMIT"); } });
    // A deterministic local fault after native() resolves, not simulated network
    // packet loss or proof of PostgreSQL's truly indeterminate COMMIT behavior.
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    const after = await rows(f); expect(calls.calls).toBe(lose); expect(calls.commits).toBe(lose);
    expect(after.events).toHaveLength(lose); expect(after.credentials).toHaveLength(lose === 1 ? 0 : 1);
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(await rows(f)).toEqual(after);
    if (lose === 1) await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    else expect(await f.read()).toMatchObject({ status: "APPLIED_NOT_ACTIVATED", automaticRetry: false });
    expect(await rows(f)).toEqual(after);
  });

  it.each(["credential", "account", "route", "policy", "applied"])("rollback after real %s write preserves claim but none of TX2", async stage => {
    const f = await fixture(), before = await rows(f); let reached = false;
    const delegate = stage === "credential" ? "constructionConnectorCredential" : stage === "account" ? "constructionConnectorAccount"
      : stage === "route" ? "modelGatewayRouteProfile" : stage === "policy" ? "modelGatewayPolicyVersion" : "constructionAuditEvent";
    transactions({ transform: (tx, call) => call !== 2 ? tx : afterWrite(tx, delegate, stage === "account" ? "update" : "create", () => { reached = true; throw new Error("SYNTHETIC_AFTER_REAL_TX2_WRITE"); }) });
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(reached).toBe(true);
    const after = await rows(f); expect(after.events).toHaveLength(1); expect(after.events[0].action).toBe("personal_model_setup_claimed_v1");
    expect(after.route).toBeNull(); expect(after.policy).toBeNull(); expect(after.credentials).toEqual(before.credentials);
    expect(after.account).toEqual(before.account); expect(after.grants).toEqual(before.grants); expect(after.holds).toEqual(before.holds);
    await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(await rows(f)).toEqual(after);
  });

  it.each(["no-consent", "unverified-owner", "admin-member"])("refuses %s before the durable claim", async kind => {
    const f = await fixture({ consent: kind !== "no-consent" });
    if (kind === "unverified-owner") await prisma.user.update({ where: { id: f.owner.userId }, data: { emailVerified: false } });
    if (kind === "admin-member") await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: f.owner }, data: { role: "admin" } });
    const before = await rows(f);
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(await rows(f)).toEqual(before);
  });

  it("abort after real claim commit consumes attempt and never starts TX2", async () => {
    const f = await fixture(), abort = new AbortController();
    const calls = transactions({ afterCommit: call => { if (call === 1) abort.abort(); } });
    await expect(apply(f.input, f.env, { ...context(), signal: abort.signal })).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(calls.calls).toBe(1); const after = await rows(f); expect(after.events).toHaveLength(1); expect(after.credentials).toHaveLength(0);
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(await rows(f)).toEqual(after);
  });

  it.each(["owner", "consent"])("persisted %s revocation after TX1 refuses TX2 and consumes the claim", async kind => {
    const f = await fixture(), before = await rows(f); let revoked = false;
    const calls = transactions({ afterCommit: async call => {
      if (call !== 1) return;
      // Independent autocommitted Prisma write after the actual claim commit;
      // no mocked authorization result and no uncommitted revocation snapshot.
      if (kind === "owner") {
        await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: f.owner }, data: { role: "admin" } });
        expect((await prisma.constructionWorkspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: f.owner } })).role).toBe("admin");
      } else {
        const grant = await prisma.constructionConnectorGrant.update({
          where: { connectorAccountId_capability: { connectorAccountId: f.accountId, capability: "personal_model_inference" } },
          data: { status: "revoked", grantedScopes: [], revokedAt: await now(), stateVersion: { increment: 1 } } });
        expect((await prisma.constructionConnectorGrant.findUniqueOrThrow({ where: { id: grant.id } })).status).toBe("revoked");
      }
      revoked = true;
    } });
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(revoked).toBe(true); expect(calls.calls).toBe(2); expect(calls.commits).toBe(1);
    const after = await rows(f);
    expect(after.events).toHaveLength(1); expect(after.events[0].action).toBe("personal_model_setup_claimed_v1");
    expect(after.credentials).toEqual(before.credentials); expect(after.account).toEqual(before.account);
    expect(after.route).toBeNull(); expect(after.policy).toBeNull(); expect(after.holds).toEqual(before.holds);
    if (kind === "owner") expect(after.grants).toEqual(before.grants);
    else { expect(after.grants).toHaveLength(1); expect(after.grants[0].status).toBe("revoked"); }
    // Restore only the synthetic authorization fixture to prove a fresh request
    // still cannot reuse the already committed claim or create a replacement key.
    if (kind === "owner") await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: f.owner }, data: { role: "owner" } });
    else await prisma.constructionConnectorGrant.update({ where: { id: before.grants[0].id }, data: {
      status: before.grants[0].status, grantedScopes: before.grants[0].grantedScopes, revokedAt: before.grants[0].revokedAt,
      stateVersion: { increment: 1 } } });
    const restored = await rows(f);
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(await rows(f)).toEqual(restored);
  });

  it("config byte change after real claim commit never starts TX2", async () => {
    const f = await fixture(), calls = transactions({ afterCommit: call => { if (call === 1) f.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION += " "; } });
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(calls.calls).toBe(1);
    const after = await rows(f); expect(after.events).toHaveLength(1); expect(after.credentials).toHaveLength(0);
    await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); expect(await rows(f)).toEqual(after);
  });

  it("two simultaneous real claim transactions contend by PK; only the inserter continues", async () => {
    const f = await fixture(), ready = deferred(), release = deferred(), secondStarted = deferred(); let timedOut = false;
    const calls = transactions({ transform: (tx, call) => {
      if (call === 2) secondStarted.resolve();
      return call === 1 ? afterWrite(tx, "constructionAuditEvent", "create", async () => { ready.resolve(); await release.promise; }) : tx;
    } });
    const timer = setTimeout(() => { timedOut = true; ready.resolve(); secondStarted.resolve(); release.resolve(); }, 1500);
    const first = outcome(f.apply()); let second: ReturnType<typeof outcome<Awaited<ReturnType<Fixture["apply"]>>>> | undefined;
    try {
      await ready.promise; second = outcome(f.apply()); await secondStarted.promise;
      expect(calls.pids[0]).not.toBe(calls.pids[1]); expect(await blocked(calls.pids[1], calls.pids[0])).toBe(true); expect(timedOut).toBe(false);
    } finally { clearTimeout(timer); release.resolve(); await Promise.all([first, second]); }
    expect((await first).ok).toBe(true); const other = await second!; expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toMatchObject({ message: "PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN" });
    const after = await rows(f); expect(after.events).toHaveLength(2); expect(after.credentials).toHaveLength(1);
    expect(after.route?.status).toBe("published"); expect(after.policy?.status).toBe("published");
  });

  it("real expiry then disconnect still permits read-only history, never current authority", async () => {
    const f = await fixture({ windowMs: 4000 }), receipt = await f.apply();
    const expiry = Date.parse(f.configuration.expiresAt);
    for (let n = 0; n < 60 && (await now()).getTime() < expiry; n++) await prisma.$queryRawUnsafe("SELECT pg_sleep(0.1)::text");
    expect((await now()).getTime()).toBeGreaterThanOrEqual(expiry);
    expect(() => publication(receipt)).toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    await disconnectPersonalModelConnection(f.owner); delete f.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY;
    const before = await rows(f); expect(await f.read()).toEqual(receipt); expect(await rows(f)).toEqual(before);
    await expect(f.apply()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); expect(await rows(f)).toEqual(before);
    await prisma.user.update({ where: { id: f.owner.userId }, data: { emailVerified: false } });
    await expect(f.read()).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED");
  }, 12000);
});

let localIdentityAddressObserved = false;
async function localIdentity() {
  const [row] = await prisma.$queryRawUnsafe<Array<{ database: string; address: string; rawAddress: string; port: number }>>(
    'SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_addr()::text AS "rawAddress",inet_server_port() AS port');
  if (!localIdentityAddressObserved) {
    localIdentityAddressObserved = true;
    // One bounded local address-only diagnostic. No URL, database credential,
    // environment dump or inferred cause before the controller's actual run.
    if (typeof row.address !== "string" || row.address.length > 64 || !/^[a-fA-F0-9:.]+$/.test(row.address)
      || typeof row.rawAddress !== "string" || row.rawAddress.length > 68 || !/^[a-fA-F0-9:./]+$/.test(row.rawAddress)) {
      throw new Error("LOCAL_NATIVE_ADDRESS_SHAPE_REFUSED");
    }
    console.log(JSON.stringify({ address: row.address, rawAddress: row.rawAddress }));
  }
  expect(row.database).toBe(localConnection.database); expect(row.port).toBe(localConnection.port);
  expect(["127.0.0.1", "::1"].includes(row.address)).toBe(true);
}
async function selectorEnvironment<T>(f: Fixture, work: () => Promise<T>) {
  requirePersonalDisposableDatabase(); await localIdentity();
  for (const name of ["ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", "DATABASE_URL", "DIRECT_URL", "ENDVERA_EXTERNAL_AUTHORITY_REF",
    "ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED"]) {
    vi.stubEnv(name, f.env[name]);
  }
  // Only the session seam is a business-logic mock. All selector SQL/delegates,
  // transactions and snapshots execute against the pinned real native client.
  localConnection.session.mockResolvedValue({ id: f.owner.userId, role: "CLIENT", emailVerified: true });
  try { return await work(); }
  finally {
    try { await localIdentity(); }
    finally { vi.unstubAllEnvs(); requirePersonalDisposableDatabase(); }
  }
}
describe("B4 selector real native SQL; session and fixed-profile env are synthetic", () => {
  it("OFF refuses before the session seam", async () => {
    requirePersonalDisposableDatabase(); await localIdentity();
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", undefined);
    try { expect(await readForm()).toEqual({ status: "UNAVAILABLE" }); expect(localConnection.session).not.toHaveBeenCalled(); }
    finally { vi.unstubAllEnvs(); requirePersonalDisposableDatabase(); await localIdentity(); }
  });
  it("real current owner and genuine synthetic grant yield minimal INPUT_AVAILABLE without writes", async () => {
    const f = await fixture(), before = await rows(f);
    const result = await selectorEnvironment(f, () => readForm());
    expect(result).toEqual({ status: "AVAILABLE", view: { version: "personal-model-operator-form-v1", setupRef: f.input.setupRef,
      provider: "openrouter", model: "synthetic/not-a-model", providerEndpoint: "synthetic/not-a-provider",
      purpose: "personal_intent_candidate_v1", expiresAt: f.configuration.expiresAt, state: "INPUT_AVAILABLE",
      executionAuthorized: false, providerVerified: false } });
    expect(await rows(f)).toEqual(before); expect(localConnection.session).toHaveBeenCalledTimes(1);
  });
  it("an actual consumed B2 claim yields HISTORY_ONLY with no credential or second attempt", async () => {
    const f = await fixture(), abort = new AbortController();
    const calls = transactions({ afterCommit: call => { if (call === 1) abort.abort(); } });
    await expect(apply(f.input, f.env, { ...context(), signal: abort.signal })).rejects.toThrow("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN");
    expect(calls.calls).toBe(1); expect(calls.commits).toBe(1); vi.restoreAllMocks();
    const before = await rows(f); expect(before.events).toHaveLength(1); expect(before.credentials).toHaveLength(0);
    expect(await selectorEnvironment(f, () => readForm())).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } });
    expect(await rows(f)).toEqual(before);
  });
  it("persisted owner-membership loss refuses despite the owner-shaped session", async () => {
    const f = await fixture();
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: f.owner }, data: { role: "admin" } });
    const before = await rows(f);
    expect(await selectorEnvironment(f, () => readForm())).toEqual({ status: "UNAVAILABLE" });
    expect(await rows(f)).toEqual(before);
  });
  it("real DB expiry changes INPUT_AVAILABLE to HISTORY_ONLY, no new consent or key", async () => {
    const f = await fixture({ windowMs: 2500 }), before = await rows(f);
    expect(await selectorEnvironment(f, () => readForm())).toMatchObject({ status: "AVAILABLE", view: { state: "INPUT_AVAILABLE" } });
    const expiry = Date.parse(f.configuration.expiresAt);
    for (let n = 0; n < 40 && (await now()).getTime() < expiry; n++) await prisma.$queryRawUnsafe("SELECT pg_sleep(0.1)::text");
    expect((await now()).getTime()).toBeGreaterThanOrEqual(expiry);
    expect(await selectorEnvironment(f, () => readForm())).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } });
    expect(await rows(f)).toEqual(before);
  }, 10000);
});
