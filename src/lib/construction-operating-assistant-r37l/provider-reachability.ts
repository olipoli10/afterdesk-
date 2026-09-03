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

export type DynamicCodeExecutionReachability = Readonly<{
  entrypoint: string;
  path: readonly string[];
  executionModule: string;
  executionKind: "eval" | "Function" | "node:vm";
}>;

const PROVIDER_EXECUTION_MODULE =
  /^src\/server\/construction-operating-assistant-r37(?:a|b|c|f)\//u;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;

function normalizeRepositoryPath(path: string) {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function isPublicEntrypoint(path: string) {
  return ["src/app/", "src/server/actions/", "src/jobs/", "src/workers/"].some(
    (root) => path.startsWith(root),
  );
}

function inspectModule(path: string, source: string) {
  const scriptKind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.(?:js|mjs|cjs)$/u.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const specifiers: string[] = [];
  const unresolvedCallKinds: Array<"import" | "require"> = [];
  const dynamicCodeKinds: Array<"eval" | "Function" | "node:vm"> = [];
  const addLiteral = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node)) {
      specifiers.push(node.text);
      if (node.text === "node:vm" || node.text === "vm") {
        dynamicCodeKinds.push("node:vm");
      }
    }
  };

  const dynamicCodeKind = (expression: ts.Expression) => {
    const directName = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : ts.isElementAccessExpression(expression) &&
            expression.argumentExpression &&
            ts.isStringLiteralLike(expression.argumentExpression)
          ? expression.argumentExpression.text
          : null;
    if (directName === "eval") return "eval" as const;
    if (directName === "Function") return "Function" as const;
    if (
      directName &&
      ["runInThisContext", "runInNewContext", "runInContext", "compileFunction"].includes(
        directName,
      )
    ) {
      return "node:vm" as const;
    }
    return null;
  };

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === "eval") {
      dynamicCodeKinds.push("eval");
    } else if (ts.isIdentifier(node) && node.text === "Function") {
      dynamicCodeKinds.push("Function");
    }
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
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const kind = dynamicCodeKind(node.expression);
      if (kind) dynamicCodeKinds.push(kind);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    specifiers: [...new Set(specifiers)].sort(),
    unresolvedCallKinds: [...new Set(unresolvedCallKinds)].sort(),
    dynamicCodeKinds: [...new Set(dynamicCodeKinds)].sort(),
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
    withoutJavaScriptExtension,
    ...SOURCE_EXTENSIONS.flatMap((extension) => [
      `${base}${extension}`,
      `${withoutJavaScriptExtension}${extension}`,
      `${base}/index${extension}`,
      `${withoutJavaScriptExtension}/index${extension}`,
    ]),
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
  const dynamicCodeByModule = new Map<
    string,
    readonly ("eval" | "Function" | "node:vm")[]
  >();

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
    if (inspected.dynamicCodeKinds.length > 0) {
      dynamicCodeByModule.set(path, inspected.dynamicCodeKinds);
    }
  }

  return { modulePaths, edges, unresolvedByModule, dynamicCodeByModule } as const;
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

export function findDynamicCodeExecutionReachability(
  sourceModules: ReadonlyMap<string, string>,
): DynamicCodeExecutionReachability[] {
  const { modulePaths, edges, dynamicCodeByModule } = buildModuleGraph(sourceModules);
  return [...modulePaths]
    .filter(isPublicEntrypoint)
    .sort()
    .flatMap((entrypoint) =>
      [...reachableModulePaths(entrypoint, edges).entries()].flatMap(
        ([executionModule, path]) =>
          (dynamicCodeByModule.get(executionModule) ?? []).map((executionKind) => ({
            entrypoint,
            path,
            executionModule,
            executionKind,
          })),
      )
    );
}
