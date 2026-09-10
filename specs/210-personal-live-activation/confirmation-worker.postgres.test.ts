import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
const fakeGoogle = vi.hoisted(() => ({ transports: new Map<string, typeof fetch>(), claims: [] as unknown[] }));
// Replace only construction of the HTTP client. The real claim executor,
// credential decryption, source/Google authority checks and SQL CAS all remain.
vi.mock("@/server/personal-assistant/calendar-actions", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/personal-assistant/calendar-actions")>();
  return { ...actual, executeClaimedPersonalCalendarWrite: async (...args: Parameters<typeof actual.executeClaimedPersonalCalendarWrite>) => {
    const [claim, env, , context] = args;
    const transport = fakeGoogle.transports.get(claim.workspaceId);
    if (!transport) throw new Error("SYNTHETIC_GOOGLE_TRANSPORT_REQUIRED");
    fakeGoogle.claims.push(claim);
    const { GoogleCalendarClient } = await import("@/server/personal-assistant/google-client");
    return actual.executeClaimedPersonalCalendarWrite(claim, env, new GoogleCalendarClient(env!, transport, Date.now, context?.signal), context);
  } };
});
import { prisma } from "@/lib/db";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { admitPersonalIntent } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { processPersonalSms, type PersonalSmsExecutionContext } from "@/server/personal-assistant/sms-worker";
import { sendAutomaticCalendarConfirmationSummary } from "@/server/personal-assistant/outbox";
import { executeClaimedPersonalCalendarWrite, type PersonalCalendarWriteClaim } from "@/server/personal-assistant/calendar-actions";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { sealConnectorSecret } from "@/server/personal-assistant/credential-cipher";
import { isReservedCalendarConfirmationMessage } from "@/server/personal-assistant/calendar-confirmation-routing";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
afterEach(() => { fakeGoogle.transports.clear(); fakeGoogle.claims.length = 0; });
const span = (body: string, quote: string) => ({ start: body.indexOf(quote), end: body.indexOf(quote) + quote.length, quote });

/** No live configuration/credential reader is used. The actual source worker,
 * admission, deterministic consumer and durable bridge run against disposable
 * SQL; only model wire and outbound HTTP are replaced with explicit fakes. */
