import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { admitPersonalIntent, type PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { recoverExpiredPersonalIntentAttempts } from "@/server/model-gateway/personal-intent/recovery";
import { createOpenRouterPersonalIntentAdapter, type OpenRouterPersonalIntentTransport } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { GOOGLE_CALENDAR_READ_SCOPE, GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";

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
  async function reviewedSource(f: Fixture, actions: (admission: PersonalIntentAdmission) => unknown[], options: { rollback?: boolean; revoke?: boolean } = {}) {
    let calls = 0;
    // Intake already records provider-origin provenance even in this synthetic
    // fixture. Processing must add no outbound transport flags; never erase it.
    const transportBefore = await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } });
    const env = { ...controls(f), ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
      ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
      TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
      ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true" };
    const result = await processPersonalSms(f.sourceOperationId, env, { model: async context => {
      const admission = await admitted(f);
      const outcome = await dispatch(f, admission, async () => {
        calls++;
        return { httpStatus: 200, body: JSON.stringify({ id: "synthetic-request", model: f.rate.model,
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ schemaVersion: 1,
            requestFingerprint: admission.source.input.requestFingerprint, actions: actions(admission) }) } }] }) };
      });
      expect(outcome.status).toBe("PROPOSAL_STORED_NOT_AUTHORIZED");
      if (options.revoke) await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date() } });
      return { reply: "Synthetic pending review", finalizeReview: async tx => {
        const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, userId: context.claim.userId, workspaceId: context.claim.workspaceId,
          sourceOperationId: context.claim.operationId, modelChildOperationId: admission.childOperationId }, env);
        if (options.rollback) throw new Error("SYNTHETIC_FINAL_SOURCE_CAS_LOST");
        return review;
      } };
    } });
    expect(calls).toBe(1);
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } })).toBe(transportBefore);
    return { result, source };
  }
  function span(body: string, quote: string) { const start = body.indexOf(quote); return { start, end: start + quote.length, quote }; }
  async function calendarAccount(f: Fixture, capability: "calendar_read" | "calendar_write") {
    const scope = capability === "calendar_read" ? GOOGLE_CALENDAR_READ_SCOPE : GOOGLE_CALENDAR_WRITE_SCOPE;
    await prisma.constructionConnectorAccount.create({ data: { workspaceId: f.workspaceId, provider: "google_calendar", createdByUserId: f.userId,
      status: "connected", connectedAt: f.now, grantedScopes: [scope], credentialRef: "synthetic-never-resolved", externalAccountKeyHash: "a".repeat(64),
      grants: { create: { capability, status: "active", grantedAt: f.now, requestedScopes: [scope], grantedScopes: [scope] } } } });
  }
  it("finishes SMS source and stored review atomically, without pretending to fetch Google", async () => {
    const f = await personalModelFixture("Regarde mon calendrier pour demain."); await calendarAccount(f, "calendar_read");
    const { result, source } = await reviewedSource(f, () => [{ id: "calendar", kind: "READ_CALENDAR", dependsOn: [], period: span(f.body, "demain") }]);
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED"); expect(source.status).toBe("completed");
    expect(source.result).toMatchObject({ source: "MODEL_REVIEW_ONLY", replyDelivery: "PREPARED_UNSENT", personalModelReview: {
      source: { text: f.body }, actions: [{ status: "READ_REVIEW_ONLY" }] } });
    expect(JSON.stringify(source.result)).toContain("Google Agenda n’a pas été consulté");
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound", status: "pending" } })).toBe(1);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(0);
    const projection = await personalModelReviewsForOwner(f.userId, f.workspaceId);
    expect(projection.unavailableCount).toBe(0);
    expect(projection.reviews).toMatchObject([{ source: { text: f.body }, actions: [{ currentStatus: "NOT_READ" }] }]);
  });
  it("prepares one exact source-quoted Google draft and separate owner reply, with zero approval or transport", async () => {
    const f = await personalModelFixture("Ajoute Visite Laval le 2026-09-12 à 14:00 jusqu’à 15:00."); await calendarAccount(f, "calendar_write");
    const { result, source } = await reviewedSource(f, () => [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [],
      title: span(f.body, "Visite Laval"), starts: span(f.body, "2026-09-12 à 14:00"), ends: span(f.body, "15:00") }]);
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED");
    expect(source.result).toMatchObject({ personalModelReview: { actions: [{ status: "PREPARED_UNSENT", draft: { title: "Visite Laval", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z" } }] } });
    const drafts = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } });
    expect(drafts).toHaveLength(1); expect(drafts[0]).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false });
    const projection = await personalModelReviewsForOwner(f.userId, f.workspaceId);
    expect(projection.reviews).toMatchObject([{ actions: [{ operationId: drafts[0].id, currentStatus: "pending", nextDecision: "REVIEW_EXACT_DRAFT" }] }]);
  });
  it("prepares an exact self SMS only, without sending it", async () => {
    const f = await personalModelFixture("Texte-moi : Bonjour.");
    await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: f.smsAccountId, capability: "personal_sms_send", status: "active", grantedAt: f.now, requestedScopes: ["personal_sms_send"], grantedScopes: ["personal_sms_send"] } });
    const { result, source } = await reviewedSource(f, () => [{ id: "self", kind: "PREPARE_SELF_SMS", dependsOn: [], message: span(f.body, "Bonjour.") }]);
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED");
    expect(source.result).toMatchObject({ personalModelReview: { actions: [{ status: "PREPARED_UNSENT", draft: { to: f.from, text: "Bonjour." } }] } });
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound", status: "pending", attempts: 0 } })).toBe(2);
    const projection = await personalModelReviewsForOwner(f.userId, f.workspaceId);
    expect(projection.unavailableCount).toBe(0);
    expect(projection.reviews).toMatchObject([{ actions: [{ currentStatus: "pending", nextDecision: "REVIEW_EXACT_DRAFT", draft: { to: f.from, text: "Bonjour." } }] }]);
  });
  it.each([{ rollback: true }, { revoke: true }])("never leaves a draft or success reply when final source review refuses: %j", async options => {
    const f = await personalModelFixture("Texte-moi : Bonjour.");
    await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: f.smsAccountId, capability: "personal_sms_send", status: "active", grantedAt: f.now, requestedScopes: ["personal_sms_send"], grantedScopes: ["personal_sms_send"] } });
    const { result, source } = await reviewedSource(f, () => [{ id: "self", kind: "PREPARE_SELF_SMS", dependsOn: [], message: span(f.body, "Bonjour.") }], options);
    expect(result.status).toBe("REVIEW_REQUIRED"); expect(source.status).toBe("uncertain");
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } })).toBe(0);
  });
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
