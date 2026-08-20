/**
 * Engineering Factory DevBench is a local benchmark contract, not a model
 * router. It describes evidence that a human or an external harness must
 * produce before a coding model, tool or agent workflow may be adopted.
 *
 * It deliberately contains only repository-relative paths, commands and
 * observable oracles. Prompts, model outputs, credentials, client data and
 * provider configuration do not belong in this contract.
 */

export const DEV_BENCH_FAMILIES = [
  "deterministic-core",
  "contract-drift",
  "network-safety",
  "client-server-boundary",
  "provider-replay",
  "synthetic-execution",
  "spend-safety",
  "file-security",
] as const;

export type DevBenchFamily = (typeof DEV_BENCH_FAMILIES)[number];

export type DevBenchCase = {
  id: string;
  title: string;
  family: DevBenchFamily;
  objective: string;
  sourcePaths: readonly string[];
  commands: readonly string[];
  oracle: readonly string[];
  requiredEvidence: readonly string[];
  mutation: string;
  providerExposure: "none";
  forbiddenPaths: readonly string[];
};

export type DevBenchCatalog = {
  version: 1;
  name: string;
  cases: readonly DevBenchCase[];
};

export type DevBenchValidationOptions = {
  /** Optional so the contract remains usable without a filesystem. */
  pathExists?: (relativePath: string) => boolean;
};

export type DevBenchValidationReport = {
  ok: boolean;
  errors: string[];
  caseCount: number;
  familyCount: number;
};

const FORBIDDEN_COMMAND_PARTS = [
  "prisma migrate reset",
  "prisma db push",
  "git reset --hard",
  "git clean -",
  "vercel --prod",
  "vercel deploy",
  "npm install",
  "pnpm install",
  "yarn install",
] as const;

function isRepositoryRelativePath(path: string): boolean {
  return (
    /^(src|test|scripts|docs)\//.test(path) &&
    !path.includes("../") &&
    !path.includes("..\\") &&
    !path.includes("\\") &&
    !path.startsWith("/")
  );
}

function isSafeForbiddenPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("../") &&
    !path.includes("..\\") &&
    !path.includes("\\") &&
    !path.startsWith("/")
  );
}

export function validateDevBenchCatalog(
  catalog: DevBenchCatalog,
  options: DevBenchValidationOptions = {}
): DevBenchValidationReport {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const families = new Set<DevBenchFamily>();

  if (catalog.version !== 1) errors.push("unsupported catalog version");
  if (!catalog.name.trim()) errors.push("catalog name is required");
  if (catalog.cases.length < 8) errors.push("catalog requires at least 8 cases");

  for (const benchCase of catalog.cases) {
    if (!/^EF-\d{3}$/.test(benchCase.id)) {
      errors.push(`invalid id: ${benchCase.id}`);
    }
    if (seenIds.has(benchCase.id)) {
      errors.push(`duplicate id: ${benchCase.id}`);
    }
    seenIds.add(benchCase.id);
    families.add(benchCase.family);

    if (!benchCase.title.trim()) errors.push(`${benchCase.id}: title is required`);
    if (!benchCase.objective.trim()) errors.push(`${benchCase.id}: objective is required`);
    if (benchCase.providerExposure !== "none") {
      errors.push(`${benchCase.id}: provider exposure must be none`);
    }
    if (benchCase.sourcePaths.length === 0) errors.push(`${benchCase.id}: source paths are required`);
    if (benchCase.commands.length === 0) errors.push(`${benchCase.id}: commands are required`);
    if (benchCase.oracle.length === 0) errors.push(`${benchCase.id}: oracle is required`);
    if (benchCase.requiredEvidence.length === 0) {
      errors.push(`${benchCase.id}: required evidence is required`);
    }
    if (!benchCase.mutation.trim()) errors.push(`${benchCase.id}: mutation is required`);

    for (const path of benchCase.sourcePaths) {
      if (!isRepositoryRelativePath(path)) {
        errors.push(`${benchCase.id}: unsafe source path: ${path}`);
        continue;
      }
      if (options.pathExists && !options.pathExists(path)) {
        errors.push(`${benchCase.id}: source path does not exist: ${path}`);
      }
    }

    for (const path of benchCase.forbiddenPaths) {
      if (!isSafeForbiddenPath(path)) {
        errors.push(`${benchCase.id}: unsafe forbidden path: ${path}`);
      }
    }

    for (const command of benchCase.commands) {
      const normalized = command.toLowerCase();
      const forbidden = FORBIDDEN_COMMAND_PARTS.find((part) => normalized.includes(part));
      if (forbidden) errors.push(`${benchCase.id}: forbidden command: ${command}`);
      if (!/^npm run (test:run|lint|typecheck)( -- .+)?$/.test(command)) {
        errors.push(`${benchCase.id}: command is outside the local benchmark allowlist: ${command}`);
      }
    }
  }

  if (families.size < 6) errors.push("catalog requires at least 6 task families");

  return {
    ok: errors.length === 0,
    errors,
    caseCount: catalog.cases.length,
    familyCount: families.size,
  };
}
