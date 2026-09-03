import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37Z provider parenthesized loader factory", () => {
  it("rejects a computed load through a parenthesized namespace factory", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = (moduleApi.createRequire)(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through a parenthesized extracted factory", () => {
    const source = [
      'const moduleApi = require("module");',
      "const factory = moduleApi.createRequire;",
      "let loader;",
      "loader = (factory)(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
