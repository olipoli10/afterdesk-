import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { inspectCalendarConfirmationBridgePreparationInTransaction } from "./calendar-confirmation-authority";
import type { ConnectorEnvironment } from "./google-client";

/** Pending-only source-bound preparation. No approval, provider, budget, consent
 * or credential path. Existing outbox must independently recheck before sending. */
export async function prepareCalendarConfirmationOutboundInTransaction(tx: Prisma.TransactionClient,
  input: { actor: { userId: string; workspaceId: string }; challengeId: string }, env: ConnectorEnvironment = process.env) {
  const checked = await inspectCalendarConfirmationBridgePreparationInTransaction(tx, input, env);
  if (checked.status === "DISABLED") return checked;
  // Challenge row lock serializes duplicate preparation, no guessed replay.
  const existing = await tx.$queryRawUnsafe<Array<{ id: string; matches: boolean; status: string }>>(`SELECT id,status,
    ("workspaceId"=$2 AND "createdByUserId"=$3 AND "connectorAccountId"=$4 AND kind='sms_outbound'
      AND "requestHash"=$5 AND request=$6::jsonb AND attempts=0 AND "leaseUntil" IS NULL AND result IS NULL
      AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL AND "externalTransportPerformed"=false) AS matches
    FROM "PersonalAssistantOperation" WHERE "idempotencyKey"=$1 FOR SHARE`,
  checked.idempotencyKey, checked.actor.workspaceId, checked.actor.userId, checked.connectorAccountId, checked.requestHash, JSON.stringify(checked.request));
  if (env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED !== "true" || env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED !== "true") throw new Error("CONFIRMATION_BRIDGE_DISABLED");
  if (existing.length) {
    if (existing.length !== 1 || existing[0].matches !== true || existing[0].status !== "pending") throw new Error("CONFIRMATION_BRIDGE_REPLAY_REFUSED");
    return Object.freeze({ status: "PREPARED_UNSENT" as const, executionAuthorized: false as const, operationId: existing[0].id,
      requestHash: checked.requestHash, challengeId: checked.challengeId, replayed: true as const });
  }
  const operationId = randomUUID();
  const inserted = await tx.$executeRawUnsafe(`INSERT INTO "PersonalAssistantOperation"(id,"workspaceId","createdByUserId","connectorAccountId",kind,status,
    "idempotencyKey",request,"requestHash","updatedAt") SELECT $1,$2,$3,$4,'sms_outbound','pending',$5,$6::jsonb,$7,(clock_timestamp() AT TIME ZONE 'UTC')
    FROM "PersonalCalendarSmsConfirmation" WHERE id=$8 AND phase='PREPARED' AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')`,
  operationId, checked.actor.workspaceId, checked.actor.userId, checked.connectorAccountId, checked.idempotencyKey, JSON.stringify(checked.request), checked.requestHash, checked.challengeId);
  if (inserted !== 1) throw new Error("CONFIRMATION_NOT_PREPARED");
  return Object.freeze({ status: "PREPARED_UNSENT" as const, executionAuthorized: false as const, operationId,
    requestHash: checked.requestHash, challengeId: checked.challengeId, replayed: false as const });
}
