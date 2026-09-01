import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type ConstructionOpenLoopStatus } from "@prisma-client";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  invoiceReadinessInputSchema,
  preparedEvidenceRequestSchema,
  projectOpenLoopProjection,
  readinessDecisionSchema,
  reportWorkFinishedCommandSchema,
  type ConstructionProjectionRole,
  type InvoiceReadinessInput,
  type ReportWorkFinishedCommand,
  type ReadinessDecision,
} from "@/lib/construction-operating-assistant-r0/contracts";
import { evaluateInvoiceReadiness } from "@/lib/construction-operating-assistant-r0/evaluator";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const POLICY_VERSION = "construction-invoice-readiness-change-order-r0-v1";

const addInvoiceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1).max(160),
    userId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    kind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    state: z.enum(["PRESENT_UNVERIFIED", "VERIFIED"]),
    sourceRef: z.string().min(1).max(500),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
  })
  .strict();

const prepareEvidenceRequestInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1).max(160),
    userId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    contactId: z.string().min(1).max(160),
    channel: z.enum(["SMS", "EMAIL"]),
    body: z.string().trim().min(1).max(1600),
  })
  .strict();

const contradictionFieldSchema = z.enum([
  "PROJECT_ASSOCIATION",
  "WORK_DESCRIPTION",
  "AMOUNT",
  "COMPLETION_ASSERTION",
  "APPROVAL_STATE",
]);

const recordContradictionSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1).max(160),
    userId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    field: contradictionFieldSchema,
    claimIds: z.array(z.string().min(1).max(160)).min(2).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.claimIds).size !== value.claimIds.length) {
      ctx.addIssue({ code: "custom", path: ["claimIds"], message: "Claim IDs must be unique" });
    }
  });

const resolveContradictionSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1).max(160),
    userId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    contradictionId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    acceptedClaimId: z.string().min(1).max(160),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

const revokeEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1).max(160),
    userId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    evidenceId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

type Tx = Prisma.TransactionClient;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDatabaseStatus(status: ReadinessDecision["status"]): ConstructionOpenLoopStatus {
  const statuses: Record<ReadinessDecision["status"], ConstructionOpenLoopStatus> = {
    OPEN: "open",
    WAITING_FOR_EVIDENCE: "waiting_for_evidence",
    WAITING_FOR_VERIFICATION: "waiting_for_verification",
    READY_TO_INVOICE: "ready_to_invoice",
    CLOSED: "closed",
    REVOKED: "revoked",
  };
  return statuses[status];
}

function fromDatabaseFactState(state: string): InvoiceReadinessInput["facts"]["amount"]["state"] {
  const states = {
    unknown: "UNKNOWN",
    claimed: "CLAIMED",
    verified: "VERIFIED",
    disputed: "DISPUTED",
    revoked: "REVOKED",
  } as const;
  const mapped = states[state as keyof typeof states];
  if (!mapped) throw new Error("OPEN_LOOP_FACT_STATE_INVALID");
  return mapped;
}

function fromDatabaseEvidenceKind(kind: string) {
  const kinds = {
    written_approval: "WRITTEN_APPROVAL",
    photo: "PHOTO",
    document: "DOCUMENT",
  } as const;
  const mapped = kinds[kind as keyof typeof kinds];
  if (!mapped) throw new Error("OPEN_LOOP_EVIDENCE_KIND_INVALID");
  return mapped;
}

function fromDatabaseEvidenceState(state: string) {
  const states = {
    present_unverified: "PRESENT_UNVERIFIED",
    verified: "VERIFIED",
    rejected: "REJECTED",
    revoked: "REVOKED",
  } as const;
  const mapped = states[state as keyof typeof states];
  if (!mapped) throw new Error("OPEN_LOOP_EVIDENCE_STATE_INVALID");
  return mapped;
}

function jsonValue(row: { value: Prisma.JsonValue }): unknown {
  if (!row.value || typeof row.value !== "object" || Array.isArray(row.value)) {
    throw new Error("OPEN_LOOP_FACT_VALUE_INVALID");
  }
  return (row.value as Record<string, unknown>).value;
}

