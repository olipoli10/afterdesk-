import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/model-gateway/evidence", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/model-gateway/evidence")>(), appendGatewayAuditEvent: vi.fn(),
}));
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { buildVoiceGatewayRequest } from "@/server/model-gateway/privacy";
import { bindGatewayOperation, createGatewayAttempt } from "@/server/model-gateway/operations";
import { buildVoiceSegmentProjection } from "@/server/model-gateway/voice/projection";
import type { ProjectBrainVoiceGatewaySubject } from "@/server/model-gateway/types";
const projection = buildVoiceSegmentProjection({ sessionId: "session-a", segmentId: "segment-a", ordinal: 0, languageHint: "fr",
  mediaFormat: "m4a", mimeType: "audio/mp4", durationMs: 1000, audioBytes: new Uint8Array([1, 2, 3]) });
const subject: ProjectBrainVoiceGatewaySubject = { kind: "project_brain_voice_segment", actorUserId: "owner-a", workspaceId: "workspace-a",
  projectId: "project-a", intakeId: "intake-a", sourceId: "source-a", sessionId: "session-a", segmentId: "segment-a",
  sourceBindingHash: "a".repeat(64), segmentManifestHash: "b".repeat(64) };
function request(pb = true) {
  return buildVoiceGatewayRequest({ logicalOperationKey: "synthetic-voice", tenantId: pb ? "construction-workspace:workspace-a" : "client-a",
    policyKey: "unpublished-test-policy", dataClass: "personal_data", privacyRequirement: "zero_retention", maxTotalCostMicros: 1n,
    projection, ...(pb ? { projectBrainSubject: subject } : {}) });
}
function fixture(pb = true) {
  const req = request(pb);
  const row = { taskId: null, personalAssistantOperationId: null, purpose: "intake_voice_transcription", subjectKind: pb ? "project_brain_voice" : "voice_intake",
    clientId: pb ? null : "client-a", actorUserId: pb ? "owner-a" : null, workspaceId: pb ? "workspace-a" : null,
    projectId: pb ? "project-a" : null, intakeId: pb ? "intake-a" : null, sourceId: pb ? "source-a" : null,
    sourceBindingHash: pb ? subject.sourceBindingHash : null, segmentManifestHash: pb ? subject.segmentManifestHash : null,
    sessionId: projection.sessionId, segmentId: projection.segmentId, ordinal: projection.ordinal, languageHint: projection.languageHint,
    mediaFormat: projection.mediaFormat, mimeType: projection.mimeType, durationMs: projection.durationMs, byteCount: projection.byteCount,
    audioFingerprint: projection.audioFingerprint };
  const input = { aiOperationId: "ai-a", tenantId: req.tenantId, operationType: req.operationType, requestFingerprint: req.requestFingerprint,
    outputContractHash: req.outputContractHash, dataClass: req.dataClass, privacyRequirement: req.privacyRequirement, policyVersionId: "policy-a", maxTotalCostMicros: 1n };
  const operation = { ...input, id: "gateway-a", status: "admitted" };
  const binding = { aiOperationId: input.aiOperationId, requestFingerprint: input.requestFingerprint, aiOperationKey: "key-a", holdOperationKey: "key-a",
    billingProvider: "synthetic", holdProvider: "synthetic", holdAmountMicros: 1n, tenantId: req.tenantId, operationType: req.operationType,
    gatewayOperationId: operation.id, taskClientId: null, voiceClientId: row.clientId, personalWorkspaceId: null, personalKind: null, aiPurpose: row.purpose };
  const attempt = { id: "attempt-a", decisionId: "decision-a", accountSpendHoldId: "hold-a", status: "prepared", dispatchState: "not_dispatched",
    resultContractStatus: "not_evaluated", requestEvidenceRef: null };
  const execute = vi.fn().mockResolvedValue(1);
  const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("FOR SHARE OF ai,s,v") ? [row]
    : sql.includes('SELECT ai."taskId"') ? [{ taskId: null, taskClientId: null, purpose: row.purpose, voiceIntakeSegmentId: "segment-a",
      voiceClientId: row.clientId, personalAssistantOperationId: null }]
      : sql.includes('FROM "ModelGatewayDecision"') ? [binding]
        : sql.includes('FROM "ModelGatewayAttempt"') ? [attempt] : [operation]);
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient;
  return { row, req, input, binding, tx, query, execute };
}
describe("closed Project Brain voice request fingerprints", () => {
  it("preserves exact legacy CLIENT fingerprint and no fake Task", () => {
    const req = request(false); const { audioBytes: _bytes, ...minimum } = projection; void _bytes;
    expect(req.requestFingerprint).toBe(canonicalFingerprint(minimum));
    expect(req.subject).toEqual({ kind: "voice_intake_segment", sessionId: "session-a", segmentId: "segment-a" });
    expect(req).not.toHaveProperty("taskId");
  });
  it("PB is a distinct immutable subject using the same operation type/content reference", () => {
    const pb = request(), legacy = request(false);
    expect(pb.subject).toEqual(subject); expect(Object.isFrozen(pb.subject)).toBe(true);
    expect(pb.operationType).toBe(legacy.operationType); expect(pb.contentRef).toEqual(legacy.contentRef);
    expect(pb.requestFingerprint).not.toBe(legacy.requestFingerprint);
    expect(pb).not.toHaveProperty("executionAuthorized");
  });
  it.each(["actorUserId", "projectId", "intakeId", "sourceId", "sourceBindingHash", "segmentManifestHash"] as const)("pins %s into the request", key => {
    const changed = { ...subject, [key]: key.endsWith("Hash") ? "c".repeat(64) : "different" };
    const changedRequest = buildVoiceGatewayRequest({ ...request(), projection, projectBrainSubject: changed });
    expect(changedRequest.requestFingerprint).not.toBe(request().requestFingerprint);
  });
  it.each([
    { workspaceId: "different" }, { sessionId: "different" }, { segmentId: "different" },
    { kind: "voice_intake_segment" }, { sourceBindingHash: "wrong" }, { authority: true },
  ])("refuses crossed/unknown PB input %j", changed => {
    expect(() => buildVoiceGatewayRequest({ ...request(), projection, projectBrainSubject: { ...subject, ...changed } as never })).toThrow();
  });
});
describe("existing gateway ledger binding, never owner or provider admission", () => {
  it.each([false, true])("binds exact legacy/PB subject (%s) and an existing hold without creating AiOperation", async pb => {
    const f = fixture(pb);
    await expect(bindGatewayOperation(f.tx, f.input)).resolves.toMatchObject({ id: "gateway-a" });
    await expect(createGatewayAttempt(f.tx, { decisionId: "decision-a", accountSpendHoldId: "hold-a" })).resolves.toMatchObject({ id: "attempt-a", dispatchState: "not_dispatched" });
    expect(f.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO "AiOperation"'))).toBe(false);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("FOR SHARE OF ai,s,v"))).toHaveLength(2);
  });
  it.each([
    { taskId: "fake-task" }, { personalAssistantOperationId: "fake-personal" }, { purpose: "classification" }, { subjectKind: "other" },
    { clientId: "owner-a" }, { actorUserId: "other" }, { workspaceId: "other" }, { projectId: "other" }, { intakeId: "other" },
    { sourceId: "other" }, { sourceBindingHash: "c".repeat(64) }, { segmentManifestHash: "c".repeat(64) },
    { segmentId: "other" }, { sessionId: "other" }, { durationMs: 1001 }, { byteCount: 4 }, { audioFingerprint: `sha256:${"c".repeat(64)}` },
  ])("refuses PB DB binding mutations before both writes %j", async changed => {
    const f = fixture(); Object.assign(f.row, changed);
    await expect(bindGatewayOperation(f.tx, f.input)).rejects.toThrow("GATEWAY_OPERATION_TENANT_TASK_BINDING_MISMATCH");
    await expect(createGatewayAttempt(f.tx, { decisionId: "decision-a", accountSpendHoldId: "hold-a" })).rejects.toThrow("GATEWAY_ATTEMPT_SPEND_BINDING_MISMATCH");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["actorUserId", "workspaceId", "projectId", "intakeId", "sourceId", "sourceBindingHash", "segmentManifestHash"] as const)("legacy CLIENT rejects mixed %s", async key => {
    const f = fixture(false); f.row[key] = "unexpected";
    await expect(bindGatewayOperation(f.tx, f.input)).rejects.toThrow();
    await expect(createGatewayAttempt(f.tx, { decisionId: "decision-a", accountSpendHoldId: "hold-a" })).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("cannot use CLIENT fingerprint/tenant for a PB row", async () => {
    const f = fixture(); f.input.requestFingerprint = request(false).requestFingerprint; f.binding.requestFingerprint = f.input.requestFingerprint;
    await expect(bindGatewayOperation(f.tx, f.input)).rejects.toThrow();
    await expect(createGatewayAttempt(f.tx, { decisionId: "decision-a", accountSpendHoldId: "hold-a" })).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
