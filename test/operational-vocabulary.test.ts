import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE VOCABULARY WALL — promised by cost-provenance.ts. No operational
 * surface may call any figure a "real" cost or a "marge réelle": every 1C
 * cost is booked, metered, modeledFromMeasured or modeled, and a modeled
 * margin presented as "real" is exactly the lie the provenance taxonomy
 * exists to prevent. This scans the operational surfaces at the source
 * level, because the failure mode is a WORD in a label or a doc comment,
 * which no type checker will ever catch.
 *
 * Deliberately scoped: academy course prose talks about a worker's own
 * "real costs" of doing business — that is personal-finance teaching
 * material, not an operational cost claim, and it stays out of scope.
 */

const ROOT = join(__dirname, "..");

const OPERATIONAL_SURFACES = [
  "src/lib/operational-intelligence",
  "src/lib/queries/operational-intelligence.ts",
  "src/server/operational-actuals.ts",
  "src/server/operational-baseline.ts",
  "src/server/workflow-calibration.ts",
  "src/server/ai-operations.ts",
  "src/server/work-sessions.ts",
  "src/components/estimated-vs-actual.tsx",
  "src/components/execution-panel.tsx",
  "src/components/work-session-timer.tsx",
  "src/app/admin/calibration",
];

const FORBIDDEN = /real costs?|marge r[ée]elle|realCost/i;

function collectFiles(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(path, f));
}

describe("no operational surface claims a cost or margin is `real`", () => {
  const files = OPERATIONAL_SURFACES.flatMap(collectFiles);

  it("the scan is not vacuous — it really covers the operational code", () => {
    expect(files.length).toBeGreaterThan(12);
    expect(files.some((f) => f.includes("cost-provenance"))).toBe(true);
    expect(files.some((f) => f.includes("estimated-vs-actual"))).toBe(true);
  });

  for (const file of files) {
    it(`${file.replaceAll("\\", "/")} uses provenance vocabulary only`, () => {
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
      const offending = lines
        .map((line, i) => ({ line, n: i + 1 }))
        // The one allowed mention: the sentence in cost-provenance.ts that
        // DECLARES the ban (it necessarily names the forbidden phrase).
        .filter(({ line }) => FORBIDDEN.test(line) && !/forbidden/.test(line));
      expect(
        offending,
        offending.map(({ n, line }) => `${file}:${n} ${line.trim()}`).join("\n")
      ).toEqual([]);
    });
  }
});
