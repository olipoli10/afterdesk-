import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { admitPersonalIntent, type PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { recoverExpiredPersonalIntentAttempts } from "@/server/model-gateway/personal-intent/recovery";
import { createOpenRouterPersonalIntentAdapter, type OpenRouterPersonalIntentTransport } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
type Fixture = Awaited<ReturnType<typeof personalModelFixture>>;
function controls(f: Fixture): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "20000000" };
}
function input(f: Fixture) {
  return { subject: f.subject, policyVersionId: f.policy.id, rateConfiguration: f.rate, enabled: true,
    pilotEnvelopeReview: { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_ONLY_NOT_BILLING_PROOF", reviewedAt: f.now.toISOString(),
      nonModelExposureCeilingCadMicros: 80_000_000, totalCeilingCadMicros: 100_000_000 } };
}
async function admitted(f: Fixture) {
  const result = await admitPersonalIntent(input(f), controls(f));
  expect(result.status, JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)).toBe("ADMITTED_NOT_DISPATCHED");
  return result as PersonalIntentAdmission;
}
function response(f: Fixture, admission: PersonalIntentAdmission) {
  const quote = "demain"; const start = f.body.indexOf(quote);
  return { httpStatus: 200, body: JSON.stringify({ id: "synthetic-request", model: f.rate.model,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ schemaVersion: 1,
      requestFingerprint: admission.source.input.requestFingerprint, actions: [{ id: "calendar", kind: "READ_CALENDAR", dependsOn: [], period: { start, end: start + quote.length, quote } }] }) } }] }) };
}
function dispatch(f: Fixture, admission: PersonalIntentAdmission, transport: OpenRouterPersonalIntentTransport, env = controls(f)) {
  const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: f.rate.model,
    providerEndpointSlug: f.rate.providerEndpoint, maxOutputTokens: f.rate.maxOutputTokens, timeoutMs: 1000, transportMode: "SYNTHETIC_LOCAL", transport });
  return dispatchPersonalIntent({ admission, adapter, currentRateConfiguration: f.rate,
    currentPilotEnvelopeReview: input(f).pilotEnvelopeReview, abortSignal: new AbortController().signal, enabled: true, transportMode: "SYNTHETIC_LOCAL" }, env);
}

