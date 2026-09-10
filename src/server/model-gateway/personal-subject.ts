import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { createPersonalIntentInput } from "./personal-intent/contract";
import type { PersonalGatewayOperationSubject } from "./types";

const envelopeSchema = z.object({
  schemaVersion: z.literal(1), accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  messageSid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  from: z.string().regex(/^\+[1-9][0-9]{7,14}$/), to: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  body: z.string().min(1).max(10_000), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  identityId: z.string().min(1),
}).strict();

type SubjectRow = {
  id: string; workspaceId: string; createdByUserId: string; kind: string; status: string;
  request: unknown; requestHash: string; idempotencyKey: string; createdAt: Date;
  workspaceStatus: string; ownerUserId: string; defaultTimezone: string;
  memberStatus: string | null; memberRole: string | null;
  identityId: string | null; identityUserId: string | null; identityStatus: string | null;
  identityAddress: string | null; identityVerified: boolean | null; identityPermissions: string[] | null;
  identityBindingCount: bigint; accountId: string; accountProvider: string;
  accountStatus: string; accountRevokedAt: Date | null; accountHash: string | null;
  accountVersion: number; grantId: string | null; grantStatus: string | null;
  grantRevokedAt: Date | null; grantVersion: number | null;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Authoritative database inspection of the stored inbound subject, not a model
 * supplied permission snapshot. Caller must use its authenticated workspace.
 * This is NOT dispatch admission: no policy, pilot expiry, budget, claim or
 * provider authority is granted here. Repeat this read after model latency;
 * compare authorityFingerprint before preparing anything, then separately check
 * current action-specific grants. The SMS grant never grants Calendar access.
 */
export async function inspectPersonalGatewaySubject(
  tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
  expected: PersonalGatewayOperationSubject,
) {
  if (expected.kind !== "personal_assistant_operation" || !expected.operationId || !expected.workspaceId) {
    throw new Error("PERSONAL_GATEWAY_INVALID_SUBJECT");
  }
  const rows = await tx.$queryRawUnsafe<SubjectRow[]>(
    `SELECT p.id,p."workspaceId",p."createdByUserId",p.kind,p.status,p.request,p."requestHash",p."idempotencyKey",p."createdAt",
      w.status::text "workspaceStatus",w."ownerUserId",w."defaultTimezone",
      m.status::text "memberStatus",m.role::text "memberRole",
      i.id "identityId",i."userId" "identityUserId",i.status::text "identityStatus",
      i."normalizedAddress" "identityAddress",i.verified "identityVerified",i.permissions "identityPermissions",
      (SELECT count(*) FROM "ConstructionCommunicationIdentity" i2 JOIN "ConstructionWorkspace" w2 ON w2.id=i2."workspaceId"
        WHERE i2.channel='sms' AND i2."normalizedAddress"=p.request->>'from' AND i2.status='active'
        AND i2.verified=true AND i2."userId" IS NOT NULL AND 'COMMAND'=ANY(i2.permissions) AND w2.status='active') "identityBindingCount",
      a.id "accountId",a.provider "accountProvider",a.status "accountStatus",a."revokedAt" "accountRevokedAt",
      a."externalAccountKeyHash" "accountHash",a."stateVersion" "accountVersion",
      g.id "grantId",g.status "grantStatus",g."revokedAt" "grantRevokedAt",g."stateVersion" "grantVersion"
    FROM "PersonalAssistantOperation" p
    JOIN "ConstructionWorkspace" w ON w.id=p."workspaceId"
    JOIN "ConstructionConnectorAccount" a ON a.id=p."connectorAccountId" AND a."workspaceId"=p."workspaceId"
    LEFT JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=p."workspaceId" AND m."userId"=p."createdByUserId"
    LEFT JOIN "ConstructionCommunicationIdentity" i ON i.id=p.request->>'identityId' AND i."workspaceId"=p."workspaceId" AND i.channel='sms'
    LEFT JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id AND g.capability='sms_inbound'
    WHERE p.id=$1 AND p."workspaceId"=$2`,
    expected.operationId, expected.workspaceId,
  );
  const row = rows[0];
  if (rows.length !== 1 || !row || row.id !== expected.operationId || row.workspaceId !== expected.workspaceId ||
    row.kind !== "personal_sms_inbound" || !["received", "processing"].includes(row.status)) {
    throw new Error("PERSONAL_GATEWAY_SUBJECT_NOT_PENDING");
  }
  const received = envelopeSchema.parse(row.request);
  if (!(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) throw new Error("PERSONAL_GATEWAY_RECEIPT_TIME_INVALID");
  const receivedAt = row.createdAt.toISOString();
  const { accountSid, messageSid, from, to, body } = received;
  const contentHash = hash(JSON.stringify({ accountSid, messageSid, from, to, body }));
  if (contentHash !== received.contentHash || contentHash !== row.requestHash ||
      row.idempotencyKey !== `personal-sms:${hash(`${accountSid}:${messageSid}`)}`) {
    throw new Error("PERSONAL_GATEWAY_SOURCE_CHANGED");
  }
  if (row.workspaceStatus !== "active" || row.ownerUserId !== row.createdByUserId ||
      row.memberStatus !== "active" || row.memberRole !== "owner" ||
      row.identityId !== received.identityId || row.identityUserId !== row.createdByUserId ||
      row.identityStatus !== "active" || row.identityVerified !== true ||
      row.identityAddress !== from || !row.identityPermissions?.includes("COMMAND") ||
      row.identityBindingCount !== 1n) {
    throw new Error("PERSONAL_GATEWAY_IDENTITY_NOT_BOUND");
  }
  if (row.accountProvider !== "endvera_sms" || row.accountStatus !== "connected" || row.accountRevokedAt !== null ||
      row.accountHash !== hash(accountSid) || !row.grantId || row.grantStatus !== "active" || row.grantRevokedAt !== null) {
    throw new Error("PERSONAL_GATEWAY_CHANNEL_NOT_CONNECTED");
  }
  const input = createPersonalIntentInput(row.id, body);
  // Explicit namespace: ConstructionWorkspace identifiers are NOT Client ids.
  const tenantKey = `construction-workspace:${row.workspaceId}` as const;
  return Object.freeze({
    status: "SUBJECT_INSPECTED_NOT_DISPATCH_AUTHORIZED" as const,
    executionAuthorized: false as const,
    tenantKey,
    subject: Object.freeze({ ...expected }),
    actorUserId: row.createdByUserId,
    timezone: row.defaultTimezone,
    receivedAt,
    input,
    authorityFingerprint: `sha256:${hash(JSON.stringify({
      tenantKey, actorId: row.createdByUserId, identityId: row.identityId,
      accountId: row.accountId, accountVersion: row.accountVersion,
      grantId: row.grantId, grantVersion: row.grantVersion,
      sourceHash: contentHash, timezone: row.defaultTimezone, receivedAt,
    }))}` as const,
  });
}
