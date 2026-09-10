import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { inspectPersonalGatewaySubject } from "@/server/model-gateway/personal-subject";
import { requireOperationDefinition } from "@/server/model-gateway/registry";
import { bindGatewayOperation } from "@/server/model-gateway/operations";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const subject = { kind: "personal_assistant_operation", operationId: "synthetic-op", workspaceId: "synthetic-workspace" } as const;
function fixture() {
  const envelope = { accountSid: `AC${"a".repeat(32)}`, messageSid: `SM${"b".repeat(32)}`, from: "+15005550006", to: "+15005550007", body: "Qu'est-ce que j'ai demain?" };
  const contentHash = hash(JSON.stringify(envelope));
  return {
    id: subject.operationId, workspaceId: subject.workspaceId, createdByUserId: "synthetic-owner", createdAt: new Date("2026-09-10T03:00:00Z"),
    kind: "personal_sms_inbound", status: "received", request: { schemaVersion: 1, ...envelope, contentHash, identityId: "synthetic-identity" },
    requestHash: contentHash, idempotencyKey: `personal-sms:${hash(`${envelope.accountSid}:${envelope.messageSid}`)}`,
    workspaceStatus: "active", ownerUserId: "synthetic-owner", defaultTimezone: "America/Toronto",
    memberStatus: "active", memberRole: "owner", identityId: "synthetic-identity", identityUserId: "synthetic-owner",
    identityStatus: "active", identityAddress: envelope.from, identityVerified: true, identityPermissions: ["COMMAND"],
    identityBindingCount: 1n, accountId: "synthetic-channel", accountProvider: "endvera_sms", accountStatus: "connected",
    accountRevokedAt: null, accountHash: hash(envelope.accountSid), accountVersion: 1,
    grantId: "synthetic-grant", grantStatus: "active", grantRevokedAt: null, grantVersion: 1,
  };
}
function db(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return { tx: { $queryRawUnsafe: query } as unknown as Pick<Prisma.TransactionClient, "$queryRawUnsafe">, query };
}

