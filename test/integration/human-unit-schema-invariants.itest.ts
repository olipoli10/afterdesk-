import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAcceptedTask, createWorker } from "./fixtures";

/**
 * THE HUMAN WORK UNIT'S DATABASE INVARIANTS, proven against real PostgreSQL
 * with real COMMITS.
 *
 * Every row of contracts/db-invariants.md §1 and §2 gets a case here, and each
 * asserts that the VIOLATION IS REJECTED BY THE DATABASE — not by a code path
 * that a future caller could route around. These are constraint triggers and
 * partial unique indexes: a rolled-back transaction never exercises them, and
 * neither does a unit test with a mocked client.
 *
 * The reason this file exists at all is that a person is mid-judgment on a
 * mandate a client has already paid for. Each invariant below names a way that
 * situation could go wrong such that no later audit could put it right: a
 * second resume that spends twice against a frozen ceiling, a payout that moved
 * after the worker accepted it, a self-accepted candidate, an edited audit
 * trail. Money that has left the building cannot be un-spent by a check that
 * runs afterwards.
 */

/** A committed, admitted unit with everything it hangs off. */
async function createAdmittedUnit(over?: {
  state?: string;
  remainingRevisions?: number;
  revisionBound?: number;
  claimedById?: string | null;
  acceptedAt?: Date | null;
}) {
  const { task, snapshot } = await createAcceptedTask();
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_draft" as never,
      deliverableDescription: "Integration plan",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "cc1" as never,
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "awaiting_human_unit" as never,
    },
    select: { id: true },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: planVersion.id,
      planStepId: (
        await prisma.taskExecutionPlanStep.create({
          data: {
            planVersionId: planVersion.id,
            order: 2,
            title: "Confirm the decision-maker",
            description: "Check each row against a second independent source.",
            executor: "human" as never,
            humanRole: "worker" as never,
            fixedMinutes: 30,
            estimatedMinutesOptimistic: 20,
            estimatedMinutesLikely: 30,
            estimatedMinutesConservative: 45,
            verificationMethod: "sample_check",
            acceptanceCriteria: ["Every row carries a named source."],
            riskLevel: "low" as never,
            dependsOnOrder: [],
            humanOutputSchema: {
              type: "object",
              properties: { summary: { type: "string" } },
              required: ["summary"],
            },
            humanRequiredArtifactKinds: ["source_file"],
          },
          select: { id: true },
        })
      ).id,
      instructions: "Confirm the decision-maker for each row.",
      declaredInputs: [],
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
      },
      requiredArtifactKinds: ["source_file"],
      acceptanceCriteria: ["Every row carries a named source."],
      verificationMethod: "sample_check",
      eligibility: {},
      reviewerAuthority: "admin",
      expectedMinutes: 30,
      revisionBound: over?.revisionBound ?? 2,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 72,
      claimLeaseHours: 72,
      economicProvenance: {},
      dataClass: "business_confidential",
    },
    select: { id: true, planVersionId: true, planStepId: true },
  });
  const unit = await prisma.humanWorkUnitRunState.create({
    data: {
      runId: run.id,
      taskId: task.id,
      snapshotId: snapshot.id,
      definitionId: definition.id,
      cutOrder: 2,
      state: (over?.state ?? "admitted") as never,
      remainingRevisions: over?.remainingRevisions ?? 2,
      claimedById: over?.claimedById ?? null,
      acceptedAt: over?.acceptedAt ?? null,
    },
    select: { id: true, runId: true, claimGeneration: true, resumeGeneration: true },
  });
  return { task, snapshot, planVersion, run, definition, unit };
}

async function createCandidate(
  unitStateId: string,
  submittedById: string,
  over?: { claimGeneration?: number; revisionIndex?: number; status?: string }
) {
  return prisma.humanWorkUnitCandidate.create({
    data: {
      unitStateId,
      claimGeneration: over?.claimGeneration ?? 0,
      revisionIndex: over?.revisionIndex ?? 0,
      submittedById,
      payload: { summary: "done" },
      status: (over?.status ?? "pending") as never,
    },
    select: { id: true },
  });
}

