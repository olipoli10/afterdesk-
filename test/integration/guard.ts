/**
 * THE SIX-CONDITION GUARD in front of every destructive integration-test
 * operation. FAIL CLOSED: a missing condition throws and names itself; no
 * cleanup code is reachable past a failed check, and the suite must never
 * mark itself skipped — a silently skipped integration suite is worse than
 * no suite (the dev database here is literally `template1`, Postgres's own
 * template, which is exactly the database an accidental TRUNCATE must never
 * reach — and which condition 3 rejects by name).
 *
 * Pure module: importable by unit tests to prove the guard itself.
 */

export type GuardedTestDb = {
  url: string;
  host: string;
  database: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function identityOf(rawUrl: string): { host: string; port: string; database: string } | null {
  try {
    const u = new URL(rawUrl);
    return {
      host: u.hostname.toLowerCase(),
      port: u.port || "5432",
      database: u.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

export function assertSafeIntegrationDb(
  env: Record<string, string | undefined>
): GuardedTestDb {
  const fail = (condition: string, detail: string): never => {
    throw new Error(
      `INTEGRATION DB GUARD FAILED [${condition}]: ${detail}\n` +
        `Run with e.g.\n` +
        `  AFTERDESK_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:51218/afterdesk_integration?sslmode=disable" \\\n` +
        `  ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration`
    );
  };

  // 1. Explicit test URL — no fallback onto DATABASE_URL, ever.
  const raw = env.AFTERDESK_TEST_DATABASE_URL;
  if (!raw) return fail("TEST_URL_MISSING", "AFTERDESK_TEST_DATABASE_URL is not set.");

  const id = identityOf(raw);
  if (!id) return fail("TEST_URL_UNPARSEABLE", "AFTERDESK_TEST_DATABASE_URL is not a valid URL.");

  /**
   * 2. A local host, or a REMOTE host the operator named out loud.
   *
   * "Localhost only" was the right rule while the only test database was a
   * local cluster: being local was a cheap proof of not-production. It stops
   * being right the moment the stable test Postgres lives at a provider, and
   * the honest replacement is not to weaken the condition but to make the
   * operator state the exact host they are authorising this suite to DROP.
   *
   * That is stronger than a hostname-shape heuristic, not weaker. There is no
   * pattern, no allowlist and no "looks like a test branch" inference to get
   * wrong; the only way to point the suite at production is to have typed
   * production's hostname into the variable, next to a database name that also
   * has to end in _test or _integration, next to ALLOW_INTEGRATION_DB_RESET=1.
   * Three deliberate acts, none of which a stray shell variable performs.
   */
  if (!LOCAL_HOSTS.has(id.host)) {
    const named = (env.ALLOW_REMOTE_INTEGRATION_DB ?? "").trim().toLowerCase();
    if (!named) {
      return fail(
        "REMOTE_NOT_ALLOWED",
        `host "${id.host}" is not local. A remote test database must be named ` +
          `explicitly: ALLOW_REMOTE_INTEGRATION_DB="${id.host}".`
      );
    }
    if (named !== id.host) {
      return fail(
        "REMOTE_HOST_MISMATCH",
        `ALLOW_REMOTE_INTEGRATION_DB names "${named}" but the URL points at "${id.host}".`
      );
    }
  }

  // 3. The database names itself as disposable.
  if (!/_(test|integration)$/.test(id.database)) {
    return fail(
      "DB_NAME_NOT_DISPOSABLE",
      `database "${id.database}" does not end in _test or _integration.`
    );
  }

  // 4. Explicit opt-in for destructive resets.
  if (env.ALLOW_INTEGRATION_DB_RESET !== "1") {
    return fail("RESET_NOT_ALLOWED", "ALLOW_INTEGRATION_DB_RESET=1 is not set.");
  }

  // 5. Different from the app's own databases, compared by identity.
  for (const [name, other] of [
    ["DATABASE_URL", env.DATABASE_URL],
    ["DIRECT_URL", env.DIRECT_URL],
  ] as const) {
    if (!other) continue;
    const otherId = identityOf(other);
    if (
      otherId &&
      otherId.host === id.host &&
      otherId.port === id.port &&
      otherId.database === id.database
    ) {
      return fail("SAME_AS_APP_DB", `the test URL points at the same database as ${name}.`);
    }
  }

  // 6 is the shape of this function: any missing condition threw above, and
  // no destructive code exists before this return.
  return { url: raw, host: id.host, database: id.database };
}
