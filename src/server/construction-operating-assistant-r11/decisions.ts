import "server-only";

import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import {
  boundOutboundActionSchema,
  buildActionFingerprint,
} from "@/lib/construction-assistant-v1/outbound";
import {
  preparedActionDecisionCommandSchema,
  preparedActionDecisionResultSchema,
  type PreparedActionDecisionCommand,
} from "@/lib/construction-operating-assistant-r11/prepared-action-decisions";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const AUDIT_ACTION = {
  APPROVE: "construction_outbound_approved_unsent_r11",
  REJECT: "construction_outbound_rejected_unsent_r11",
  REVOKE: "construction_outbound_revoked_unsent_r11",
} as const;

const RESULT_STATE = {
  APPROVE: "APPROVED_UNSENT",
  REJECT: "REJECTED",
  REVOKE: "REVOKED",
} as const;

type DecisionAuditMetadata = {
  commandId: string;
  decision: PreparedActionDecisionCommand["decision"];
  version: number;
  fingerprint: string;
  externalTransportPerformed: false;
};

function auditMetadata(value: Prisma.JsonValue | null): DecisionAuditMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.commandId !== "string" ||
    !["APPROVE", "REJECT", "REVOKE"].includes(String(candidate.decision)) ||
    typeof candidate.version !== "number" ||
    typeof candidate.fingerprint !== "string" ||
    candidate.externalTransportPerformed !== false
  ) {
    return null;
  }
  return candidate as DecisionAuditMetadata;
}

function result(input: {
  command: PreparedActionDecisionCommand;
  decidedAt: Date;
  replayed: boolean;
}) {
  return preparedActionDecisionResultSchema.parse({
    schemaVersion: 1,
    commandId: input.command.commandId,
    actionId: input.command.actionId,
    decision: input.command.decision,
    state: RESULT_STATE[input.command.decision],
    version: input.command.expectedVersion,
    fingerprint: input.command.expectedFingerprint,
    decidedAt: input.decidedAt.toISOString(),
    replayed: input.replayed,
    externalTransportPerformed: false,
  });
}