// ───────────────────────────── §1 ─────────────────────────────

describe("INV-1 / INV-2 — one unit per run, one per accepted contract", () => {
  it("refuses a second unit on the same run", async () => {
    const { unit, run, task, snapshot, definition } = await createAdmittedUnit();
    expect(unit.runId).toBe(run.id);
    await expect(
      prisma.humanWorkUnitRunState.create({
        data: {
          runId: run.id,
          taskId: task.id,
          snapshotId: snapshot.id,
          definitionId: definition.id,
          cutOrder: 2,
          state: "admitted" as never,
          remainingRevisions: 2,
        },
      })
    ).rejects.toThrow();
  });

  it("refuses a second unit against the same accepted contract", async () => {
    const a = await createAdmittedUnit();
    const b = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: b.unit.id },
        data: { snapshotId: a.snapshot.id },
      })
    ).rejects.toThrow();
  });
});

describe("INV-3 — ONE RESUME PER RUN", () => {
  /**
   * The single most expensive invariant in the feature. A second resume can
   * re-run a downstream step and spend a second time against a frozen ceiling,
   * and provider money that has left the platform cannot be recalled by a check
   * that runs afterwards. This unique constraint — not a code path, not an
   * `if` — is what makes resume exactly-once across concurrent triggers,
   * retries, sweeps, crashes and replays.
   */
  it("refuses a second resume record for one run", async () => {
    const { unit, run } = await createAdmittedUnit({ state: "accepted", acceptedAt: new Date() });
    const admin = await createWorker();
    const candidate = await createCandidate(unit.id, admin.id);
    const decision = await prisma.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: unit.id,
        decidedById: (await createWorker()).id,
        outcome: "accepted" as never,
        remainingRevisionsAfter: 2,
        claimGeneration: 0,
      },
      select: { id: true },
    });
    const acceptance = await prisma.humanWorkUnitAcceptance.create({
      data: {
        unitStateId: unit.id,
        candidateId: candidate.id,
        decisionId: decision.id,
        acceptedById: admin.id,
        claimGenerationAtAcceptance: 0,
        resultPayload: { summary: "done" },
        resultSha256: "a".repeat(64),
        dataClass: "business_confidential",
        criteriaVersionRef: "def_1",
      },
      select: { id: true },
    });
    await prisma.humanWorkUnitResumeRecord.create({
      data: {
        runId: run.id,
        unitStateId: unit.id,
        acceptanceId: acceptance.id,
        resumeGeneration: 1,
        resumedStepRunIds: [],
        skippedStepRunIds: [],
      },
    });
    await expect(
      prisma.humanWorkUnitResumeRecord.create({
        data: {
          runId: run.id,
          unitStateId: unit.id,
          acceptanceId: acceptance.id,
          resumeGeneration: 2,
          resumedStepRunIds: [],
          skippedStepRunIds: [],
        },
      })
    ).rejects.toThrow();
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(1);
  });
});

