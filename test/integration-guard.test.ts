import { describe, expect, it } from "vitest";
import { assertSafeIntegrationDb } from "./integration/guard";

/**
 * The guard guards the guard: these run in the FAST suite, so a regression
 * that would let the integration harness touch a real database fails long
 * before anyone runs the integration suite.
 */

const GOOD = {
  AFTERDESK_TEST_DATABASE_URL:
    "postgres://test_user:test_password@127.0.0.1:51218/afterdesk_integration?sslmode=disable",
  ALLOW_INTEGRATION_DB_RESET: "1",
  DATABASE_URL: "postgres://test_user:test_password@127.0.0.1:51218/template1?sslmode=disable",
  DIRECT_URL: "postgres://test_user:test_password@127.0.0.1:51218/template1?sslmode=disable",
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

  it("2 — refuses a remote host nobody named", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@db.production.example/afterdesk_integration",
      })
    ).toThrow(/REMOTE_NOT_ALLOWED/);
    // The substring trap: a remote host that CONTAINS "localhost".
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@localhost.evil.example/afterdesk_integration",
      })
    ).toThrow(/REMOTE_NOT_ALLOWED/);
  });

  it("2 — accepts a remote host ONLY when the operator typed that exact host", () => {
    /**
     * The stable test Postgres lives at a provider now, so "localhost only"
     * had to go. What replaced it is stricter, not looser: the operator states
     * the hostname this suite is authorised to DROP SCHEMA on, and it is
     * compared for equality against the parsed host. There is no pattern to
     * fool and no "looks like a test branch" inference to get wrong.
     */
    const neon = {
      ...GOOD,
      AFTERDESK_TEST_DATABASE_URL:
        "postgres://u:p@ep-quiet-frost-a1b2c3.us-east-2.aws.neon.tech/afterdesk_integration?sslmode=require",
    };
    expect(() => assertSafeIntegrationDb(neon)).toThrow(/REMOTE_NOT_ALLOWED/);

    const named = assertSafeIntegrationDb({
      ...neon,
      ALLOW_REMOTE_INTEGRATION_DB: "ep-quiet-frost-a1b2c3.us-east-2.aws.neon.tech",
    });
    expect(named.host).toBe("ep-quiet-frost-a1b2c3.us-east-2.aws.neon.tech");
    expect(named.database).toBe("afterdesk_integration");
  });

  it("2 — an allowance for one host does not authorise another", () => {
    // The failure this exists for: an ALLOW_REMOTE_INTEGRATION_DB left in a
    // shell from a previous branch, and a URL now pointing somewhere else.
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://u:p@ep-production-writer.aws.neon.tech/afterdesk_integration?sslmode=require",
        ALLOW_REMOTE_INTEGRATION_DB: "ep-quiet-frost-a1b2c3.us-east-2.aws.neon.tech",
      })
    ).toThrow(/REMOTE_HOST_MISMATCH/);
  });

  it("2 — naming a remote host does not excuse any other condition", () => {
    const host = "ep-quiet-frost-a1b2c3.us-east-2.aws.neon.tech";
    const base = { ...GOOD, ALLOW_REMOTE_INTEGRATION_DB: host };
    // Still needs a disposable database name...
    expect(() =>
      assertSafeIntegrationDb({
        ...base,
        AFTERDESK_TEST_DATABASE_URL: `postgres://u:p@${host}/neondb?sslmode=require`,
      })
    ).toThrow(/DB_NAME_NOT_DISPOSABLE/);
    // ...and still needs the reset opt-in.
    expect(() =>
      assertSafeIntegrationDb({
        ...base,
        AFTERDESK_TEST_DATABASE_URL: `postgres://u:p@${host}/afterdesk_integration?sslmode=require`,
        ALLOW_INTEGRATION_DB_RESET: undefined,
      })
    ).toThrow(/RESET_NOT_ALLOWED/);
  });

  it("3 — refuses template1 by name: the dev database is not disposable", () => {
    expect(() =>
      assertSafeIntegrationDb({
        ...GOOD,
        AFTERDESK_TEST_DATABASE_URL:
          "postgres://test_user:test_password@127.0.0.1:51218/template1?sslmode=disable",
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

  describe("6 — the L3/canary database, when configured, is off limits too", () => {
    /**
     * The exact shape of the real incident: DATABASE_URL/DIRECT_URL are the
     * local prisma-dev proxy, so condition 5 is silent — but
     * .env.l3.local's AFTERDESK_TEST_DATABASE_URL points at a REMOTE Neon
     * database whose name legitimately ends in "_integration", which would
     * otherwise sail through conditions 1-5 unopposed.
     */
    const l3Url =
      "postgresql://neondb_owner:secret@ep-morning-sunset-awwhp17m-pooler.c-12.us-east-1.aws.neon.tech/afterdesk_integration?sslmode=require&channel_binding=require";

    it("refuses when the test URL is the L3/canary database in disguise", () => {
      expect(() =>
        assertSafeIntegrationDb(
          {
            ...GOOD,
            AFTERDESK_TEST_DATABASE_URL: l3Url,
            ALLOW_REMOTE_INTEGRATION_DB:
              "ep-morning-sunset-awwhp17m-pooler.c-12.us-east-1.aws.neon.tech",
          },
          { l3TestDatabaseUrl: l3Url }
        )
      ).toThrow(/SAME_AS_L3_DB/);
    });

    it("a different port on the same host is NOT treated as the same database", () => {
      const db = assertSafeIntegrationDb(
        {
          ...GOOD,
          AFTERDESK_TEST_DATABASE_URL: l3Url,
          ALLOW_REMOTE_INTEGRATION_DB:
            "ep-morning-sunset-awwhp17m-pooler.c-12.us-east-1.aws.neon.tech",
        },
        { l3TestDatabaseUrl: l3Url.replace("neon.tech/", "neon.tech:5433/") }
      );
      expect(db.database).toBe("afterdesk_integration");
    });

    it("a different database name on the same host is NOT treated as the same database", () => {
      const db = assertSafeIntegrationDb(
        {
          ...GOOD,
          AFTERDESK_TEST_DATABASE_URL: l3Url,
          ALLOW_REMOTE_INTEGRATION_DB:
            "ep-morning-sunset-awwhp17m-pooler.c-12.us-east-1.aws.neon.tech",
        },
        { l3TestDatabaseUrl: l3Url.replace("afterdesk_integration", "afterdesk_l3_only") }
      );
      expect(db.database).toBe("afterdesk_integration");
    });

    it("no L3 database configured (no .env.l3.local in this checkout) is a no-op", () => {
      const db = assertSafeIntegrationDb(GOOD, {});
      expect(db.database).toBe("afterdesk_integration");
      const db2 = assertSafeIntegrationDb(GOOD);
      expect(db2.database).toBe("afterdesk_integration");
    });

    it("catches a pooled-vs-direct Neon hostname collision, not just a byte-identical URL", () => {
      // The suite's own test URL on the DIRECT host; .env.l3.local's is on
      // the POOLED host (its real, documented shape) — same logical Neon
      // endpoint, same database, different hostname string. A plain
      // string-equality check would miss this; neonEndpointIdentity() must not.
      expect(() =>
        assertSafeIntegrationDb(
          {
            ...GOOD,
            AFTERDESK_TEST_DATABASE_URL:
              "postgresql://neondb_owner:secret@ep-morning-sunset-awwhp17m.c-12.us-east-1.aws.neon.tech/afterdesk_integration?sslmode=require",
            ALLOW_REMOTE_INTEGRATION_DB: "ep-morning-sunset-awwhp17m.c-12.us-east-1.aws.neon.tech",
          },
          {
            l3TestDatabaseUrl:
              "postgresql://neondb_owner:secret@ep-morning-sunset-awwhp17m-pooler.c-12.us-east-1.aws.neon.tech/afterdesk_integration?sslmode=require&channel_binding=require",
          }
        )
      ).toThrow(/SAME_AS_L3_DB/);
    });
  });
});
