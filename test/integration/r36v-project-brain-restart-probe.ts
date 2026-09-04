import { prisma } from "@/lib/db";
import { projectBrainIntakeProjectionForUser } from "@/server/construction-operating-assistant-r36v/project-brain-intake";

async function main() {
  const userId = process.env.R36V_RESTART_USER_ID;
  const workspaceId = process.env.R36V_RESTART_WORKSPACE_ID;
  const projectId = process.env.R36V_RESTART_PROJECT_ID;
  if (!userId || !workspaceId || !projectId) {
    throw new Error("R36V_RESTART_PROBE_SCOPE_MISSING");
  }

  const projection = await projectBrainIntakeProjectionForUser({
    userId,
    workspaceId,
    projectId,
  });
  process.stdout.write(JSON.stringify(projection));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
