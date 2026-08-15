import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeIntegrationDb } from "./integration/guard";

/**
 * THE DISPOSABLE DATABASE THIS SESSION IS ABOUT TO MIGRATE.
 *
 * Temporary file, deleted after it passes. Its job is to make the safety claim
 * checkable rather than asserted: the guard must ACCEPT this exact URL and
 * REFUSE every shape that could reach something we care about.
 */

const URL_OK =
  "postgres://postgres:postgres@127.0.0.1:51226/afterdesk_integration" +
  "?sslmode=disable&connection_limit=10&connect_timeout=0";

const env = {
  AFTERDESK_TEST_DATABASE_URL: URL_OK,
  ALLOW_INTEGRATION_DB_RESET: "1",
};

describe("the disposable database is accepted", () => {
  it("passes all seven conditions", () => {
    expect(assertSafeIntegrationDb(env)).toEqual({
      url: URL_OK,
      host: "127.0.0.1",
      database: "afterdesk_integration",
    });
  });

  it("names itself disposable — _integration", () => {
    expect(assertSafeIntegrationDb(env).database).toMatch(/_(test|integration)$/);
  });
});

describe("every unsafe shape is refused", () => {
  it("refuses without the explicit destructive opt-in", () => {
    expect(() =>
      assertSafeIntegrationDb({ ...env, ALLOW_INTEGRATION_DB_RESET: undefined })
    ).toThrow(/RESET_NOT_ALLOWED/);
  });

  /**
   * template1 is Postgres's own template database and the default `prisma dev`
   * hands out. Migrating it would corrupt every database later created from it.
   */
  it("refuses the prisma dev default, template1", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...env,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://postgres:postgres@127.0.0.1:51226/template1?sslmode=disable",
      })
    ).toThrow(/DB_NAME_NOT_DISPOSABLE/);
  });

  it("refuses a production-shaped remote host nobody named out loud", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...env,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@ep-prod-9999.us-east-2.aws.neon.tech/afterdesk_integration",
      })
    ).toThrow(/REMOTE_NOT_ALLOWED/);
  });

  it("refuses a remote host that does not match the one authorised", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...env,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@ep-a.neon.tech/afterdesk_integration",
        ALLOW_REMOTE_INTEGRATION_DB: "ep-b.neon.tech",
      })
    ).toThrow(/REMOTE_HOST_MISMATCH/);
  });

  it("refuses a collision with the app's own database", () => {
    expect(() => assertSafeIntegrationDb({ ...env, DATABASE_URL: URL_OK })).toThrow(
      /SAME_AS_APP_DB/
    );
    expect(() => assertSafeIntegrationDb({ ...env, DIRECT_URL: URL_OK })).toThrow(
      /SAME_AS_APP_DB/
    );
  });

  /**
   * The L3/canary database keeps a `_prisma_migrations` ledger that this
   * suite's raw schema rebuild does not maintain. Sharing one would fail a
   * later `migrate deploy` closed with P3005.
   */
  it("refuses a collision with the L3/canary database", () => {
    expect(() =>
      assertSafeIntegrationDb(env, { l3TestDatabaseUrl: URL_OK })
    ).toThrow(/SAME_AS_L3_DB/);
  });

  it("catches the L3 collision across Neon pooled-vs-direct hostnames", () => {
    const pooled = "postgres://u:p@ep-x-pooler.neon.tech/afterdesk_integration";
    const direct = "postgres://u:p@ep-x.neon.tech/afterdesk_integration";
    expect(() =>
      assertSafeIntegrationDb(
        {
          ...env,
          AFTERDESK_TEST_DATABASE_URL: pooled,
          ALLOW_REMOTE_INTEGRATION_DB: "ep-x-pooler.neon.tech",
        },
        { l3TestDatabaseUrl: direct }
      )
    ).toThrow(/SAME_AS_L3_DB/);
  });
});

describe("the worktree carries no production or shared env source", () => {
  /**
   * The strongest safety property available here, and it is structural rather
   * than argued: there is no `.env` in this worktree at all, so there is no
   * production connection string for anything to fall back onto. The guard
   * refuses to read `DATABASE_URL` anyway — this proves there is nothing to
   * read even if it did.
   */
  const root = join(__dirname, "..");

  it("has no .env, .env.local, .env.production or .env.l3.local", () => {
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
      ".env.l3.local",
    ]) {
      expect(existsSync(join(root, name)), `${name} must not exist`).toBe(false);
    }
  });

  it("carries only .env.example", () => {
    const envFiles = readdirSync(root).filter((f) => f.startsWith(".env"));
    expect(envFiles).toEqual([".env.example"]);
  });

  it("has no live DATABASE_URL in the process environment", () => {
    // The suite sets these itself per file; before that they must be absent,
    // so nothing can be inherited from a developer shell.
    const live = process.env.DATABASE_URL;
    expect(live === undefined || live.includes("afterdesk_integration")).toBe(true);
  });
});
