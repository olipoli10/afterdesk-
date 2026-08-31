import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export async function appendConstructionAudit(
  tx: Prisma.TransactionClient,
  entry: {
    workspaceId: string;
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    reasonCode?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  const nonce = randomUUID();
  await tx.constructionAuditEvent.create({
    data: {
      ...entry,
      fingerprint: sha256Canonical({ ...entry, nonce }),
    },
  });
}
