import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37T provider module namespace loader", () => {
  it("rejects a computed load created through a CommonJS node:module namespace", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through an assigned CommonJS module namespace", () => {
    const source = [
      "let moduleApi;",
      'moduleApi = require("module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("resolves literal loads created through a CommonJS module namespace", () => {
    const result = validateProviderBoundaryModules(
      new Map([
        [
          "src/jobs/loader.ts",
          [
            'const moduleApi = require("node:module");',
            "const loader = moduleApi.createRequire(import.meta.url);",
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
