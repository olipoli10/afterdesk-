import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPersonalModelOperatorFormView as read } from "../src/server/model-gateway/personal-intent/operator-form";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { PERSONAL_MODEL_INGRESS_TARGET as target } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";

const mocks = vi.hoisted(() => ({ session: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); mocks.session.mockReset(); mocks.transaction.mockReset(); });
const instant = Date.parse("2026-09-11T01:00:00.000Z"), iso = (ms: number) => new Date(ms).toISOString();
const setupRef = "12345678-1234-4234-8234-123456789abc";
function configuration() {
  const authority = "ENDVERA-PERSONAL-20260910-100CAD", pilotExpiresAt = "2026-10-10T01:18:26Z";
  const doc = { reviewRef: "synthetic-only", contentHash: `sha256:${"a".repeat(64)}` };
  const rate = { authorityId: authority, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: iso(instant),
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000, outputUsdMicrosPerMillionTokens: 2000000,
    additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000, headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "synthetic-reviewer", reviewedAt: iso(instant), rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: authority, expiresAt: pilotExpiresAt }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: authority, reviewRef: "synthetic", reviewedAt: iso(instant), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "synthetic-not-certified", effectiveAt: iso(instant), expiresAt: iso(instant + 600000),
      endpointKey: rate.providerEndpoint, intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"],
      pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: "synthetic-route", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 }, policy: { id: "synthetic-policy", version: 1 },
  } }, new Date(instant));
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("INVALID_SYNTHETIC_FIXTURE");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: setupRef, expectedHead: "a".repeat(40),
    expectedSchemaCatalogSha256: "b".repeat(64), authorityId: authority, pilotExpiresAt, workspaceId: "workspace", ownerUserId: "owner", artifact };
  const manifestUtf8 = JSON.stringify(manifest);
  return JSON.stringify({ version: "personal-model-operator-ingress-configuration-v1", mode: "ENABLED", setupRef,
    notBefore: iso(instant), expiresAt: iso(instant + 600000), manifestUtf8, manifestSha256: createHash("sha256").update(manifestUtf8).digest("hex"),
    expectedSourceHead: manifest.expectedHead, expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256,
    controllerReceiptRef: "synthetic-only", targetProfile: "PERSONAL_PILOT" });
}
// Real artifact and B1 parsing; SQL, session and commit are explicit unit mocks.
function fixture() {
  const wall = vi.spyOn(Date, "now").mockReturnValue(instant + 86400000);
  const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
  const config = configuration();
  for (const [key, value] of Object.entries({
    ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION: config,
    DATABASE_URL: `postgresql://neondb_owner:synthetic_password@${target.pooledHostname}/neondb?sslmode=require`,
    DIRECT_URL: `postgresql://neondb_owner:synthetic_password@${target.directHostname}/neondb?sslmode=require`,
    ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
  })) vi.stubEnv(key, value);
  const state = { owner: true, account: true, locked: true, events: [] as Array<{ id: string }>, prior: null as null | { id: string },
    db: instant, isolation: "serializable", commits: 0, hook: (_point: string) => { void _point; } };
  mocks.session.mockImplementation(async () => { state.hook("auth"); return { id: "owner", role: "CLIENT", emailVerified: true }; });
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      state.hook(sql.includes("clock_timestamp() AS now") ? "clock" : "query");
      if (sql === "SHOW transaction_isolation") return [{ transaction_isolation: state.isolation }];
      if (sql.includes("set_config")) return [];
      if (sql.includes('FROM "ConstructionWorkspace"')) return state.owner ? [{ id: "workspace" }] : [];
      if (sql.includes('SELECT a.id FROM "ConstructionConnectorAccount"')) return state.account ? [{ id: "account" }] : [];
      if (sql.includes('SELECT id FROM "ConstructionConnectorAccount"')) return state.locked ? [{ id: "account" }] : [];
      if (sql === "SELECT clock_timestamp() AS now") return [{ now: new Date(state.db) }];
      throw new Error("UNEXPECTED_SQL");
    }),
    constructionAuditEvent: { findMany: vi.fn(async () => { state.hook("events"); return structuredClone(state.events); }) },
    constructionConnectorCredential: { findFirst: vi.fn(async () => { state.hook("prior"); return structuredClone(state.prior); }) },
  };
  mocks.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => {
    const value = await callback(tx); state.commits++; state.hook("commit"); return value;
  });
  return { state, wall, mono, tx, config };
}
describe("B4 metadata selector only — no real session, DB or provider", () => {
  it("returns only a frozen minimal configured view with real B1 validation", async () => {
    const f = fixture();
    expect(await read()).toEqual({ status: "AVAILABLE", view: { version: "personal-model-operator-form-v1", setupRef,
      provider: "openrouter", model: "synthetic/model", providerEndpoint: "synthetic-endpoint", purpose: "personal_intent_candidate_v1",
      expiresAt: iso(instant + 600000), state: "INPUT_AVAILABLE", executionAuthorized: false, providerVerified: false } });
    const result = await read(); expect(Object.isFrozen(result)).toBe(true);
    if (result.status === "AVAILABLE") expect(Object.isFrozen(result.view)).toBe(true);
    expect(f.tx.constructionAuditEvent.findMany).toHaveBeenCalledWith({ where: { id: { in: [
      `personal-model-setup:v1:${setupRef}:claim`, `personal-model-setup:v1:${setupRef}:applied`,
    ] } }, select: { id: true }, take: 3 });
    expect(f.tx.constructionConnectorCredential.findFirst).toHaveBeenCalledWith({ where: { connectorAccountId: "account" }, select: { id: true } });
    expect(JSON.stringify(result)).not.toMatch(/manifest|workspace|owner|synthetic_password|credential|controllerReceipt|reviewRef/);
  });
  it.each([undefined, "{}", "not-json"])("bad/absent config %s refuses before auth", async config => {
    fixture(); vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", config);
    expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([null, { id: "owner", role: "ADMIN", emailVerified: true }, { id: "owner", role: "CLIENT", emailVerified: false }])("requires verified CLIENT session %#", async session => {
    fixture(); mocks.session.mockResolvedValue(session); expect(await read()).toEqual({ status: "AUTHENTICATION_REQUIRED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("foreign owner never reads the workspace", async () => {
    fixture(); mocks.session.mockResolvedValue({ id: "other", role: "CLIENT", emailVerified: true });
    expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["owner", "locked", "isolation"])("refuses missing DB invariant %s", async kind => {
    const f = fixture(); if (kind === "owner") f.state.owner = false; if (kind === "locked") f.state.locked = false;
    if (kind === "isolation") f.state.isolation = "read committed";
    expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(f.state.commits).toBe(0);
  });
  it.each(["claim", "applied", "consent", "prior", "expiry", "before-window", "engine", "transport", "authority", "pilot"])("%s leaves owned history without key input", async kind => {
    const f = fixture();
    if (kind === "claim" || kind === "applied") f.state.events = [{ id: `personal-model-setup:v1:${setupRef}:${kind}` }];
    if (kind === "consent") f.state.account = false;
    if (kind === "prior") f.state.prior = { id: "old-revoked-credential" };
    if (kind === "expiry") f.state.db += 600000;
    if (kind === "before-window") f.state.db--;
    if (kind === "engine") vi.stubEnv("ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "true");
    if (kind === "transport") vi.stubEnv("ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED", "true");
    if (kind === "authority") vi.stubEnv("ENDVERA_EXTERNAL_AUTHORITY_REF", "other");
    if (kind === "pilot") vi.stubEnv("ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "2027-01-01T00:00:00Z");
    expect(await read()).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } });
  });
  it.each(["host", "direct", "role", "database", "ssl", "extra", "duplicate"])("rejects B2 target %s mismatch before auth", async kind => {
    fixture(); const key = kind === "direct" ? "DIRECT_URL" : "DATABASE_URL";
    let value = process.env[key]!;
    if (kind === "host") value = value.replace(target.pooledHostname, "example.invalid");
    if (kind === "direct") value = process.env.DATABASE_URL!;
    if (kind === "role") value = value.replace("neondb_owner", "other");
    if (kind === "database") value = value.replace("/neondb?", "/other?");
    if (kind === "ssl") value = value.replace("require", "disable");
    if (kind === "extra") value += "&options=evil";
    if (kind === "duplicate") value += "&sslmode=require";
    vi.stubEnv(key, value); expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(["auth", "events", "clock", "commit"])("original 5s monotonic deadline includes %s", async point => {
    const f = fixture(); f.state.hook = p => { if (p === point) f.mono.mockReturnValue(6000); };
    expect(await read()).toEqual({ status: "UNAVAILABLE" });
    if (point === "auth") expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("transaction queue plus timeout consume the post-auth remainder", async () => {
    const f = fixture(); f.state.hook = p => { if (p === "auth") { f.mono.mockReturnValue(2500); f.wall.mockReturnValue(instant + 86400000 + 1500); } };
    expect(await read()).toMatchObject({ status: "AVAILABLE" });
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 1000, timeout: 2500 });
  });
  it.each(["wall-nan", "mono-nan", "wall-back", "mono-back"])("refuses %s after commit", async kind => {
    const f = fixture(); f.state.hook = point => { if (point !== "commit") return;
      if (kind === "wall-nan") f.wall.mockReturnValue(NaN); if (kind === "mono-nan") f.mono.mockReturnValue(NaN);
      if (kind === "wall-back") f.wall.mockReturnValue(instant); if (kind === "mono-back") f.mono.mockReturnValue(999);
    }; expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(f.state.commits).toBe(1);
  });
  it.each(["ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", "DATABASE_URL", "DIRECT_URL", "ENDVERA_EXTERNAL_AUTHORITY_REF",
    "ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED"])("pins %s through commit", async key => {
    const f = fixture(); f.state.hook = p => { if (p === "commit") vi.stubEnv(key, `${process.env[key]} `); };
    expect(await read()).toEqual({ status: "UNAVAILABLE" });
  });
  it("DB expiry during commit suppresses input without assuming app/DB equal epochs", async () => {
    const f = fixture(); f.state.db = instant + 599000;
    f.state.hook = p => { if (p === "commit") f.mono.mockReturnValue(2000); };
    expect(await read()).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } }); expect(f.state.commits).toBe(1);
  });
  it.each(["wrong", "duplicate", "extra"])("malformed ID-only %s results are never availability", async kind => {
    const f = fixture(), id = `personal-model-setup:v1:${setupRef}:claim`;
    f.state.events = kind === "wrong" ? [{ id: "other" }] : kind === "duplicate" ? [{ id }, { id }] : [{ id, metadata: "must-not-load" } as { id: string }];
    expect(await read()).toEqual({ status: "UNAVAILABLE" });
  });
  it("lost read commit acknowledgement is unavailable with no retry", async () => {
    const f = fixture(); f.state.hook = p => { if (p === "commit") throw new Error("SYNTHETIC_PRIVATE_ERROR"); };
    expect(await read()).toEqual({ status: "UNAVAILABLE" }); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("SQL predicates preserve owner and exact genuine-consent requirements", async () => {
    const f = fixture(); await read(); const sql = f.tx.$queryRawUnsafe.mock.calls.map(c => c[0]).join("\n");
    for (const part of ["w.status='active'", "m.role='owner'", "m.status='active'", "u.role='CLIENT'", 'u."emailVerified"=true',
      "g.status='active'", 'g."revokedAt" IS NULL', "personal_data:inference", "2026-09-10T01:18:26Z", 'a."credentialRef" IS NULL']) expect(sql).toContain(part);
    expect(sql).not.toMatch(/SELECT \*|ciphertext|metadata|INSERT |UPDATE |DELETE /);
  });
  it("source has no key/archive/decrypt/setup writes or account initialization call", () => {
    const source = readFileSync("src/server/model-gateway/personal-intent/operator-form.ts", "utf8");
    expect(source).toContain('import "server-only"'); expect(source).toContain("readPersonalModelOperatorFormView()");
    expect(source).not.toMatch(/ENDVERA_CONNECTOR_ENCRYPTION_KEY|openConnectorSecret|\.create\(|\.update\(|\.upsert\(|applyPersonal|consentPersonal|preparePersonalModelConnection|metadata:\s*true/);
  });
});