async function buildEvaluationInput(
  tx: Tx,
  loopId: string,
  stateVersion?: number,
): Promise<InvoiceReadinessInput> {
  const loop = await tx.constructionOpenLoop.findUniqueOrThrow({
    where: { id: loopId },
    include: {
      facts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      contradictions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  const facts = new Map(loop.facts.map((fact) => [fact.field, fact]));
  const requiredFact = (field: string) => {
    const fact = facts.get(field);
    if (!fact) throw new Error(`OPEN_LOOP_REQUIRED_FACT_MISSING:${field}`);
    return fact;
  };
  const projectAssociation = requiredFact("PROJECT_ASSOCIATION");
  const workDescription = requiredFact("WORK_DESCRIPTION");
  const amount = requiredFact("AMOUNT");
  const completion = requiredFact("COMPLETION_ASSERTION");
  const approval = requiredFact("APPROVAL_STATE");

  return invoiceReadinessInputSchema.parse({
    schemaVersion: 1,
    loopId: loop.id,
    workspaceId: loop.workspaceId,
    projectId: loop.projectId,
    stateVersion: stateVersion ?? loop.stateVersion,
    billingBasis: "CHANGE_ORDER",
    facts: {
      projectAssociation: {
        value: jsonValue(projectAssociation),
        state: fromDatabaseFactState(projectAssociation.state),
      },
      workDescription: {
        value: jsonValue(workDescription),
        state: fromDatabaseFactState(workDescription.state),
      },
      amount: {
        value: jsonValue(amount),
        state: fromDatabaseFactState(amount.state),
      },
      completion: {
        value: jsonValue(completion),
        state: fromDatabaseFactState(completion.state),
      },
      approval: {
        value: jsonValue(approval),
        state: fromDatabaseFactState(approval.state),
      },
    },
    evidence: loop.evidence.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      kind: fromDatabaseEvidenceKind(item.kind),
      state: fromDatabaseEvidenceState(item.state),
    })),
    contradictions: loop.contradictions.map((item) => ({
      id: item.id,
      field: item.field,
      status: item.status === "open" ? "OPEN" : "RESOLVED",
    })),
  });
}

async function decisionFromSnapshot(tx: Tx, loopId: string, stateVersion: number) {
  const snapshot = await tx.constructionOpenLoopSnapshot.findUniqueOrThrow({
    where: { loopId_stateVersion: { loopId, stateVersion } },
    select: { snapshot: true, canonicalHash: true },
  });
  const decision = readinessDecisionSchema.parse(snapshot.snapshot);
  if (sha256Canonical(decision) !== snapshot.canonicalHash) {
    throw new Error("OPEN_LOOP_SNAPSHOT_HASH_MISMATCH");
  }
  return decision;
}

