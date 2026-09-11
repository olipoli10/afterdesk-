import { afterEach, describe, expect, it, vi } from "vitest";
import { readPersonalModelOperatorFormView } from "../src/server/model-gateway/personal-intent/operator-form";
import { PERSONAL_MODEL_INGRESS_TARGET as target } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";

const mock = vi.hoisted(() => ({ session: vi.fn(), transaction: vi.fn(), inspect: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: mock.session }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("../src/server/model-gateway/personal-intent/operator-ingress-contract", async original => ({
  ...await original<typeof import("../src/server/model-gateway/personal-intent/operator-ingress-contract")>(),
  inspectPersonalModelIngressConfiguration: mock.inspect,
}));
vi.mock("../src/server/model-gateway/personal-intent/operator-preparation", () => ({ validatePersonalModelOperatorArtifact: mock.validate }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); Object.values(mock).forEach(fn => fn.mockReset()); });
const start = Date.parse("2026-09-11T01:00:00Z"), iso = (n: number) => new Date(n).toISOString();
const setupRef = "12345678-1234-4234-8234-123456789abc";

// This file isolates B4's projection/control flow. B1/artifact acceptance, session,
// SQL and commit are explicitly mocked; real B1 is covered by separate suites.
function fixture() {
  const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
  vi.spyOn(Date, "now").mockReturnValue(start - 86400000);
  const authority = "ENDVERA-PERSONAL-20260910-100CAD", pilotExpiry = "2026-10-10T01:18:26Z";
  const secrets = ["SYNTHETIC_ARCHIVE_PRIVATE", "SYNTHETIC_OWNER_ID", "SYNTHETIC_DB_PASSWORD", "SYNTHETIC_ENCRYPTION_KEY"];
  const review = Object.freeze({ reviewedAt: iso(start) });
  const artifact = Object.freeze({ draftRoute: Object.freeze({ modelKey: "review/model", endpointKey: "review-endpoint" }),
    configuration: Object.freeze({ operatorReview: review, rateConfiguration: review, pilotEnvelopeReview: review,
      privacyEvidence: Object.freeze({ expiresAt: iso(start + 600000) }) }) });
  mock.inspect.mockReturnValue(Object.freeze({ configuration: Object.freeze({ setupRef, notBefore: iso(start), expiresAt: iso(start + 10000), manifestUtf8: secrets[0] }),
    manifest: Object.freeze({ workspaceId: "review-workspace", ownerUserId: secrets[1], authorityId: authority, pilotExpiresAt: pilotExpiry, artifact }) }));
  mock.validate.mockReturnValue({ status: "PREPARED_NOT_PUBLISHED" });
  for (const [key, value] of Object.entries({ ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION: "MOCKED_B1_INPUT",
    DATABASE_URL: `postgresql://neondb_owner:${secrets[2]}@${target.pooledHostname}/neondb?sslmode=require&sslaccept=strict`,
    DIRECT_URL: `postgresql://neondb_owner:${secrets[2]}@${target.directHostname}/neondb?sslmode=require&sslaccept=strict`,
    ENDVERA_EXTERNAL_AUTHORITY_REF: authority, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: pilotExpiry,
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: secrets[3] })) vi.stubEnv(key, value);
  mock.session.mockResolvedValue({ id: secrets[1], role: "CLIENT", emailVerified: true });
  const state = { attempt: false, snapshotSawAttempt: false, commits: 0, priorReads: 0, dbNow: start,
    afterAbsence: () => {}, clockDelay: 0, error: false };
  const queries: string[] = [];
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      queries.push(sql); if (state.error) throw new Error(secrets.join(" "));
      if (sql === "SHOW transaction_isolation") return [{ transaction_isolation: "serializable" }];
      if (sql.includes("set_config")) return [];
      if (sql.includes('FROM "ConstructionWorkspace"')) return [{ id: "review-workspace" }];
      if (sql.includes('SELECT a.id FROM "ConstructionConnectorAccount"') || sql.includes('SELECT id FROM "ConstructionConnectorAccount"')) return [{ id: "review-account" }];
      if (sql === "SELECT clock_timestamp() AS now") { mono.mockReturnValue(1000 + state.clockDelay); return [{ now: new Date(state.dbNow) }]; }
      throw new Error("PEER_UNEXPECTED_SQL");
    }),
    constructionAuditEvent: { findMany: vi.fn(async (_input: unknown) => {
      void _input;
      state.snapshotSawAttempt = state.attempt;
      const result = state.attempt ? [{ id: `personal-model-setup:v1:${setupRef}:claim` }] : [];
      state.afterAbsence(); return result;
    }) },
    constructionConnectorCredential: { findFirst: vi.fn(async () => { state.priorReads++; return null; }) },
  };
  mock.transaction.mockImplementation(async (work: (t: typeof tx) => Promise<unknown>) => { const value = await work(tx); state.commits++; return value; });
  return { state, tx, queries, secrets };
}

