import "server-only";

import { prisma } from "@/lib/db";
import { humanUnitForWorker } from "@/lib/queries/human-unit";

/**
 * Construction-specific minimum projection. It returns only the safe generic
 * worker contract plus the non-financial escalation purpose.
 */
export async function constructionHumanEscalationForWorker(input: {
  taskId: string;
  workerId: string;
  claimGeneration: number;
}) {
  const binding = await prisma.constructionHumanEscalation.findFirst({
    where: {
      taskId: input.taskId,
      state: { in: ["active", "resumed"] },
      unitState: {
        claimedById: input.workerId,
        claimGeneration: input.claimGeneration,
      },
    },
    select: { id: true, purpose: true, evidenceKind: true },
  });
  if (!binding) return null;
  const unit = await humanUnitForWorker(input);
  if (!unit) return null;
  return {
    escalationId: binding.id,
    purpose: "OBTAIN_MISSING_EVIDENCE" as const,
    evidenceKind:
      binding.evidenceKind === "written_approval"
        ? "WRITTEN_APPROVAL"
        : binding.evidenceKind === "photo"
          ? "PHOTO"
          : "DOCUMENT",
    unit,
  };
}
