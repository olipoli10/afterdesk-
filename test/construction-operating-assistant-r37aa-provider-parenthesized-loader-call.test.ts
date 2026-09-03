import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37AA provider parenthesized loader calls", () => {
  it("rejects a computed load through a parenthesized require alias", () => {
    const source = [
      "const loader = require;",
      "(loader)(target);",
    ].join("\n");
    expect(validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through a parenthesized createRequire loader", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      "(loader)(target);",
    ].join("\n");
    expect(validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
