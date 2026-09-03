import { posix } from "node:path";
import ts from "typescript";

export type ProviderExecutionReachability = Readonly<{
  entrypoint: string;
  path: readonly string[];
}>;

const PROVIDER_EXECUTION_MODULE =
  /^src\/server\/construction-operating-assistant-r37(?:a|b|c|f)\//u;

function normalizeRepositoryPath(path: string) {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function isPublicEntrypoint(path: string) {
  return ["src/app/", "src/server/actions/", "src/jobs/", "src/workers/"].some(
    (root) => path.startsWith(root),
  );
}

function importedSpecifiers(path: string, source: string) {
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const specifiers: string[] = [];
  const addLiteral = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      addLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
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
    const resolved = importedSpecifiers(path, source)
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
