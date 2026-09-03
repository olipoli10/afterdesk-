import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AM provider Reflect namespace aliases", () => {
  it("rejects a computed require target through a Reflect namespace alias", () => {
    const source = ["const reflector = Reflect;", "reflector.apply(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed tracked loader target through destructuring from a Reflect alias", () => {
    const source = ['const moduleApi = require("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "const reflector = (Reflect);", "const { apply: invoke } = reflector;", "invoke(loader, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify an alias of an unrelated object", () => {
    const source = ["const reflector = helper;", "reflector.apply(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
