import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { admitPersonalIntent, type PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { prepareCalendarSmsConfirmationInTransaction, markCalendarSmsConfirmationWaitingInTransaction, consumeCalendarSmsConfirmationInTransaction } from "@/server/personal-assistant/calendar-sms-confirmation-store";
import { maintainCalendarSmsConfirmations, maintainCalendarSmsConfirmationsInTransaction } from "@/server/personal-assistant/calendar-confirmation-maintenance";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const span = (body: string, quote: string) => ({ start: body.indexOf(quote), end: body.indexOf(quote) + quote.length, quote });
// Canonical synthetic fixture copied from confirmation.postgres.test.ts without
// importing that test module (which would register/run its separate suite).
// All model transport is injected SYNTHETIC_LOCAL; accepted SMS and terminal
// calendar rows below are explicitly test-created durable states, not live proof.
async function fixture() {
  requirePersonalDisposableDatabase();
  const f = await personalModelFixture("Ajoute Visite Laval le 2026-09-12 à 14:00 jusqu’à 15:00.");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "20000000",
    TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
    ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example" };
  const google = await prisma.constructionConnectorAccount.create({ data: { workspaceId: f.workspaceId, provider: "google_calendar", createdByUserId: f.userId,
    status: "prepared", grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], externalAccountKeyHash: "a".repeat(64),
    grants: { create: { capability: "calendar_write", status: "active", grantedAt: f.now, requestedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] } } }, include: { grants: true } });
  // Opaque synthetic material only. No credential loader, decryption or network is called.
  const credential = await prisma.constructionConnectorCredential.create({ data: { workspaceId: f.workspaceId, connectorAccountId: google.id, ciphertext: "synthetic-never-decrypted" } });
  await prisma.constructionConnectorAccount.update({ where: { id: google.id }, data: { status: "connected", connectedAt: f.now, credentialRef: credential.id } });
  const sourceClaim = { operationId: f.sourceOperationId, userId: f.userId, workspaceId: f.workspaceId, attempt: 1 as const,
    leaseUntil: new Date(Date.now() + 60000).toISOString() };
  await prisma.personalAssistantOperation.update({ where: { id: f.sourceOperationId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(sourceClaim.leaseUntil) } });
  const envelope = { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_TEST_ONLY", reviewedAt: f.now.toISOString(), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 };
  const admitted = await admitPersonalIntent({ subject: f.subject, policyVersionId: f.policy.id, rateConfiguration: f.rate, pilotEnvelopeReview: envelope, enabled: true }, env);
  expect(admitted.status).toBe("ADMITTED_NOT_DISPATCHED");
  const admission = admitted as PersonalIntentAdmission;
  const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: f.rate.model, providerEndpointSlug: f.rate.providerEndpoint,
    maxOutputTokens: f.rate.maxOutputTokens, timeoutMs: 1000, transportMode: "SYNTHETIC_LOCAL", transport: async () => ({ httpStatus: 200, body: JSON.stringify({
      id: "synthetic-response", model: f.rate.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({
        schemaVersion: 1, requestFingerprint: admission.source.input.requestFingerprint, actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [],
          title: span(f.body, "Visite Laval"), starts: span(f.body, "2026-09-12 à 14:00"), ends: span(f.body, "15:00") }] }) } }] }) }) });
  expect((await dispatchPersonalIntent({ admission, adapter, currentRateConfiguration: f.rate, currentPilotEnvelopeReview: envelope,
    abortSignal: new AbortController().signal, enabled: true, transportMode: "SYNTHETIC_LOCAL" }, env)).status).toBe("PROPOSAL_STORED_NOT_AUTHORIZED");
  const actor = { userId: f.userId, workspaceId: f.workspaceId };
  async function prepare(finalize = true, ttlMs?: number) {
    return prisma.$transaction(async tx => {
      const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, ...actor, sourceOperationId: f.sourceOperationId, modelChildOperationId: admission.childOperationId }, env);
      if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED" || !review.actions[0].operationId) throw new Error("SYNTHETIC_REVIEW_REQUIRED");
      const prepared = await prepareCalendarSmsConfirmationInTransaction(tx, { actor, sourceClaim, modelChildOperationId: admission.childOperationId,
        reviewActionId: "event", calendarOperationId: review.actions[0].operationId, ttlMs }, env);
      if (prepared.status !== "PREPARED_DURABLE_OFF") throw new Error("SYNTHETIC_PREPARATION_REQUIRED");
      if (finalize) await tx.personalAssistantOperation.update({ where: { id: f.sourceOperationId }, data: { status: "completed", leaseUntil: null,
        result: { source: "MODEL_REVIEW_ONLY", reply: "Un rendez-vous attend sa vérification. Aucun ajout n’est confirmé.", personalModelReview: prepared.requiredSourceReview } } });
      return prepared;
    }, { isolationLevel: "Serializable", timeout: 10000 });
  }
  return { ...f, env, actor, google, sourceClaim, prepare };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Prepared = Awaited<ReturnType<Fixture["prepare"]>>;
