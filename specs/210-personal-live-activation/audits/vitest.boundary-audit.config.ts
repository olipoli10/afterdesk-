import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately excluded from normal root/PG suites: targeted red reproductions
// awaiting their next authorized repair wave, never a green release claim.
export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": fileURLToPath(new URL("../../../test/server-only.ts", import.meta.url)) } },
  test: { environment: "node", include: ["specs/210-personal-live-activation/audits/*.audit.ts"],
    maxWorkers: 1, clearMocks: true, restoreMocks: true },
});
