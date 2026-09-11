import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { admitPersonalAnswer, type AnswerAdmissionInput } from "@/server/model-gateway/personal-answer/admission";
import { dispatchPersonalAnswer } from "@/server/model-gateway/personal-answer/dispatch";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import { recoverExpiredPersonalAnswerAttempts } from "@/server/model-gateway/personal-answer/recovery";
import { personalAnswerReportForOwner } from "@/server/personal-assistant/answer-report";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());

async function fixture(body = "Explique-moi le béton", claimSource = true) {
  const f = await personalModelFixture(body);
  const research = body.includes("actuel");
  const answerRate = { ...f.rate, totalContextTokens: research ? 65536 : f.rate.totalContextTokens, perCallCeilingCadMicros: 1_000_000 };
  const operation = research ? "personal_public_research_v1" : "personal_answer_candidate_v1";
  const routeKey = research ? "personal-public-research-openrouter-v1" : "personal-answer-openrouter-v1";
  const policyKey = research ? "personal-public-research-v1" : "personal-answer-v1";
  const privacy = { ...(f.route.privacyEvidence as object), adapterKey: "openrouter-personal-answer-candidate", modelKey: "openrouter/auto", operationTypes: [operation] };
  const version = Math.floor(Math.random() * 1_000_000_000) + 1;
  const route = await prisma.modelGatewayRouteProfile.create({ data: {
    routeKey, version, status: "published", pathKind: "gateway_mediated", adapterKey: "openrouter-personal-answer-candidate",
    billingProvider: "openrouter", intermediary: "openrouter", endpointKey: f.rate.providerEndpoint, modelKey: "openrouter/auto",
    operationTypes: [operation], allowedDataClasses: ["personal_data"], privacyPosture: "zero_retention", residency: [],
    privacyEvidence: privacy, pricingEvidence: { syntheticOnly: true }, maxInputTokens: answerRate.totalContextTokens, maxOutputTokens: answerRate.maxOutputTokens,
    canonicalHash: canonicalFingerprint({ seed: randomUUID() }), createdBy: "synthetic-test", publishedAt: f.now,
  } });
  const policy = await prisma.modelGatewayPolicyVersion.create({ data: {
    policyKey, version, status: "published", operationType: operation, routeOrder: [{ routeKey, version: route.version }], fallbackRules: [],
    maxAttempts: 1, maxTotalCostMicros: 1_000_000n, requiredPrivacyPosture: "zero_retention", canonicalHash: canonicalFingerprint({ seed: randomUUID() }), createdBy: "synthetic-test", publishedAt: f.now,
  } });
  const deadlineAt = Date.now() + 120_000;
  if (claimSource) await prisma.personalAssistantOperation.update({ where: { id: f.sourceOperationId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(deadlineAt) } });
  const input: AnswerAdmissionInput = { enabled: true, context: { claim: { operationId: f.sourceOperationId, workspaceId: f.workspaceId,
    userId: f.userId, attempt: 1, leaseUntil: new Date(deadlineAt).toISOString() }, signal: new AbortController().signal, deadlineAt },
    configuration: { policyVersionId: policy.id, rateConfiguration: { candidateRates: [answerRate], searchUsdMicrosPerRequest: 7000 },
      pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_ONLY", reviewedAt: f.now.toISOString(), nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 } } };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED: "true",
    ENDVERA_PERSONAL_PUBLIC_RESEARCH_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "20000000" };
  return { f, input, env, research };
}
type Admitted = Awaited<ReturnType<typeof admitPersonalAnswer>>;
function wire(a: Admitted, research = false) {
  return { httpStatus: 200, body: JSON.stringify({ id: `synthetic-${randomUUID()}`, model: "synthetic/model",
    usage: { prompt_tokens: 90, completion_tokens: 50, ...(research ? { server_tool_use: { web_search_requests: 1 } } : {}) },
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({
      requestFingerprint: a.current.candidateInput.requestFingerprint, answer: "Le béton contient du ciment.", needsCurrentSources: false,
      extracts: research ? [{ sourceId: "s1", quote: "Prix sur demande." }] : [],
    }), ...(research ? { annotations: [{ type: "url_citation", url_citation: { url: "https://supplier.example/prix", title: "Fournisseur synthétique", content: "Prix sur demande." } }] } : {}) } }],
  }) };
}

