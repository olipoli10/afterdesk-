import "server-only";
import { prisma } from "@/lib/db";
import {
  buildRecoveryManifest,
  fingerprintRecoveryManifest,
} from "@/server/construction-operating-assistant-r31/checkpoints";

const workspaceId = process.argv[2];

if (!workspaceId) {
  throw new Error("RECOVERY_WORKSPACE_ID_REQUIRED");
}

void (async () => {
  try {
    const manifest = await prisma.$transaction((tx) => buildRecoveryManifest(tx, workspaceId));
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      workspaceId,
      manifest,
      fingerprint: fingerprintRecoveryManifest(manifest),
    })}\n`);
  } finally {
    await prisma.$disconnect();
  }
})();
