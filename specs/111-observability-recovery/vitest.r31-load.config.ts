import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("../../test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/construction-operating-assistant-r31-load-gates.itest.ts"],
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    isolate: true,
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
});
