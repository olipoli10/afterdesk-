import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { admitPersonalIntent, type PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { prepareCalendarSmsConfirmationInTransaction, markCalendarSmsConfirmationWaitingInTransaction,
  consumeCalendarSmsConfirmationInTransaction, expireCalendarSmsConfirmationsInTransaction } from "@/server/personal-assistant/calendar-sms-confirmation-store";
import { claimPersonalCalendarWriteInTransaction } from "@/server/personal-assistant/calendar-actions";
import { approvePersonalOutbound, preparePersonalOutbound, sendAutomaticCalendarConfirmationSummary } from "@/server/personal-assistant/outbox";
import { prepareCalendarConfirmationOutboundInTransaction } from "@/server/personal-assistant/calendar-confirmation-bridge";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { disconnectPersonalPhone } from "@/server/personal-assistant/phone-pairing";
import { selectPersonalAutomaticOutboundCandidates } from "@/server/personal-assistant/outbound-queue";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const span = (body: string, quote: string) => ({ start: body.indexOf(quote), end: body.indexOf(quote) + quote.length, quote });
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
async function bridgeControls(f: Fixture): Promise<NodeJS.ProcessEnv> {
  // Explicit synthetic standing self-SMS consent. No OAuth, pairing SMS or real key.
  await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: f.smsAccountId, capability: "personal_sms_send", status: "active", grantedAt: f.now,
    requestedScopes: ["personal_sms_send"], grantedScopes: ["personal_sms_send"] } });
  return { ...f.env, ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
    ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true",
    TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`, TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token",
    ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status",
    ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date(Date.now() - 1000).toISOString(), ENDVERA_TWILIO_RATE_REVIEW_REF: "SYNTHETIC_RATE_ONLY",
    ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10", ENDVERA_VOICE_MINUTE_RESERVE_CAD: "0.50" };
}
async function stored(prepared: Prepared) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ id: string; phase: string; namespace: string; calendarOperationId: string;
    prepared: { phrase: string; nonReuseKey: string; binding: { calendar: { requestHash: string } } }; expiresAt: Date; acceptedAt: Date | null; failedAttempts: number }>>(
    'SELECT * FROM "PersonalCalendarSmsConfirmation" WHERE id=$1', prepared.challengeId);
  return row;
}
async function syntheticAcceptedBridge(f: Fixture, prepared: Prepared) {
  requirePersonalDisposableDatabase();
  const request = { to: f.from, from: f.env.TWILIO_PHONE_NUMBER!, text: prepared.summary, sourceOperationId: f.sourceOperationId };
  // Fixture ONLY: inserts a synthetic accepted row for isolated store tests.
  // The actual bridge/outbox path is exercised separately above; this shortcut
  // proves durable comparisons, not provider acceptance or delivery.
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
describe("durable OFF SMS calendar confirmation on disposable PostgreSQL", () => {
  it.each(["expired", "revoked", "identity-revised"] as const)("selects the newer ordinary reply ahead of a retained %s bridge without rewriting either", async invalidation => {
    const f = await fixture(), prepared = await f.prepare(true, invalidation === "expired" ? 5000 : undefined);
    const env: NodeJS.ProcessEnv = { ...await bridgeControls(f), ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" };
    const bridge = await prisma.$transaction(tx => prepareCalendarConfirmationOutboundInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId }, env), { isolationLevel: "Serializable" });
    if (bridge.status !== "PREPARED_UNSENT") throw new Error("SYNTHETIC_BRIDGE_REQUIRED");
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    const request = { to: f.from, from: env.TWILIO_PHONE_NUMBER!, text: (source.result as { reply: string }).reply, sourceOperationId: source.id };
    const ordinary = await prisma.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId, connectorAccountId: f.smsAccountId,
      kind: "sms_outbound", status: "pending", idempotencyKey: `reply:${source.id}`, request, requestHash: sha(JSON.stringify(request)) } });
    const selection = () => selectPersonalAutomaticOutboundCandidates({ enabled: true, limit: 1, includeConfirmations: true }, env);
    expect(await selection()).toMatchObject({ status: "CANDIDATES_NOT_AUTHORIZED", executionAuthorized: false, candidates: [{ id: bridge.operationId }] });
    if (invalidation === "expired") await prisma.$queryRawUnsafe("SELECT pg_sleep(5.05)::text");
    else if (invalidation === "revoked") await prisma.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id },
      data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    else await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { updatedAt: new Date(Date.now() + 1) } });
    const before = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: bridge.operationId } });
    const challenge = await stored(prepared);
    expect(await selection()).toMatchObject({ candidates: [{ id: ordinary.id }] });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: bridge.operationId } })).toEqual(before);
    expect(await stored(prepared)).toEqual(challenge);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: ordinary.id } })).toEqual(ordinary);
  });
  it("is OFF without explicit switch and creates no records", async () => {
    expect(await prisma.$transaction(tx => prepareCalendarSmsConfirmationInTransaction(tx, {} as never, { NODE_ENV: "test" }))).toEqual({ status: "DISABLED", executionAuthorized: false });
  });
  it("prepares an exact pending bridge through the real lower authority without granting approval", async () => {
    const f = await fixture(), prepared = await f.prepare(), env = await bridgeControls(f);
    const input = { actor: f.actor, challengeId: prepared.challengeId };
    const result = await prisma.$transaction(tx => prepareCalendarConfirmationOutboundInTransaction(tx, input, env), { isolationLevel: "Serializable" });
    if (result.status !== "PREPARED_UNSENT") throw new Error("SYNTHETIC_BRIDGE_REQUIRED");
    expect(result.executionAuthorized).toBe(false);
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: result.operationId } });
    expect(row).toMatchObject({ status: "pending", attempts: 0, result: null, budgetId: null, reservedCadMicros: null, externalTransportPerformed: false });
    expect(row.request).toEqual({ to: f.from, from: env.TWILIO_PHONE_NUMBER, text: prepared.summary, sourceOperationId: f.sourceOperationId });
    expect(await prisma.$transaction(tx => prepareCalendarConfirmationOutboundInTransaction(tx, input, env), { isolationLevel: "Serializable" })).toMatchObject({ operationId: row.id, replayed: true });
    await expect(preparePersonalOutbound({ ...f.actor, kind: "sms_outbound", to: f.from, text: prepared.summary, requestId: randomUUID() }, env)).rejects.toThrow("CONFIRMATION_RESERVED_OUTBOUND_TEXT");
    expect((await stored(prepared)).phase).toBe("PREPARED");
  });
  it("uses actual outbox gates with an injected synthetic HTTP response and commits accepted bridge plus WAITING atomically", async () => {
    const f = await fixture(), prepared = await f.prepare(), env = await bridgeControls(f);
    const bridge = await prisma.$transaction(tx => prepareCalendarConfirmationOutboundInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId }, env), { isolationLevel: "Serializable" });
    if (bridge.status !== "PREPARED_UNSENT") throw new Error("SYNTHETIC_BRIDGE_REQUIRED");
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      return Response.json({ sid, account_sid: f.accountSid, from: body.get("From"), to: body.get("To"), status: "queued" });
    });
    const result = await sendAutomaticCalendarConfirmationSummary(bridge.operationId, env, transport);
    expect(result).toMatchObject({ providerSid: sid, delivered: false }); expect(transport).toHaveBeenCalledOnce();
    const outbound = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: bridge.operationId } });
    expect(outbound).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null });
    expect(outbound.result).toMatchObject({ acceptedByProvider: true, approvalHash: bridge.requestHash, providerSid: sid });
    expect((await stored(prepared)).phase).toBe("WAITING");
    await expect(sendAutomaticCalendarConfirmationSummary(bridge.operationId, env, transport)).rejects.toThrow("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
    expect(transport).toHaveBeenCalledOnce();
    // Injected HTTP is local test evidence, not provider acceptance/delivery proof.
  });
  it("creates one non-executable summary, permanently registered phrase and exact source review atomically", async () => {
    const f = await fixture(), prepared = await f.prepare(), row = await stored(prepared);
    expect(row.phase).toBe("PREPARED"); expect(prepared.executionAuthorized).toBe(false); expect(prepared.transportReady).toBe(false);
    const summary = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.summaryOperationId } });
    expect(summary).toMatchObject({ kind: "calendar_confirmation_summary", status: "pending", attempts: 0, externalTransportPerformed: false });
    await expect(approvePersonalOutbound({ ...f.actor, operationId: summary.id, expectedRequestHash: summary.requestHash }, f.env)).rejects.toThrow("APPROVAL_REFUSED_OR_ALREADY_USED");
    const [nonce] = await prisma.$queryRawUnsafe<Array<{ nonReuseKey: string }>>('SELECT "nonReuseKey" FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1', row.prepared.nonReuseKey);
    expect(nonce.nonReuseKey).toBe(row.prepared.nonReuseKey);
  });
  it("rolls back challenge, summary and nonce if caller omits final source CAS", async () => {
    const f = await fixture(); await expect(f.prepare(false)).rejects.toThrow();
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "PersonalCalendarSmsConfirmation" WHERE "workspaceId"=$1', f.workspaceId);
    expect(count).toBe(0n); expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_confirmation_summary" } })).toBe(0);
  });
  it("refuses waiting without a durable source-bound accepted outbox bridge", async () => {
    const f = await fixture(), prepared = await f.prepare();
    await expect(prisma.$transaction(tx => markCalendarSmsConfirmationWaitingInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, bridgeOutboundOperationId: prepared.summaryOperationId }, f.env))).rejects.toThrow("CONFIRMATION_DURABLE_OUTBOX_BRIDGE_REQUIRED");
    expect((await stored(prepared)).phase).toBe("PREPARED");
  });
  it("keeps nonces immutable and permanent independently of terminal challenges", async () => {
    const f = await fixture(), prepared = await f.prepare(), row = await stored(prepared);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1', row.prepared.nonReuseKey)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('UPDATE "PersonalCalendarSmsConfirmationNonce" SET namespace=$2 WHERE "nonReuseKey"=$1', row.prepared.nonReuseKey, "a".repeat(64))).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE "PersonalCalendarSmsConfirmationNonce" CASCADE')).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('UPDATE "PersonalCalendarSmsConfirmation" SET "expiresAt"="expiresAt"+interval \'1 minute\' WHERE id=$1', prepared.challengeId)).rejects.toThrow();
  });
  it("rejects a second orphan summary naming an already bound challenge", async () => {
    const f = await fixture(), prepared = await f.prepare();
    const summary = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.summaryOperationId } });
    await expect(prisma.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId,
      connectorAccountId: f.smsAccountId, kind: "calendar_confirmation_summary", status: "pending", request: summary.request!, requestHash: summary.requestHash,
      idempotencyKey: `orphan-summary:${randomUUID()}` } })).rejects.toThrow();
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_confirmation_summary" } })).toBe(1);
  });
  it("prevents post-commit source/draft evidence replacement without preventing revocation", async () => {
    const f = await fixture(), prepared = await f.prepare(), row = await stored(prepared);
    await expect(prisma.personalAssistantOperation.update({ where: { id: f.sourceOperationId }, data: { requestHash: "f".repeat(64) } })).rejects.toThrow();
    await expect(prisma.personalAssistantOperation.update({ where: { id: f.sourceOperationId }, data: { result: { personalModelReview: {} } } })).rejects.toThrow();
    await expect(prisma.personalAssistantOperation.update({ where: { id: row.calendarOperationId }, data: { requestHash: "f".repeat(64) } })).rejects.toThrow();
    await prisma.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked", permissions: [] } });
    expect((await stored(prepared)).phase).toBe("PREPARED");
  });
  it("declares same-owner composite FKs for every operation binding and permanent active uniqueness", async () => {
    // Schema evidence supplements the cross-owner refusal and live concurrent
    // consumption tests; it is not presented as provider/authorization proof.
    const constraints = await prisma.$queryRawUnsafe<Array<{ name: string; definition: string }>>(`SELECT conname AS name,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='"PersonalCalendarSmsConfirmation"'::regclass AND contype='f'`);
    const operations = constraints.filter(row => row.definition.includes('REFERENCES "PersonalAssistantOperation"'));
    expect(operations).toHaveLength(6);
    expect(operations.every(row => row.definition.includes('"workspaceId", "userId"') && row.definition.includes('id, "workspaceId", "createdByUserId"'))).toBe(true);
    const [index] = await prisma.$queryRawUnsafe<Array<{ definition: string }>>(`SELECT pg_get_indexdef(indexrelid) AS definition FROM pg_index
      WHERE indexrelid='"calendar_confirmation_one_active_visible_pair"'::regclass`);
    expect(index.definition).toContain("UNIQUE INDEX"); expect(index.definition).toContain("PREPARED"); expect(index.definition).toContain("WAITING"); expect(index.definition).toContain("CONSUMED");
    expect(index.definition).not.toContain("now()");
  });
  it("disconnects the actual phone authority without rewriting its immutable pending confirmation summary", async () => {
    const f = await fixture(), prepared = await f.prepare();
    const summary = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.summaryOperationId } });
    expect(await disconnectPersonalPhone(f.userId, f.workspaceId)).toEqual({ disconnected: true });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: summary.id } })).toEqual(summary);
    expect(await prisma.constructionCommunicationIdentity.findUniqueOrThrow({ where: { id: f.identityId } })).toMatchObject({ verified: false, status: "revoked", permissions: [] });
    expect(await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: f.smsAccountId } })).toMatchObject({ status: "revoked", credentialRef: null, externalAccountKeyHash: null });
    const grants = await prisma.constructionConnectorGrant.findMany({ where: { connectorAccountId: f.smsAccountId } });
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) expect(grant).toMatchObject({ status: "revoked", grantedScopes: [] });
    expect((await stored(prepared)).phase).toBe("PREPARED");
  });
  it("consumes the exact verified phrase and calendar claim once in one transaction without execution", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    const sourceClaim = await confirmation(f, (await stored(prepared)).prepared.phrase);
    const result = await prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env), { isolationLevel: "Serializable" });
    expect(result).toMatchObject({ status: "CONSUMED_NOT_EXECUTED", executionAuthorized: false, calendarWriteConfirmed: false });
    expect((await stored(prepared)).phase).toBe("CONSUMED");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: sourceClaim.operationId } })).toMatchObject({ status: "completed", result: { calendarWriteConfirmed: false } });
    if (result.status !== "CONSUMED_NOT_EXECUTED") throw new Error("SYNTHETIC_EXPECTED_CLAIM");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: result.calendarClaim.operationId } })).toMatchObject({ status: "processing", attempts: 1, externalTransportPerformed: false });
    await expect(prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env))).rejects.toThrow();
  });
  it("counts a wrong phrase once per completed source, never a write or replay", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    const sourceClaim = await confirmation(f, "CONFIRME ENDVERA AGENDA oui");
    expect(await prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env), { isolationLevel: "Serializable" })).toMatchObject({ status: "REFUSED", executionAuthorized: false });
    expect((await stored(prepared)).failedAttempts).toBe(1);
    await expect(prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env))).rejects.toThrow();
    expect((await stored(prepared)).failedAttempts).toBe(1);
  });
  it("rejects a queued confirmation received before the summary was durably accepted", async () => {
    const f = await fixture(), prepared = await f.prepare();
    const sourceClaim = await confirmation(f, (await stored(prepared)).prepared.phrase);
    await prisma.$queryRawUnsafe('SELECT pg_sleep(0.005)::text');
    await syntheticAcceptedBridge(f, prepared);
    const received = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: sourceClaim.operationId } });
    expect(received.createdAt.getTime()).toBeLessThan((await stored(prepared)).acceptedAt!.getTime());
    await expect(prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env))).rejects.toThrow("CONFIRMATION_RECEIVED_BEFORE_SUMMARY");
    expect((await stored(prepared)).phase).toBe("WAITING");
  });
  it("allows only one of two concurrent exact SMS sources to claim the calendar", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    const phrase = (await stored(prepared)).prepared.phrase;
    // Setup is sequential; the actual consumption claims below still race.
    // PGlite setup contention is not evidence of native PostgreSQL concurrency.
    const sources = [await confirmation(f, phrase), await confirmation(f, phrase)];
    const results = await Promise.allSettled(sources.map(confirmationSourceClaim => prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx,
      { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim }, f.env), { isolationLevel: "Serializable" })));
    expect(results.filter(result => result.status === "fulfilled" && result.value.status === "CONSUMED_NOT_EXECUTED")).toHaveLength(1);
    const challenge = await stored(prepared);
    expect(challenge.phase).toBe("CONSUMED");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: challenge.calendarOperationId } })).toMatchObject({ status: "processing", attempts: 1, externalTransportPerformed: false });
    expect(await prisma.personalAssistantOperation.count({ where: { id: { in: sources.map(source => source.operationId) }, status: "completed" } })).toBe(1);
  });
  it("serializes app approval against SMS consumption without two calendar claims", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    const row = await stored(prepared), source = await confirmation(f, row.prepared.phrase);
    const results = await Promise.allSettled([
      prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: source }, f.env), { isolationLevel: "Serializable" }),
      prisma.$transaction(tx => claimPersonalCalendarWriteInTransaction(tx, { ...f.actor, operationId: row.calendarOperationId, expectedRequestHash: row.prepared.binding.calendar.requestHash }, f.env), { isolationLevel: "Serializable" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: row.calendarOperationId } })).toMatchObject({ status: "processing", attempts: 1, externalTransportPerformed: false });
  });
  it("expires by the DB clock without deleting or resetting the permanent phrase registry", async () => {
    const f = await fixture(), prepared = await f.prepare(true, 1000), row = await stored(prepared);
    await new Promise(resolve => setTimeout(resolve, 1050));
    expect(await prisma.$transaction(tx => expireCalendarSmsConfirmationsInTransaction(tx, f.actor, f.env), { isolationLevel: "Serializable" })).toMatchObject({ status: "EXPIRED_BOOKKEEPING_ONLY", count: 1 });
    expect((await stored(prepared)).phase).toBe("EXPIRED");
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1', row.prepared.nonReuseKey);
    expect(count).toBe(1n);
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "PersonalCalendarSmsConfirmationNonce" ("nonReuseKey",namespace,"phraseHash")
      SELECT $2,namespace,"phraseHash" FROM "PersonalCalendarSmsConfirmationNonce" WHERE "nonReuseKey"=$1`, row.prepared.nonReuseKey, sha(randomUUID()))).rejects.toThrow();
  });
  it("permanently closes after five distinct wrong confirmation sources", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    for (let n = 0; n < 5; n++) {
      const source = await confirmation(f, `CONFIRME ENDVERA AGENDA erreur ${n}`);
      expect(await prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: source }, f.env), { isolationLevel: "Serializable" })).toMatchObject({ status: "REFUSED" });
    }
    expect(await stored(prepared)).toMatchObject({ phase: "REFUSED", failedAttempts: 5 });
    const source = await confirmation(f, (await stored(prepared)).prepared.phrase);
    await expect(prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: source }, f.env))).rejects.toThrow("CONFIRMATION_NOT_WAITING");
  });
  it("refuses another owner and independently changed Google grant epoch", async () => {
    const f = await fixture(), prepared = await f.prepare(); await syntheticAcceptedBridge(f, prepared);
    const sourceClaim = await confirmation(f, (await stored(prepared)).prepared.phrase);
    await expect(prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: { ...f.actor, userId: "different-owner" }, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env))).rejects.toThrow("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
    await prisma.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id }, data: { stateVersion: { increment: 1 } } });
    expect(await prisma.$transaction(tx => consumeCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, challengeId: prepared.challengeId, confirmationSourceClaim: sourceClaim }, f.env), { isolationLevel: "Serializable" })).toMatchObject({ status: "REFUSED" });
    expect((await stored(prepared)).phase).toBe("WAITING");
  });
});
