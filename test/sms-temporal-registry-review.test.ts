import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
const mocks = vi.hoisted(() => ({ binding: vi.fn(), namespace: vi.fn(), source: vi.fn(), clock: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ inspectModelAuthority: mocks.model }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-authority", async original => ({
  ...await original<typeof import("@/server/personal-assistant/sms-temporal-clarification-authority")>(),
  temporalCurrentBinding: mocks.binding, temporalLockSourceNamespace: mocks.namespace,
  temporalCheckedSource: mocks.source, temporalRegistryClock: mocks.clock,
}));
import { consumeSmsTemporalClarificationInTransaction } from "@/server/personal-assistant/sms-temporal-clarification-store";
import { prepareSmsTemporalClarification, markSmsTemporalClarificationAsked, smsTemporalClarificationQuestionRequest,
  type SmsTemporalClarificationBinding } from "@/server/personal-assistant/sms-temporal-clarification";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolveCorrelatedPersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/correlated-temporal-resolution";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const anchor = "2026-09-11T03:58:00.000Z", acceptedAt = "2026-09-11T03:58:20.000Z", now = "2026-09-11T04:01:01.000Z";
const actor = { userId: "owner", workspaceId: "workspace" };
function fixture(incomplete: boolean) {
  const accountSid = `AC${"a".repeat(32)}`;
  const binding: SmsTemporalClarificationBinding = { ...actor, memberId: "member", memberRole: "owner", memberRevision: anchor,
    workspaceRevision: anchor, identityId: "identity", identityRevision: anchor, verifiedIdentity: true, ownerNumber: "+15145550100",
    endveraNumber: "+15145550101", smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid),
    smsInboundGrantId: "inbound", smsInboundGrantVersion: 1, modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant",
    modelGrantVersion: 1, calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: "America/Toronto" };
  const source = (body: string, suffix: string, receivedAt: string) => {
    const wire = { accountSid, messageSid: `SM${suffix.repeat(32)}`, from: binding.ownerNumber, to: binding.endveraNumber, body };
    return { operationId: `source-${suffix}`, ...actor, identityId: "identity", verifiedIngress: true as const,
      ...wire, requestHash: sha(JSON.stringify(wire)), receivedAt };
  };
  const original = source("Ajoute inspection demain à 2h, fin 15h.", "a", anchor), replySource = source("14h", "b", "2026-09-11T04:01:00.000Z");
  const span = (quote: string) => ({ quote, start: original.body.indexOf(quote), end: original.body.indexOf(quote) + quote.length });
  const proposal = { schemaVersion: 1, requestFingerprint: createPersonalIntentInput(original.operationId, original.body).requestFingerprint,
    actions: [incomplete ? { id: "event", kind: "CLARIFY", dependsOn: [], reason: "MISSING_END_TIME" }
      : { id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span("demain à 2h"), ends: span("15h") }] };
  const prepared = prepareSmsTemporalClarification({ schemaVersion: 1, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding,
    source: original, modelChildOperationId: "child", modelGatewayOperationId: "gateway", actionId: "event", rawProposal: JSON.stringify(proposal),
    createdAt: "2026-09-11T03:58:10.000Z", expiresAt: "2026-09-11T04:08:00.000Z" });
  const requestHash = sha(JSON.stringify(smsTemporalClarificationQuestionRequest(prepared)));
  const waiting = markSmsTemporalClarificationAsked(prepared, { outboundOperationId: "question", requestHash, acceptedProviderSid: `SM${"c".repeat(32)}`,
    acceptedAt, acceptedByProvider: true, deliveryConfirmed: false }, acceptedAt);
  const result = { proposal }, reviewSnapshot = { fixture: "synthetic-exact-review" }, evidenceRef = canonicalFingerprint(result);
  const claim = { ...actor, operationId: replySource.operationId, attempt: 1 as const, leaseUntil: "2026-09-11T04:01:30.000Z" };
  const row = { ...actor, id: prepared.clarificationId, namespace: "namespace", phase: "WAITING", prepared, preparedHash: prepared.preparedHash,
    identityId: binding.identityId, bindingHash: prepared.bindingHash, wireTextHash: prepared.wireTextHash, wireFormatterVersion: prepared.wireFormatterVersion,
    proposalSerializationVersion: "personal-inspected-proposal-canonical-v1", createdAt: new Date(prepared.createdAt),
    sourceOperationId: original.operationId, modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event",
    questionOutboundOperationId: "question", questionRequestHash: requestHash, proposalEvidenceRef: evidenceRef, reviewSnapshot,
    waiting, waitingHash: waiting.waitingHash, acceptedAt: new Date(acceptedAt), acceptedProviderSid: waiting.questionReceipt.acceptedProviderSid,
    expiresAt: new Date(prepared.expiresAt), failedAttempts: 0 };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("set_config")) return [];
    if (sql.includes('SELECT "sourceOperationId"')) return [{ sourceOperationId: original.operationId }];
    if (sql.includes('SELECT * FROM "PersonalSmsTemporalClarification"')) return [row];
    if (sql.includes('SELECT c.result')) return [{ result, request: { modelAuthorityFingerprint: "current-model-fingerprint" }, resultEvidenceRef: evidenceRef, responseEvidenceRef: evidenceRef }];
    if (sql.includes('SELECT id,request')) return [{ id: replySource.operationId, request: {}, requestHash: replySource.requestHash, result: null,
      createdAt: new Date(replySource.receivedAt), connectorAccountId: "sms" }];
    if (sql.includes('PersonalSmsConversationExpectation')) return [{ id: `temporal:${row.id}` }];
    throw new Error("UNEXPECTED_SYNTHETIC_QUERY");
  });
  const execute = vi.fn(async (...args: unknown[]) => { void args; return 1; });
  mocks.namespace.mockResolvedValue("namespace"); mocks.binding.mockResolvedValue({ source: original, binding, sourceResult: { personalModelReview: reviewSnapshot }, now: new Date(now) });
  mocks.model.mockResolvedValue({ accountId: binding.modelAccountId, grantId: binding.modelGrantId, fingerprint: "current-model-fingerprint" });
  mocks.source.mockReturnValue(replySource); mocks.clock.mockResolvedValue(new Date(now));
  return { tx: { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient, execute, claim, row,
    pure: { waiting, currentBinding: binding, currentPhase: "WAITING" as const, activeQuestionCount: 1, now,
      reply: { source: replySource, attempt: 1 as const, status: "processing" as const, leaseUntil: claim.leaseUntil, alreadyConsumed: false as const } } };
}
beforeEach(() => vi.clearAllMocks());
describe("independent temporal registry outcome classification (synthetic DB, real resolver/store)", () => {
  it("does not accept or consume an insufficient original template as a resolved clarification", async () => {
    const f = fixture(true);
    expect(resolveCorrelatedPersonalCalendarTemporal(f.pure).status).toBe("INSUFFICIENT_ORIGINAL_TEMPLATE");
    const result = await consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
      { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 });
    expect(result.status).toBe("REFUSED");
    const insert = f.execute.mock.calls.find(call => String(call[0]).includes('INSERT INTO "PersonalSmsTemporalClarificationReply"'));
    expect(insert?.[9]).toBe("REFUSED");
  });
  it("keeps an exact resolved two-source positive control", async () => {
    const f = fixture(false);
    expect(resolveCorrelatedPersonalCalendarTemporal(f.pure).status).toBe("RESOLVED_NOT_AUTHORIZED");
    const result = await consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
      { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 });
    expect(result.status).toBe("CORRELATED_NOT_EXECUTED"); expect(result.executionAuthorized).toBe(false);
  });
  it("normalizes an accepted equivalent lease offset before immutable receipt capture", async () => {
    const f = fixture(false), leaseWithOffset = f.claim.leaseUntil.replace(".000Z", "+00:00");
    expect(leaseWithOffset).not.toBe(f.claim.leaseUntil);
    const result = await consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id,
      replySourceClaim: { ...f.claim, leaseUntil: leaseWithOffset } },
    { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 });
    expect(result.status).toBe("CORRELATED_NOT_EXECUTED");
    const insert = f.execute.mock.calls.find(call => String(call[0]).includes('INSERT INTO "PersonalSmsTemporalClarificationReply"'));
    expect(JSON.parse(String(insert?.[8])).leaseUntil).toBe(f.claim.leaseUntil);
  });
  it.each(["identityId", "bindingHash", "wireTextHash", "wireFormatterVersion", "proposalSerializationVersion", "modelChildOperationId", "questionRequestHash"])(
    "rejects changed persisted scalar %s before a reply write", async field => {
      const f = fixture(false);
      (f.row as unknown as Record<string, unknown>)[field] = "changed";
      await expect(consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
        { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 })).rejects.toThrow();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it.each(["createdAt", "expiresAt"] as const)("refuses persisted %s diverging from the immutable packet", async field => {
    const f = fixture(false); f.row[field] = new Date(f.row[field].getTime() + 1000);
    await expect(consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
      { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 })).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["accountId", "grantId", "fingerprint"])("rejects changed current model %s before consuming the reply", async field => {
    const f = fixture(false);
    mocks.model.mockResolvedValue({ accountId: "model", grantId: "model-grant", fingerprint: "current-model-fingerprint", [field]: "changed" });
    await expect(consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
      { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() + 30_000 })).rejects.toThrow("MODEL_AUTHORITY_CHANGED");
    expect(f.execute).not.toHaveBeenCalled();
    expect(mocks.model.mock.calls[0][1]).toEqual({ actorUserId: actor.userId,
      subject: { kind: "personal_assistant_operation", operationId: f.row.sourceOperationId, workspaceId: actor.workspaceId } });
  });
  it("OFF refuses work before querying the database even with malformed input", async () => {
    const query = vi.fn();
    expect(await consumeSmsTemporalClarificationInTransaction({ $queryRawUnsafe: query } as never, {} as never,
      { NODE_ENV: "test" }, { deadlineAt: Infinity })).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(query).not.toHaveBeenCalled();
  });
  it("an already expired deadline does not query or write the database", async () => {
    const f = fixture(false);
    await expect(consumeSmsTemporalClarificationInTransaction(f.tx, { actor, clarificationId: f.row.id, replySourceClaim: f.claim },
      { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { deadlineAt: Date.now() - 1 })).rejects.toThrow("DEADLINE");
    expect(f.tx.$queryRawUnsafe).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
});
