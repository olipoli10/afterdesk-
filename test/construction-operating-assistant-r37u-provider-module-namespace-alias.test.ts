import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37U provider module namespace alias propagation", () => {
  it("rejects a computed load through a second-generation CommonJS module namespace", () => {
    const source = [
      'const first = require("node:module");',
      "const second = first;",
      "const loader = second.createRequire(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through an assigned module namespace alias", () => {
    const source = [
      'const first = require("module");',
      "let second;",
      "second = first;",
      "const loader = second.createRequire(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("keeps literal loads visible through a module namespace alias", () => {
    const result = validateProviderBoundaryModules(
      new Map([
        [
          "src/jobs/loader.ts",
          [
            'const first = require("node:module");',
            "const second = first;",
            "const loader = second.createRequire(import.meta.url);",
            'loader("./facade");',
          ].join("\n"),
        ],
        ["src/jobs/facade.ts", 'export * from "@/server/construction-operating-assistant-r37a/executor";'],
        ["src/server/construction-operating-assistant-r37a/executor.ts", "export const run = true;"],
      ]),
    );
    expect(result.map((item) => item.code)).toContain("R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED");
    expect(result.map((item) => item.code)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
