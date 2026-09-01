import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { transitionTask } from "@/lib/state";
import {
  bindClaimToHumanUnit,
  decideHumanUnitCandidate,
  openHumanUnitReview,
  submitHumanUnitCandidate,
} from "@/server/human-unit";
import { createWorker } from "./fixtures";
import { createUs4Admin, createUs4Unit } from "./human-unit-us4-fixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireApprovedVa: vi.fn() };
});
const { requireApprovedVa } = await import("@/lib/authz");
const { releaseTask, claimTask } = await import("@/server/actions/va-tasks");

const signedInAs = (id: string) =>
  vi.mocked(requireApprovedVa).mockResolvedValue({ id, role: "VA" } as never);

describe("T052 concurrency and fencing", () => {
  it("lets exactly one of eight simultaneous claimants establish the sole assignment", async () => {
    const fixture = await createUs4Unit({ state: "published" });
    const workers = await Promise.all(Array.from({ length: 8 }, () => createWorker()));
    const results = await Promise.allSettled(workers.map((worker) =>
      prisma.$transaction(async (tx) => {
        await transitionTask({
          tx,
          taskId: fixture.task.id,
          from: "open",
          to: "claimed",
          action: "va_claimed",
          actorId: worker.id,
          guard: { claimedById: null },
          data: { claimedById: worker.id, claimedAt: new Date() },
        });
        await bindClaimToHumanUnit(tx, { taskId: fixture.task.id, workerId: worker.id });
        return worker.id;
      })
    ));
    const winners = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    expect(winners).toHaveLength(1);
    const [task, unit, claims] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: fixture.task.id }, select: { claimedById: true } }),
      prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unit.id },
        select: { claimedById: true, claimGeneration: true },
      }),
      prisma.humanWorkUnitTransition.findMany({
        where: { unitStateId: fixture.unit.id, cause: "claimed" },
        select: { actorId: true, assignmentEstablished: true },
      }),
    ]);
    expect(task.claimedById).toBe(winners[0]);
    expect(unit).toEqual({ claimedById: winners[0], claimGeneration: 1 });
    expect(claims).toEqual([{ actorId: winners[0], assignmentEstablished: true }]);
  });

  it("converges duplicate submissions to one candidate", async () => {
    const fixture = await createUs4Unit();
    const input = {
      taskId: fixture.task.id,
      actorId: fixture.worker.id,
      claimGeneration: 1,
      payload: { summary: "same result" },
      fileIds: [],
    };
    const outcomes = await Promise.all([
      submitHumanUnitCandidate(input),
      submitHumanUnitCandidate(input),
    ]);
    expect(outcomes.filter((outcome) => outcome.submitted)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.submitted)).toEqual([
      { submitted: false, cause: "duplicate" },
    ]);
    expect(await prisma.humanWorkUnitCandidate.count({ where: { unitStateId: fixture.unit.id } })).toBe(1);
  });

  it("allows one of two admins to decide and records the loser as duplicate", async () => {
    const fixture = await createUs4Unit();
    const submitted = await submitHumanUnitCandidate({
      taskId: fixture.task.id,
      actorId: fixture.worker.id,
      claimGeneration: 1,
      payload: { summary: "review me" },
      fileIds: [],
    });
    if (!submitted.submitted) throw new Error("fixture did not submit");
    const [a, b] = await Promise.all([createUs4Admin("a"), createUs4Admin("b")]);
    await openHumanUnitReview({ taskId: fixture.task.id, actorId: a.id });
    const outcomes = await Promise.all([
      decideHumanUnitCandidate({ candidateId: submitted.candidateId, actorId: a.id, outcome: "accept" }),
      decideHumanUnitCandidate({ candidateId: submitted.candidateId, actorId: b.id, outcome: "accept" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.decided)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.decided)).toEqual([
      { decided: false, cause: "duplicate" },
    ]);
    expect(await prisma.humanWorkUnitReviewDecision.count({ where: { candidateId: submitted.candidateId } })).toBe(1);
  });

  it("records released, permits a new claim and records reclaimed without a second assignment", async () => {
    const fixture = await createUs4Unit();
    signedInAs(fixture.worker.id);
    expect((await releaseTask(fixture.task.id)).ok).toBe(true);
    expect((await prisma.humanWorkUnitTransition.findMany({
      where: { unitStateId: fixture.unit.id },
      orderBy: { seq: "asc" },
      select: { cause: true },
    })).map((row) => row.cause)).toContain("released");

    const successor = await createWorker();
    signedInAs(successor.id);
    expect((await claimTask(fixture.task.id)).ok).toBe(true);
    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unit.id },
      select: { claimedById: true, claimGeneration: true },
    });
    expect(after).toEqual({ claimedById: successor.id, claimGeneration: 2 });
    expect(await prisma.humanWorkUnitTransition.count({
      where: { unitStateId: fixture.unit.id, cause: "reclaimed" },
    })).toBe(1);

    expect(await submitHumanUnitCandidate({
      taskId: fixture.task.id,
      actorId: fixture.worker.id,
      claimGeneration: 1,
      payload: { summary: "zombie" },
      fileIds: [],
    })).toEqual({ submitted: false, cause: "stale_generation" });
  });
});
