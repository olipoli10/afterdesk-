import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": fileURLToPath(new URL("../../test/server-only.ts", import.meta.url)) } },
  test: { environment: "node", include: ["specs/210-personal-live-activation/*.postgres.test.ts"], maxWorkers: 1, fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 },
});