describe("personal gateway authoritative subject inspection (synthetic SQL results)", () => {
  it("reloads exact persisted source and uses a workspace namespace without action authority", async () => {
    const row = fixture(); const { tx, query } = db([row]);
    const result = await inspectPersonalGatewaySubject(tx, subject);
    expect(result).toMatchObject({ executionAuthorized: false, status: "SUBJECT_INSPECTED_NOT_DISPATCH_AUTHORIZED", tenantKey: "construction-workspace:synthetic-workspace", actorUserId: "synthetic-owner" });
    expect(result.input.source).toBe(row.request.body);
    expect(result.receivedAt).toBe("2026-09-10T03:00:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    const [sql, ...values] = query.mock.calls[0];
    expect(sql).toContain('p.id=$1 AND p."workspaceId"=$2');
    expect(sql).toContain('a."workspaceId"=p."workspaceId"');
    expect(sql).toContain('i."workspaceId"=p."workspaceId"');
    expect(values).toEqual([subject.operationId, subject.workspaceId]);
    expect(sql).not.toContain('JOIN "Task"');
  });

  it("binds the persisted reception instant rather than a processing clock", async () => {
    const first = await inspectPersonalGatewaySubject(db([fixture()]).tx, subject);
    const second = await inspectPersonalGatewaySubject(db([{ ...fixture(), createdAt: new Date("2026-09-11T03:00:00Z") }]).tx, subject);
    expect(first.authorityFingerprint).not.toBe(second.authorityFingerprint);
    await expect(inspectPersonalGatewaySubject(db([{ ...fixture(), createdAt: new Date("invalid") }]).tx, subject)).rejects.toThrow("RECEIPT_TIME_INVALID");
  });

  it.each([{ rows: [] }, { rows: [fixture(), fixture()] }])("refuses missing or ambiguous results", async ({ rows }) => {
    await expect(inspectPersonalGatewaySubject(db(rows).tx, subject)).rejects.toThrow("SUBJECT_NOT_PENDING");
  });

  it.each([
    { workspaceId: "other-workspace" }, { id: "other-operation" },
    { kind: "personal_sms_outbound" }, { status: "completed" },
  ])("refuses mismatched or terminal subjects %j", async changed => {
    await expect(inspectPersonalGatewaySubject(db([{ ...fixture(), ...changed }]).tx, subject)).rejects.toThrow("SUBJECT_NOT_PENDING");
  });

  it.each([
    { ownerUserId: "other-owner" }, { memberStatus: "revoked" }, { memberRole: "admin" },
    { workspaceStatus: "archived" }, { identityUserId: "other-user" }, { identityVerified: false },
    { identityAddress: "+15005550009" }, { identityPermissions: [] }, { identityBindingCount: 2n },
    { identityId: "other-identity" }, { identityStatus: "inactive" },
  ])("refuses altered owner/verified-phone binding", async changed => {
    await expect(inspectPersonalGatewaySubject(db([{ ...fixture(), ...changed }]).tx, subject)).rejects.toThrow("IDENTITY_NOT_BOUND");
  });

  it.each([
    { accountProvider: "google_calendar" }, { accountStatus: "revoked" }, { accountRevokedAt: new Date() },
    { accountHash: hash("other-account") }, { grantId: null }, { grantStatus: "requested" }, { grantRevokedAt: new Date() },
  ])("refuses changed connector or revoked grants", async changed => {
    await expect(inspectPersonalGatewaySubject(db([{ ...fixture(), ...changed }]).tx, subject)).rejects.toThrow("CHANNEL_NOT_CONNECTED");
  });

  it("rejects altered source bytes, replay keys and injected authority fields", async () => {
    const row = fixture();
    for (const changed of [
      { request: { ...row.request, body: "Texte Marc" } },
      { requestHash: "c".repeat(64) }, { idempotencyKey: "different-replay-key" },
      { request: { ...row.request, executionAuthorized: true } },
    ]) await expect(inspectPersonalGatewaySubject(db([{ ...row, ...changed }]).tx, subject)).rejects.toThrow();
  });

  it("requires fresh DB reinspection after latency and fingerprints grant version changes", async () => {
    const row = fixture(); const { tx, query } = db([row]);
    const before = await inspectPersonalGatewaySubject(tx, subject);
    query.mockResolvedValueOnce([{ ...row, grantVersion: 2 }]);
    const after = await inspectPersonalGatewaySubject(tx, subject);
    expect(after.authorityFingerprint).not.toBe(before.authorityFingerprint);
    query.mockResolvedValueOnce([{ ...row, grantStatus: "revoked" }]);
    await expect(inspectPersonalGatewaySubject(tx, subject)).rejects.toThrow("CHANNEL_NOT_CONNECTED");
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("does not register a dispatchable personal operation or change legacy subject checks", () => {
    expect(() => requireOperationDefinition("personal_intent_candidate_v1")).toThrow("UNKNOWN_GATEWAY_OPERATION");
    const migration = readFileSync("prisma/migrations/20260910030000_personal_gateway_subject/migration.sql", "utf8");
    expect(migration).toContain('REFERENCES "PersonalAssistantOperation"("id")');
    expect(migration).toContain('AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL');
    expect(migration).toContain('"ai_operation_personal_subject_ck"');
    expect(migration).toContain('personal_gateway_subject_immutable');
    expect(migration).not.toContain('DROP CONSTRAINT');
    expect(migration).not.toContain('ModelGatewayPolicyVersion');
  });

  it("refuses a personal FK through the legacy classification binder before any write", async () => {
    const execute = vi.fn();
    const tx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{
        taskId: "forged-task", taskClientId: "forged-client", purpose: "personal_intent_candidate_v1",
        voiceIntakeSegmentId: null, voiceClientId: null, personalAssistantOperationId: subject.operationId,
      }]),
      $executeRawUnsafe: execute,
    } as unknown as Prisma.TransactionClient;
    await expect(bindGatewayOperation(tx, {
      aiOperationId: "synthetic-ai", tenantId: "forged-client", operationType: "classification",
      requestFingerprint: "synthetic-request", outputContractHash: "synthetic-contract", dataClass: "personal_data",
      privacyRequirement: "no_training", policyVersionId: "synthetic-policy", maxTotalCostMicros: 1n,
    })).rejects.toThrow("GATEWAY_OPERATION_TENANT_TASK_BINDING_MISMATCH");
    expect(execute).not.toHaveBeenCalled();
  });
});
