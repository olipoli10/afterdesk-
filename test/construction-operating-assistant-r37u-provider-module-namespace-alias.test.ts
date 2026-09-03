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
});
