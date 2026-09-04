import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireMember: vi.fn(),
  projectFindFirst: vi.fn(),
  sourceFindUnique: vi.fn(),
  sourceFindFirst: vi.fn(),
  fileAccessCreate: vi.fn(),
  fileDeleteMany: vi.fn(),
  fileFindMany: vi.fn(),
  readObject: vi.fn(),
  scanObjects: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/server/construction-assistant-v1/workspace", () => ({
  requireActiveConstructionMember: mocks.requireMember,
}));

vi.mock("@/lib/storage-local", () => ({
  LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256,
  deleteLocalObject: mocks.deleteObject,
  putLocalObject: vi.fn(),
  readLocalObject: mocks.readObject,
  scanLocalObjects: mocks.scanObjects,
}));

import {
  projectBrainSourceBytesForUser,
  reconcileProjectBrainLocalObjectBatch,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";

const tx = {
  constructionProject: { findFirst: mocks.projectFindFirst },
  constructionProjectBrainSource: {
    findUnique: mocks.sourceFindUnique,
    findFirst: mocks.sourceFindFirst,
  },
  fileAccessLog: { create: mocks.fileAccessCreate },
  file: {
    deleteMany: mocks.fileDeleteMany,
    findMany: mocks.fileFindMany,
  },
};

describe("R36V Project Brain server hardening", () => {
  beforeEach(() => {
    mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx));
    mocks.requireMember.mockResolvedValue({ role: "owner" });
    mocks.fileAccessCreate.mockResolvedValue({ id: "access-log-a" });
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it("rechecks active project authorization after the source bytes have been read", async () => {
    const bytes = Buffer.from("project-brain-source-bytes", "utf8");
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const source = {
      id: "source-a",
      workspaceId: "workspace-a",
      projectId: "project-a",
      contentHash,
      displayName: "scope.txt",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
      file: {
        id: "file-a",
        storageKey: "project-brain-intake/workspace-a/project-a/intake-a/file-a.txt",
        fileName: "scope.txt",
        detectedMime: "text/plain",
        sha256: contentHash,
        sizeBytes: bytes.length,
        scanDetails: "LOCAL_SIGNATURE_SANITIZATION; providerExecutionPerformed=false",
      },
    };
    let projectActive = true;
    let releaseRead: () => void = () => undefined;
    let markReadStarted: () => void = () => undefined;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    mocks.projectFindFirst.mockImplementation(async () => projectActive
      ? { id: "project-a", code: "LAVAL-001", name: "Rénovation Laval" }
      : null);
    mocks.sourceFindUnique.mockResolvedValue({
      workspaceId: source.workspaceId,
      projectId: source.projectId,
    });
    mocks.sourceFindFirst.mockResolvedValue(source);
    mocks.readObject.mockImplementation(async () => {
      markReadStarted();
      await readGate;
      return bytes;
    });

    const download = projectBrainSourceBytesForUser({
      userId: "owner-a",
      sourceId: source.id,
    });
    await readStarted;
    projectActive = false;
    releaseRead();

    await expect(download).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(mocks.projectFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.fileAccessCreate).not.toHaveBeenCalled();
  });

  it("caps each cleanup page, uses bulk File queries and drains later pages", async () => {
    const prefix = "project-brain-intake/workspace-a/project-a/intake-a";
    const retainedKey = `${prefix}/00-retained.pdf`;
    const originalKeys = [
      retainedKey,
      `${prefix}/01-orphan.pdf`,
      `${prefix}/02-orphan.pdf`,
      `${prefix}/03-crash.tmp`,
      `${prefix}/04-orphan.pdf`,
      `${prefix}/05-orphan.pdf`,
      `${prefix}/06-orphan.pdf`,
      `${prefix}/07-orphan.pdf`,
      `${prefix}/08-orphan.pdf`,
    ];
    const filesystemKeys = new Set(originalKeys);
    const databaseKeys = new Set([retainedKey]);
    const referencedKeys = new Set([retainedKey]);
    const listedPageSizes: number[] = [];
    const visitedKeys = new Set<string>();

    mocks.scanObjects.mockImplementation(async (
      _requestedPrefix: string,
      input: { maxScannedEntries: number; maxResults: number },
    ) => {
      const eligible = originalKeys.filter((key) => !visitedKeys.has(key));
      const scanned = eligible.slice(0, input.maxScannedEntries);
      for (const key of scanned) visitedKeys.add(key);
      const entries = scanned.slice(0, input.maxResults).map((key) => ({
        key,
        modifiedAtMs: 0,
      }));
      listedPageSizes.push(entries.length);
      return {
        entries,
        scannedEntries: scanned.length,
        cycleComplete: scanned.length === eligible.length,
      };
    });
    mocks.fileDeleteMany.mockImplementation(async (input: {
      where: { storageKey: { in: string[] } };
    }) => {
      let count = 0;
      for (const key of input.where.storageKey.in) {
        if (databaseKeys.has(key) && !referencedKeys.has(key)) {
          databaseKeys.delete(key);
          count += 1;
        }
      }
      return { count };
    });
    mocks.fileFindMany.mockImplementation(async (input: {
      where: { storageKey: { in: string[] } };
    }) => input.where.storageKey.in
      .filter((key) => databaseKeys.has(key))
      .map((storageKey) => ({ storageKey })));
    mocks.deleteObject.mockImplementation(async (key: string) => {
      filesystemKeys.delete(key);
    });

    let removed = 0;
    let cycleComplete = false;
    do {
      const result = await reconcileProjectBrainLocalObjectBatch({
        now: new Date(25 * 60 * 60 * 1_000),
        batchSize: 3,
        scanLimit: 3,
      });
      expect(result.scanned).toBeLessThanOrEqual(3);
      removed += result.removed;
      cycleComplete = result.cycleComplete;
    } while (!cycleComplete);

    expect(listedPageSizes).toEqual([3, 3, 3]);
    expect(removed).toBe(originalKeys.length - 1);
    expect([...filesystemKeys]).toEqual([retainedKey]);
    expect(mocks.fileDeleteMany).toHaveBeenCalledTimes(3);
    expect(mocks.fileFindMany).toHaveBeenCalledTimes(3);
    for (const call of mocks.fileDeleteMany.mock.calls) {
      expect(call[0].where.storageKey.in.length).toBeLessThanOrEqual(3);
      expect(call[0].where.projectBrainSources).toEqual({ none: {} });
    }
  });
});
