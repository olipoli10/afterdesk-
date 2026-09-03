import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AC provider indirect loader calls", () => {
  it("rejects a computed require target invoked with call", () => {
    expect(codesFor("require.call(undefined, target);")).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed aliased loader target invoked with apply", () => {
    const source = ["const loader = require;", "loader.apply(undefined, [target]);"].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed createRequire loader target invoked with call", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = moduleApi.createRequire(import.meta.url);",
      "loader.call(undefined, target);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