async function replayedTransition(
  tx: Tx,
  input: { loopId: string; idempotencyKey: string; inputHash: string },
) {
  const replay = await tx.constructionOpenLoopTransition.findUnique({
    where: {
      loopId_idempotencyKey: {
        loopId: input.loopId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { inputHash: true, nextVersion: true },
  });
  if (!replay) return null;
  if (replay.inputHash !== input.inputHash) throw new Error("OPEN_LOOP_IDEMPOTENCY_CONFLICT");
  return {
    loopId: input.loopId,
    decision: await decisionFromSnapshot(tx, input.loopId, replay.nextVersion),
    replayed: true,
  };
}

async function persistEvaluatedTransition(
  tx: Tx,
  input: {
    loop: {
      id: string;
      workspaceId: string;
      stateVersion: number;
      status: ConstructionOpenLoopStatus;
    };
    actorUserId: string;
    idempotencyKey: string;
    inputHash: string;
    authorityDecision: string;
    auditAction: string;
    auditReasonCode: string;
    auditMetadata?: Record<string, unknown>;
  },
) {
  const nextVersion = input.loop.stateVersion + 1;
  const evaluationInput = await buildEvaluationInput(tx, input.loop.id, nextVersion);
  const decision = evaluateInvoiceReadiness(evaluationInput);
  const update = await tx.constructionOpenLoop.updateMany({
    where: {
      id: input.loop.id,
      workspaceId: input.loop.workspaceId,
      stateVersion: input.loop.stateVersion,
    },
    data: {
      stateVersion: nextVersion,
      status: toDatabaseStatus(decision.status),
      nextResponsibleRole: decision.nextResponsible.role,
      nextAction: decision.nextAction,
      decisionHash: decision.decisionHash,
      readyAt: decision.ready ? new Date() : null,
    },
  });
  if (update.count !== 1) throw new Error("OPEN_LOOP_CONCURRENT_TRANSITION_REFUSED");
  await tx.constructionOpenLoopTransition.create({
    data: {
      loopId: input.loop.id,
      workspaceId: input.loop.workspaceId,
      priorStatus: input.loop.status,
      nextStatus: toDatabaseStatus(decision.status),
      priorVersion: input.loop.stateVersion,
      nextVersion,
      reasonCodes: decision.reasons,
      actorUserId: input.actorUserId,
      authorityDecision: input.authorityDecision,
      inputHash: input.inputHash,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await tx.constructionOpenLoopSnapshot.create({
    data: {
      loopId: input.loop.id,
      workspaceId: input.loop.workspaceId,
      stateVersion: nextVersion,
      snapshot: asJson(decision),
      canonicalHash: sha256Canonical(decision),
    },
  });
  await appendConstructionAudit(tx, {
    workspaceId: input.loop.workspaceId,
    actorUserId: input.actorUserId,
    entityType: "open_loop",
    entityId: input.loop.id,
    action: input.auditAction,
    reasonCode: input.auditReasonCode,
    metadata: {
      stateVersion: nextVersion,
      decisionHash: decision.decisionHash,
      ...input.auditMetadata,
    },
  });
  return { loopId: input.loop.id, decision, replayed: false };
}

async function replayForCommand(input: {
  userId: string;
  workspaceId: string;
  idempotencyKey: string;
  semanticKey: string;
  inputHash: string;
}) {
  return prisma.$transaction(async (tx) => {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const loop = await tx.constructionOpenLoop.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [{ idempotencyKey: input.idempotencyKey }, { semanticKey: input.semanticKey }],
      },
      select: { id: true, stateVersion: true, idempotencyKey: true },
    });
    if (!loop) throw new Error("OPEN_LOOP_REPLAY_NOT_FOUND");
    if (loop.idempotencyKey === input.idempotencyKey) {
      const transition = await tx.constructionOpenLoopTransition.findUniqueOrThrow({
        where: {
          loopId_idempotencyKey: { loopId: loop.id, idempotencyKey: input.idempotencyKey },
        },
        select: { inputHash: true },
      });
      if (transition.inputHash !== input.inputHash) {
        throw new Error("OPEN_LOOP_IDEMPOTENCY_CONFLICT");
      }
    }
    return {
      loopId: loop.id,
      decision: await decisionFromSnapshot(tx, loop.id, loop.stateVersion),
      replayed: true,
    };
  });
}

function reportSemanticKey(command: ReportWorkFinishedCommand) {
  return sha256Canonical({
    schemaVersion: 1,
    commandType: command.commandType,
    workspaceId: command.workspaceId,
    projectId: command.projectId,
    claims: command.claims,
  });
}

export async function recordWorkFinishedInTransaction(tx: Tx, rawCommand: unknown) {
  const command = reportWorkFinishedCommandSchema.parse(rawCommand);
  const inputHash = sha256Canonical(command);
  const semanticKey = reportSemanticKey(command);
  await requireActiveConstructionMember(tx, command.actorId, command.workspaceId);
        const project = await tx.constructionProject.findFirst({
          where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
          select: { id: true },
        });
        const message = await tx.constructionMessage.findFirst({
          where: {
            id: command.sourceMessageId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
          },
          select: { id: true },
        });
        if (!project || !message) throw new ConstructionAccessDenied();

        // Different providers can wrap the same business update in different
        // event IDs. Serialize only the canonical business report so both
        // envelopes converge on one durable outcome loop.
        await tx.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${command.workspaceId}:${semanticKey}`}, 0)
          )::text AS acquired
        `);

        const existing = await tx.constructionOpenLoop.findFirst({
          where: {
            workspaceId: command.workspaceId,
            OR: [{ idempotencyKey: command.commandId }, { semanticKey }],
          },
          select: { id: true, stateVersion: true, idempotencyKey: true },
        });
        if (existing) {
          if (existing.idempotencyKey === command.commandId) {
            const transition = await tx.constructionOpenLoopTransition.findUniqueOrThrow({
              where: {
                loopId_idempotencyKey: { loopId: existing.id, idempotencyKey: command.commandId },
              },
              select: { inputHash: true },
            });
            if (transition.inputHash !== inputHash) {
              throw new Error("OPEN_LOOP_IDEMPOTENCY_CONFLICT");
            }
          }
          await tx.constructionMessage.update({
            where: { id: command.sourceMessageId },
            data: { relatedOpenLoopId: existing.id },
          });
          return {
            loopId: existing.id,
            decision: await decisionFromSnapshot(tx, existing.id, existing.stateVersion),
            replayed: true,
          };
        }

        const loopId = randomUUID();
        const evaluationInput = invoiceReadinessInputSchema.parse({
          schemaVersion: 1,
          loopId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          stateVersion: 1,
          billingBasis: "CHANGE_ORDER",
          facts: {
            projectAssociation: { value: true, state: "VERIFIED" },
            workDescription: {
              value: command.claims.workDescription,
              state: command.claims.workDescription ? "CLAIMED" : "UNKNOWN",
            },
            amount: {
              value:
                command.claims.amountMinor === null
                  ? null
                  : { amountMinor: command.claims.amountMinor, currency: "CAD" },
              state: command.claims.amountMinor === null ? "UNKNOWN" : "CLAIMED",
            },
            completion: {
              value: command.claims.completion,
              state: command.claims.completion === null ? "UNKNOWN" : "CLAIMED",
            },
            approval: {
              value: command.claims.approvalState,
              state:
                command.claims.approvalState === null || command.claims.approvalState === "UNKNOWN"
                  ? "UNKNOWN"
                  : "CLAIMED",
            },
          },
          evidence: [],
          contradictions: [],
        });
        const decision = evaluateInvoiceReadiness(evaluationInput);
        const snapshotHash = sha256Canonical(decision);

        await tx.constructionOpenLoop.create({
          data: {
            id: loopId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
            openedByMessageId: command.sourceMessageId,
            type: "invoice_ready",
            billingBasis: "change_order",
            desiredOutcome: "Assemble a verified package ready for invoice preparation",
            status: toDatabaseStatus(decision.status),
            policyVersion: POLICY_VERSION,
            stateVersion: 1,
            idempotencyKey: command.commandId,
            semanticKey,
            nextResponsibleRole: decision.nextResponsible.role,
            nextAction: decision.nextAction,
            decisionHash: decision.decisionHash,
            readyAt: decision.ready ? new Date() : null,
          },
        });

        await tx.constructionOpenLoopFact.createMany({
          data: [
            {
              loopId,
              workspaceId: command.workspaceId,
              projectId: command.projectId,
              field: "PROJECT_ASSOCIATION",
              value: asJson({ value: true }),
              state: "verified",
              sourceType: "message_resolution",
              sourceId: command.sourceMessageId,
              suppliedById: command.actorId,
            },
            {
              loopId,
              workspaceId: command.workspaceId,
              projectId: command.projectId,
              field: "WORK_DESCRIPTION",
              value: asJson({ value: command.claims.workDescription }),
              state: command.claims.workDescription ? "claimed" : "unknown",
              sourceType: "message_claim",
              sourceId: command.sourceMessageId,
              suppliedById: command.actorId,
            },
            {
              loopId,
              workspaceId: command.workspaceId,
              projectId: command.projectId,
              field: "AMOUNT",
              value: asJson({
                value:
                  command.claims.amountMinor === null
                    ? null
                    : { amountMinor: command.claims.amountMinor, currency: "CAD" },
              }),
              state: command.claims.amountMinor === null ? "unknown" : "claimed",
              sourceType: "message_claim",
              sourceId: command.sourceMessageId,
              suppliedById: command.actorId,
            },
            {
              loopId,
              workspaceId: command.workspaceId,
              projectId: command.projectId,
              field: "COMPLETION_ASSERTION",
              value: asJson({ value: command.claims.completion }),
              state: command.claims.completion === null ? "unknown" : "claimed",
              sourceType: "message_claim",
              sourceId: command.sourceMessageId,
              suppliedById: command.actorId,
            },
            {
              loopId,
              workspaceId: command.workspaceId,
              projectId: command.projectId,
              field: "APPROVAL_STATE",
              value: asJson({ value: command.claims.approvalState }),
              state:
                command.claims.approvalState === null || command.claims.approvalState === "UNKNOWN"
                  ? "unknown"
                  : "claimed",
              sourceType: "message_claim",
              sourceId: command.sourceMessageId,
              suppliedById: command.actorId,
            },
          ],
        });
        await tx.constructionOpenLoopTransition.create({
          data: {
            loopId,
            workspaceId: command.workspaceId,
            priorStatus: null,
            nextStatus: toDatabaseStatus(decision.status),
            priorVersion: 0,
            nextVersion: 1,
            reasonCodes: decision.reasons,
            actorUserId: command.actorId,
            authorityDecision: "ACTIVE_MEMBER_REPORT_ACCEPTED",
            inputHash,
            idempotencyKey: command.commandId,
          },
        });
        await tx.constructionOpenLoopSnapshot.create({
          data: {
            loopId,
            workspaceId: command.workspaceId,
            stateVersion: 1,
            snapshot: asJson(decision),
            canonicalHash: snapshotHash,
          },
        });
        await appendConstructionAudit(tx, {
          workspaceId: command.workspaceId,
          actorUserId: command.actorId,
          entityType: "open_loop",
          entityId: loopId,
          action: "construction_invoice_readiness_loop_opened",
          reasonCode: decision.status,
          metadata: {
            policyVersion: POLICY_VERSION,
            stateVersion: 1,
            decisionHash: decision.decisionHash,
            sourceMessageId: command.sourceMessageId,
          },
        });
        await tx.constructionMessage.update({
          where: { id: command.sourceMessageId },
          data: { relatedOpenLoopId: loopId },
        });
  return { loopId, decision, replayed: false };
}

export async function recordWorkFinished(rawCommand: unknown) {
  const command = reportWorkFinishedCommandSchema.parse(rawCommand);
  const inputHash = sha256Canonical(command);
  const semanticKey = reportSemanticKey(command);
  try {
    return await prisma.$transaction((tx) => recordWorkFinishedInTransaction(tx, command));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return replayForCommand({
        userId: command.actorId,
        workspaceId: command.workspaceId,
        idempotencyKey: command.commandId,
        semanticKey,
        inputHash,
      });
    }
    throw error;
  }
}