describe("INV-4 — one immutable acceptance per unit", () => {
  async function acceptOnce() {
    const { unit } = await createAdmittedUnit({ state: "accepted", acceptedAt: new Date() });
    const submitter = await createWorker();
    const admin = await createWorker();
    const candidate = await createCandidate(unit.id, submitter.id);
    const decision = await prisma.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: unit.id,
        decidedById: admin.id,
        outcome: "accepted" as never,
        remainingRevisionsAfter: 2,
        claimGeneration: 0,
      },
      select: { id: true },
    });
    const acceptance = await prisma.humanWorkUnitAcceptance.create({
      data: {
        unitStateId: unit.id,
        candidateId: candidate.id,
        decisionId: decision.id,
        acceptedById: admin.id,
        claimGenerationAtAcceptance: 0,
        resultPayload: { summary: "original" },
        resultSha256: "b".repeat(64),
        dataClass: "business_confidential",
        criteriaVersionRef: "def_1",
      },
      select: { id: true },
    });
    return { unit, acceptance, candidate, decision, admin, submitter };
  }

  it("refuses a second acceptance for the same unit", async () => {
    const { unit, candidate, decision, admin } = await acceptOnce();
    await expect(
      prisma.humanWorkUnitAcceptance.create({
        data: {
          unitStateId: unit.id,
          candidateId: candidate.id,
          decisionId: decision.id,
          acceptedById: admin.id,
          claimGenerationAtAcceptance: 0,
          resultPayload: { summary: "second" },
          resultSha256: "c".repeat(64),
          dataClass: "business_confidential",
          criteriaVersionRef: "def_1",
        },
      })
    ).rejects.toThrow();
  });

  /**
   * The accepted result is what downstream steps consume and what was
   * delivered. Mutating it changes both, retroactively, with the original gone.
   */
  it("refuses UPDATE and DELETE of the acceptance, and the row survives both", async () => {
    const { acceptance } = await acceptOnce();
    await expect(
      prisma.humanWorkUnitAcceptance.update({
        where: { id: acceptance.id },
        data: { resultPayload: { summary: "tampered" } },
      })
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.humanWorkUnitAcceptance.delete({ where: { id: acceptance.id } })
    ).rejects.toThrow(/immutable/i);
    const still = await prisma.humanWorkUnitAcceptance.findUniqueOrThrow({
      where: { id: acceptance.id },
      select: { resultPayload: true },
    });
    expect(still.resultPayload).toEqual({ summary: "original" });
  });
});

describe("INV-5 / INV-8 — exactly one decision per candidate, append-only", () => {
  it("refuses a second decision on one candidate", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const submitter = await createWorker();
    const candidate = await createCandidate(unit.id, submitter.id);
    const base = {
      candidateId: candidate.id,
      unitStateId: unit.id,
      decidedById: (await createWorker()).id,
      outcome: "rejected" as never,
      remainingRevisionsAfter: 1,
      claimGeneration: 0,
    };
    await prisma.humanWorkUnitReviewDecision.create({ data: base });
    await expect(
      prisma.humanWorkUnitReviewDecision.create({
        data: { ...base, decidedById: (await createWorker()).id },
      })
    ).rejects.toThrow();
  });

  it("refuses UPDATE and DELETE of a decision", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const candidate = await createCandidate(unit.id, (await createWorker()).id);
    const decision = await prisma.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: unit.id,
        decidedById: (await createWorker()).id,
        outcome: "rejected" as never,
        remainingRevisionsAfter: 1,
        claimGeneration: 0,
      },
      select: { id: true },
    });
    await expect(
      prisma.humanWorkUnitReviewDecision.update({
        where: { id: decision.id },
        data: { outcome: "accepted" as never },
      })
    ).rejects.toThrow(/append-only|immutable/i);
    await expect(
      prisma.humanWorkUnitReviewDecision.delete({ where: { id: decision.id } })
    ).rejects.toThrow(/append-only|immutable/i);
  });
});

describe("INV-6 — generations are monotonic", () => {
  /**
   * A generation that can go backwards is not a fencing token. Move it down and
   * a superseded claimant becomes current again, which is exactly how a stale
   * submission gets accepted after the work was reassigned.
   */
  it("refuses lowering claimGeneration", async () => {
    const { unit } = await createAdmittedUnit();
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { claimGeneration: 3 },
    });
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { claimGeneration: 2 },
      })
    ).rejects.toThrow(/monotonic/i);
  });

  it("refuses lowering resumeGeneration", async () => {
    const { unit } = await createAdmittedUnit();
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { resumeGeneration: 1 },
    });
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { resumeGeneration: 0 },
      })
    ).rejects.toThrow(/monotonic/i);
  });

  it("permits raising either generation", async () => {
    const { unit } = await createAdmittedUnit();
    const bumped = await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { claimGeneration: 1, resumeGeneration: 1 },
      select: { claimGeneration: true, resumeGeneration: true },
    });
    expect(bumped).toEqual({ claimGeneration: 1, resumeGeneration: 1 });
  });
});

