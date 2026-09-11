import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { provisionInitialPersonalModelCredentialInTransaction } from "../src/server/personal-assistant/model-connection";
import { inspectPersonalModelSetupManifest } from "../src/server/model-gateway/personal-intent/operator-setup";

vi.mock("@/lib/db", () => ({ prisma: {} }));
afterEach(() => vi.restoreAllMocks());

// Real initial credential helper and cipher, synthetic SQL result rows only.
// This does not prove PostgreSQL rollback/locks or authenticated owner consent.
function initialFixture() {
  const instant = Date.parse("2026-09-11T01:00:00Z");
  const wall = vi.spyOn(Date, "now").mockReturnValue(instant);
  const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
  const abort = new AbortController();
  const context = { deadlineAt: instant + 15000, monotoneDeadlineAt: 16000, signal: abort.signal };
  const env = { NODE_ENV: "test" as const, ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
  const state = { clocks: 0, hook: (_phase: string) => { void _phase; } };
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      if (sql === "SHOW transaction_isolation") return [{ transaction_isolation: "serializable" }];
      if (sql.includes("set_config") || sql.includes("pg_advisory")) return [];
      if (sql.includes('g.id AS "grantId"')) return [{ id: "review-account", grantId: "review-grant", grantVersion: 1 }];
      if (sql.includes('SELECT id FROM "ConstructionConnectorAccount"')) return [{ id: "review-account" }];
      if (sql.includes("c.ciphertext=$5")) { state.hook("readback"); return [{ id: "review-account" }]; }
      if (sql === "SELECT clock_timestamp() AS now") {
        state.clocks++; if (state.clocks === 2) state.hook("final-clock");
        return [{ now: new Date(instant) }];
      }
      throw new Error("REVIEW_UNEXPECTED_QUERY");
    }),
    constructionConnectorCredential: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    constructionConnectorAccount: { update: vi.fn(async () => ({})) },
  };
  const run = () => provisionInitialPersonalModelCredentialInTransaction(tx as unknown as Prisma.TransactionClient,
    { userId: "review-owner", workspaceId: "review-workspace", credentialId: "12345678-1234-4234-8234-123456789abc",
      apiKey: "synthetic_review_key_12345678901234567890" }, env, context);
  return { run, state, wall, mono, abort, context, tx };
}

describe("peer: initial-only setup clock and data boundaries", () => {
  it("positive control uses the real helper, cipher and provisional false-authority result", async () => {
    const f = initialFixture();
    await expect(f.run()).resolves.toEqual({ credentialPrepared: true, providerVerified: false, executionAuthorized: false });
    expect(f.state.clocks).toBe(2); expect(f.tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
  });

  it.each(["wall", "monotone"])("refuses nonfinite current %s clock after writes, not merely nonfinite deadlines", async kind => {
    const f = initialFixture();
    f.state.hook = phase => { if (phase === "final-clock") (kind === "wall" ? f.wall : f.mono).mockReturnValue(NaN); };
    await expect(f.run()).rejects.toThrow("PERSONAL_MODEL_INITIAL_SETUP_REFUSED");
    expect(f.tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
    // Caller must roll this back; this mock does not claim to do so.
  });

  it("preserves original cancellation even when caller replaces its context signal during an await", async () => {
    const f = initialFixture();
    f.state.hook = phase => { if (phase === "readback") {
      f.context.signal = new AbortController().signal; f.abort.abort();
    } };
    await expect(f.run()).rejects.toThrow("PERSONAL_MODEL_INITIAL_SETUP_REFUSED");
    expect(f.tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a proxy input without executing its reflection traps", () => {
    const trap = vi.fn(() => Object.prototype);
    const input = new Proxy({}, { getPrototypeOf: trap });
    expect(() => inspectPersonalModelSetupManifest(input)).toThrow("PERSONAL_MODEL_SETUP_REFUSED");
    expect(trap).not.toHaveBeenCalled();
  });
});
