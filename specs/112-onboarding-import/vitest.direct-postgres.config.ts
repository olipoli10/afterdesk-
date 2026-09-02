import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Proportional R32 concurrency gate for the campaign-owned direct PostgreSQL
 * restore cluster. The schema is prepared forward-only before this gate; the
 * ordinary integration suite remains on its isolated Prisma Dev database.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("../../test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/construction-operating-assistant-r32-onboarding-import.itest.ts"],
    setupFiles: ["./test/integration/per-file-setup.ts"],
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    isolate: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