async function fixture() {
  requirePersonalDisposableDatabase();
  const f = await personalModelFixture("Ajoute Visite Laval le 2026-09-12 à 14:00 jusqu’à 15:00.");
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
    ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true",
    ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "20000000",
    ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true",
    TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_PHONE_NUMBER: "+15005550006", TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`,
    TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token",
    ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status",
    ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date(Date.now() - 1000).toISOString(), ENDVERA_TWILIO_RATE_REVIEW_REF: "SYNTHETIC_RATE_ONLY",
    ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10", ENDVERA_VOICE_MINUTE_RESERVE_CAD: "0.50",
    ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  };
  const google = await prisma.constructionConnectorAccount.create({ data: { workspaceId: f.workspaceId, provider: "google_calendar", createdByUserId: f.userId,
    status: "prepared", grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], externalAccountKeyHash: "a".repeat(64),
    grants: { create: { capability: "calendar_write", status: "active", grantedAt: f.now, requestedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] } } } });
  // The existing executor decrypts this synthetic, locally generated material;
  // no key or token is read from the operator environment or sent externally.
  const key = randomBytes(32), credentialId = randomUUID();
  env.ENDVERA_CONNECTOR_ENCRYPTION_KEY = key.toString("base64");
  const tokens = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: Date.now() + 3600000,
    scopes: [GOOGLE_CALENDAR_WRITE_SCOPE], subject: "synthetic-subject" };
  const credential = await prisma.constructionConnectorCredential.create({ data: { id: credentialId, workspaceId: f.workspaceId, connectorAccountId: google.id,
    ciphertext: sealConnectorSecret(JSON.stringify(tokens), JSON.stringify([f.workspaceId, google.id, `tokens:${credentialId}`]), key) } });
  await prisma.constructionConnectorAccount.update({ where: { id: google.id }, data: { status: "connected", connectedAt: f.now, credentialRef: credential.id } });
  await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: google.id, capability: "calendar_read", status: "active", grantedAt: f.now,
    requestedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] } });
  await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: f.smsAccountId, capability: "personal_sms_send", status: "active", grantedAt: f.now,
    requestedScopes: ["personal_sms_send"], grantedScopes: ["personal_sms_send"] } });
  const envelope = { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_TEST_ONLY", reviewedAt: f.now.toISOString(), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 };
  let wireCalls = 0, finalizations = 0;
  function model(tamperReview = false) {
    return vi.fn(async (context: PersonalSmsExecutionContext) => {
      expect(context.claim.operationId).toBe(f.sourceOperationId);
      const admission = await admitPersonalIntent({ subject: f.subject, policyVersionId: f.policy.id, rateConfiguration: f.rate, pilotEnvelopeReview: envelope, enabled: true }, env);
      if (admission.status !== "ADMITTED_NOT_DISPATCHED") throw new Error(`SYNTHETIC_ADMISSION_REQUIRED:${admission.status}`);
      const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: f.rate.model, providerEndpointSlug: f.rate.providerEndpoint,
        maxOutputTokens: f.rate.maxOutputTokens, timeoutMs: 1000, transportMode: "SYNTHETIC_LOCAL", transport: async () => {
          wireCalls++;
          return { httpStatus: 200, body: JSON.stringify({ id: "synthetic-response", model: f.rate.model,
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ schemaVersion: 1,
              requestFingerprint: admission.source.input.requestFingerprint, actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [],
                title: span(f.body, "Visite Laval"), starts: span(f.body, "2026-09-12 à 14:00"), ends: span(f.body, "15:00") }] }) } }] }) };
        } });
      const dispatched = await dispatchPersonalIntent({ admission, adapter, currentRateConfiguration: f.rate, currentPilotEnvelopeReview: envelope,
        abortSignal: context.signal, enabled: true, transportMode: "SYNTHETIC_LOCAL" }, env);
      if (dispatched.status !== "PROPOSAL_STORED_NOT_AUTHORIZED") throw new Error(`SYNTHETIC_PROPOSAL_REQUIRED:${dispatched.status}`);
      return { reply: "Une proposition attend sa vérification.", finalizeReview: async (tx: Parameters<typeof prepareStoredPersonalIntentReview>[0]) => {
        finalizations++;
        const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, userId: f.userId, workspaceId: f.workspaceId,
          sourceOperationId: f.sourceOperationId, modelChildOperationId: admission.childOperationId }, env);
        if (!tamperReview || review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED") return review;
        return { ...review, actions: review.actions.map(action => ({ ...action, requestHash: "f".repeat(64) })) };
      } };
    });
  }
  return { ...f, google, env, model, counts: () => ({ wireCalls, finalizations }) };
}

async function waitingFixture() {
  const f = await fixture(), model = f.model();
  expect(await processPersonalSms(f.sourceOperationId, f.env, { model })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
  const challenge = await prisma.personalCalendarSmsConfirmation.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
  const bridge = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { idempotencyKey: `calendar-confirmation:${challenge.id}` } });
  const sms = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = new URLSearchParams(String(init?.body));
    return Response.json({ sid: `SM${randomUUID().replaceAll("-", "")}`, account_sid: f.accountSid, from: body.get("From"), to: body.get("To"), status: "queued" });
  });
  await sendAutomaticCalendarConfirmationSummary(bridge.id, f.env, sms);
  expect(sms).toHaveBeenCalledOnce();
  const waiting = await prisma.personalCalendarSmsConfirmation.findUniqueOrThrow({ where: { id: challenge.id } });
  expect(waiting.phase).toBe("WAITING");
  const body = (waiting.prepared as { phrase: string }).phrase;
  const input = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from, to: f.env.TWILIO_PHONE_NUMBER!, body };
  const confirmation = await enqueuePersonalSms({ ...input, contentHash: createHash("sha256").update(JSON.stringify(input)).digest("hex") });
  return { ...f, model, challenge: waiting, confirmation };
}

describe("actual SMS source finalization and reserved confirmation bridge on disposable SQL", () => {
  it("commits one exact review/draft/challenge plus two distinct pending messages; only the dedicated fake-HTTP bridge reaches WAITING", async () => {
    const f = await fixture(), model = f.model();
    expect(await processPersonalSms(f.sourceOperationId, f.env, { model })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(f.counts()).toEqual({ wireCalls: 1, finalizations: 1 });
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(source).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null });
    const result = source.result as { reply: string; personalModelReview: { source: { text: string }; actions: Array<{ operationId: string }> } };
    expect(result.personalModelReview.source.text).toBe(f.body); expect(isReservedCalendarConfirmationMessage(result.reply)).toBe(false);
    const challenges = await prisma.personalCalendarSmsConfirmation.findMany({ where: { workspaceId: f.workspaceId } });
    expect(challenges).toHaveLength(1);
    const challenge = challenges[0];
    expect(challenge).toMatchObject({ phase: "PREPARED", sourceOperationId: source.id, calendarOperationId: result.personalModelReview.actions[0].operationId });
    const outbounds = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } });
    expect(outbounds).toHaveLength(2);
    const ordinary = outbounds.find(row => row.idempotencyKey === `reply:${source.id}`)!;
    const bridge = outbounds.find(row => row.idempotencyKey === `calendar-confirmation:${challenge.id}`)!;
    for (const row of outbounds) expect(row).toMatchObject({ status: "pending", attempts: 0, budgetId: null, result: null, externalTransportPerformed: false });
    expect(isReservedCalendarConfirmationMessage((ordinary.request as { text: string }).text)).toBe(false);
    expect(isReservedCalendarConfirmationMessage((bridge.request as { text: string }).text)).toBe(true);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(1);
    expect(await processPersonalSms(f.sourceOperationId, f.env, { model })).toEqual({ status: "NOT_PENDING" });
    expect(model).toHaveBeenCalledOnce();
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      return Response.json({ sid, account_sid: f.accountSid, from: body.get("From"), to: body.get("To"), status: "queued" });
    });
    expect(await sendAutomaticCalendarConfirmationSummary(bridge.id, f.env, transport)).toMatchObject({ providerSid: sid, delivered: false });
    expect(transport).toHaveBeenCalledOnce();
    expect(await prisma.personalCalendarSmsConfirmation.findUniqueOrThrow({ where: { id: challenge.id } })).toMatchObject({ phase: "WAITING", bridgeOutboundOperationId: bridge.id });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: challenge.calendarOperationId } })).toMatchObject({ status: "pending", attempts: 0, budgetId: null, externalTransportPerformed: false });
  });
  it("rolls back review/draft/challenge/messages together when the first consumer result drifts from deterministic replay", async () => {
    const f = await fixture();
    expect(await processPersonalSms(f.sourceOperationId, f.env, { model: f.model(true) })).toMatchObject({ status: "REVIEW_REQUIRED", recorded: true, automaticRetry: false });
    expect(f.counts()).toEqual({ wireCalls: 1, finalizations: 1 });
    expect(await prisma.personalCalendarSmsConfirmation.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: { in: ["calendar_write", "calendar_confirmation_summary", "sms_outbound"] } } })).toBe(0);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } })).toMatchObject({ status: "uncertain", attempts: 1, leaseUntil: null });
  });
  it("preserves app-only review with no summary or challenge when the worker bridge switch is OFF", async () => {
    const f = await fixture(); f.env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED = "false";
    expect(await processPersonalSms(f.sourceOperationId, f.env, { model: f.model() })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(await prisma.personalCalendarSmsConfirmation.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_confirmation_summary" } })).toBe(0);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write", status: "pending", attempts: 0 } })).toBe(1);
    const replies = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } });
    expect(replies).toHaveLength(1); expect(isReservedCalendarConfirmationMessage((replies[0].request as { text: string }).text)).toBe(false);
  });
  it.each(["confirmed", "unknown"] as const)("reloads exact confirmation SMS and runs the existing Google executor once with synthetic %s outcome", async outcome => {
    const f = await waitingFixture();
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(String(url)).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events?");
      expect(String(url)).toContain("sendUpdates=none"); expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)); expect(body.attendees).toBeUndefined();
      if (outcome === "unknown") throw new Error("synthetic connection lost after dispatch attempt");
      return Response.json({ ...body, status: "confirmed" });
    });
    fakeGoogle.transports.set(f.workspaceId, transport);
    const noModel = vi.fn().mockRejectedValue(new Error("CONFIRMATION_MUST_NOT_CALL_MODEL"));
    expect(await processPersonalSms(f.confirmation.operationId, f.env, { model: noModel })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(noModel).not.toHaveBeenCalled(); expect(transport).toHaveBeenCalledOnce(); expect(fakeGoogle.claims).toHaveLength(1);
    const expected = outcome === "confirmed" ? "completed" : "uncertain";
    const calendar = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.challenge.calendarOperationId } });
    expect(calendar).toMatchObject({ status: expected, attempts: 1, leaseUntil: null, externalTransportPerformed: true });
    expect(calendar.result).toMatchObject(outcome === "confirmed" ? { confirmed: true } : { writeConfirmed: false, automaticRetry: false });
    expect(await prisma.personalCalendarSmsConfirmation.findUniqueOrThrow({ where: { id: f.challenge.id } })).toMatchObject({ phase: expected.toUpperCase(), confirmationSourceOperationId: f.confirmation.operationId });
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.confirmation.operationId } });
    expect(source).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null });
    // The immutable receipt states consumption only, never retrospective success.
    expect(source.result).toMatchObject({ source: "CALENDAR_CONFIRMATION", calendarWriteConfirmed: false });
    expect(await processPersonalSms(f.confirmation.operationId, f.env, { model: noModel })).toEqual({ status: "NOT_PENDING" });
    await expect(executeClaimedPersonalCalendarWrite(fakeGoogle.claims[0] as PersonalCalendarWriteClaim, f.env)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(transport).toHaveBeenCalledOnce(); expect(noModel).not.toHaveBeenCalled();
    const repeated = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from,
      to: f.env.TWILIO_PHONE_NUMBER!, body: (f.challenge.prepared as { phrase: string }).phrase };
    const repeatedSource = await enqueuePersonalSms({ ...repeated, contentHash: createHash("sha256").update(JSON.stringify(repeated)).digest("hex") });
    expect(await processPersonalSms(repeatedSource.operationId, f.env, { model: noModel })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: repeatedSource.operationId } })).result).toMatchObject({ source: "CLARIFICATION" });
    expect(transport).toHaveBeenCalledOnce(); expect(noModel).not.toHaveBeenCalled();
    const ack = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { idempotencyKey: `reply:${source.id}` } });
    expect(ack.status).toBe("pending"); expect(isReservedCalendarConfirmationMessage((ack.request as { text: string }).text)).toBe(false);
  });
  it("refuses a received exact confirmation after Google write consent is revoked without any Google HTTP or model fallback", async () => {
    const f = await waitingFixture(), transport = vi.fn<typeof fetch>(); fakeGoogle.transports.set(f.workspaceId, transport);
    await prisma.constructionConnectorGrant.updateMany({ where: { connectorAccountId: f.google.id, capability: "calendar_write" },
      data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    const noModel = vi.fn().mockRejectedValue(new Error("CONFIRMATION_MUST_NOT_CALL_MODEL"));
    expect(await processPersonalSms(f.confirmation.operationId, f.env, { model: noModel })).toMatchObject({ status: "REVIEW_REQUIRED", recorded: true, automaticRetry: false });
    expect(transport).not.toHaveBeenCalled(); expect(noModel).not.toHaveBeenCalled(); expect(fakeGoogle.claims).toHaveLength(0);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.challenge.calendarOperationId } })).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false });
    expect(await prisma.personalCalendarSmsConfirmation.findUniqueOrThrow({ where: { id: f.challenge.id } })).toMatchObject({ phase: "WAITING", confirmationSourceOperationId: null });
    expect(await processPersonalSms(f.confirmation.operationId, f.env, { model: noModel })).toEqual({ status: "NOT_PENDING" });
  });
});