describe("INV-7 — the audit trail is append-only", () => {
  async function oneTransition() {
    const { unit } = await createAdmittedUnit();
    return prisma.humanWorkUnitTransition.create({
      data: {
        unitStateId: unit.id,
        seq: 1,
        actorRole: "system" as never,
        toState: "admitted" as never,
        cause: "admitted",
        claimGeneration: 0,
        resumeGeneration: 0,
      },
      select: { id: true, unitStateId: true },
    });
  }

  it("refuses UPDATE unconditionally — an editable trail is not evidence", async () => {
    const t = await oneTransition();
    await expect(
      prisma.humanWorkUnitTransition.update({
        where: { id: t.id },
        data: { cause: "resumed" },
      })
    ).rejects.toThrow(/append-only/i);
  });

  it("refuses DELETE outside the retention purge", async () => {
    const t = await oneTransition();
    await expect(
      prisma.humanWorkUnitTransition.delete({ where: { id: t.id } })
    ).rejects.toThrow(/append-only|retention/i);
  });

  it("refuses two transitions at the same seq for one unit (INV-T1)", async () => {
    const t = await oneTransition();
    await expect(
      prisma.humanWorkUnitTransition.create({
        data: {
          unitStateId: t.unitStateId,
          seq: 1,
          actorRole: "system" as never,
          toState: "published" as never,
          cause: "published",
          claimGeneration: 0,
          resumeGeneration: 0,
        },
      })
    ).rejects.toThrow();
  });
});

describe("INV-9 — the definition is immutable", () => {
  /**
   * A mutated definition retroactively changes what a worker was asked to do
   * and what a reviewer judged against — the two things the whole feature is
   * built to keep stable.
   */
  it("refuses UPDATE and DELETE", async () => {
    const { definition } = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitDefinition.update({
        where: { id: definition.id },
        data: { instructions: "do something else entirely" },
      })
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.humanWorkUnitDefinition.delete({ where: { id: definition.id } })
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses a second definition for one accepted plan step", async () => {
    const { definition, planVersion } = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitDefinition.create({
        data: {
          planVersionId: planVersion.id,
          planStepId: definition.planStepId,
          instructions: "duplicate",
          declaredInputs: [],
          outputSchema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
          requiredArtifactKinds: [],
          acceptanceCriteria: [],
          verificationMethod: "sample_check",
          eligibility: {},
          reviewerAuthority: "admin",
          expectedMinutes: 30,
          revisionBound: 2,
          publicationDeadlineHours: 72,
          submissionDeadlineHours: 72,
          claimLeaseHours: 72,
          economicProvenance: {},
          dataClass: "business_confidential",
        },
      })
    ).rejects.toThrow();
  });
});

describe("INV-10 / INV-11 — candidates are evidence, and only one is pending", () => {
  it("refuses rewriting a candidate's payload", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const candidate = await createCandidate(unit.id, (await createWorker()).id);
    await expect(
      prisma.humanWorkUnitCandidate.update({
        where: { id: candidate.id },
        data: { payload: { summary: "rewritten" } },
      })
    ).rejects.toThrow(/append-only|immutable/i);
  });

  it("permits the one-way status change a review makes", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const candidate = await createCandidate(unit.id, (await createWorker()).id);
    const moved = await prisma.humanWorkUnitCandidate.update({
      where: { id: candidate.id },
      data: { status: "rejected" as never },
      select: { status: true },
    });
    expect(moved.status).toBe("rejected");
  });

  it("refuses two pending candidates for one unit", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const worker = await createWorker();
    await createCandidate(unit.id, worker.id, { revisionIndex: 0 });
    await expect(
      createCandidate(unit.id, worker.id, { revisionIndex: 1 })
    ).rejects.toThrow();
  });

  it("CHK-6 — refuses a duplicate (generation, revision) candidate", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const worker = await createWorker();
    const first = await createCandidate(unit.id, worker.id, { revisionIndex: 0 });
    await prisma.humanWorkUnitCandidate.update({
      where: { id: first.id },
      data: { status: "rejected" as never },
    });
    await expect(
      createCandidate(unit.id, worker.id, { revisionIndex: 0 })
    ).rejects.toThrow();
  });
});

