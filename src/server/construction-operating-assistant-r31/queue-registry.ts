import "server-only";
import type { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import type {
  ReliabilityQueueKind,
  ReliabilityReplayClass,
} from "@/lib/construction-operating-assistant-r31/contracts";
import { processDueManagedFollowUpInTransaction } from "@/server/construction-operating-assistant-r20/follow-up-engine";

export const RELIABILITY_QUEUE_REGISTRY_VERSION = 1 as const;

type QueueItem = {
  queueKind: ReliabilityQueueKind;
  itemId: string;
  itemVersion: number;
  fingerprint: string;
  replayClass: ReliabilityReplayClass;
  recoveryAction: "REQUEUE_LOCAL" | "QUARANTINE";
};

export async function inspectReliabilityQueueItem(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; queueKind: ReliabilityQueueKind; itemId: string },
): Promise<QueueItem> {
  if (input.queueKind === "FOLLOW_UP_DUE") {
    const row = await tx.constructionFollowUp.findFirst({
      where: { id: input.itemId, workspaceId: input.workspaceId },
      select: { id: true, version: true, status: true, dueAt: true, policyHash: true, attempt: true },
    });
    if (!row) throw new Error("RELIABILITY_QUEUE_ITEM_NOT_FOUND");
    return {
      queueKind: input.queueKind,
      itemId: row.id,
      itemVersion: row.version,
      fingerprint: sha256Canonical({
        id: row.id,
        version: row.version,
        status: row.status,
        dueAt: row.dueAt.toISOString(),
        policyHash: row.policyHash,
        attempt: row.attempt,
      }),
      replayClass: "LOCAL_REPLAY_SAFE",
      recoveryAction: "REQUEUE_LOCAL",
    };
  }

  const row = await tx.constructionConnectorOperation.findFirst({
    where: { id: input.itemId, workspaceId: input.workspaceId },
    select: {
      id: true,
      status: true,
      requestHash: true,
      resultHash: true,
      preparedAt: true,
      appliedAt: true,
      refusedAt: true,
      externalTransportPerformed: true,
    },
  });
  if (!row) throw new Error("RELIABILITY_QUEUE_ITEM_NOT_FOUND");
  return {
    queueKind: input.queueKind,
    itemId: row.id,
    itemVersion: 1,
    fingerprint: sha256Canonical({
      id: row.id,
      status: row.status,
      requestHash: row.requestHash,
      resultHash: row.resultHash,
      preparedAt: row.preparedAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
      refusedAt: row.refusedAt?.toISOString() ?? null,
      externalTransportPerformed: row.externalTransportPerformed,
    }),
    replayClass: "EXTERNAL_EFFECT_UNCERTAIN",
    recoveryAction: "QUARANTINE",
  };
}

export async function applyRegisteredLocalRecovery(
  tx: Prisma.TransactionClient,
  input: { queueKind: ReliabilityQueueKind; itemId: string; referenceNow: Date },
) {
  if (input.queueKind !== "FOLLOW_UP_DUE") {
    throw new Error("RELIABILITY_EXTERNAL_RECOVERY_REFUSED");
  }
  const result = await processDueManagedFollowUpInTransaction(tx, input.itemId, input.referenceNow);
  if (!result) throw new Error("RELIABILITY_QUEUE_ITEM_NO_LONGER_DUE");
  return result;
}
