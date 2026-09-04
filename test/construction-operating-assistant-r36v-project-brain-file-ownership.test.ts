import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function functionBody(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("R36V Project Brain File ownership boundary", () => {
  it("keeps Project Brain evidence out of both generic task claim paths", () => {
    const clientTasks = functionBody(
      read("src/server/actions/client-tasks.ts"),
      "export async function submitTask",
      "export type QuoteActionResult",
    );
    const standingTasks = functionBody(
      read("src/server/actions/standing-capacity.ts"),
      "export async function submitStandingTask",
      "export async function submitContextNoteDraft",
    );

    for (const claimPath of [clientTasks, standingTasks]) {
      expect(claimPath).toMatch(/file\.updateMany\([\s\S]*?projectBrainSources:\s*\{\s*none:\s*\{\}\s*\}/u);
      expect(claimPath).toMatch(/projectBrainSources:[\s\S]*?data:\s*\{\s*taskId:/u);
    }
  });

  it("refuses generic recheck and retention selection before storage mutation", () => {
    const adminRecheck = functionBody(
      read("src/server/actions/admin-files.ts"),
      "export async function recheckFile",
      "return { ok: true }",
    );
    const sweeps = read("src/server/sweeps.ts");
    const orphanSweep = functionBody(
      sweeps,
      "export async function reapOrphanFiles",
      "export async function purgeExpiredTaskFiles",
    );
    const retentionSweep = functionBody(
      sweeps,
      "export async function purgeExpiredTaskFiles",
      "export async function advanceStandingCapacityPeriods",
    );

    expect(adminRecheck).toMatch(/file\.findFirst\([\s\S]*?projectBrainSources:\s*\{\s*none:\s*\{\}\s*\}/u);
    expect(adminRecheck.indexOf("projectBrainSources")).toBeLessThan(adminRecheck.indexOf("readObject"));
    expect(orphanSweep).toMatch(/projectBrainSources:\s*\{\s*none:\s*\{\}\s*\}/u);
    expect(orphanSweep.indexOf("projectBrainSources")).toBeLessThan(orphanSweep.indexOf("deleteObject"));
    expect(retentionSweep.match(/projectBrainSources:\s*\{\s*none:\s*\{\}\s*\}/gu)).toHaveLength(2);
    expect(retentionSweep.indexOf("projectBrainSources")).toBeLessThan(retentionSweep.indexOf("deleteObject"));
  });

  it("installs a database backstop for every referenced File row", () => {
    const migration = read(
      "prisma/migrations/20260903180000_construction_assistant_r36v_project_brain_intake/migration.sql",
    );
    const guard = functionBody(
      migration,
      'CREATE OR REPLACE FUNCTION "ConstructionProjectBrainFile_guard"()',
      "-- The intake is a mutable aggregate",
    );

    expect(guard).toContain('FROM "ConstructionProjectBrainSource"');
    expect(guard).toContain('WHERE "fileId" = OLD."id"');
    expect(guard).toContain("IF NEW IS DISTINCT FROM OLD THEN");
    expect(guard).toContain("IF TG_OP = 'DELETE' THEN");
    expect(guard).toContain(
      'CREATE TRIGGER "ConstructionProjectBrainFile_guard_update_delete"',
    );
    expect(guard).toContain('BEFORE UPDATE OR DELETE ON "File"');
  });
});
