import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("personal device bridge production release", () => {
  it("uses the guarded production migration pipeline without enabling a cron", () => {
    const config = JSON.parse(readFileSync(join(
      root,
      "specs/210-personal-live-activation/deployment/vercel.personal.release.json",
    ), "utf8"));
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    expect(config.buildCommand).toBe("npm run build");
    expect(config.crons).toEqual([]);
    expect(packageJson.scripts.build).toBe("node scripts/vercel-build.mjs");
  });
});
