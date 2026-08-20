import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import { validateDevBenchCatalog } from "../src/lib/engineering-factory/devbench";

const rootDir = resolve(import.meta.dirname, "..");
const report = validateDevBenchCatalog(DEV_BENCH_V1, {
  pathExists: (relativePath) => existsSync(resolve(rootDir, relativePath)),
});

if (!report.ok) {
  console.error("Engineering Factory DevBench is invalid:");
  for (const error of report.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Engineering Factory DevBench is valid: ${report.caseCount} cases across ${report.familyCount} families; provider exposure: none.`
  );
}
