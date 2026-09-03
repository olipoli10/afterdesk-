import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) => validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AN provider Reflect namespace assignments", () => {
  it("rejects a computed require target through a directly assigned Reflect namespace", () => {
    const source = ["let reflector = helper;", "reflector = Reflect;", "reflector.apply(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed loader target after assignment propagation", () => {
    const source = ['const moduleApi = require("node:module");', "const loader = moduleApi.createRequire(import.meta.url);", "const first = Reflect;", "let second = helper;", "second = (first);", "const { apply: invoke } = second;", "invoke(loader, undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify an unrelated object assignment", () => {
    const source = ["let reflector = fallback;", "reflector = helper;", "reflector.apply(require, undefined, [target]);"].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
