import { posix } from "node:path";

export type ProviderExecutionReachability = Readonly<{
  entrypoint: string;
  path: readonly string[];
}>;

const PROVIDER_EXECUTION_MODULE =
  /^src\/server\/construction-operating-assistant-r37(?:a|b|c|f)\//u;

const STATIC_IMPORT_OR_EXPORT =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"'();\r\n]*?\s+from\s+)?["']([^"']+)["']/gu;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/gu;
const REQUIRE_IMPORT = /\brequire\s*\(\s*["']([^"']+)["']/gu;

function normalizeRepositoryPath(path: string) {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function isPublicEntrypoint(path: string) {
  return ["src/app/", "src/server/actions/", "src/jobs/", "src/workers/"].some(
    (root) => path.startsWith(root),
  );
}

function importedSpecifiers(source: string) {
  const specifiers = [
    ...source.matchAll(STATIC_IMPORT_OR_EXPORT),
    ...source.matchAll(DYNAMIC_IMPORT),
    ...source.matchAll(REQUIRE_IMPORT),
  ]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
  return [...new Set(specifiers)].sort();
}

function resolveInternalModule(
  importer: string,
  specifier: string,
  modulePaths: ReadonlySet<string>,
) {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = posix.join(posix.dirname(importer), specifier);
  } else {
    return null;
  }
  base = normalizeRepositoryPath(base);

  const withoutJavaScriptExtension = base.replace(/\.(?:mjs|cjs|js|jsx)$/u, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    withoutJavaScriptExtension,
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${withoutJavaScriptExtension}/index.ts`,
    `${withoutJavaScriptExtension}/index.tsx`,
  ];
  return candidates.find((candidate) => modulePaths.has(candidate)) ?? null;
}

function firstProviderPath(
  entrypoint: string,
  edges: ReadonlyMap<string, readonly string[]>,
) {
  const visit = (current: string, path: readonly string[]): readonly string[] | null => {
    if (PROVIDER_EXECUTION_MODULE.test(current)) return path;
    for (const next of edges.get(current) ?? []) {
      if (path.includes(next)) continue;
      const found = visit(next, [...path, next]);
      if (found) return found;
    }
    return null;
  };
  return visit(entrypoint, [entrypoint]);
}

export function findProviderExecutionReachability(
  sourceModules: ReadonlyMap<string, string>,
): ProviderExecutionReachability[] {
  const modules = new Map(
    [...sourceModules.entries()].map(([path, source]) => [
      normalizeRepositoryPath(path),
      source,
    ]),
  );
  const modulePaths = new Set(modules.keys());
  const edges = new Map<string, readonly string[]>();

  for (const [path, source] of [...modules.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const resolved = importedSpecifiers(source)
      .map((specifier) => resolveInternalModule(path, specifier, modulePaths))
      .filter((target): target is string => target !== null);
    edges.set(path, [...new Set(resolved)].sort());
  }

  return [...modulePaths]
    .filter(isPublicEntrypoint)
    .sort()
    .flatMap((entrypoint) => {
      const path = firstProviderPath(entrypoint, edges);
      return path ? [{ entrypoint, path }] : [];
    });
}