export async function addInvoiceReadinessEvidence(rawInput: unknown) {
  const input = addInvoiceEvidenceSchema.parse(rawInput);
  const inputHash = sha256Canonical(input);
  return prisma.$transaction(async (tx) => {
      const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
      if (input.state === "VERIFIED" && membership.role === "member") {
        throw new ConstructionAccessDenied();
      }
      const loop = await tx.constructionOpenLoop.findFirst({
        where: { id: input.loopId, workspaceId: input.workspaceId },
        select: { id: true, projectId: true, stateVersion: true, status: true },
      });
      if (!loop) throw new ConstructionAccessDenied();
      const replay = await tx.constructionOpenLoopTransition.findUnique({
        where: { loopId_idempotencyKey: { loopId: loop.id, idempotencyKey: input.eventId } },
        select: { inputHash: true, nextVersion: true },
      });
      if (replay) {
        if (replay.inputHash !== inputHash) throw new Error("OPEN_LOOP_IDEMPOTENCY_CONFLICT");
        return {
          loopId: loop.id,
          decision: await decisionFromSnapshot(tx, loop.id, replay.nextVersion),
          replayed: true,
        };
      }
      if (loop.stateVersion !== input.expectedStateVersion) {
        throw new Error("OPEN_LOOP_STALE_STATE_VERSION");
      }

      await tx.constructionOpenLoopEvidence.create({
        data: {
          loopId: loop.id,
          workspaceId: input.workspaceId,
          projectId: loop.projectId,
          evidenceKey: input.eventId,
          kind:
            input.kind === "WRITTEN_APPROVAL"
              ? "written_approval"
              : input.kind === "PHOTO"
                ? "photo"
                : "document",
          state: input.state === "VERIFIED" ? "verified" : "present_unverified",
          sourceRef: input.sourceRef,
          contentHash: input.contentHash,
          suppliedById: input.userId,
        },
      });
      const nextVersion = loop.stateVersion + 1;
      const evaluationInput = await buildEvaluationInput(tx, loop.id, nextVersion);
      const decision = evaluateInvoiceReadiness(evaluationInput);
      const update = await tx.constructionOpenLoop.updateMany({
        where: { id: loop.id, workspaceId: input.workspaceId, stateVersion: loop.stateVersion },
        data: {
          stateVersion: nextVersion,
          status: toDatabaseStatus(decision.status),
          nextResponsibleRole: decision.nextResponsible.role,
          nextAction: decision.nextAction,
          decisionHash: decision.decisionHash,
          readyAt: decision.ready ? new Date() : null,
        },
      });
      if (update.count !== 1) throw new Error("OPEN_LOOP_CONCURRENT_TRANSITION_REFUSED");
      await tx.constructionOpenLoopTransition.create({
        data: {
          loopId: loop.id,
          workspaceId: input.workspaceId,
          priorStatus: loop.status,
          nextStatus: toDatabaseStatus(decision.status),
          priorVersion: loop.stateVersion,
          nextVersion,
          reasonCodes: decision.reasons,
          actorUserId: input.userId,
          authorityDecision:
            input.state === "VERIFIED" ? "OWNER_OR_ADMIN_VERIFICATION_ACCEPTED" : "MEMBER_EVIDENCE_ACCEPTED_UNVERIFIED",
          inputHash,
          idempotencyKey: input.eventId,
        },
      });
      await tx.constructionOpenLoopSnapshot.create({
        data: {
          loopId: loop.id,
          workspaceId: input.workspaceId,
          stateVersion: nextVersion,
          snapshot: asJson(decision),
          canonicalHash: sha256Canonical(decision),
        },
      });
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        entityType: "open_loop",
        entityId: loop.id,
        action: "construction_invoice_readiness_evidence_added",
        reasonCode: input.kind,
        metadata: {
          evidenceKey: input.eventId,
          evidenceState: input.state,
          stateVersion: nextVersion,
          decisionHash: decision.decisionHash,
        },
      });
      return { loopId: loop.id, decision, replayed: false };
    });
}

