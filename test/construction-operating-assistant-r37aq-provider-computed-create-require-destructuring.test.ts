import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AQ provider computed createRequire destructuring", () => {
  it("rejects a computed target through a computed createRequire binding", () => {
    const source = ['const { ["createRequire"]: makeRequire } = require("node:module");', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("retains the direct createRequire binding guard", () => {
    const source = ['const { createRequire: makeRequire } = require("node:module");', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another computed module property", () => {
    const source = ['const { ["resolve"]: makeRequire } = require("node:module");', "const loader = makeRequire(import.meta.url);", "loader(target);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