async function stored(prepared: Prepared) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ id: string; phase: string; namespace: string; calendarOperationId: string;
    prepared: { phrase: string; nonReuseKey: string; binding: { calendar: { requestHash: string } } }; expiresAt: Date; acceptedAt: Date | null; failedAttempts: number }>>(
    'SELECT * FROM "PersonalCalendarSmsConfirmation" WHERE id=$1', prepared.challengeId);
  return row;
}
async function syntheticAcceptedBridge(f: Fixture, prepared: Prepared) {
  requirePersonalDisposableDatabase();
  const request = { to: f.from, from: f.env.TWILIO_PHONE_NUMBER!, text: prepared.summary, sourceOperationId: f.sourceOperationId };
  // Fixture ONLY: a test-created accepted row, not the real bridge sender.
  // This proves bookkeeping comparisons, never provider acceptance or delivery.
  const row = await prisma.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId,
    connectorAccountId: f.smsAccountId, kind: "sms_outbound", status: "completed", attempts: 1,
    idempotencyKey: `calendar-confirmation:${prepared.challengeId}`, request, requestHash: sha(JSON.stringify(request)),
    result: { providerSid: `SM${randomUUID().replaceAll("-", "")}`, acceptedByProvider: true, approvalHash: sha(JSON.stringify(request)), delivered: false } } });
  await prisma.$transaction(tx => markCalendarSmsConfirmationWaitingInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, bridgeOutboundOperationId: row.id }, f.env), { isolationLevel: "Serializable" });
  return row;
}
async function confirmation(f: Fixture, body: string) {
  const request = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from, to: f.env.TWILIO_PHONE_NUMBER!, body };
  const source = await enqueuePersonalSms({ ...request, contentHash: sha(JSON.stringify(request)) });
  const claim = { operationId: source.operationId, workspaceId: f.workspaceId, userId: f.userId, attempt: 1 as const, leaseUntil: new Date(Date.now() + 30000).toISOString() };
  await prisma.personalAssistantOperation.update({ where: { id: claim.operationId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil) } });
  return claim;
}

const maintenanceEnv = (f: Fixture) => ({ ...f.env, ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED: "true" });
async function snapshotNonce(prepared: Prepared) {
  const row = await stored(prepared);
  return prisma.$queryRawUnsafe<Array<{ nonReuseKey: string; namespace: string; phraseHash: string; createdAt: Date }>>(
    'SELECT * FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1', row.prepared.nonReuseKey);
}
async function consumedFixture() {
  const f = await fixture(), prepared = await f.prepare();
  await syntheticAcceptedBridge(f, prepared);
  const claim = await confirmation(f, (await stored(prepared)).prepared.phrase);
  const consumed = await prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, {
    actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: claim,
  }, f.env), { isolationLevel: "Serializable", timeout: 10000 });
  if (consumed.status !== "CONSUMED_NOT_EXECUTED") throw new Error("SYNTHETIC_CONSUMED_CLAIM_REQUIRED");
  return { f, prepared, consumed };
}