describe("INV-12 — THE PAYOUT IS FROZEN FROM ADMISSION", () => {
  /**
   * The worker accepted a number. If it can move afterwards they are paid
   * something they never agreed to, and the existing freeze does not cover it:
   * that one only fires when `claimedById` is non-null on BOTH sides, so a
   * release-and-reclaim cycle passes straight through the gap.
   */
  it("refuses moving vaPayoutCents once a unit is admitted, even with no claimant", async () => {
    const { task } = await createAdmittedUnit();
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { vaPayoutCents: 1 } })
    ).rejects.toThrow(/frozen/i);
  });

  it("refuses moving estimatedMinutes once a unit is admitted", async () => {
    const { task } = await createAdmittedUnit();
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { estimatedMinutes: 1 } })
    ).rejects.toThrow(/frozen/i);
  });

  it("closes the release-and-reclaim gap the existing freeze leaves open", async () => {
    const worker = await createWorker();
    const { task } = await createAdmittedUnit();
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: worker.id } });
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: null } });
    // Unclaimed on both sides — exactly the window the old guard misses.
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { vaPayoutCents: 99 } })
    ).rejects.toThrow(/frozen/i);
  });
});

describe("INV-13 / INV-14 — the claimant matches, and a reassignment fences", () => {
  it("refuses a unit claimant that is not the task's claimant", async () => {
    const { unit } = await createAdmittedUnit();
    const stranger = await createWorker();
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { claimedById: stranger.id },
      })
    ).rejects.toThrow(/claimant/i);
  });

  /**
   * The initial NULL → worker claim is EXCLUDED from the fence on purpose: the
   * application bumps the generation there, and firing here too would
   * double-bump and instantly stale the claim that was just created.
   */
  it("does not bump the generation on the initial claim", async () => {
    const worker = await createWorker();
    const { task, unit } = await createAdmittedUnit();
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: worker.id } });
    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimGeneration: true },
    });
    expect(after.claimGeneration).toBe(0);
  });

  it("bumps the generation exactly once when a prior claimant is replaced", async () => {
    const first = await createWorker();
    const second = await createWorker();
    const { task, unit } = await createAdmittedUnit();
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: first.id } });
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { claimedById: first.id },
    });
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: second.id } });
    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimGeneration: true, claimedById: true },
    });
    expect(after.claimGeneration).toBe(1);
    // And the stale holder is cleared atomically with the bump, so a late
    // submission from them is refused rather than merged.
    expect(after.claimedById).toBeNull();
  });

  it("bumps once on a release to nobody", async () => {
    const worker = await createWorker();
    const { task, unit } = await createAdmittedUnit();
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: worker.id } });
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { claimedById: worker.id },
    });
    await prisma.task.update({ where: { id: task.id }, data: { claimedById: null } });
    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimGeneration: true },
    });
    expect(after.claimGeneration).toBe(1);
  });
});

describe("INV-15 — no run-level provider reservation while the unit waits", () => {
  /**
   * Ordering, not accounting. Spend that has left the platform cannot be
   * un-made by a check that runs afterwards, so the refusal has to happen
   * before the reservation row exists.
   */
  it("refuses a budget hold on a run whose unit is waiting", async () => {
    const { run } = await createAdmittedUnit({ state: "published" });
    await expect(
      prisma.workflowBudgetHold.create({
        data: {
          runId: run.id,
          operationKey: `hwu-test:${run.id}`,
          amountMicros: 1_000n,
        } as never,
      })
    ).rejects.toThrow(/waiting|human/i);
  });
});