describe("peer: B4 metadata observation is not a secret or execution capability", () => {
  it("maps only the exact public fields and never projects the archive or identity sentinels", async () => {
    const f = fixture(), result = await readPersonalModelOperatorFormView();
    expect(result).toEqual({ status: "AVAILABLE", view: { version: "personal-model-operator-form-v1", setupRef, provider: "openrouter",
      model: "review/model", providerEndpoint: "review-endpoint", purpose: "personal_intent_candidate_v1", expiresAt: iso(start + 10000),
      state: "INPUT_AVAILABLE", executionAuthorized: false, providerVerified: false } });
    for (const value of f.secrets) expect(JSON.stringify(result)).not.toContain(value);
    expect(f.queries.join("\n")).not.toMatch(/ciphertext|SELECT \*|INSERT |DELETE /);
  });
  it("an existing attempt skips consent/account/credential inspection entirely and offers history only", async () => {
    const f = fixture(); f.state.attempt = true;
    expect(await readPersonalModelOperatorFormView()).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } });
    expect(f.state.priorReads).toBe(0); expect(f.queries.join("\n")).not.toContain('FROM "ConstructionConnectorAccount"');
    expect(f.tx.constructionAuditEvent.findMany.mock.calls[0][0]).toEqual({ where: { id: { in: [
      `personal-model-setup:v1:${setupRef}:claim`, `personal-model-setup:v1:${setupRef}:applied`,
    ] } }, select: { id: true }, take: 3 });
  });
  it("the DB query itself consumes the conservative expiry TTL, not only later commit time", async () => {
    const f = fixture(); f.state.dbNow = start + 9900; f.state.clockDelay = 100;
    expect(await readPersonalModelOperatorFormView()).toMatchObject({ status: "AVAILABLE", view: { state: "HISTORY_ONLY" } });
    expect(f.state.commits).toBe(1); expect(f.state.priorReads).toBe(1);
  });
  it("does not misrepresent a snapshot of absent claims as a concurrency lock or ongoing authority", async () => {
    const f = fixture(); f.state.afterAbsence = () => { f.state.attempt = true; };
    const result = await readPersonalModelOperatorFormView();
    expect(f.state.snapshotSawAttempt).toBe(false); expect(f.state.attempt).toBe(true);
    expect(result).toMatchObject({ status: "AVAILABLE", view: { state: "INPUT_AVAILABLE", executionAuthorized: false } });
    // A different invocation may have claimed after this read snapshot. B2 must
    // still enforce POST uniqueness; B4 makes no claim insert or admission token.
    expect(f.tx.constructionAuditEvent.findMany).toHaveBeenCalledTimes(1);
  });
  it("returns a fixed unavailable result for a private DB error without a second attempt", async () => {
    const f = fixture(); f.state.error = true;
    expect(await readPersonalModelOperatorFormView()).toEqual({ status: "UNAVAILABLE" });
    expect(mock.transaction).toHaveBeenCalledTimes(1); expect(f.state.commits).toBe(0);
  });
});
