import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const codesFor = (source: string) =>
  validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map((item) => item.code);

describe("R37AB provider transparent expressions", () => {
  it("rejects a computed load through an as-wrapped createRequire factory", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = (moduleApi.createRequire as typeof moduleApi.createRequire)(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through a satisfies-wrapped factory", () => {
    const source = [
      'const moduleApi = require("node:module");',
      "const loader = (moduleApi.createRequire satisfies typeof moduleApi.createRequire)(import.meta.url);",
      "loader(target);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through an as-wrapped loader", () => {
    const source = [
      "const loader = require;",
      "(loader as (id: string) => unknown)(target);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through a non-null loader", () => {
    const source = [
      "const loader = require;",
      "loader!(target);",
    ].join("\n");
    expect(codesFor(source)).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
