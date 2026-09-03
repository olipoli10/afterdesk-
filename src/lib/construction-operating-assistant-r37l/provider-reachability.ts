import { posix } from "node:path";
import ts from "typescript";

export type ProviderExecutionReachability = Readonly<{
  entrypoint: string;
  path: readonly string[];
}>;

export type UnresolvedDynamicModuleReachability = Readonly<{
  entrypoint: string;
  path: readonly string[];
  unresolvedModule: string;
  callKind: "import" | "require";
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

function inspectModule(path: string, source: string) {
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const specifiers: string[] = [];
  const unresolvedCallKinds: Array<"import" | "require"> = [];
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
      const callKind = node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? "import"
        : "require";
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) {
        addLiteral(argument);
      } else {
        unresolvedCallKinds.push(callKind);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    specifiers: [...new Set(specifiers)].sort(),
    unresolvedCallKinds: [...new Set(unresolvedCallKinds)].sort(),
  } as const;
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

function reachableModulePaths(
  entrypoint: string,
  edges: ReadonlyMap<string, readonly string[]>,
) {
  const paths = new Map<string, readonly string[]>([[entrypoint, [entrypoint]]]);
  const pending = [entrypoint];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;
    const currentPath = paths.get(current) ?? [current];
    for (const next of edges.get(current) ?? []) {
      if (paths.has(next)) continue;
      paths.set(next, [...currentPath, next]);
      pending.push(next);
    }
  }
  return paths;
}

function buildModuleGraph(
  sourceModules: ReadonlyMap<string, string>,
) {
  const modules = new Map(
    [...sourceModules.entries()].map(([path, source]) => [
      normalizeRepositoryPath(path),
      source,
    ]),
  );
  const modulePaths = new Set(modules.keys());
  const edges = new Map<string, readonly string[]>();
  const unresolvedByModule = new Map<string, readonly ("import" | "require")[]>();

  for (const [path, source] of [...modules.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const inspected = inspectModule(path, source);
    const resolved = inspected.specifiers
      .map((specifier) => resolveInternalModule(path, specifier, modulePaths))
      .filter((target): target is string => target !== null);
    edges.set(path, [...new Set(resolved)].sort());
    if (inspected.unresolvedCallKinds.length > 0) {
      unresolvedByModule.set(path, inspected.unresolvedCallKinds);
    }
  }

  return { modulePaths, edges, unresolvedByModule } as const;
}

export function findProviderExecutionReachability(
  sourceModules: ReadonlyMap<string, string>,
): ProviderExecutionReachability[] {
  const { modulePaths, edges } = buildModuleGraph(sourceModules);

  return [...modulePaths]
    .filter(isPublicEntrypoint)
    .sort()
    .flatMap((entrypoint) => {
      const path = [...reachableModulePaths(entrypoint, edges).entries()]
        .find(([module]) => PROVIDER_EXECUTION_MODULE.test(module))?.[1];
      return path ? [{ entrypoint, path }] : [];
    });
}

export function findUnresolvedDynamicModuleReachability(
  sourceModules: ReadonlyMap<string, string>,
): UnresolvedDynamicModuleReachability[] {
  const { modulePaths, edges, unresolvedByModule } = buildModuleGraph(sourceModules);
  return [...modulePaths]
    .filter(isPublicEntrypoint)
    .sort()
    .flatMap((entrypoint) =>
      [...reachableModulePaths(entrypoint, edges).entries()].flatMap(
        ([unresolvedModule, path]) =>
          (unresolvedByModule.get(unresolvedModule) ?? []).map((callKind) => ({
            entrypoint,
            path,
            unresolvedModule,
            callKind,
          })),
      )
    );
}
