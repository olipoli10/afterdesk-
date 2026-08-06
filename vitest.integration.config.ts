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
 *   AFTERDESK_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:51222/afterdesk_integration?sslmode=disable&pgbouncer=true&connection_limit=3" \
 *   ALLOW_INTEGRATION_DB_RESET=1 npm run test:integration
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
    // One file at a time AND one worker process for the whole suite: the
    // local `prisma dev` proxy tolerates few concurrent clients, and a fresh
    // PrismaClient per test file (the default worker-per-file model) wedges
    // it. A single fork shares the @/lib/db singleton across every file.
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // One PROCESS for the whole suite: isolate:false shares the worker (and
    // therefore the @/lib/db singleton and its connection pool) across every
    // file — the local prisma-dev proxy tolerates very few clients.
    isolate: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
