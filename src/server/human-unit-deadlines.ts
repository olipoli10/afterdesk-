import "server-only";

import { type HumanWorkUnitAlertKind, type HumanWorkUnitRefusalCause, type HumanWorkUnitState } from "@prisma/client";
import { prisma } from "@/lib/db";

const DEADLINE_BATCH = 100;

type DueUnit = {
  id: string;
  taskId: string;
  state: HumanWorkUnitState;
  claimGeneration: number;
  resumeGeneration: number;
  transitionSeq: number;
  claimedById: string | null;
  dueAt: Date;
  kind: HumanWorkUnitAlertKind;
  refusalCause: HumanWorkUnitRefusalCause;
};

function dueFact(unit: {
  id: string;
  taskId: string;
  state: HumanWorkUnitState;
  claimGeneration: number;
  resumeGeneration: number;
  transitionSeq: number;
  claimedById: string | null;
  publicationDeadlineAt: Date | null;
  submissionDeadlineAt: Date | null;
  claimLeaseExpiresAt: Date | null;
}, now: Date): DueUnit | null {
  if (unit.state === "published" && unit.publicationDeadlineAt && unit.publicationDeadlineAt <= now) {
    return { ...unit, dueAt: unit.publicationDeadlineAt, kind: "publication_deadline", refusalCause: "publication_deadline" };
  }
  if (!["claimed", "revision_requested"].includes(unit.state)) return null;
  const lease = unit.claimLeaseExpiresAt && unit.claimLeaseExpiresAt <= now ? unit.claimLeaseExpiresAt : null;
  const submission = unit.submissionDeadlineAt && unit.submissionDeadlineAt <= now ? unit.submissionDeadlineAt : null;
  if (lease && (!submission || lease <= submission)) {
    return { ...unit, dueAt: lease, kind: "claim_lease", refusalCause: "claim_lease_expired" };
  }
  if (submission) {
    return { ...unit, dueAt: submission, kind: "submission_deadline", refusalCause: "submission_deadline" };
  }
  return null;
}

async function sweepOne(input: DueUnit): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "HumanWorkUnitRunState" WHERE id = ${input.id} FOR UPDATE
    `;
    if (locked.length !== 1) return false;
    const current = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: input.id },
      select: {
        id: true, taskId: true, state: true, claimGeneration: true, resumeGeneration: true,
        transitionSeq: true, claimedById: true, publicationDeadlineAt: true,
        submissionDeadlineAt: true, claimLeaseExpiresAt: true,
      },
    });
    const fact = dueFact(current, new Date());
    if (!fact || fact.kind !== input.kind || fact.dueAt.getTime() !== input.dueAt.getTime()) return false;

    // Publication historically pre-created this keyed row at publish time.
    // createMany+skipDuplicates preserves that durable schedule while the
    // state CAS below remains the exactly-once notification authority.
    await tx.humanWorkUnitAlert.createMany({
      data: [{
        unitStateId: fact.id,
        kind: fact.kind,
        dueAt: fact.dueAt,
        claimGeneration: fact.claimGeneration,
      }],
      skipDuplicates: true,
    });

    if (fact.state !== "published") {
      const released = await tx.task.updateMany({
        where: { id: fact.taskId, status: "claimed", claimedById: fact.claimedById },
        data: { status: "open", claimedById: null, claimedAt: null },
      });
      if (released.count !== 1) throw new Error("deadline release CAS lost");
    }

    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: { id: fact.id, state: fact.state },
      data: {
        state: "paused",
        refusalCause: fact.refusalCause,
        pausedDetail: fact.kind === "publication_deadline"
          ? "The publication deadline lapsed with no claim."
          : fact.kind === "claim_lease"
            ? "The claim lease expired before a valid submission."
            : "The submission deadline lapsed before a valid submission.",
        claimedById: null,
        claimLeaseExpiresAt: null,
        submissionDeadlineAt: null,
        transitionSeq: { increment: 1 },
      },
    });
    if (moved.count !== 1) throw new Error("deadline unit CAS lost");
    const after = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fact.id },
      select: { transitionSeq: true, claimGeneration: true, resumeGeneration: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: fact.id,
        seq: after.transitionSeq,
        actorRole: "system",
        fromState: fact.state,
        toState: "paused",
        cause: fact.kind === "publication_deadline" ? "paused:publication_deadline" : "paused:submission_deadline",
        claimGeneration: after.claimGeneration,
        resumeGeneration: after.resumeGeneration,
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: fact.taskId,
        action: "human_unit_deadline_lapsed",
        meta: { kind: fact.kind, dueAt: fact.dueAt.toISOString(), cause: fact.refusalCause },
      },
    });
    const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map(({ id }) => ({
          userId: id,
          taskId: fact.taskId,
          type: "human_unit_deadline",
          title: "Human work unit needs operator action",
          body: fact.kind === "publication_deadline"
            ? "No worker claimed the unit before its publication deadline."
            : "The assigned worker did not submit before the active deadline.",
        })),
      });
    }
    return true;
  });
}

/** Bounded, per-item-isolated T11 sweep. */
export async function sweepHumanWorkUnitDeadlines(): Promise<number> {
  const now = new Date();
  const candidates = await prisma.humanWorkUnitRunState.findMany({
    where: {
      OR: [
        { state: "published", publicationDeadlineAt: { lte: now } },
        { state: { in: ["claimed", "revision_requested"] }, submissionDeadlineAt: { lte: now } },
        { state: { in: ["claimed", "revision_requested"] }, claimLeaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: DEADLINE_BATCH,
    select: {
      id: true, taskId: true, state: true, claimGeneration: true, resumeGeneration: true,
      transitionSeq: true, claimedById: true, publicationDeadlineAt: true,
      submissionDeadlineAt: true, claimLeaseExpiresAt: true,
    },
  });
  let swept = 0;
  for (const candidate of candidates) {
    const fact = dueFact(candidate, now);
    if (!fact) continue;
    try {
      if (await sweepOne(fact)) swept++;
    } catch (error) {
      console.error("[human-unit-deadlines] item failed", { unitStateId: fact.id, error });
    }
  }
  return swept;
}
