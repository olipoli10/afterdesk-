import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args) => {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`R36_GIT_FINGERPRINT_FAILED:${result.stderr.trim()}`);
  return result.stdout.trim();
};

if (!process.env.AFTERDESK_TEST_DATABASE_URL || process.env.ALLOW_INTEGRATION_DB_RESET !== "1") {
  throw new Error("R36_DISPOSABLE_POSTGRESQL_AUTHORITY_REQUIRED");
}

const result = spawnSync(process.execPath, [
  path.join(repositoryRoot, "node_modules", "vitest", "vitest.mjs"),
  "--config",
  "vitest.integration.config.ts",
  "--run",
  "test/integration/construction-operating-assistant-r36-internal-e2e.itest.ts",
], {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    R36_SOURCE_HEAD: git(["rev-parse", "HEAD"]),
    R36_SOURCE_TREE: git(["rev-parse", "HEAD^{tree}"]),
    R36_PRINT_REPORT: "1",
  },
});

if (result.error) throw result.error;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0) process.exit(result.status ?? 1);
if (!result.stdout.includes("R36_REPORT_JSON=")) throw new Error("R36_REPORT_NOT_EMITTED");
