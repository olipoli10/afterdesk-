import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AO provider Reflect destructuring assignments", () => {
  it("rejects a computed require target through a renamed destructuring assignment", () => {
    const source = ["let invoke = helper;", "({ apply: invoke } = Reflect);", "invoke(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed loader target through shorthand assignment from a namespace alias", () => {
    const source = ['const moduleApi = require("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "const reflector = Reflect;", "let apply = helper;", "({ apply } = reflector);", "apply(loader, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify destructuring assignment from an unrelated object", () => {
    const source = ["let invoke = fallback;", "({ apply: invoke } = helper);", "invoke(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