describe("personal model complete gateway on disposable PostgreSQL, fake transport only", () => {
  it("does not reserve or admit when disabled or explicit AI consent is revoked", async () => {
    const f = await personalModelFixture();
    expect((await admitPersonalIntent({ ...input(f), enabled: false }, controls(f))).status).toBe("DISABLED");
    await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [] } });
    expect((await admitPersonalIntent(input(f), controls(f))).status).toBe("REFUSED");
    expect(await prisma.aiOperation.count({ where: { personalAssistantOperationId: f.sourceOperationId } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { sourcePersonalOperationId: f.sourceOperationId } })).toBe(0);
  });
  it("rolls back AI, child, gateway and CAD reservation if the USD hold refuses", async () => {
    const f = await personalModelFixture();
    const before = await prisma.personalAssistantBudget.findUnique({ where: { id: `${PERSONAL_MODEL_AUTHORITY}:openrouter` } });
    const result = await admitPersonalIntent(input(f), { ...controls(f), ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "1" });
    expect(result.status).toBe("REFUSED");
    expect(await prisma.aiOperation.count({ where: { personalAssistantOperationId: f.sourceOperationId } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { sourcePersonalOperationId: f.sourceOperationId } })).toBe(0);
    const after = await prisma.personalAssistantBudget.findUnique({ where: { id: `${PERSONAL_MODEL_AUTHORITY}:openrouter` } });
    expect(after?.reservedCadMicros ?? 0n).toBe(before?.reservedCadMicros ?? 0n);
  });
  it("admits once under concurrency, stores only a proposal, never settles or replays", async () => {
    const f = await personalModelFixture();
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => admitPersonalIntent(input(f), controls(f))));
    const admissions = results.flatMap(result => result.status === "fulfilled" && result.value.status === "ADMITTED_NOT_DISPATCHED" ? [result.value] : []);
    expect(admissions).toHaveLength(1);
    const admission = admissions[0]; let calls = 0;
    const transport: OpenRouterPersonalIntentTransport = async () => { calls++; return response(f, admission); };
    const dispatched = await dispatch(f, admission, transport);
    expect(dispatched.status).toBe("PROPOSAL_STORED_NOT_AUTHORIZED");
    expect(dispatched.executionAuthorized).toBe(false);
    await dispatch(f, admission, transport);
    expect(calls).toBe(1);
    expect((await admitPersonalIntent(input(f), controls(f))).status).toBe("REFUSED");
    expect(await prisma.personalAssistantOperation.count({ where: { sourcePersonalOperationId: f.sourceOperationId } })).toBe(1);
    const child = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: admission.childOperationId } });
    expect(child.status).toBe("completed"); expect(child.externalTransportPerformed).toBe(false);
    expect(child.reservedCadMicros).toBeGreaterThan(0n);
    const hold = await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } });
    expect(hold.status).toBe("held");
    expect(await prisma.aiUsage.count({ where: { operationId: admission.claim.operationId } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: { in: ["sms_outbound", "voice_outbound", "calendar_write"] } } })).toBe(0);
  });
  it("refuses transport after consent revocation and preserves held exposure", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); let calls = 0;
    await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [] } });
    const result = await dispatch(f, admission, async () => { calls++; return response(f, admission); });
    expect(result.status).not.toBe("PROPOSAL_STORED_NOT_AUTHORIZED"); expect(calls).toBe(0);
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("refuses dispatch when the account USD cap is withdrawn after admission", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); let calls = 0;
    const result = await dispatch(f, admission, async () => { calls++; return response(f, admission); },
      { ...controls(f), ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "1" });
    expect(result.status).not.toBe("PROPOSAL_STORED_NOT_AUTHORIZED"); expect(calls).toBe(0);
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("drops a proposal if permission changes during model latency and never retries", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); let calls = 0;
    const result = await dispatch(f, admission, async () => {
      calls++;
      await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked" } });
      return response(f, admission);
    });
    expect(result.status).toBe("UNCERTAIN"); expect(calls).toBe(1);
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: admission.childOperationId } })).status).toBe("uncertain");
    await dispatch(f, admission, async () => { calls++; return response(f, admission); });
    expect(calls).toBe(1);
  });
  it("does not accept a proposal when the USD ceiling is removed during latency", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); const env = controls(f); let calls = 0;
    const result = await dispatch(f, admission, async () => {
      calls++;
      delete env.ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS;
      return response(f, admission);
    }, env);
    expect(result.status).toBe("UNCERTAIN"); expect(calls).toBe(1);
    const child = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: admission.childOperationId } });
    expect(child.status).toBe("uncertain");
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("keeps unknown callback outcomes and both reservations, without business writes", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); let calls = 0;
    const result = await dispatch(f, admission, async () => { calls++; throw new Error("synthetic unknown callback outcome"); });
    expect(result.status).toBe("UNCERTAIN"); expect(calls).toBe(1);
    const child = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: admission.childOperationId } });
    expect(child.status).toBe("uncertain"); expect(child.reservedCadMicros).toBe(admission.budgetPolicy.reservationCadMicros);
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).status).toBe("held");
  });
  it("records a pre-dispatch expired claim without a callback, refund or second claim", async () => {
    const f = await personalModelFixture(); const admission = await admitted(f); let calls = 0;
    await prisma.aiOperation.update({ where: { id: admission.claim.operationId }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    expect((await recoverExpiredPersonalIntentAttempts()).status).toBe("DISABLED");
    const recovered = await recoverExpiredPersonalIntentAttempts({ enabled: true, batchSize: 25 });
    expect(recovered.recovered).toBeGreaterThanOrEqual(1);
    const child = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: admission.childOperationId } });
    expect(child.status).toBe("uncertain"); expect(child.externalTransportPerformed).toBe(false);
    await dispatch(f, admission, async () => { calls++; return response(f, admission); });
    expect(calls).toBe(0);
    expect((await prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).status).toBe("held");
    expect((await admitPersonalIntent(input(f), controls(f))).status).toBe("REFUSED");
  });
});
