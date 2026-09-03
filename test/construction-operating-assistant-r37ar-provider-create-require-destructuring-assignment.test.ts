import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AR provider createRequire destructuring assignment", () => {
  it("rejects a computed target through a direct createRequire destructuring assignment", () => {
    const source = ["let makeRequire;", '({ createRequire: makeRequire } = require("node:module"));', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed target through a computed createRequire destructuring assignment", () => {
    const source = ["let makeRequire;", '({ ["createRequire"]: makeRequire } = require("node:module"));', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another assigned module property", () => {
    const source = ["let makeRequire;", '({ ["resolve"]: makeRequire } = require("node:module"));', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
