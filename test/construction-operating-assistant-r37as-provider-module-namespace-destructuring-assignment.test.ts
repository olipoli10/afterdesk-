import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AS provider module namespace destructuring assignment", () => {
  it("rejects a computed target through a direct property assignment", () => {
    const source = ['const moduleApi = require("node:module");', "let makeRequire;", "({ createRequire: makeRequire } = moduleApi);", "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed target through a computed property assignment", () => {
    const source = ['const moduleApi = require("node:module");', "let makeRequire;", '({ ["createRequire"]: makeRequire } = moduleApi);', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another assigned namespace property", () => {
    const source = ['const moduleApi = require("node:module");', "let makeRequire;", '({ ["resolve"]: makeRequire } = moduleApi);', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
