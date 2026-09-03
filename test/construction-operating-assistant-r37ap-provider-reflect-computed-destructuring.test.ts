import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AP provider Reflect computed destructuring", () => {
  it("rejects a computed require target through a computed binding property", () => {
    const source = ['const { ["apply"]: invoke } = Reflect;', "invoke(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed loader target through a computed assignment property", () => {
    const source = ['const moduleApi = require("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "const reflector = Reflect;", "let invoke = helper;", '({ ["apply"]: invoke } = reflector);', "invoke(loader, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify another computed property", () => {
    const source = ['const { ["call"]: invoke } = Reflect;', "invoke(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
