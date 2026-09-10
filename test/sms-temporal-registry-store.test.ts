import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
const mocks = vi.hoisted(() => ({ proof: vi.fn(), binding: vi.fn(), namespace: vi.fn(), clock: vi.fn(), model: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/model-gateway/personal-intent/review-proof", () => ({ loadStoredPersonalIntentReviewProof: mocks.proof }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ inspectModelAuthority: mocks.model }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-authority", async original => ({
  ...await original<typeof import("@/server/personal-assistant/sms-temporal-clarification-authority")>(),
  temporalCurrentBinding: mocks.binding, temporalLockSourceNamespace: mocks.namespace, temporalRegistryClock: mocks.clock,
}));
import { prepareSmsTemporalClarificationInTransaction as prepare, markSmsTemporalClarificationAskedInTransaction as asked,
  consumeSmsTemporalClarificationInTransaction as consume } from "@/server/personal-assistant/sms-temporal-clarification-store";
import { prepareSmsTemporalClarification as purePrepare, smsTemporalClarificationQuestionRequest as request,
  type SmsTemporalClarificationBinding } from "@/server/personal-assistant/sms-temporal-clarification";
import { temporalConversationNamespace } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { canonicalFingerprint, canonicalJson } from "@/server/model-gateway/evidence";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { formatPersonalModelReviewMessage } from "@/server/personal-assistant/model-review-message";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const actor = { userId: "owner", workspaceId: "workspace" }, now = new Date("2026-09-11T12:00:10.000Z");
const env = { ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" };
const context = () => ({ deadlineAt: Date.now() + 30000 });
function fixture() {
  const anchor = "2026-09-11T12:00:00.000Z", accountSid = `AC${"a".repeat(32)}`;
  const binding: SmsTemporalClarificationBinding = { ...actor, memberId: "member", memberRole: "owner", memberRevision: anchor,
    workspaceRevision: anchor, identityId: "identity", identityRevision: anchor, verifiedIdentity: true, ownerNumber: "+15145550100", endveraNumber: "+15145550101",
    smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(accountSid), smsInboundGrantId: "inbound", smsInboundGrantVersion: 1,
    modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
    calendarAccountId: "google", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: "America/Toronto" };
  const wire = { accountSid, messageSid: `SM${"b".repeat(32)}`, from: binding.ownerNumber, to: binding.endveraNumber, body: "Ajoute inspection demain à 2h, fin 15h." };
  const source = { operationId: "source", ...actor, identityId: "identity", verifiedIngress: true as const, ...wire, requestHash: sha(JSON.stringify(wire)), receivedAt: anchor };
  const input = createPersonalIntentInput(source.operationId, source.body), span = (quote: string) => ({ quote, start: source.body.indexOf(quote), end: source.body.indexOf(quote) + quote.length });
  const proposal = { schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span("demain à 2h"), ends: span("15h") }] };
  const prepared = purePrepare({ schemaVersion: 1, clarificationId: "ca336f07-b173-4d30-8e8c-fa6d5cdfc065", binding, source,
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", actionId: "event", rawProposal: canonicalJson(proposal), createdAt: now.toISOString(), expiresAt: "2026-09-11T12:10:10.000Z" });
  const questionRequest = request(prepared), questionHash = sha(JSON.stringify(questionRequest)), childResult = { proposal }, evidence = canonicalFingerprint(childResult);
  const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED" as const, executionAuthorized: false, externalTransportPerformed: false, accounting: "UNSETTLED", automaticRetry: false,
    semanticIntentVerified: false, source: { operationId: source.operationId, text: source.body, receivedAt: anchor, timezone: binding.timezone }, modelChildOperationId: "child",
    actions: [{ actionId: "event", kind: "PREPARE_CALENDAR_EVENT", status: "CLARIFY" as const, question: prepared.question }] };
  const claim = { ...actor, operationId: source.operationId, attempt: 1 as const, leaseUntil: "2026-09-11T12:00:35.000Z" };
  const row = { ...actor, id: prepared.clarificationId, identityId: binding.identityId, namespace: temporalConversationNamespace(binding.ownerNumber, binding.endveraNumber), phase: "PREPARED", prepared,
    preparedHash: prepared.preparedHash, bindingHash: prepared.bindingHash, wireTextHash: prepared.wireTextHash, wireFormatterVersion: prepared.wireFormatterVersion,
    proposalSerializationVersion: "personal-inspected-proposal-canonical-v1", createdAt: now, expiresAt: new Date(prepared.expiresAt), sourceClaim: claim,
    sourceOperationId: source.operationId, modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event", questionOutboundOperationId: "question",
    questionRequestHash: questionHash, proposalEvidenceRef: evidence, reviewSnapshot: review, waiting: null, waitingHash: null, acceptedAt: null, acceptedProviderSid: null, failedAttempts: 0 };
  const receipt: Record<string, unknown> = { providerSid: `SM${"c".repeat(32)}`, acceptedByProvider: true, delivered: false, approvalHash: questionHash, acceptedAt: "2026-09-11T12:00:12.000Z" };
  const state = { old: [] as unknown[], questions: [{ request: questionRequest, requestHash: questionHash, result: receipt }], isolation: "serializable", row };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    void args;
    if (sql.includes("transaction_isolation")) return [{ isolation: state.isolation }];
    if (sql.includes("set_config")) return [];
    if (sql.includes('SELECT "sourceOperationId"')) return [{ sourceOperationId: source.operationId }];
    if (sql.includes('SELECT * FROM "PersonalSmsTemporalClarification"')) return sql.includes('"reviewActionId"=$2') ? state.old : [state.row];
    if (sql.includes('SELECT c.result')) return [{ result: childResult, request: { modelAuthorityFingerprint: "fingerprint" }, resultEvidenceRef: evidence, responseEvidenceRef: evidence }];
    if (sql.includes('SELECT request,"requestHash"') || sql.includes('SELECT result,request')) return state.questions;
    throw new Error("UNEXPECTED_SYNTHETIC_SQL");
  });
  const execute = vi.fn(async (...args: unknown[]) => { void args; return 1; });
  mocks.namespace.mockResolvedValue(row.namespace); mocks.binding.mockResolvedValue({ source, binding, sourceResult: { personalModelReview: review }, now });
  mocks.clock.mockResolvedValue(now); mocks.model.mockResolvedValue({ accountId: "model", grantId: "model-grant", fingerprint: "fingerprint" });
  mocks.proof.mockResolvedValue({ status: "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED", inspected: { proposal }, source: { input, receivedAt: anchor, timezone: binding.timezone },
    row: { gatewayId: "gateway", resultEvidenceRef: evidence }, request: {} });
  return { tx: { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient, query, execute, state, row, prepared, receipt,
    preparation: { actor, sourceClaim: claim, modelChildOperationId: "child", reviewActionId: "event", questionOutboundOperationId: "question" },
    lookup: { actor, clarificationId: row.id, questionOutboundOperationId: "question" } };
}
beforeEach(() => vi.clearAllMocks());
describe("temporal registry provisional store (mocked DB; real pure contracts)", () => {
  it.each([prepare, asked, consume])("OFF returns before parsing, DB or proof loaders", async method => {
    const f = fixture(); expect(await method(f.tx, null as never, {}, context())).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(f.query).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled(); expect(mocks.proof).not.toHaveBeenCalled();
  });
  it("rejects wrong actor and invalid original claim before any query", async () => {
    const f = fixture(); await expect(prepare(f.tx, { ...f.preparation, actor: { ...actor, userId: "other" } }, env, context())).rejects.toThrow("ACTOR_MISMATCH");
    await expect(prepare(f.tx, { ...f.preparation, sourceClaim: { ...f.preparation.sourceClaim, attempt: 2 } as never }, env, context())).rejects.toThrow(); expect(f.query).not.toHaveBeenCalled();
  });
  it("prepares only registry, preserves exact full wire message, and requires caller source commit", async () => {
    const f = fixture(), result = await prepare(f.tx, f.preparation, env, context());
    expect(result).toMatchObject({ status: "PREPARED_FOR_SOURCE_COMMIT", executionAuthorized: false, committed: false, replayed: false, requiredSourceReview: f.row.reviewSnapshot });
    expect(formatPersonalModelReviewMessage(f.row.reviewSnapshot)).toBe(f.prepared.wireText);
    expect(f.execute).toHaveBeenCalledTimes(1); expect(f.execute.mock.calls[0][0]).toContain('INSERT INTO "PersonalSmsTemporalClarification"');
    expect(f.execute.mock.calls[0][0]).not.toContain('UPDATE "PersonalAssistantOperation"'); expect(Object.isFrozen(result)).toBe(true);
  });
  it("same preparation replay returns existing evidence without write", async () => {
    const f = fixture(); f.state.old = [f.row]; expect(await prepare(f.tx, f.preparation, env, context())).toMatchObject({ replayed: true, clarificationId: f.row.id }); expect(f.execute).not.toHaveBeenCalled();
  });
  it("changed outbox on replay cannot create a replacement", async () => {
    const f = fixture(); f.state.old = [{ ...f.row, questionOutboundOperationId: "other" }];
    await expect(prepare(f.tx, f.preparation, env, context())).rejects.toThrow("REPLAY_CHANGED"); expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects multiple actions before source bindings or drafts", async () => {
    const f = fixture(), proof = await mocks.proof(); mocks.proof.mockResolvedValue({ ...proof, inspected: { proposal: { ...proof.inspected.proposal, actions: [...proof.inspected.proposal.actions, ...proof.inspected.proposal.actions] } } });
    await expect(prepare(f.tx, f.preparation, env, context())).rejects.toThrow("SINGLE_PROOF_REQUIRED"); expect(mocks.binding).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["missing", "truncated", "hash"])("refuses %s existing full question", async mode => {
    const f = fixture(); if (mode === "missing") f.state.questions = [];
    else if (mode === "truncated") f.state.questions[0].request = { ...f.state.questions[0].request, text: f.prepared.question };
    else f.state.questions[0].requestHash = "a".repeat(64);
    await expect(prepare(f.tx, f.preparation, env, context())).rejects.toThrow("EXACT_QUESTION_REQUIRED"); expect(f.execute).not.toHaveBeenCalled();
  });
  it("records WAITING only from exact durable receipt, not delivery or updatedAt", async () => {
    const f = fixture(); mocks.clock.mockResolvedValue(new Date("2026-09-11T12:00:13.000Z"));
    expect(await asked(f.tx, f.lookup, env, context())).toMatchObject({ status: "WAITING_FOR_TEMPORAL_REPLY", executionAuthorized: false, committed: false });
    expect(f.execute).toHaveBeenCalledTimes(1); const waiting = JSON.parse(f.execute.mock.calls[0][2] as string);
    expect(waiting.questionReceipt).toMatchObject({ acceptedAt: f.receipt.acceptedAt, deliveryConfirmed: false });
  });
  it.each(["acceptedAt", "providerSid", "approvalHash", "acceptedByProvider", "delivered"])("refuses missing durable receipt field %s", async key => {
    const f = fixture(); delete f.receipt[key]; await expect(asked(f.tx, f.lookup, env, context())).rejects.toThrow(); expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["2026-09-11T08:00:12-04:00", "2026-09-11T12:00:12Z", "2026-09-11T12:00:09.000Z", "2026-09-11T12:11:12.000Z"])("refuses noncanonical/outside receipt instant %s", async acceptedAt => {
    const f = fixture(); f.receipt.acceptedAt = acceptedAt; mocks.clock.mockResolvedValue(new Date("2026-09-11T12:00:13.000Z"));
    await expect(asked(f.tx, f.lookup, env, context())).rejects.toThrow(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("current consent change refuses before receipt attachment", async () => {
    const f = fixture(), current = await mocks.binding(); mocks.binding.mockResolvedValue({ ...current, binding: { ...current.binding, calendarWriteGrantVersion: 2 } });
    await expect(asked(f.tx, f.lookup, env, context())).rejects.toThrow("CONTEXT_CHANGED"); expect(f.execute).not.toHaveBeenCalled();
  });
  it("zero-row WAITING CAS fails rather than claiming persistence", async () => {
    const f = fixture(); mocks.clock.mockResolvedValue(new Date("2026-09-11T12:00:13.000Z")); f.execute.mockResolvedValue(0);
    await expect(asked(f.tx, f.lookup, env, context())).rejects.toThrow("CLAIM_LOST");
  });
});
