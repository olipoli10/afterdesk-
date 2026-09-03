import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  isProviderBoundarySourcePath,
  validateProviderBoundaryModules,
} from "../src/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return isProviderBoundarySourcePath(entry.name) ? [path] : [];
    }),
  );
  return paths.flat().sort();
}

async function main() {
  const repositoryRoot = resolve(process.cwd());
  const sourceRoot = resolve(repositoryRoot, "src");
  const sourceFiles = await listSourceFiles(sourceRoot);
  const modules = new Map<string, string>();
  for (const path of sourceFiles) {
    modules.set(
      relative(repositoryRoot, path).replaceAll("\\", "/"),
      await readFile(path, "utf8"),
    );
  }

  const violations = validateProviderBoundaryModules(modules);
  if (violations.length > 0) {
    for (const item of violations) {
      console.error(`${item.code} ${item.path}${item.detail ? ` ${item.detail}` : ""}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`R37O_PROVIDER_BOUNDARY_PASS modules=${modules.size} violations=0`);
  }
}

void main();
