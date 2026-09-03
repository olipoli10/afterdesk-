import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AE provider Reflect element-access loader calls", () => {
  it("rejects a computed require target invoked through string-literal element access", () => {
    expect(codesFor('Reflect["apply"](require, undefined, [target]);')).toContain(
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
    );
  });

  it("rejects a computed createRequire loader target through string-literal element access", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      'Reflect["apply"](loader, undefined, [target]);',
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
