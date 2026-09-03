import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AY provider transparent require namespace assignment", () => {
  it("rejects a dynamic target through parenthesized require assignment", () => {
    const source = ["let moduleApi;", 'moduleApi = (require)("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a dynamic target through asserted require assignment", () => {
    const source = ["let moduleApi;", 'moduleApi = require("module") as typeof import("module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify assignment from another wrapped module", () => {
    const source = ["let moduleApi;", 'moduleApi = (require)("node:path");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
