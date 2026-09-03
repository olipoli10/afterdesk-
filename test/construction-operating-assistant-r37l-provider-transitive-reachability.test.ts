import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findProviderExecutionReachability } from "@/lib/construction-operating-assistant-r37l/provider-reachability";

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

describe("R37L provider transitive reachability guard", () => {
  it("finds an exact route-to-facade-to-provider execution chain", () => {
    const modules = new Map([
      [
        "src/app/api/assistant/route.ts",
        'import {\n  run,\n} from "@/server/provider-facade";',
      ],
      [
        "src/server/provider-facade.ts",
        'export { executeControlledSyntheticProviderDelivery as run } from "@/server/construction-operating-assistant-r37f/provider-delivery";',
      ],
      ["src/server/construction-operating-assistant-r37f/provider-delivery.ts", "export const executeControlledSyntheticProviderDelivery = () => {};"],
    ]);

    expect(findProviderExecutionReachability(modules)).toEqual([
      {
        entrypoint: "src/app/api/assistant/route.ts",
        path: [
          "src/app/api/assistant/route.ts",
          "src/server/provider-facade.ts",
          "src/server/construction-operating-assistant-r37f/provider-delivery.ts",
        ],
      },
    ]);
  });

  it("finds TypeScript import-equals facade chains", () => {
    const modules = new Map([
      ["src/workers/provider.ts", 'import facade = require("../server/provider-facade");'],
      ["src/server/provider-facade.ts", 'export * from "./construction-operating-assistant-r37c/coordinator";'],
      ["src/server/construction-operating-assistant-r37c/coordinator.ts", "export const controlled = true;"],
    ]);

    expect(findProviderExecutionReachability(modules)[0]?.path).toEqual([
      "src/workers/provider.ts",
      "src/server/provider-facade.ts",
      "src/server/construction-operating-assistant-r37c/coordinator.ts",
    ]);
  });

  it("finds dynamic, require and index-facade chains", () => {
    const modules = new Map([
      ["src/jobs/provider.ts", 'const facade = require("../server/provider-facade");'],
      ["src/server/provider-facade.ts", 'const provider = import("./provider-runtime");'],
      ["src/server/provider-runtime/index.ts", 'import "../construction-operating-assistant-r37a/sealed-executor";'],
      ["src/server/construction-operating-assistant-r37a/sealed-executor.ts", "export const sealed = true;"],
    ]);

    expect(findProviderExecutionReachability(modules)[0]?.path).toEqual([
      "src/jobs/provider.ts",
      "src/server/provider-facade.ts",
      "src/server/provider-runtime/index.ts",
      "src/server/construction-operating-assistant-r37a/sealed-executor.ts",
    ]);
  });

  it("keeps the actual public source graph detached from R37 execution modules", () => {
    const files = sourceFiles(join(repositoryRoot, "src"));
    const modules = new Map(
      files.map((absolute) => [repositoryPath(absolute), readFileSync(absolute, "utf8")]),
    );
    expect(modules.size).toBeGreaterThan(0);
    expect(findProviderExecutionReachability(modules)).toEqual([]);
  });
});
