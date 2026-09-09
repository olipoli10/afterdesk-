import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Three source-graph audits parse hundreds of modules. Unbounded host-wide
    // concurrency starves their unchanged 5s deadline (R0b full-suite evidence).
    // Bound CPU contention, not test assertions or timeouts.
    maxWorkers: 4,
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
