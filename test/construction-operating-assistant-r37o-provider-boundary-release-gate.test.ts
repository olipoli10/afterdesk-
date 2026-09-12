import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

describe("R37O provider boundary release gate", () => {
  it("is mandatory before the release build", async () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["validate:provider-boundary"]).toBe(
      "tsx scripts/validate-provider-boundary.ts",
    );
    expect(packageJson.scripts.build).toBe("node scripts/vercel-build.mjs");
    const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      buildCommand?: string;
    };
    expect(vercelConfig.buildCommand).toBe("node scripts/vercel-build.mjs");
    const pipeline = await import("../scripts/vercel-build.mjs");
    expect(
      pipeline.resolveBuildPipelineCommands(
        pipeline.computePlan({ VERCEL_ENV: "development" }),
      ),
    ).toEqual(["npm run validate:provider-boundary", "next build"]);
    expect(
      pipeline.resolveBuildPipelineCommands(
        pipeline.computePlan({ VERCEL_ENV: "production", DIRECT_URL: "configured" }),
        [],
        { ENDVERA_BUILD_VERIFY_PERSONAL_PROVIDER_KEY: "true" },
      ),
    ).toEqual([
      "npm run validate:provider-boundary",
      pipeline.PERSONAL_PROVIDER_DIAGNOSTIC_COMMAND,
      "prisma migrate deploy",
      "next build",
    ]);
  });

  it("accepts a safe public source graph", () => {
    expect(
      validateProviderBoundaryModules(
        new Map([["src/app/page.tsx", "export default function Page() { return null; }"]]),
      ),
    ).toEqual([]);
  });

  it("composes direct, transitive, computed and dynamic-code violations", () => {
    const modules = new Map([
      [
        "src/app/api/direct/route.ts",
        'import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";',
      ],
      ["src/app/api/transitive/route.ts", 'import "@/server/provider-facade";'],
      [
        "src/server/provider-facade.ts",
        'export * from "./construction-operating-assistant-r37f/provider-delivery";',
      ],
      ["src/server/construction-operating-assistant-r37f/provider-delivery.ts", "export const delivery = true;"],
      ["src/jobs/computed.ts", "const target = './runtime'; void import(target);"],
      ["src/workers/dynamic.ts", "eval(code);"],
    ]);

    expect(validateProviderBoundaryModules(modules).map((item) => item.code)).toEqual([
      "R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED",
      "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
      "R37O_UNRESOLVED_DYNAMIC_MODULE",
      "R37O_DYNAMIC_CODE_EXECUTION",
    ]);
  });
});
