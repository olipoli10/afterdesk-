import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AV provider transparent require namespace", () => {
  it("rejects a dynamic target through a parenthesized require namespace", () => {
    const source = ['const moduleApi = (require)("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a dynamic target through an asserted require namespace", () => {
    const source = ['const moduleApi = require("module") as typeof import("module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another wrapped require namespace", () => {
    const source = ['const moduleApi = (require)("node:path");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