describe("actor-scoped confirmation maintenance on disposable PostgreSQL", () => {
  it("expires PREPARED and WAITING by DB time without touching another owner, summary or permanent nonce", async () => {
    const first = await fixture(), prepared = await first.prepare(true, 3000);
    const second = await fixture(), waiting = await second.prepare(true, 3000);
    await syntheticAcceptedBridge(second, waiting);
    const firstNonce = await snapshotNonce(prepared), secondNonce = await snapshotNonce(waiting);
    const summary = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.summaryOperationId } });
    // Test-only local DB wait, no host clock substitution or immutable TTL rewrite.
    await prisma.$queryRawUnsafe("SELECT pg_sleep(3.05)::text");
    const result = await maintainCalendarSmsConfirmations({ actor: first.actor, batchSize: 25 }, maintenanceEnv(first));
    expect(result).toMatchObject({ status: "CONFIRMATION_MAINTENANCE_COMMITTED", expired: 1, completed: 0, uncertain: 0 });
    expect((await stored(prepared)).phase).toBe("EXPIRED");
    expect((await stored(waiting)).phase).toBe("WAITING");
    expect(await snapshotNonce(prepared)).toEqual(firstNonce); expect(await snapshotNonce(waiting)).toEqual(secondNonce);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: summary.id } })).toEqual(summary);
    expect(await maintainCalendarSmsConfirmations({ actor: second.actor }, maintenanceEnv(second))).toMatchObject({ expired: 1 });
    expect((await stored(waiting)).phase).toBe("EXPIRED"); expect(await snapshotNonce(waiting)).toEqual(secondNonce);
    // The permanent phrase remains non-reusable even when active-namespace slot is released.
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "PersonalCalendarSmsConfirmationNonce" ("nonReuseKey",namespace,"phraseHash")
      SELECT $2,namespace,"phraseHash" FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1`,
      firstNonce[0].nonReuseKey, sha(randomUUID()))).rejects.toThrow();
  });
  it.each(["completed", "uncertain"] as const)("mirrors only durable calendar %s, retaining operation, full reserved budget and nonce after revocation", async terminal => {
    const { f, prepared, consumed } = await consumedFixture();
    const nonce = await snapshotNonce(prepared);
    const budget = await prisma.personalAssistantBudget.create({ data: { id: randomUUID(), ceilingCadMicros: 1000000n,
      reservedCadMicros: 250000n, expiresAt: new Date(Date.now() - 1000) } });
    // Explicit synthetic terminal DB state; the canonical Google executor is NOT called.
    await prisma.personalAssistantOperation.update({ where: { id: consumed.calendarClaim.operationId }, data: {
      status: terminal, leaseUntil: null, result: { syntheticDurableTerminalFixture: true, writeConfirmed: terminal === "completed" },
      budgetId: budget.id, reservedCadMicros: 250000n, externalTransportPerformed: false,
    } });
    const calendar = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: consumed.calendarClaim.operationId } });
    await prisma.constructionConnectorAccount.update({ where: { id: f.google.id }, data: { status: "revoked", revokedAt: new Date(),
      credentialRef: null, syncCursorRef: null, externalAccountKeyHash: null, grantedScopes: [], stateVersion: { increment: 1 } } });
    await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked", permissions: [] } });
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, maintenanceEnv(f))).toMatchObject({
      expired: 0, completed: terminal === "completed" ? 1 : 0, uncertain: terminal === "uncertain" ? 1 : 0,
      executionAuthorized: false, automaticRetry: false, budgetReservationReleased: false,
    });
    expect((await stored(prepared)).phase).toBe(terminal.toUpperCase());
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: calendar.id } })).toEqual(calendar);
    expect(await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: budget.id } })).toEqual(budget);
    expect(await snapshotNonce(prepared)).toEqual(nonce);
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, maintenanceEnv(f))).toMatchObject({ expired: 0, completed: 0, uncertain: 0 });
  });
  it("leaves nonterminal consumed calendar processing and returns no fabricated completion", async () => {
    const { f, prepared, consumed } = await consumedFixture();
    const calendar = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: consumed.calendarClaim.operationId } });
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, maintenanceEnv(f))).toMatchObject({ expired: 0, completed: 0, uncertain: 0 });
    expect((await stored(prepared)).phase).toBe("CONSUMED");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: calendar.id } })).toEqual(calendar);
  });
  it("requires both owner and workspace, and does not mutate a different actor's terminal challenge", async () => {
    const { f, prepared, consumed } = await consumedFixture();
    await prisma.personalAssistantOperation.update({ where: { id: consumed.calendarClaim.operationId }, data: { status: "uncertain", leaseUntil: null, result: { synthetic: true } } });
    for (const actor of [{ ...f.actor, userId: "different-owner" }, { ...f.actor, workspaceId: "different-workspace" }]) {
      expect(await maintainCalendarSmsConfirmations({ actor }, maintenanceEnv(f))).toMatchObject({ expired: 0, completed: 0, uncertain: 0 });
      expect((await stored(prepared)).phase).toBe("CONSUMED");
    }
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, maintenanceEnv(f))).toMatchObject({ uncertain: 1 });
  });
  it("rolls maintenance back with its caller transaction and does not claim a durable provisional result", async () => {
    const { f, prepared, consumed } = await consumedFixture();
    await prisma.personalAssistantOperation.update({ where: { id: consumed.calendarClaim.operationId }, data: { status: "uncertain", leaseUntil: null, result: { synthetic: true } } });
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT set_config('statement_timeout','2000',true),set_config('lock_timeout','250',true)");
      const result = await maintainCalendarSmsConfirmationsInTransaction(tx, { actor: f.actor, deadlineAt: Date.now() + 2000 }, maintenanceEnv(f));
      expect(result).toMatchObject({ status: "CONFIRMATION_MAINTENANCE_PREPARED_NOT_COMMITTED", uncertain: 1 });
      throw new Error("SYNTHETIC_OUTER_SOURCE_CAS_FAILURE");
    }, { isolationLevel: "Serializable", timeout: 2500 })).rejects.toThrow("SYNTHETIC_OUTER_SOURCE_CAS_FAILURE");
    expect((await stored(prepared)).phase).toBe("CONSUMED");
  });
  it("keeps future PREPARED untouched and OFF mode does no maintenance", async () => {
    const f = await fixture(), prepared = await f.prepare();
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, f.env)).toMatchObject({ status: "DISABLED" });
    expect(await maintainCalendarSmsConfirmations({ actor: f.actor }, maintenanceEnv(f))).toMatchObject({ expired: 0, completed: 0, uncertain: 0 });
    expect((await stored(prepared)).phase).toBe("PREPARED");
  });
});
