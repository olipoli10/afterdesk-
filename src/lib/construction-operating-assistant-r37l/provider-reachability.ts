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

function unwrapParenthesizedExpression(expression: ts.Expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
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
  const createRequireIdentifiers = new Set(["createRequire"]);
  const moduleNamespaceIdentifiers = new Set<string>();
  const requireLoaderIdentifiers = new Set<string>();
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
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        ["node:module", "module"].includes(node.moduleSpecifier.text)
      ) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if ((element.propertyName ?? element.name).text === "createRequire") {
              createRequireIdentifiers.add(element.name.text);
            }
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          moduleNamespaceIdentifiers.add(bindings.name.text);
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const callTarget = unwrapParenthesizedExpression(node.expression);
      if (
        callTarget.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callTarget) &&
          (callTarget.text === "require" || requireLoaderIdentifiers.has(callTarget.text)))
      ) {
        const callKind = callTarget.kind === ts.SyntaxKind.ImportKeyword
          ? "import"
          : "require";
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) {
          addLiteral(argument);
        } else {
          unresolvedCallKinds.push(callKind);
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer
    ) {
      if (
        ts.isIdentifier(node.name) &&
        ts.isIdentifier(node.initializer) &&
        (node.initializer.text === "require" ||
          requireLoaderIdentifiers.has(node.initializer.text))
      ) {
        requireLoaderIdentifiers.add(node.name.text);
      } else if (
        ts.isIdentifier(node.name) &&
        ts.isIdentifier(node.initializer) &&
        createRequireIdentifiers.has(node.initializer.text)
      ) {
        createRequireIdentifiers.add(node.name.text);
      } else if (
        ts.isIdentifier(node.name) &&
        ((ts.isPropertyAccessExpression(node.initializer) &&
          node.initializer.name.text === "createRequire" &&
          ts.isIdentifier(node.initializer.expression) &&
          moduleNamespaceIdentifiers.has(node.initializer.expression.text)) ||
          (ts.isElementAccessExpression(node.initializer) &&
            node.initializer.argumentExpression &&
            ts.isStringLiteralLike(node.initializer.argumentExpression) &&
            node.initializer.argumentExpression.text === "createRequire" &&
            ts.isIdentifier(node.initializer.expression) &&
            moduleNamespaceIdentifiers.has(node.initializer.expression.text)))
      ) {
        createRequireIdentifiers.add(node.name.text);
      } else if (
        ts.isIdentifier(node.name) &&
        ts.isIdentifier(node.initializer) &&
        moduleNamespaceIdentifiers.has(node.initializer.text)
      ) {
        moduleNamespaceIdentifiers.add(node.name.text);
      } else if (
        ts.isIdentifier(node.name) &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "require" &&
        node.initializer.arguments[0] &&
        ts.isStringLiteralLike(node.initializer.arguments[0]) &&
        ["node:module", "module"].includes(node.initializer.arguments[0].text)
      ) {
        moduleNamespaceIdentifiers.add(node.name.text);
      } else if (ts.isIdentifier(node.name) && ts.isCallExpression(node.initializer)) {
        const factory = unwrapParenthesizedExpression(node.initializer.expression);
        const isCreateRequire =
          (ts.isIdentifier(factory) && createRequireIdentifiers.has(factory.text)) ||
          (ts.isPropertyAccessExpression(factory) &&
            factory.name.text === "createRequire" &&
            ts.isIdentifier(factory.expression) &&
            moduleNamespaceIdentifiers.has(factory.expression.text)) ||
          (ts.isElementAccessExpression(factory) &&
            factory.argumentExpression &&
            ts.isStringLiteralLike(factory.argumentExpression) &&
            factory.argumentExpression.text === "createRequire" &&
            ts.isIdentifier(factory.expression) &&
            moduleNamespaceIdentifiers.has(factory.expression.text));
        if (isCreateRequire) requireLoaderIdentifiers.add(node.name.text);
      } else if (
        ts.isObjectBindingPattern(node.name) &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "require" &&
        node.initializer.arguments[0] &&
        ts.isStringLiteralLike(node.initializer.arguments[0]) &&
        ["node:module", "module"].includes(node.initializer.arguments[0].text)
      ) {
        for (const element of node.name.elements) {
          if (
            ts.isIdentifier(element.name) &&
            (element.propertyName ?? element.name).getText(sourceFile) === "createRequire"
          ) {
            createRequireIdentifiers.add(element.name.text);
          }
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isIdentifier(node.right) &&
      (node.right.text === "require" || requireLoaderIdentifiers.has(node.right.text))
    ) {
      requireLoaderIdentifiers.add(node.left.text);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isIdentifier(node.right) &&
      createRequireIdentifiers.has(node.right.text)
    ) {
      createRequireIdentifiers.add(node.left.text);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isCallExpression(node.right) &&
      (() => {
        const factory = unwrapParenthesizedExpression(node.right.expression);
        return (
          (ts.isIdentifier(factory) && createRequireIdentifiers.has(factory.text)) ||
          (ts.isPropertyAccessExpression(factory) &&
            factory.name.text === "createRequire" &&
            ts.isIdentifier(factory.expression) &&
            moduleNamespaceIdentifiers.has(factory.expression.text)) ||
          (ts.isElementAccessExpression(factory) &&
            factory.argumentExpression &&
            ts.isStringLiteralLike(factory.argumentExpression) &&
            factory.argumentExpression.text === "createRequire" &&
            ts.isIdentifier(factory.expression) &&
            moduleNamespaceIdentifiers.has(factory.expression.text))
        );
      })()
    ) {
      requireLoaderIdentifiers.add(node.left.text);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ((ts.isPropertyAccessExpression(node.right) &&
        node.right.name.text === "createRequire" &&
        ts.isIdentifier(node.right.expression) &&
        moduleNamespaceIdentifiers.has(node.right.expression.text)) ||
        (ts.isElementAccessExpression(node.right) &&
          node.right.argumentExpression &&
          ts.isStringLiteralLike(node.right.argumentExpression) &&
          node.right.argumentExpression.text === "createRequire" &&
          ts.isIdentifier(node.right.expression) &&
          moduleNamespaceIdentifiers.has(node.right.expression.text)))
    ) {
      createRequireIdentifiers.add(node.left.text);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isIdentifier(node.right) &&
      moduleNamespaceIdentifiers.has(node.right.text)
    ) {
      moduleNamespaceIdentifiers.add(node.left.text);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isCallExpression(node.right) &&
      ts.isIdentifier(node.right.expression) &&
      node.right.expression.text === "require" &&
      node.right.arguments[0] &&
      ts.isStringLiteralLike(node.right.arguments[0]) &&
      ["node:module", "module"].includes(node.right.arguments[0].text)
    ) {
      moduleNamespaceIdentifiers.add(node.left.text);
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
