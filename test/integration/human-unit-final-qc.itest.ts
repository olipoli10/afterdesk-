import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createUs4Admin, createUs4Unit } from "./human-unit-us4-fixtures";

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireRole: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { requireRole } = await import("@/lib/authz");
const { rejectDeliverable } = await import("@/server/actions/admin-qc");

describe("final QC remains downstream from immutable Human Work Unit acceptance", () => {
  it("a final-QC rejection cannot mutate acceptance, resume, or downstream execution", async () => {
    const built = await createUs4Unit({ state: "resumed", taskStatus: "submitted_for_qc" });
    const admin = await createUs4Admin("final-qc");
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const candidate = await prisma.humanWorkUnitCandidate.create({
      data: {
        unitStateId: built.unit.id,
        claimGeneration: built.claimGeneration,
        revisionIndex: 0,
        submittedById: built.worker.id,
        payload: { summary: "accepted unit result" },
        status: "accepted",
      },
    });
    const decision = await prisma.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: built.unit.id,
        decidedById: admin.id,
        outcome: "accepted",
        remainingRevisionsAfter: 2,
        claimGeneration: built.claimGeneration,
      },
    });
    const acceptance = await prisma.humanWorkUnitAcceptance.create({
      data: {
        unitStateId: built.unit.id,
        candidateId: candidate.id,
        decisionId: decision.id,
        acceptedById: admin.id,
        claimGenerationAtAcceptance: built.claimGeneration,
        resultPayload: { summary: "accepted unit result" },
        resultSha256: "a".repeat(64),
        dataClass: "business_confidential",
        criteriaVersionRef: built.definition.id,
      },
    });
    const resume = await prisma.humanWorkUnitResumeRecord.create({
      data: {
        runId: built.run.id,
        unitStateId: built.unit.id,
        acceptanceId: acceptance.id,
        resumeGeneration: 1,
        resumedStepRunIds: [],
        skippedStepRunIds: [],
      },
    });
    await prisma.humanWorkUnitRunState.update({
      where: { id: built.unit.id },
      data: { resumeGeneration: 1 },
    });
    const submission = await prisma.submission.create({
      data: {
        taskId: built.task.id,
        vaId: built.worker.id,
        attemptNo: 1,
        note: "final deliverable assembled from the accepted unit",
        qcStatus: "pending",
      },
    });
    const downstreamBefore = await prisma.taskWorkflowStepRun.findMany({
      where: { runId: built.run.id },
      orderBy: { order: "asc" },
    });

    expect(await rejectDeliverable({
      submissionId: submission.id,
      comment: "Correct the final presentation without replaying the accepted internal work.",
    })).toMatchObject({ ok: true });

    expect(await prisma.humanWorkUnitAcceptance.findUniqueOrThrow({ where: { id: acceptance.id } }))
      .toMatchObject(acceptance);
    expect(await prisma.humanWorkUnitResumeRecord.findUniqueOrThrow({ where: { id: resume.id } }))
      .toMatchObject(resume);
    expect(await prisma.taskWorkflowStepRun.findMany({
      where: { runId: built.run.id }, orderBy: { order: "asc" },
    })).toEqual(downstreamBefore);
    expect(await prisma.humanWorkUnitRunState.findUniqueOrThrow({ where: { id: built.unit.id } }))
      .toMatchObject({ state: "resumed", remainingRevisions: 2, resumeGeneration: 1 });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: built.run.id } })).toBe(1);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: built.task.id } }))
      .toMatchObject({ status: "qc_rejected", claimedById: built.worker.id, qcRounds: 1 });
  });
});
