import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AJ provider transparent Reflect.apply aliases", () => {
  it("rejects a computed require target through a parenthesized alias", () => {
    const source = [
      "const invoke = Reflect.apply;",
      "const invokeAgain = (invoke);",
      "invokeAgain(require, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed tracked loader target through a typed alias", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      "const invoke = Reflect.apply;",
      "const invokeAgain = invoke as typeof invoke;",
      "invokeAgain(loader, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify an unrelated wrapped alias as a module load", () => {
    const source = [
      "const invoke = helper;",
      "const invokeAgain = (invoke);",
      "invokeAgain(require, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
