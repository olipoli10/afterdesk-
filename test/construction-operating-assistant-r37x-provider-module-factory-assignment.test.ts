import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37X provider module factory assignment", () => {
  it("rejects a computed load through an assigned namespace factory", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "let factory;",
      'factory = moduleApi["createRequire"];',
      "const loader = factory(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});