export async function recordOpenLoopContradiction(rawInput: unknown) {
  const input = recordContradictionSchema.parse(rawInput);
  const inputHash = sha256Canonical(input);
  return prisma.$transaction(async (tx) => {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const loop = await tx.constructionOpenLoop.findFirst({
      where: { id: input.loopId, workspaceId: input.workspaceId },
      select: { id: true, workspaceId: true, projectId: true, stateVersion: true, status: true },
    });
    if (!loop || loop.status === "closed" || loop.status === "revoked") {
      throw new ConstructionAccessDenied();
    }
    const replay = await replayedTransition(tx, {
      loopId: loop.id,
      idempotencyKey: input.eventId,
      inputHash,
    });
    if (replay) return replay;
    if (loop.stateVersion !== input.expectedStateVersion) {
      throw new Error("OPEN_LOOP_STALE_STATE_VERSION");
    }

    const contradictionId = randomUUID();
    await tx.constructionOpenLoopContradiction.create({
      data: {
        id: contradictionId,
        loopId: loop.id,
        workspaceId: loop.workspaceId,
        projectId: loop.projectId,
        field: input.field,
        claimIds: input.claimIds,
        status: "open",
      },
    });
    return persistEvaluatedTransition(tx, {
      loop,
      actorUserId: input.userId,
      idempotencyKey: input.eventId,
      inputHash,
      authorityDecision: "ACTIVE_MEMBER_CONTRADICTION_RECORDED",
      auditAction: "construction_invoice_readiness_contradiction_recorded",
      auditReasonCode: input.field,
      auditMetadata: { contradictionId, claimIds: input.claimIds },
    });
  });
}

