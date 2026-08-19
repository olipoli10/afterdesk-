import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  const absolute = join(ROOT, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

describe("HumanWorkUnit role-shaped surfaces", () => {
  it("keeps the worker panel on the minimum worker projection and worker action", () => {
    const worker = source("src/components/human-work-unit-worker.tsx");

    expect(worker).toContain('import type { WorkerUnitView }');
    expect(worker).toContain("submitHumanUnitResult");
    expect(worker).not.toMatch(/clientPriceCents|runId|snapshotId|dataClass/);
  });

  it("keeps the admin panel on the complete admin projection and explicit actions", () => {
    const admin = source("src/components/human-work-unit-admin.tsx");

    expect(admin).toContain('import type { AdminUnitView }');
    expect(admin).toContain("openHumanUnitReview");
    expect(admin).toContain("decideHumanUnitCandidate");
    expect(admin).toContain("continuePausedHumanUnitRun");
    expect(admin).toContain("safeNextAction");
  });

  it("mounts role-shaped unit views without widening the client timeline", () => {
    const workerPage = source("src/app/va/tasks/[id]/page.tsx");
    const adminPage = source("src/app/admin/tasks/[id]/page.tsx");
    const timeline = source("src/lib/queries/tasks.ts");

    expect(workerPage).toContain("HumanWorkUnitWorker");
    expect(workerPage).toMatch(/humanUnit\s*\?[\s\S]{0,2400}task\.description/);
    expect(workerPage).toMatch(/humanUnit\s*\?[\s\S]{0,4200}task\.files\.map/);
    expect(adminPage).toContain("HumanWorkUnitAdmin");
    expect(timeline).not.toContain("human_unit_accepted:");
  });
});
