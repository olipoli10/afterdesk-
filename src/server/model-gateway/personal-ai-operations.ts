import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import type { AiOperationClaim } from "@/server/ai-operations";
import { inspectPersonalGatewaySubject } from "./personal-subject";
import type { PersonalGatewayOperationSubject } from "./types";

type Tx = Prisma.TransactionClient;
const PURPOSE = "personal_intent_candidate_v1";
export type PersonalAiOperationClaim = Readonly<AiOperationClaim & { attempt: 1; subject: PersonalGatewayOperationSubject; authorityFingerprint: string }>;

function operationKey(inspected: Awaited<ReturnType<typeof inspectPersonalGatewaySubject>>) {
  return `personal-intent:${inspected.subject.operationId}:${inspected.input.requestFingerprint}`;
}

/** Reservation does not authorize provider execution or any business action. */
export async function reservePersonalAiOperation(tx: Tx, subject: PersonalGatewayOperationSubject) {
  const inspected = await inspectPersonalGatewaySubject(tx, subject);
  const key = operationKey(inspected);
  await tx.$executeRawUnsafe(
    `INSERT INTO "AiOperation" (id,"personalAssistantOperationId",purpose,"operationKey",status,attempts,"createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,'reserved',0,now(),now()) ON CONFLICT ("personalAssistantOperationId") DO NOTHING`,
    `aiop_${randomUUID().replaceAll("-", "")}`, subject.operationId, PURPOSE, key,
  );
  const [row] = await tx.$queryRawUnsafe<Array<{ id: string; operationKey: string; personalAssistantOperationId: string }>>(
    `SELECT id,"operationKey","personalAssistantOperationId" FROM "AiOperation"
     WHERE "personalAssistantOperationId"=$1 AND purpose=$2 AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL`,
    subject.operationId, PURPOSE,
  );
  if (!row || row.operationKey !== key || row.personalAssistantOperationId !== subject.operationId) {
    throw new Error("PERSONAL_AI_OPERATION_BINDING_CONFLICT");
  }
  return Object.freeze({ operationId: row.id, operationKey: key, inspected });
}

/**
 * One attempt only. No failed retry, no expired-lease reclaim. Crashed/expired
 * claims remain reviewable and cannot silently create a second provider call.
 * Use in the SAME transaction as both budget holds and gateway admission.
 */
export async function claimPersonalAiOperation(tx: Tx, subject: PersonalGatewayOperationSubject): Promise<PersonalAiOperationClaim | null> {
  const inspected = await inspectPersonalGatewaySubject(tx, subject);
  const key = operationKey(inspected);
  const lockedBy = randomUUID();
  const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE "AiOperation" SET status='running',attempts=1,"lockedAt"=now(),"lockedBy"=$3,
       "leaseExpiresAt"=now()+interval '5 minutes',"lastError"=NULL,"updatedAt"=now()
     WHERE "personalAssistantOperationId"=$1 AND "operationKey"=$2 AND purpose=$4
       AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL AND status='reserved' AND attempts=0
     RETURNING id`,
    subject.operationId, key, lockedBy, PURPOSE,
  );
  if (!row) return null;
  return Object.freeze({ operationId: row.id, operationKey: key, lockedBy, attempt: 1 as const,
    subject: Object.freeze({ ...subject }), authorityFingerprint: inspected.authorityFingerprint });
}

/**
 * Close ONLY the model operation. A succeeded model proposal is NOT an executed
 * calendar/SMS action. No AiUsage with a fabricated Task/client is emitted.
 * The wrapper stores gateway evidence and immutable proposal under this same
 * transaction; this helper never settles/reduces spend holds from model usage.
 */
export async function finishPersonalAiOperation(tx: Tx, input: {
  claim: PersonalAiOperationClaim;
  outcome: "PROPOSAL_INSPECTED" | "REFUSED" | "UNCERTAIN";
  resultId: string;
}) {
  const { claim } = input;
  if (claim.attempt !== 1 || claim.subject.kind !== "personal_assistant_operation" ||
      !/^[A-Za-z0-9:_-]{1,191}$/.test(input.resultId) ||
      !["PROPOSAL_INSPECTED", "REFUSED", "UNCERTAIN"].includes(input.outcome)) {
    throw new Error("PERSONAL_AI_TERMINAL_INVALID");
  }
  // Changed authority suppresses proposal acceptance, but must not suppress
  // recording an uncertain/refused outcome or retaining its budget exposure.
  if (input.outcome === "PROPOSAL_INSPECTED") {
    const current = await inspectPersonalGatewaySubject(tx, claim.subject);
    if (operationKey(current) !== claim.operationKey || current.authorityFingerprint !== claim.authorityFingerprint) {
      throw new Error("PERSONAL_AI_AUTHORITY_CHANGED");
    }
  }
  const status = input.outcome === "PROPOSAL_INSPECTED" ? "succeeded" : input.outcome === "UNCERTAIN" ? "abandoned" : "failed";
  const resultKind = `personal_model_${input.outcome.toLowerCase()}`;
  const changed = await tx.$executeRawUnsafe(
    `UPDATE "AiOperation" SET status=$6::"AiOperationStatus","resultKind"=$7,"resultId"=$8,
      "lastError"=$9,"finishedAt"=now(),"lockedAt"=NULL,"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=NULL,"updatedAt"=now()
     WHERE id=$1 AND "operationKey"=$2 AND "lockedBy"=$3 AND "personalAssistantOperationId"=$4
       AND purpose=$5 AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL
       AND status='running' AND attempts=1 AND "leaseExpiresAt">now()`,
    claim.operationId, claim.operationKey, claim.lockedBy, claim.subject.operationId, PURPOSE,
    status, resultKind, input.resultId, input.outcome === "PROPOSAL_INSPECTED" ? null : `PERSONAL_MODEL_${input.outcome}`,
  );
  if (changed !== 1) throw new Error("PERSONAL_AI_CLAIM_EXPIRED_OR_SUPERSEDED");
  return Object.freeze({ status: input.outcome, executionAuthorized: false as const, resultId: input.resultId });
}