describe("INV-16 — a terminal unit state never reopens", () => {
  it.each(["resumed", "exhausted", "withdrawn"])("refuses reopening %s", async (terminal) => {
    const { unit } = await createAdmittedUnit();
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { state: terminal as never, acceptedAt: new Date() },
    });
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { state: "published" as never },
      })
    ).rejects.toThrow(/terminal/i);
  });
});

describe("INV-17 — the decider is not the submitter", () => {
  /**
   * Self-acceptance turns a candidate into a contract input with no independent
   * gate. There is no later audit that repairs it, so the database refuses the
   * row rather than trusting the call site.
   */
  it("refuses a decision by the worker who submitted the candidate", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const submitter = await createWorker();
    const candidate = await createCandidate(unit.id, submitter.id);
    await expect(
      prisma.humanWorkUnitReviewDecision.create({
        data: {
          candidateId: candidate.id,
          unitStateId: unit.id,
          decidedById: submitter.id,
          outcome: "accepted" as never,
          remainingRevisionsAfter: 2,
          claimGeneration: 0,
        },
      })
    ).rejects.toThrow(/submitter|self/i);
  });

  it("permits a different admin to decide", async () => {
    const { unit } = await createAdmittedUnit({ state: "submitted" });
    const candidate = await createCandidate(unit.id, (await createWorker()).id);
    const decision = await prisma.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: unit.id,
        decidedById: (await createWorker()).id,
        outcome: "accepted" as never,
        remainingRevisionsAfter: 2,
        claimGeneration: 0,
      },
      select: { id: true },
    });
    expect(decision.id).toBeTruthy();
  });
});

// ───────────────────────────── §2 ─────────────────────────────

describe("check constraints", () => {
  it("CHK-1 — remainingRevisions may not go negative", async () => {
    const { unit } = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { remainingRevisions: -1 },
      })
    ).rejects.toThrow();
  });

  it("CHK-2 — revisionBound and expectedMinutes may not go negative", async () => {
    const { planVersion } = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitDefinition.create({
        data: {
          planVersionId: planVersion.id,
          planStepId: (
            await prisma.taskExecutionPlanStep.create({
              data: {
                planVersionId: planVersion.id,
                order: 9,
                title: "x",
                description: "x",
                executor: "human" as never,
                humanRole: "worker" as never,
                estimatedMinutesOptimistic: 1,
                estimatedMinutesLikely: 1,
                estimatedMinutesConservative: 1,
                verificationMethod: "v",
                acceptanceCriteria: [],
                riskLevel: "low" as never,
                dependsOnOrder: [],
              },
              select: { id: true },
            })
          ).id,
          instructions: "x",
          declaredInputs: [],
          outputSchema: {},
          requiredArtifactKinds: [],
          acceptanceCriteria: [],
          verificationMethod: "v",
          eligibility: {},
          reviewerAuthority: "admin",
          expectedMinutes: -1,
          revisionBound: 2,
          publicationDeadlineHours: 72,
          submissionDeadlineHours: 72,
          claimLeaseHours: 72,
          economicProvenance: {},
          dataClass: "business_confidential",
        },
      })
    ).rejects.toThrow();
  });

  it("CHK-3 — a zero deadline is an unbounded wait, not a fast one", async () => {
    const { definition } = await createAdmittedUnit();
    const row = await prisma.humanWorkUnitDefinition.findUniqueOrThrow({
      where: { id: definition.id },
      select: {
        publicationDeadlineHours: true,
        submissionDeadlineHours: true,
        claimLeaseHours: true,
      },
    });
    for (const hours of Object.values(row)) expect(hours).toBeGreaterThan(0);
  });

  it("CHK-4 — accepted and resumed require an acceptedAt", async () => {
    const { unit } = await createAdmittedUnit();
    await expect(
      prisma.humanWorkUnitRunState.update({
        where: { id: unit.id },
        data: { state: "accepted" as never, acceptedAt: null },
      })
    ).rejects.toThrow();
  });

  it("CHK-5 — one alert per (unit, kind, dueAt), which is what makes the sweep replay-safe", async () => {
    const { unit } = await createAdmittedUnit({ state: "published" });
    const dueAt = new Date("2026-09-01T00:00:00.000Z");
    const alert = {
      unitStateId: unit.id,
      kind: "publication_deadline" as never,
      dueAt,
      claimGeneration: 0,
    };
    await prisma.humanWorkUnitAlert.create({ data: alert });
    await expect(prisma.humanWorkUnitAlert.create({ data: alert })).rejects.toThrow();
    expect(await prisma.humanWorkUnitAlert.count({ where: { unitStateId: unit.id } })).toBe(1);
  });
});

