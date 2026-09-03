import { describe, expect, it } from "vitest";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37S provider loader alias propagation", () => {
  it("rejects a computed load through a second-generation require alias", () => {
    const source = "const first = require; const second = first; second(target);";
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through an assigned second-generation require alias", () => {
    const source = "const first = require; let second; second = first; second(target);";
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("rejects a computed load through an aliased createRequire factory", () => {
    const source = [
      'import { createRequire } from "node:module";',
      "const makeLoader = createRequire;",
      "const first = makeLoader(import.meta.url);",
      "const second = first;",
      "second(target);",
    ].join("\n");
    expect(
      validateProviderBoundaryModules(new Map([["src/jobs/loader.ts", source]])).map(
        (item) => item.code,
      ),
    ).toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });

  it("resolves a literal module through a second-generation loader alias", () => {
    const result = validateProviderBoundaryModules(
      new Map([
        ["src/jobs/loader.ts", 'const first = require; const second = first; second("./facade");'],
        ["src/jobs/facade.ts", 'export * from "@/server/construction-operating-assistant-r37a/executor";'],
        ["src/server/construction-operating-assistant-r37a/executor.ts", "export const run = true;"],
      ]),
    );
    expect(result.map((item) => item.code)).toContain("R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED");
    expect(result.map((item) => item.code)).not.toContain("R37O_UNRESOLVED_DYNAMIC_MODULE");
  });
});
