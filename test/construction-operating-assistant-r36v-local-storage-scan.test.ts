import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalObjectStorage } from "@/lib/storage-local";

describe("R36V bounded local object scan", () => {
  it("caps every filesystem visit batch and resumes until the tree is drained", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "endvera-r36v-bounded-scan-"));
    try {
      const storage = createLocalObjectStorage(root);
      const keys = Array.from({ length: 12 }, (_, index) =>
        `project-brain-intake/workspace-${Math.floor(index / 4)}/project-a/intake-a/${String(index).padStart(2, "0")}.pdf`);
      for (const key of keys) await storage.put(key, Buffer.from(key, "utf8"));

      let filteredCycleComplete = false;
      let filteredPasses = 0;
      do {
        const batch = await storage.scan("project-brain-intake", {
          maxScannedEntries: 5,
          maxResults: 3,
          modifiedBeforeMs: 0,
        });
        expect(batch.scannedEntries).toBeLessThanOrEqual(5);
        expect(batch.entries).toEqual([]);
        filteredCycleComplete = batch.cycleComplete;
        filteredPasses += 1;
        expect(filteredPasses).toBeLessThan(20);
      } while (!filteredCycleComplete);
      expect(filteredPasses).toBeGreaterThan(1);

      const discovered: string[] = [];
      let cycleComplete = false;
      let passes = 0;
      do {
        const batch = await storage.scan("project-brain-intake", {
          maxScannedEntries: 5,
          maxResults: 3,
        });
        expect(batch.scannedEntries).toBeLessThanOrEqual(5);
        expect(batch.entries.length).toBeLessThanOrEqual(3);
        discovered.push(...batch.entries.map((entry) => entry.key));
        cycleComplete = batch.cycleComplete;
        passes += 1;
        expect(passes).toBeLessThan(20);
      } while (!cycleComplete);

      expect(passes).toBeGreaterThan(1);
      expect([...discovered].sort()).toEqual([...keys].sort());
      expect(new Set(discovered).size).toBe(keys.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
