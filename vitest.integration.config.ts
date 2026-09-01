import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * REAL-POSTGRES integration suite. Separate config on purpose: `npm test`
 * stays the 1.5-second pure loop; this one talks to a dedicated disposable
 * database behind the six-condition guard (test/integration/guard.ts) and
 * COMMITS for real — several invariants under test are constraint triggers
 * and partial indexes that a rolled-back transaction would never exercise.
 *
 * Run — against a SEPARATE `prisma dev` cluster, never the app's port: the
 * local proxy aliases every database name onto one store, so a same-port
 * "afterdesk_integration" IS the app database wearing a costume (the guard's
 * isolation probe refuses exactly that). First `npx prisma dev --name
 * integration`, create the database once on ITS port, then:
 *   AFTERDESK_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:<TCP-port>/afterdesk_integration?sslmode=disable&pgbouncer=true&connection_limit=10" \
 *   ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration
 * Use the TCP URL printed by `prisma dev ls`; its port is the database port,
 * not the main Prisma API port or the shadow-database port. Keep Prisma's
 * pooler-compatibility flag: the local proxy multiplexes backend sessions,
 * while transaction-scoped advisory locks remain held for each transaction.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.itest.ts"],
    globalSetup: ["./test/integration/global-setup.ts"],
    setupFiles: ["./test/integration/per-file-setup.ts"],
    // One file at a time and one worker process for the whole suite. Files
    // still need isolated module graphs: application caches (notably
    // getSettings) must not survive the SQL truncation between files.
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // per-file-setup disconnects each file's Prisma singleton in afterAll,
    // so isolation does not accumulate one live connection pool per file.
    isolate: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
