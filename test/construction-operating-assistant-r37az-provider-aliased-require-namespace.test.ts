import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AZ provider aliased require namespace", () => {
  it("rejects a dynamic target through a declared namespace from a require alias", () => {
    const source = ["const req = require;", 'const moduleApi = req("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a dynamic target through an assigned namespace from a require alias", () => {
    const source = ["const req = require;", "let moduleApi;", 'moduleApi = req("module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another module loaded through a require alias", () => {
    const source = ["const req = require;", 'const moduleApi = req("node:path");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