export async function resolveOpenLoopContradiction(rawInput: unknown) {
  const input = resolveContradictionSchema.parse(rawInput);
  const inputHash = sha256Canonical(input);
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (membership.role === "member") throw new ConstructionAccessDenied();
    const loop = await tx.constructionOpenLoop.findFirst({
      where: { id: input.loopId, workspaceId: input.workspaceId },
      select: { id: true, workspaceId: true, projectId: true, stateVersion: true, status: true },
    });
    if (!loop || loop.status === "closed" || loop.status === "revoked") {
      throw new ConstructionAccessDenied();
    }
    const replay = await replayedTransition(tx, {
      loopId: loop.id,
      idempotencyKey: input.eventId,
      inputHash,
    });
    if (replay) return replay;
    if (loop.stateVersion !== input.expectedStateVersion) {
      throw new Error("OPEN_LOOP_STALE_STATE_VERSION");
    }
    const contradiction = await tx.constructionOpenLoopContradiction.findFirst({
      where: {
        id: input.contradictionId,
        loopId: loop.id,
        workspaceId: input.workspaceId,
        projectId: loop.projectId,
        status: "open",
      },
      select: { id: true, claimIds: true },
    });
    if (!contradiction || !contradiction.claimIds.includes(input.acceptedClaimId)) {
      throw new ConstructionAccessDenied();
    }
    const resolvedAt = new Date();
    const resolved = await tx.constructionOpenLoopContradiction.updateMany({
      where: { id: contradiction.id, loopId: loop.id, status: "open" },
      data: {
        status: "resolved",
        resolution: asJson({
          acceptedClaimId: input.acceptedClaimId,
          reason: input.reason,
        }),
        resolvedById: input.userId,
        resolvedAt,
      },
    });
    if (resolved.count !== 1) throw new Error("OPEN_LOOP_CONCURRENT_TRANSITION_REFUSED");
    return persistEvaluatedTransition(tx, {
      loop,
      actorUserId: input.userId,
      idempotencyKey: input.eventId,
      inputHash,
      authorityDecision: "OWNER_OR_ADMIN_CONTRADICTION_RESOLVED",
      auditAction: "construction_invoice_readiness_contradiction_resolved",
      auditReasonCode: "AUTHORIZED_VERIFICATION",
      auditMetadata: {
        contradictionId: contradiction.id,
        acceptedClaimId: input.acceptedClaimId,
      },
    });
  });
}

export async function revokeOpenLoopEvidence(rawInput: unknown) {
  const input = revokeEvidenceSchema.parse(rawInput);
  const inputHash = sha256Canonical(input);
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (membership.role === "member") throw new ConstructionAccessDenied();
    const loop = await tx.constructionOpenLoop.findFirst({
      where: { id: input.loopId, workspaceId: input.workspaceId },
      select: { id: true, workspaceId: true, projectId: true, stateVersion: true, status: true },
    });
    if (!loop || loop.status === "closed" || loop.status === "revoked") {
      throw new ConstructionAccessDenied();
    }
    const replay = await replayedTransition(tx, {
      loopId: loop.id,
      idempotencyKey: input.eventId,
      inputHash,
    });
    if (replay) return replay;
    if (loop.stateVersion !== input.expectedStateVersion) {
      throw new Error("OPEN_LOOP_STALE_STATE_VERSION");
    }
    const evidence = await tx.constructionOpenLoopEvidence.findFirst({
      where: {
        id: input.evidenceId,
        loopId: loop.id,
        workspaceId: input.workspaceId,
        projectId: loop.projectId,
      },
      select: { id: true, evidenceKey: true, state: true },
    });
    if (!evidence || evidence.state === "revoked") throw new ConstructionAccessDenied();
    const revoked = await tx.constructionOpenLoopEvidence.updateMany({
      where: { id: evidence.id, loopId: loop.id, state: evidence.state },
      data: { state: "revoked" },
    });
    if (revoked.count !== 1) throw new Error("OPEN_LOOP_CONCURRENT_TRANSITION_REFUSED");
    return persistEvaluatedTransition(tx, {
      loop,
      actorUserId: input.userId,
      idempotencyKey: input.eventId,
      inputHash,
      authorityDecision: "OWNER_OR_ADMIN_EVIDENCE_REVOKED",
      auditAction: "construction_invoice_readiness_evidence_revoked",
      auditReasonCode: "EVIDENCE_REVOKED",
      auditMetadata: {
        evidenceId: evidence.id,
        evidenceKey: evidence.evidenceKey,
        reason: input.reason,
      },
    });
  });
}

