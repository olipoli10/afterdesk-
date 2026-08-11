import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTask, createWorker } from "./fixtures";
import { deleteObject, putObject } from "@/lib/storage";

/**
 * A SECOND SPECIALIST, SIGNED IN AND APPROVED, GETS NOTHING.
 *
 * test/worker-after-claim.test.ts pins the ARCHITECTURE: that the download
 * route checks `claimedById === user.id` before it ever looks at what kind of
 * file is being requested. That test reads the source, so it protects the
 * shape of the code and nothing else. It would keep passing against a route
 * whose authorization had been broken by a change three files away, in
 * `isApprovedVa`, in the status list, or in the Prisma select.
 *
 * So this one runs the real handler, against real Postgres, with a real
 * session, and asks the question a hostile specialist would ask: I am
 * approved, I am signed in, I can see the pool, give me the machine's output
 * for a task somebody else claimed.
 *
 * The answer must be an indistinguishable 404 — not a 403, which would confirm
 * the file exists, and certainly not the bytes.
 *
 * Only `getSessionUser` is faked, because there is no HTTP layer here to hold
 * a cookie. Everything else is the production path: the same route module, the
 * same Prisma queries, the same authorization branches.
 */

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, getSessionUser: vi.fn() };
});

const { getSessionUser } = await import("@/lib/authz");
const { GET } = await import("@/app/api/files/[id]/download/route");

/** The handler's params arrive as a promise in Next 16. */
const call = (fileId: string) =>
  GET(new Request(`http://localhost/api/files/${fileId}/download`), {
    params: Promise.resolve({ id: fileId }),
  });

async function machineArtifactOn(taskId: string, uploaderId: string) {
  return prisma.file.create({
    data: {
      taskId,
      kind: "artifact",
      uploaderId,
      storageKey: `it/artifact-${taskId}-${Math.abs(taskId.length * 7919)}`,
      fileName: "candidate.csv",
      mime: "text/csv",
      sizeBytes: 128,
      /**
       * A `clean` row must carry the evidence the scanning pipeline produces
       * (File_clean_requires_scan_evidence, migration 20260730001000). The
       * fixture supplies it rather than working around the constraint: a file
       * marked clean with no hash and no scan time is not a shape production
       * can reach, and testing authorization against an impossible row would
       * prove less than it appears to.
       */
      scanStatus: "clean",
      sha256: "0".repeat(64),
      detectedMime: "text/csv",
      scannedAt: new Date("2026-08-10T00:00:00.000Z"),
      // What every 1E-alpha builder writes: the file the assigned specialist
      // finishes and delivers.
      artifactVisibility: "deliverable_candidate",
    },
    select: { id: true },
  });
}

describe("a machine artifact is readable only by the specialist who claimed it", () => {
  beforeEach(() => {
    vi.mocked(getSessionUser).mockReset();
  });

  it("refuses an approved specialist who did not claim the task", async () => {
    const owner = await createWorker();
    const stranger = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: owner.id });
    const artifact = await machineArtifactOn(task.id, owner.id);

    vi.mocked(getSessionUser).mockResolvedValue({
      id: stranger.id,
      role: "VA",
    } as never);

    const res = await call(artifact.id);
    expect(res.status).toBe(404);
    // Indistinguishable from a missing file: a 403 would confirm it exists.
    await expect(res.json()).resolves.toEqual({ error: "Not found." });
  });

  it("refuses a signed-out caller before it touches the database", async () => {
    const owner = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: owner.id });
    const artifact = await machineArtifactOn(task.id, owner.id);

    vi.mocked(getSessionUser).mockResolvedValue(null as never);
    const res = await call(artifact.id);
    expect(res.status).toBe(401);
  });

  it("refuses the CLIENT who owns the task, whatever the artifact's visibility", async () => {
    /**
     * A machine's working file is not the client's to read. It reaches them
     * only by becoming a deliverable a specialist submitted and an operator
     * approved, which is a different code path entirely.
     */
    const owner = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: owner.id });
    const artifact = await machineArtifactOn(task.id, owner.id);
    const client = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { clientId: true },
    });

    vi.mocked(getSessionUser).mockResolvedValue({
      id: client.clientId,
      role: "CLIENT",
    } as never);

    const res = await call(artifact.id);
    expect(res.status).toBe(404);
  });

  it("NOT VACUOUS: the specialist who holds the claim receives the actual bytes", async () => {
    /**
     * Without this the three refusals above would pass against a route that
     * refuses everyone, which is a broken product rather than a secure one.
     *
     * The integration environment uses the dev local-disk storage backend, so
     * the test writes the artifact's real bytes first and asserts the full
     * happy path: 200, the exact body, and the access log the route writes
     * only after authorization AND existence both held. The first version of
     * this test skipped the write and inferred success from the failure mode
     * of a missing object, which proved authorization without proving the
     * serve; this proves both.
     */
    const owner = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: owner.id });
    const artifact = await machineArtifactOn(task.id, owner.id);
    const stored = await prisma.file.findUniqueOrThrow({
      where: { id: artifact.id },
      select: { storageKey: true },
    });
    const body = Buffer.from("unit_key,email\nrow-1,a@x.ca\n", "utf8");
    await putObject(stored.storageKey, body);

    try {
      vi.mocked(getSessionUser).mockResolvedValue({ id: owner.id, role: "VA" } as never);

      const res = await call(artifact.id);
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);
      // The route records the read only after authorization and existence
      // both held; a refused caller never reaches that line.
      const logged = await prisma.fileAccessLog.count({
        where: { fileId: artifact.id, userId: owner.id },
      });
      expect(logged).toBeGreaterThan(0);
    } finally {
      await deleteObject(stored.storageKey);
    }
  });

  it("refuses even the claiming specialist once the artifact has no declared audience", async () => {
    // A null visibility is refused rather than read permissively: an artifact
    // nobody marked for a worker is internal by default.
    const owner = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: owner.id });
    const artifact = await machineArtifactOn(task.id, owner.id);
    await prisma.file.update({
      where: { id: artifact.id },
      data: { artifactVisibility: null },
    });

    vi.mocked(getSessionUser).mockResolvedValue({ id: owner.id, role: "VA" } as never);
    const res = await call(artifact.id);
    expect(res.status).toBe(404);
  });
});
