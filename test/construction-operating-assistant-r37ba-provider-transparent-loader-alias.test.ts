import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37BA provider transparent loader alias", () => {
  it("rejects a dynamic target through a wrapped require alias declaration", () => {
    const source = ["const req = require as NodeRequire;", 'const moduleApi = req("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a dynamic target through a wrapped require alias assignment", () => {
    const source = ["let req;", "req = (require as NodeRequire);", 'const moduleApi = req("module");', "const loader = moduleApi.createRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify an unrelated wrapped identifier as a loader", () => {
    const source = ["declare const other: Function;", "const req = other as NodeRequire;", "req(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
