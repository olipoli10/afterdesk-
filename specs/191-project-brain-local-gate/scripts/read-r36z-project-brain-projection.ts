import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { projectBrainIntakeForUser } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { projectBrainFactCandidatesForUser } from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";
import { projectBrainUnderstandingForUser } from "@/server/construction-operating-assistant-r36x/project-brain-understanding-review";
import { projectBrainAssistantMemoryForUser } from "@/server/construction-operating-assistant-r36y/project-brain-assistant-memory";

export async function readR36ZProjectBrainProjection(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  intakeId: string;
}) {
  // The disposable local proxy exposes a bounded connection pool. Keep the
  // four repeatable-read projections serialized so one transaction cannot
  // issue work before another transaction's isolation level is established.
  const intake = await projectBrainIntakeForUser(input);
  const candidates = await projectBrainFactCandidatesForUser(input);
  const understanding = await projectBrainUnderstandingForUser(input);
  const assistant = await projectBrainAssistantMemoryForUser(input);
  const counts = await Promise.all([
      prisma.constructionProjectBrainIntake.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainSource.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainFactCandidateBatch.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainFactCandidate.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainUnderstandingReview.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainContradiction.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainContradictionResolution.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainUnderstandingSnapshot.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainRecallReceipt.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionProjectBrainPreparedActionBinding.count({ where: { workspaceId: input.workspaceId, projectId: input.projectId } }),
      prisma.constructionMessageDeliveryEvent.count({ where: { workspaceId: input.workspaceId } }),
  ]);
  const canonical = JSON.stringify({ intake, candidates, understanding, assistant, counts });
  return {
    canonical,
    sha256: createHash("sha256").update(canonical).digest("hex"),
    counts,
  };
}

async function main() {
  const [userId, workspaceId, projectId, intakeId] = process.argv.slice(3);
  if (![userId, workspaceId, projectId, intakeId].every(Boolean)) {
    throw new Error("R36Z_PROJECTION_ARGUMENTS_REQUIRED");
  }
  try {
    const projection = await readR36ZProjectBrainProjection({ userId, workspaceId, projectId, intakeId });
    process.stdout.write(`${JSON.stringify(projection)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[2] === "--read") {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
