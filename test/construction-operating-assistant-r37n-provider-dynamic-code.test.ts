import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findDynamicCodeExecutionReachability } from "@/lib/construction-operating-assistant-r37l/provider-reachability";

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

describe("R37N provider dynamic code guard", () => {
  it.each([
    ["eval", "eval(code);"],
    ["Function", "const fn = new Function(code); fn();"],
    ["node:vm", "vm.runInNewContext(code);"],
  ] as const)("reports public-reachable %s execution", (executionKind, sink) => {
    const modules = new Map([
      ["src/app/api/assistant/route.ts", 'import "@/server/provider-facade";'],
      ["src/server/provider-facade.ts", `const code = "safe fixture"; ${sink}`],
    ]);

    expect(findDynamicCodeExecutionReachability(modules)).toEqual([
      {
        entrypoint: "src/app/api/assistant/route.ts",
        path: ["src/app/api/assistant/route.ts", "src/server/provider-facade.ts"],
        executionModule: "src/server/provider-facade.ts",
        executionKind,
      },
    ]);
  });

  it("ignores unreachable internal dynamic code", () => {
    const modules = new Map([
      ["src/app/page.tsx", "export default function Page() { return null; }"],
      ["src/server/internal-only.ts", "eval(code);"],
    ]);
    expect(findDynamicCodeExecutionReachability(modules)).toEqual([]);
  });

  it("keeps the actual public source graph free of dynamic code execution", () => {
    const files = sourceFiles(join(repositoryRoot, "src"));
    const modules = new Map(
      files.map((absolute) => [repositoryPath(absolute), readFileSync(absolute, "utf8")]),
    );
    expect(findDynamicCodeExecutionReachability(modules)).toEqual([]);
  });
});