describe("assistant answer gateway on real disposable PostgreSQL, injected transport only", () => {
  it("reserves both currencies once, stores a served-model receipt and refuses replay", async () => {
    const { input, env } = await fixture();
    const a = await admitPersonalAnswer(input, env);
    await expect(admitPersonalAnswer(input, env)).rejects.toThrow();
    let calls = 0;
    const invoke = () => dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => { calls++; return wire(a); } }, env);
    expect(await invoke()).toMatchObject({ status: "ANSWER_STORED", accounting: "UNSETTLED" });
    expect(await invoke()).toMatchObject({ status: "NOT_DISPATCHED" });
    expect(calls).toBe(1);
    const child = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: a.childId } });
    expect(child).toMatchObject({ kind: "personal_answer_v1", status: "completed", attempts: 1, externalTransportPerformed: false });
    expect(child.result).toMatchObject({ requestedModel: "openrouter/auto", servedModel: "synthetic/model", actionAuthority: false });
    expect(await prisma.accountProviderSpendHold.count({ where: { operationKey: a.current.request.logicalOperationKey } })).toBe(1);
    await expect(prisma.personalAssistantOperation.update({ where: { id: a.childId }, data: { result: { invented: true } } })).rejects.toThrow();
  });
  it("stores cited extracts and rejects an action request from the answer lane", async () => {
    const { input, env } = await fixture("Quel est le prix actuel du béton?");
    const a = await admitPersonalAnswer(input, env);
    expect(await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => wire(a, true) }, env)).toMatchObject({ status: "ANSWER_STORED", answer: { evidence: "PUBLIC_SOURCE_EXCERPTS" } });
    const other = await fixture("Appelle Marc");
    await expect(admitPersonalAnswer(other.input, other.env)).rejects.toThrow("ANSWER_LANE_REFUSED");
  });
  it("refuses revoked model consent before transport without releasing exposure", async () => {
    const { f, input, env } = await fixture(); const a = await admitPersonalAnswer(input, env);
    await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    let calls = 0;
    const result = await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => { calls++; return wire(a); } }, env);
    expect(result.status).toBe("NOT_DISPATCHED"); expect(calls).toBe(0);
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: a.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("records a lost response as uncertain and does not retry", async () => {
    const { input, env } = await fixture(); const a = await admitPersonalAnswer(input, env); let calls = 0;
    const invoke = () => dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => { calls++; throw new Error("synthetic failure"); } }, env);
    expect(await invoke()).toMatchObject({ status: "UNCERTAIN" });
    expect(await invoke()).toMatchObject({ status: "NOT_DISPATCHED" }); expect(calls).toBe(1);
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: a.childId } })).status).toBe("uncertain");
  });
  it("rejects cross-workspace claims before a model operation or spend hold", async () => {
    const { input, env, f } = await fixture();
    const other = await fixture();
    const wrong = { ...input, context: { ...input.context, claim: { ...input.context.claim, workspaceId: other.f.workspaceId } } };
    await expect(admitPersonalAnswer(wrong, env)).rejects.toThrow("ANSWER_SOURCE_CLAIM_LOST");
    expect(await prisma.aiOperation.count({ where: { personalAssistantOperationId: f.sourceOperationId } })).toBe(0);
  });
  it("connects one answer to the real SMS worker outbox with no transport", async () => {
    const { input, env, f } = await fixture("Explique-moi le béton", false);
    const workerEnv = { ...env, ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
      ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
      TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true" };
    const result = await processPersonalSms(f.sourceOperationId, workerEnv, { answer: async context => {
      const a = await admitPersonalAnswer({ ...input, context }, env);
      const result = await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => wire(a) }, env);
      if (result.status !== "ANSWER_STORED") throw new Error("SYNTHETIC_ANSWER_REQUIRED");
      return { reply: result.answer.text };
    } });
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED");
    const outbound = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } });
    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false });
    expect((outbound[0].request as { text: string }).text).toContain("béton");
  });
  it("fences concurrent dispatchers to one injected call", async () => {
    const { input, env } = await fixture(); const a = await admitPersonalAnswer(input, env); let calls = 0;
    const invoke = () => dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => { calls++; return wire(a); } }, env);
    const results = await Promise.all([invoke(), invoke()]);
    expect(calls).toBe(1); expect(results.filter(r => r.status === "ANSWER_STORED")).toHaveLength(1);
    expect(results.filter(r => r.status === "NOT_DISPATCHED")).toHaveLength(1);
  });
  it("does not publish a response after consent is revoked during transport", async () => {
    const { f, input, env } = await fixture(); const a = await admitPersonalAnswer(input, env);
    const result = await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => {
      await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
      return wire(a);
    } }, env);
    expect(result.status).toBe("UNCERTAIN");
    expect(await personalAnswerReportForOwner(f.userId, a.childId)).toBeNull();
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: a.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("expires an abandoned admission without retry or refund, once only", async () => {
    const { input, env } = await fixture(); const a = await admitPersonalAnswer(input, env);
    expect(await recoverExpiredPersonalAnswerAttempts()).toMatchObject({ status: "DISABLED", recovered: 0 });
    await prisma.$executeRawUnsafe(`UPDATE "AiOperation" SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1`, a.aiId);
    expect(await recoverExpiredPersonalAnswerAttempts({ enabled: true })).toMatchObject({ recovered: 1 });
    expect(await recoverExpiredPersonalAnswerAttempts({ enabled: true })).toMatchObject({ recovered: 0 });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: a.childId } })).toMatchObject({ status: "uncertain", result: { dispatchAttempted: false, accounting: "UNSETTLED" } });
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: a.attempt.accountSpendHoldId } })).status).toBe("held");
    expect(await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => { throw new Error("MUST_NOT_RUN"); } }, env)).toMatchObject({ status: "NOT_DISPATCHED" });
  });
  it("shows the stored report only to its active owner, without model metadata", async () => {
    const { f, input, env } = await fixture(); const a = await admitPersonalAnswer(input, env);
    expect(await dispatchPersonalAnswer({ admission: a, enabled: true, transportMode: "SYNTHETIC_LOCAL", transport: async () => wire(a) }, env)).toMatchObject({ status: "ANSWER_STORED" });
    const report = await personalAnswerReportForOwner(f.userId, a.childId);
    expect(report).toMatchObject({ text: "Le béton contient du ciment." });
    expect(report).not.toHaveProperty("servedModel");
    const other = await fixture();
    expect(await personalAnswerReportForOwner(other.f.userId, a.childId)).toBeNull();
  });
});