export async function openLoopProjectionForUser(input: {
  userId: string;
  workspaceId: string;
  loopId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const loop = await tx.constructionOpenLoop.findFirst({
      where: { id: input.loopId, workspaceId: input.workspaceId },
      select: { id: true, stateVersion: true },
    });
    if (!loop) throw new ConstructionAccessDenied();
    const evaluationInput = await buildEvaluationInput(tx, loop.id);
    const decision = await decisionFromSnapshot(tx, loop.id, loop.stateVersion);
    const role: ConstructionProjectionRole =
      membership.role === "owner"
        ? "OWNER"
        : membership.role === "admin"
          ? "OFFICE_MANAGER"
          : "FIELD_WORKER";
    return projectOpenLoopProjection(evaluationInput, decision, role);
  });
}

export async function projectOpenLoopsForUser(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const project = await tx.constructionProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!project) throw new ConstructionAccessDenied();
    const loops = await tx.constructionOpenLoop.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        stateVersion: true,
        policyVersion: true,
        createdAt: true,
        updatedAt: true,
        openedByMessage: { select: { originalBody: true, channel: true, createdAt: true } },
        evidence: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            kind: true,
            state: true,
            sourceRef: true,
            contentHash: true,
            createdAt: true,
          },
        },
        contradictions: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, field: true, status: true, claimIds: true, createdAt: true },
        },
        transitions: {
          orderBy: { nextVersion: "asc" },
          select: {
            id: true,
            priorStatus: true,
            nextStatus: true,
            nextVersion: true,
            reasonCodes: true,
            authorityDecision: true,
            createdAt: true,
          },
        },
        actions: {
          where: { status: "proposed" },
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, status: true, version: true, payload: true, payloadHash: true },
        },
      },
    });
    const role: ConstructionProjectionRole =
      membership.role === "owner"
        ? "OWNER"
        : membership.role === "admin"
          ? "OFFICE_MANAGER"
          : "FIELD_WORKER";

    return Promise.all(
      loops.map(async (loop) => {
        const evaluationInput = await buildEvaluationInput(tx, loop.id);
        const decision = await decisionFromSnapshot(tx, loop.id, loop.stateVersion);
        const projection = projectOpenLoopProjection(evaluationInput, decision, role);
        const canSeeFinancials = role !== "FIELD_WORKER";
        return {
          ...projection,
          canManageEvidence: membership.role === "owner" || membership.role === "admin",
          stateVersion: loop.stateVersion,
          policyVersion: loop.policyVersion,
          createdAt: loop.createdAt,
          updatedAt: loop.updatedAt,
          openedByMessage: canSeeFinancials ? loop.openedByMessage : null,
          evidence: loop.evidence.map((item) =>
            canSeeFinancials
              ? item
              : { id: item.id, kind: item.kind, state: item.state, createdAt: item.createdAt },
          ),
          contradictions: loop.contradictions.map((item) =>
            canSeeFinancials
              ? item
              : { id: item.id, field: item.field, status: item.status, createdAt: item.createdAt },
          ),
          transitions: loop.transitions,
          preparedActions: loop.actions.map((action) => {
            const parsed = preparedEvidenceRequestSchema.safeParse(action.payload);
            return {
              id: action.id,
              type: action.type,
              status: action.status,
              version: action.version,
              payloadHash: action.payloadHash,
              request: parsed.success
                ? canSeeFinancials
                  ? parsed.data
                  : {
                      disposition: parsed.data.disposition,
                      channel: parsed.data.channel,
                      expiresAt: parsed.data.expiresAt,
                    }
                : null,
            };
          }),
        };
      }),
    );
  });
}

export async function openLoopFocusForUser(input: {
  userId: string;
  workspaceId: string;
  referenceNow: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const workspace = await tx.constructionWorkspace.findFirst({
      where: { id: input.workspaceId, status: "active" },
      select: { id: true, defaultTimezone: true },
    });
    if (!workspace) throw new ConstructionAccessDenied();
    const role: ConstructionProjectionRole =
      membership.role === "owner"
        ? "OWNER"
        : membership.role === "admin"
          ? "OFFICE_MANAGER"
          : "FIELD_WORKER";
    const zonedNow = toZonedTime(input.referenceNow, workspace.defaultTimezone);
    const localToday = startOfDay(zonedNow);
    const tomorrowFrom = fromZonedTime(addDays(localToday, 1), workspace.defaultTimezone);
    const dayAfterTomorrowFrom = fromZonedTime(addDays(localToday, 2), workspace.defaultTimezone);
    const loops = await tx.constructionOpenLoop.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: { notIn: ["closed", "revoked"] },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        projectId: true,
        stateVersion: true,
        status: true,
        priority: true,
        dueAt: true,
        dueState: true,
        updatedAt: true,
        project: { select: { code: true, name: true } },
      },
    });
    const items = await Promise.all(
      loops.map(async (loop) => {
        const evaluationInput = await buildEvaluationInput(tx, loop.id);
        const decision = await decisionFromSnapshot(tx, loop.id, loop.stateVersion);
        return {
          ...projectOpenLoopProjection(evaluationInput, decision, role),
          project: loop.project,
          priority: loop.priority,
          dueAt: loop.dueAt,
          dueState: loop.dueState,
          updatedAt: loop.updatedAt,
        };
      }),
    );
    const statusRank: Record<ReadinessDecision["status"], number> = {
      READY_TO_INVOICE: 0,
      WAITING_FOR_VERIFICATION: 1,
      WAITING_FOR_EVIDENCE: 2,
      OPEN: 3,
      CLOSED: 4,
      REVOKED: 5,
    };
    items.sort((left, right) => {
      const statusDifference = statusRank[left.status] - statusRank[right.status];
      if (statusDifference !== 0) return statusDifference;
      const priorityDifference = right.priority - left.priority;
      if (priorityDifference !== 0) return priorityDifference;
      const leftAmount = "amountMinor" in left ? left.amountMinor ?? 0 : 0;
      const rightAmount = "amountMinor" in right ? right.amountMinor ?? 0 : 0;
      if (leftAmount !== rightAmount) return rightAmount - leftAmount;
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    });
    return {
      timezone: workspace.defaultTimezone,
      today: items.filter((item) => !item.dueAt || item.dueAt < tomorrowFrom),
      tomorrow: items.filter(
        (item) => item.dueAt && item.dueAt >= tomorrowFrom && item.dueAt < dayAfterTomorrowFrom,
      ),
    };
  });
}

