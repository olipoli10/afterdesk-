import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findUnresolvedDynamicModuleReachability } from "@/lib/construction-operating-assistant-r37l/provider-reachability";

const repositoryRoot = process.cwd();

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [absolute] : [];
  });
}

function repositoryPath(absolute: string) {
  return relative(repositoryRoot, absolute).replaceAll("\\", "/");
}

describe("R37M provider computed import guard", () => {
  it("reports a computed import reachable through a neutral facade", () => {
    const modules = new Map([
      ["src/app/api/assistant/route.ts", 'import { run } from "@/server/provider-facade";'],
      ["src/server/provider-facade.ts", 'const target = "./provider-runtime"; export const run = () => import(target);'],
      ["src/server/provider-runtime.ts", "export const runtime = true;"],
    ]);

    expect(findUnresolvedDynamicModuleReachability(modules)).toEqual([
      {
        entrypoint: "src/app/api/assistant/route.ts",
        path: ["src/app/api/assistant/route.ts", "src/server/provider-facade.ts"],
        unresolvedModule: "src/server/provider-facade.ts",
        callKind: "import",
      },
    ]);
  });

  it("reports a computed require reachable from a public worker", () => {
    const modules = new Map([
      ["src/workers/assistant.ts", 'import "../server/provider-facade";'],
      ["src/server/provider-facade.ts", 'const target = "./provider-runtime"; require(target);'],
      ["src/server/provider-runtime.ts", "export const runtime = true;"],
    ]);

    expect(findUnresolvedDynamicModuleReachability(modules)[0]?.callKind).toBe("require");
  });

  it("ignores unreachable internal computed imports", () => {
    const modules = new Map([
      ["src/app/page.tsx", "export default function Page() { return null; }"],
      ["src/server/internal-only.ts", "const target = './private'; void import(target);"],
      ["src/server/private.ts", "export const value = true;"],
    ]);
    expect(findUnresolvedDynamicModuleReachability(modules)).toEqual([]);
  });

  it("keeps the actual public source graph free of unresolved dynamic loads", () => {
    const files = sourceFiles(join(repositoryRoot, "src"));
    const modules = new Map(
      files.map((absolute) => [repositoryPath(absolute), readFileSync(absolute, "utf8")]),
    );
    expect(findUnresolvedDynamicModuleReachability(modules)).toEqual([]);
  });
});
