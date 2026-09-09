import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import {
  findProviderExecutionReachability,
  findUnresolvedDynamicModuleReachability,
  findDynamicCodeExecutionReachability,
} from "@/lib/construction-operating-assistant-r37l/provider-reachability";

vi.mock("typescript", async () => {
  const actual = await vi.importActual<{ default: typeof ts }>("typescript");
  return { ...actual, default: { ...actual.default, createSourceFile: vi.fn(actual.default.createSourceFile) } };
});

describe("R37L public-reachable graph construction", () => {
  beforeEach(() => { vi.mocked(ts.createSourceFile).mockClear(); });

  it.each([
    ["provider", findProviderExecutionReachability],
    ["computed import", findUnresolvedDynamicModuleReachability],
    ["dynamic code", findDynamicCodeExecutionReachability],
  ] as const)("parses each public-reachable module once for %s, including cycles", (_name, analyze) => {
    const modules = new Map([
      ["src/app/page.tsx", 'import "../server/facade";'],
      ["src/jobs/worker.ts", 'import "../server/facade";'],
      ["src/server/facade.ts", 'import "./shared";'],
      ["src/server/shared.ts", 'import "./facade";'],
      ["src/server/detached.ts", 'eval(code); const moduleName = "private"; import(moduleName);'],
    ]);
    expect(analyze(modules)).toEqual([]);
    expect(vi.mocked(ts.createSourceFile).mock.calls.map(([path]) => path).sort()).toEqual([
      "src/app/page.tsx", "src/jobs/worker.ts", "src/server/facade.ts", "src/server/shared.ts",
    ]);
  });

  it("freshly detects a changed Map and newly reachable dangerous source", () => {
    const modules = new Map([
      ["src/app/page.tsx", "export default null;"],
      ["src/server/detached.ts", 'eval(code); const name = "private"; import(name);'],
      ["src/server/construction-operating-assistant-r37f/provider-delivery.ts", "export const value = true;"],
    ]);
    expect(findDynamicCodeExecutionReachability(modules)).toEqual([]);
    modules.set("src/app/page.tsx", 'import "../server/detached";');
    expect(findDynamicCodeExecutionReachability(modules)[0]?.executionKind).toBe("eval");
    expect(findUnresolvedDynamicModuleReachability(modules)[0]?.callKind).toBe("import");
    modules.set("src/server/detached.ts", 'export * from "./construction-operating-assistant-r37f/provider-delivery";');
    expect(findProviderExecutionReachability(modules)[0]?.path).toEqual([
      "src/app/page.tsx", "src/server/detached.ts", "src/server/construction-operating-assistant-r37f/provider-delivery.ts",
    ]);
    modules.set("src/app/page.tsx", "export default null;");
    expect(findProviderExecutionReachability(modules)).toEqual([]);
  });
});
