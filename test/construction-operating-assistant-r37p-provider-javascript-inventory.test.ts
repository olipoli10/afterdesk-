import { describe, expect, it } from "vitest";

import {
  isProviderBoundarySourcePath,
  validateProviderBoundaryModules,
} from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37P JavaScript-family provider boundary inventory", () => {
  it.each(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"])(
    "inventories .%s executable source modules",
    (extension) => {
      expect(isProviderBoundarySourcePath(`src/app/route.${extension}`)).toBe(true);
    },
  );

  it("ignores non-executable artifacts", () => {
    expect(isProviderBoundarySourcePath("src/app/route.json")).toBe(false);
    expect(isProviderBoundarySourcePath("src/app/route.css")).toBe(false);
  });

  it("rejects an extensionless public JavaScript chain to sealed provider execution", () => {
    const modules = new Map([
      ["src/app/api/provider/route.js", 'import "@/lib/provider-facade";'],
      [
        "src/lib/provider-facade.js",
        'export * from "@/server/construction-operating-assistant-r37f/provider-delivery";',
      ],
      [
        "src/server/construction-operating-assistant-r37f/provider-delivery.js",
        "export const delivery = true;",
      ],
    ]);

    expect(validateProviderBoundaryModules(modules)).toContainEqual({
      code: "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
      path: "src/app/api/provider/route.js",
      detail:
        "src/app/api/provider/route.js -> src/lib/provider-facade.js -> src/server/construction-operating-assistant-r37f/provider-delivery.js",
    });
  });

  it("resolves JavaScript-family index modules across mixed extensions", () => {
    const modules = new Map([
      ["src/workers/provider.cjs", 'require("@/lib/provider-index");'],
      [
        "src/lib/provider-index/index.mjs",
        'export * from "@/server/construction-operating-assistant-r37c/coordinator.js";',
      ],
      [
        "src/server/construction-operating-assistant-r37c/coordinator.ts",
        "export const coordinator = true;",
      ],
    ]);

    expect(validateProviderBoundaryModules(modules)).toContainEqual({
      code: "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
      path: "src/workers/provider.cjs",
      detail:
        "src/workers/provider.cjs -> src/lib/provider-index/index.mjs -> src/server/construction-operating-assistant-r37c/coordinator.ts",
    });
  });
});