export async function prepareInvoiceEvidenceRequest(rawInput: unknown) {
  const input = prepareEvidenceRequestInputSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (membership.role === "member") throw new ConstructionAccessDenied();
    const loop = await tx.constructionOpenLoop.findFirst({
      where: { id: input.loopId, workspaceId: input.workspaceId },
      select: {
        id: true,
        projectId: true,
        stateVersion: true,
        status: true,
        openedByMessageId: true,
        actions: {
          where: { type: "follow_up" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, payload: true, payloadHash: true },
        },
      },
    });
    if (!loop || loop.status === "revoked" || loop.status === "closed") {
      throw new ConstructionAccessDenied();
    }
    const existing = loop.actions[0];
    if (existing) {
      const parsed = preparedEvidenceRequestSchema.safeParse(existing.payload);
      if (
        !parsed.success ||
        parsed.data.requestId !== input.requestId ||
        parsed.data.loopStateVersion !== input.expectedStateVersion ||
        parsed.data.contactId !== input.contactId ||
        parsed.data.channel !== input.channel ||
        parsed.data.body !== input.body
      ) {
        throw new Error("OPEN_LOOP_PREPARED_ACTION_CONFLICT");
      }
      return {
        actionId: existing.id,
        payloadHash: existing.payloadHash,
        disposition: "PREPARED_UNSENT" as const,
        replayed: true,
      };
    }
    if (loop.stateVersion !== input.expectedStateVersion) {
      throw new Error("OPEN_LOOP_STALE_STATE_VERSION");
    }
    const contact = await tx.constructionContact.findFirst({
      where: {
        id: input.contactId,
        workspaceId: input.workspaceId,
        projectId: loop.projectId,
        status: "active",
      },
      select: { normalizedPhone: true, normalizedEmail: true },
    });
    if (!contact) throw new ConstructionAccessDenied();
    const normalizedRecipient =
      input.channel === "SMS" ? contact.normalizedPhone : contact.normalizedEmail;
    if (!normalizedRecipient) throw new Error("OPEN_LOOP_RECIPIENT_UNAVAILABLE");

    const actionId = randomUUID();
    const payload = preparedEvidenceRequestSchema.parse({
      schemaVersion: 1,
      disposition: "PREPARED_UNSENT",
      transportAuthorized: false,
      workspaceId: input.workspaceId,
      projectId: loop.projectId,
      loopId: loop.id,
      loopStateVersion: loop.stateVersion,
      actionId,
      actionVersion: 1,
      requestId: input.requestId,
      contactId: input.contactId,
      channel: input.channel,
      normalizedRecipient,
      body: input.body,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const payloadHash = sha256Canonical(payload);
    await tx.constructionAction.create({
      data: {
        id: actionId,
        workspaceId: input.workspaceId,
        projectId: loop.projectId,
        contactId: input.contactId,
        openLoopId: loop.id,
        sourceMessageId: loop.openedByMessageId,
        type: "follow_up",
        status: "proposed",
        riskClass: "medium",
        approvalRequired: true,
        version: 1,
        payload: asJson(payload),
        payloadHash,
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      entityType: "action",
      entityId: actionId,
      action: "construction_invoice_evidence_request_prepared_unsent",
      reasonCode: "PREPARED_UNSENT",
      metadata: {
        loopId: loop.id,
        loopStateVersion: loop.stateVersion,
        payloadHash,
        transportAuthorized: false,
      },
    });
    return {
      actionId,
      payloadHash,
      disposition: "PREPARED_UNSENT" as const,
      replayed: false,
    };
  });
}