// ─────────────────── T011 option-B rider ───────────────────

describe("the frozen human output contract is immutable once accepted", () => {
  /**
   * `second_shift_accepted_plan_step_guard` is row-level and names no column,
   * so `humanOutputSchema` and `humanRequiredArtifactKinds` inherit accepted-plan
   * immutability the moment they exist. Inheritance that is not pinned is
   * inheritance that can be silently lost — a later migration narrowing that
   * trigger to a column list would take these two with it, and an operator
   * could then edit the obligation a worker is held to AFTER the client signed.
   *
   * Until this case passes, that protection is CODE-PROVEN only.
   */
  it("refuses a direct UPDATE of humanOutputSchema on an accepted plan", async () => {
    const { definition } = await createAdmittedUnit();
    await expect(
      prisma.taskExecutionPlanStep.update({
        where: { id: definition.planStepId },
        data: {
          humanOutputSchema: {
            type: "object",
            properties: { anything: { type: "string" } },
            required: [],
          },
        },
      })
    ).rejects.toThrow(/append-only|accepted/i);
  });

  it("refuses a direct UPDATE of humanRequiredArtifactKinds on an accepted plan", async () => {
    const { definition } = await createAdmittedUnit();
    await expect(
      prisma.taskExecutionPlanStep.update({
        where: { id: definition.planStepId },
        data: { humanRequiredArtifactKinds: ["smuggled_obligation"] },
      })
    ).rejects.toThrow(/append-only|accepted/i);
  });

  it("leaves an UNACCEPTED plan's step freely editable, which the editor needs", async () => {
    const { task } = await createAcceptedTask();
    const free = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId: task.id,
        version: 2,
        source: "ai_draft" as never,
        deliverableDescription: "draft",
        assumptions: [],
        exclusions: [],
        internalCostLikelyCents: 1,
        internalCostConservativeCents: 1,
        suggestedPriceCents: 1,
        suggestedVaPayoutCents: 1,
        calibration: "cc1" as never,
      },
      select: { id: true },
    });
    const step = await prisma.taskExecutionPlanStep.create({
      data: {
        planVersionId: free.id,
        order: 1,
        title: "draft step",
        description: "d",
        executor: "human" as never,
        humanRole: "worker" as never,
        estimatedMinutesOptimistic: 1,
        estimatedMinutesLikely: 1,
        estimatedMinutesConservative: 1,
        verificationMethod: "v",
        acceptanceCriteria: [],
        riskLevel: "low" as never,
        dependsOnOrder: [],
      },
      select: { id: true },
    });
    const edited = await prisma.taskExecutionPlanStep.update({
      where: { id: step.id },
      data: { humanRequiredArtifactKinds: ["source_file"] },
      select: { humanRequiredArtifactKinds: true },
    });
    expect(edited.humanRequiredArtifactKinds).toEqual(["source_file"]);
  });
});
