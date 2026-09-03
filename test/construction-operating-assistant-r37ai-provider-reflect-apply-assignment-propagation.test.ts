import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AI provider Reflect.apply assignment propagation", () => {
  it("rejects a computed require target invoked through an assignment-propagated Reflect.apply alias", () => {
    const source = [
      "const invoke = Reflect.apply;",
      "let invokeAgain = helper;",
      "invokeAgain = invoke;",
      "invokeAgain(require, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed tracked loader target through assignment-propagated element access", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      'const invoke = Reflect["apply"];',
      "let invokeAgain = helper;",
      "invokeAgain = invoke;",
      "invokeAgain(loader, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("does not classify unrelated identifier assignments as module loads", () => {
    const source = [
      "const invoke = helper;",
      "let invokeAgain = fallback;",
      "invokeAgain = invoke;",
      "invokeAgain(require, undefined, [target]);",
    ].join("\n");
    expect(codesFor(source)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
