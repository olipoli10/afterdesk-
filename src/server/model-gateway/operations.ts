import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "./evidence";
import type {
  GatewayDataClass,
  GatewayOperationType,
  GatewayPrivacyRequirement,
} from "./types";

type Tx = Prisma.TransactionClient;

const uid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

export type GatewayOperationRow = {
  id: string;
  aiOperationId: string;
  tenantId: string;
  operationType: GatewayOperationType;
  requestFingerprint: string;
  outputContractHash: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  policyVersionId: string;
  maxTotalCostMicros: bigint;
  status: string;
};

export type BindGatewayOperationInput = Omit<GatewayOperationRow, "id" | "status">;

export type GatewayDecisionRow = {
  id: string;
  gatewayOperationId: string;
  attempt: number;
  disposition: "route_authorized" | "refused";
  routeProfileId: string | null;
  reasonClass: string;
  policyHash: string;
  routeHash: string | null;
  privacyEvidenceHash: string | null;
  breakerGeneration: bigint;
  remainingCostMicros: bigint;
  decisionFingerprint: string;
};

export type PersistGatewayDecisionInput = Omit<GatewayDecisionRow, "id" | "decisionFingerprint">;

export type GatewayAttemptRow = {
  id: string;
  decisionId: string;
  accountSpendHoldId: string;
  status: string;
  dispatchState: string;
  resultContractStatus: string;
  requestEvidenceRef: string | null;
};

export async function withModelGatewayTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => work(tx), { isolationLevel: "Serializable" });
}

export async function bindGatewayOperation(
  tx: Tx,
  input: BindGatewayOperationInput
): Promise<GatewayOperationRow> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayOperation" (id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'admitted',now()) ON CONFLICT ("aiOperationId") DO NOTHING`,
    uid("gwop"),
    input.aiOperationId,
    input.tenantId,
    input.operationType,
    input.requestFingerprint,
    input.outputContractHash,
    input.dataClass,
    input.privacyRequirement,
    input.policyVersionId,
    input.maxTotalCostMicros
  );
  const [row] = await tx.$queryRawUnsafe<GatewayOperationRow[]>(
    `SELECT id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status FROM "ModelGatewayOperation" WHERE "aiOperationId"=$1`,
    input.aiOperationId
  );
  if (!row) throw new Error("GATEWAY_OPERATION_BINDING_MISSING");
  const same =
    row.tenantId === input.tenantId &&
    row.operationType === input.operationType &&
    row.requestFingerprint === input.requestFingerprint &&
    row.outputContractHash === input.outputContractHash &&
    row.dataClass === input.dataClass &&
    row.privacyRequirement === input.privacyRequirement &&
    row.policyVersionId === input.policyVersionId &&
    row.maxTotalCostMicros === input.maxTotalCostMicros;
  if (!same) throw new Error("GATEWAY_OPERATION_BINDING_CONFLICT");
  return row;
}

export async function persistGatewayDecision(
  tx: Tx,
  input: PersistGatewayDecisionInput
): Promise<GatewayDecisionRow> {
  const decisionFingerprint = canonicalFingerprint(input);
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayDecision" (id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint","decidedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) ON CONFLICT ("gatewayOperationId",attempt) DO NOTHING`,
    uid("decision"),
    input.gatewayOperationId,
    input.attempt,
    input.disposition,
    input.routeProfileId,
    input.reasonClass,
    input.policyHash,
    input.routeHash,
    input.privacyEvidenceHash,
    input.breakerGeneration,
    input.remainingCostMicros,
    decisionFingerprint
  );
  const [row] = await tx.$queryRawUnsafe<GatewayDecisionRow[]>(
    `SELECT id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint" FROM "ModelGatewayDecision" WHERE "gatewayOperationId"=$1 AND attempt=$2`,
    input.gatewayOperationId,
    input.attempt
  );
  if (!row) throw new Error("GATEWAY_DECISION_MISSING");
  if (row.decisionFingerprint !== decisionFingerprint) {
    throw new Error("GATEWAY_DECISION_CONFLICT");
  }
  return row;
}

export async function createGatewayAttempt(
  tx: Tx,
  input: { decisionId: string; accountSpendHoldId: string; requestEvidenceRef?: string | null }
): Promise<GatewayAttemptRow> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","requestEvidenceRef","startedAt") VALUES ($1,$2,$3,'prepared','not_dispatched','not_evaluated',$4,now()) ON CONFLICT ("decisionId") DO NOTHING`,
    uid("attempt"),
    input.decisionId,
    input.accountSpendHoldId,
    input.requestEvidenceRef ?? null
  );
  const [row] = await tx.$queryRawUnsafe<GatewayAttemptRow[]>(
    `SELECT id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","requestEvidenceRef" FROM "ModelGatewayAttempt" WHERE "decisionId"=$1`,
    input.decisionId
  );
  if (!row) throw new Error("GATEWAY_ATTEMPT_MISSING");
  if (
    row.accountSpendHoldId !== input.accountSpendHoldId ||
    row.requestEvidenceRef !== (input.requestEvidenceRef ?? null)
  ) {
    throw new Error("GATEWAY_ATTEMPT_BINDING_CONFLICT");
  }
  return row;
}
