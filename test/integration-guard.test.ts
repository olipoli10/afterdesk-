import { describe, expect, it } from "vitest";
import { assertSafeIntegrationDb } from "./integration/guard";

/**
 * The guard guards the guard: these run in the FAST suite, so a regression
 * that would let the integration harness touch a real database fails long
 * before anyone runs the integration suite.
 */

const GOOD = {
  AFTERDESK_TEST_DATABASE_URL:
    "postgres://postgres:postgres@127.0.0.1:51218/afterdesk_integration?sslmode=disable",
  ALLOW_INTEGRATION_DB_RESET: "1",
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable",
  DIRECT_URL: "postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable",
};

describe("the six-condition integration DB guard fails closed", () => {
  it("accepts the documented safe configuration", () => {
    const db = assertSafeIntegrationDb(GOOD);
    expect(db.database).toBe("afterdesk_integration");
    expect(db.host).toBe("127.0.0.1");
  });

  it("1 — refuses a missing test URL, with no fallback on DATABASE_URL", () => {
    expect(() =>
      assertSafeIntegrationDb({ ...GOOD, AFTERDESK_TEST_DATABASE_URL: undefined })
    ).toThrow(/TEST_URL_MISSING/);
  });

  it("2 — refuses a remote host, parsed not substring-matched", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@db.production.example/afterdesk_integration",
      })
    ).toThrow(/NOT_LOCALHOST/);
    // The substring trap: a remote host that CONTAINS "localhost".
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@localhost.evil.example/afterdesk_integration",
      })
    ).toThrow(/NOT_LOCALHOST/);
  });

  it("3 — refuses template1 by name: the dev database is not disposable", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://postgres:postgres@127.0.0.1:51218/template1?sslmode=disable",
      })
    ).toThrow(/DB_NAME_NOT_DISPOSABLE/);
  });

  it("4 — refuses without the explicit reset opt-in", () => {
    expect(() =>
      assertSafeIntegrationDb({ ...GOOD, ALLOW_INTEGRATION_DB_RESET: undefined })
    ).toThrow(/RESET_NOT_ALLOWED/);
    expect(() =>
      assertSafeIntegrationDb({ ...GOOD, ALLOW_INTEGRATION_DB_RESET: "true" })
    ).toThrow(/RESET_NOT_ALLOWED/);
  });

  it("5 — refuses when the test URL is the app database in disguise", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        // Same identity as DATABASE_URL but a _test suffix would be needed;
        // here we point DATABASE_URL at the test db to prove identity check.
        DATABASE_URL:
          "postgres://other:creds@127.0.0.1:51218/afterdesk_integration?extra=1",
      })
    ).toThrow(/SAME_AS_APP_DB/);
  });
});
