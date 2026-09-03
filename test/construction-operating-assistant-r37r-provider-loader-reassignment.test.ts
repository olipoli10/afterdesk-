import { describe, expect, it } from "vitest";

import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37R provider loader reassignment guard", () => {
  it.each([
    "let load; load = require; load(target);",
    'const { createRequire: make } = require("node:module"); const load = make(import.meta.url); load(target);',
  ])("rejects hidden computed loader form: %s", (source) => {
    const violations = validateProviderBoundaryModules(
      new Map([["src/workers/reassigned-loader.ts", source]]),
    );
    expect(violations.map((item) => item.code)).toContain(
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
    );
  });
});