export async function decidePreparedAction(input: {
  userId: string;
  command: unknown;
  /** Internal bounded retry for a serializable write conflict. */
  _conflictAttempt?: number;
}) {
  const command = preparedActionDecisionCommandSchema.parse(input.command);
  try {
    return await prisma.$transaction(
      async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.actionId}`}, 0))::text AS acquired
      `);
      const membership = await requireActiveConstructionMember(
        tx,
        input.userId,
        command.workspaceId,
      );
      if (!["owner", "admin"].includes(membership.role)) {
        throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      }

      const audits = await tx.constructionAuditEvent.findMany({
        where: {
          workspaceId: command.workspaceId,
          entityType: "action",
          entityId: command.actionId,
          action: { in: Object.values(AUDIT_ACTION) },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { action: true, metadata: true, createdAt: true },
      });
      for (const audit of audits) {
        const metadata = auditMetadata(audit.metadata);
        if (metadata?.commandId !== command.commandId) continue;
        if (
          metadata.decision !== command.decision ||
          metadata.version !== command.expectedVersion ||
          metadata.fingerprint !== command.expectedFingerprint
        ) {
          throw new Error("DECISION_IDEMPOTENCY_MISMATCH");
        }
        return result({ command, decidedAt: audit.createdAt, replayed: true });
      }

      const action = await tx.constructionAction.findFirst({
        where: {
          id: command.actionId,
          workspaceId: command.workspaceId,
          type: "outbound_message",
        },
        select: {
          id: true,
          status: true,
          version: true,
          payload: true,
          payloadHash: true,
          approvedVersion: true,
          approvedPayloadHash: true,
          approvedAt: true,
          simulatedDeliveryCount: true,
        },
      });
      if (!action) throw new Error("PREPARED_ACTION_NOT_FOUND");
      if (
        action.status === "simulated_delivered" ||
        action.simulatedDeliveryCount !== 0
      ) {
        throw new Error("PREPARED_ACTION_ALREADY_DELIVERED");
      }
      const payload = boundOutboundActionSchema.parse(action.payload);
      if (
        payload.actionId !== action.id ||
        payload.workspaceId !== command.workspaceId ||
        payload.version !== command.expectedVersion ||
        action.version !== command.expectedVersion
      ) {
        throw new Error("STALE_VERSION");
      }
      if (
        buildActionFingerprint(payload) !== command.expectedFingerprint ||
        action.payloadHash !== command.expectedFingerprint
      ) {
        throw new Error("PAYLOAD_CHANGED");
      }

      const priorSameDecision = audits.find((audit) => {
        const metadata = auditMetadata(audit.metadata);
        return (
          metadata?.decision === command.decision &&
          metadata.version === command.expectedVersion &&
          metadata.fingerprint === command.expectedFingerprint
        );
      });
      if (priorSameDecision) {
        return result({ command, decidedAt: priorSameDecision.createdAt, replayed: true });
      }

      const decidedAt = new Date();
      if (command.decision === "APPROVE") {
        if (
          action.status === "approved" &&
          action.approvedVersion === command.expectedVersion &&
          action.approvedPayloadHash === command.expectedFingerprint &&
          action.approvedAt
        ) {
          return result({ command, decidedAt: action.approvedAt, replayed: true });
        }
        if (action.status !== "proposed") throw new Error("DECISION_STATE_CHANGED");
        const updated = await tx.constructionAction.updateMany({
          where: {
            id: action.id,
            workspaceId: command.workspaceId,
            status: "proposed",
            version: command.expectedVersion,
            payloadHash: command.expectedFingerprint,
            simulatedDeliveryCount: 0,
          },
          data: {
            status: "approved",
            approvedVersion: command.expectedVersion,
            approvedPayloadHash: command.expectedFingerprint,
            approvedAt: decidedAt,
          },
        });
        if (updated.count !== 1) throw new Error("CONCURRENT_OR_STALE");
      } else if (command.decision === "REJECT") {
        if (action.status !== "proposed") throw new Error("DECISION_STATE_CHANGED");
        const updated = await tx.constructionAction.updateMany({
          where: {
            id: action.id,
            workspaceId: command.workspaceId,
            status: "proposed",
            version: command.expectedVersion,
            payloadHash: command.expectedFingerprint,
            simulatedDeliveryCount: 0,
          },
          data: { status: "revoked" },
        });
        if (updated.count !== 1) throw new Error("CONCURRENT_OR_STALE");
      } else {
        if (
          action.status !== "approved" ||
          action.approvedVersion !== command.expectedVersion ||
          action.approvedPayloadHash !== command.expectedFingerprint ||
          !action.approvedAt
        ) {
          throw new Error("EXACT_APPROVAL_REQUIRED");
        }
        const updated = await tx.constructionAction.updateMany({
          where: {
            id: action.id,
            workspaceId: command.workspaceId,
            status: "approved",
            version: command.expectedVersion,
            payloadHash: command.expectedFingerprint,
            approvedVersion: command.expectedVersion,
            approvedPayloadHash: command.expectedFingerprint,
            simulatedDeliveryCount: 0,
          },
          data: { status: "revoked" },
        });
        if (updated.count !== 1) throw new Error("CONCURRENT_OR_STALE");
      }

      await appendConstructionAudit(tx, {
        workspaceId: command.workspaceId,
        actorUserId: input.userId,
        entityType: "action",
        entityId: action.id,
        action: AUDIT_ACTION[command.decision],
        reasonCode: "reason" in command ? command.reason : null,
        metadata: {
          commandId: command.commandId,
          decision: command.decision,
          version: command.expectedVersion,
          fingerprint: command.expectedFingerprint,
          externalTransportPerformed: false,
        },
      });
      return result({ command, decidedAt, replayed: false });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034" &&
      (input._conflictAttempt ?? 0) < 2
    ) {
      return decidePreparedAction({
        ...input,
        _conflictAttempt: (input._conflictAttempt ?? 0) + 1,
      });
    }
    throw error;
  }
}
