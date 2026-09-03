import { describe, expect, it } from "vitest";

import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37Q provider loader alias guard", () => {
  it("rejects a computed load through createRequire", () => {
    const modules = new Map([
      [
        "src/workers/provider-loader.ts",
        'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); const target = "./private"; load(target);',
      ],
    ]);

    expect(validateProviderBoundaryModules(modules).map((item) => item.code)).toContain(
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
    );
  });

  it("rejects computed loads through direct require aliases", () => {
    const modules = new Map([
      ["src/jobs/loader.cjs", "const load = require; load(target);"],
    ]);
    expect(validateProviderBoundaryModules(modules).map((item) => item.code)).toContain(
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
    );
  });

  it("tracks aliased and namespace createRequire imports", () => {
    for (const source of [
      'import { createRequire as make } from "node:module"; const load = make(import.meta.url); load(target);',
      'import * as nodeModule from "node:module"; const load = nodeModule.createRequire(import.meta.url); load(target);',
    ]) {
      const violations = validateProviderBoundaryModules(
        new Map([["src/workers/loader.mjs", source]]),
      );
      expect(violations.map((item) => item.code)).toContain(
        "R37O_UNRESOLVED_DYNAMIC_MODULE",
      );
    }
  });

  it("resolves literal alias loads into the transitive graph", () => {
    const modules = new Map([
      [
        "src/workers/loader.ts",
        'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("@/lib/facade");',
      ],
      [
        "src/lib/facade.ts",
        'export * from "@/server/construction-operating-assistant-r37f/provider-delivery";',
      ],
      [
        "src/server/construction-operating-assistant-r37f/provider-delivery.ts",
        "export const delivery = true;",
      ],
    ]);
    const violations = validateProviderBoundaryModules(modules);
    expect(violations.map((item) => item.code)).not.toContain(
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
    );
    expect(violations.map((item) => item.code)).toContain(
      "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
    );
  });
});
