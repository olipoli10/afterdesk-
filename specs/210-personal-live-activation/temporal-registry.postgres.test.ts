import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { admitPersonalIntent } from "@/server/model-gateway/personal-intent/admission";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { formatPersonalModelReviewMessage } from "@/server/personal-assistant/model-review-message";
import { prepareSmsTemporalClarificationInTransaction, markSmsTemporalClarificationAskedInTransaction, consumeSmsTemporalClarificationInTransaction } from "@/server/personal-assistant/sms-temporal-clarification-store";
import { prepareCalendarSmsConfirmationInTransaction } from "@/server/personal-assistant/calendar-sms-confirmation-store";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { approvePersonalOutbound, dispatchPersonalOutbound } from "@/server/personal-assistant/outbox";
import { inspectSmsTemporalQuestionPreparationInTransaction, attachSmsTemporalQuestionInTransaction } from "@/server/personal-assistant/sms-temporal-question-preparation";
import { processPersonalSms, type PersonalSmsSourceClaim } from "@/server/personal-assistant/sms-worker";
import { maintainSmsTemporalClarifications, maintainSmsTemporalClarificationsInTransaction } from "@/server/personal-assistant/sms-temporal-maintenance";
import { selectPersonalAutomaticOutboundCandidates } from "@/server/personal-assistant/outbound-queue";
import { processSmsTemporalReply } from "@/server/personal-assistant/sms-temporal-reply-worker";
import * as temporalReplyModule from "@/server/personal-assistant/sms-temporal-reply-worker";
import { loadCorrelatedPersonalReceiptSubject } from "@/server/model-gateway/personal-intent/correlated-receipt-subject";
import { prepareCorrelatedPersonalCalendarReview, prepareCorrelatedPersonalCalendarReviewInTransaction } from "@/server/model-gateway/personal-intent/correlated-calendar-review";
import { personalCalendarActions, preparePersonalCalendar, preparePersonalCalendarInTransaction, claimPersonalCalendarWriteInTransaction } from "@/server/personal-assistant/calendar-actions";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { loadCorrelatedPersonalCalendarReviewInTransaction, readCorrelatedPersonalCalendarReview } from "@/server/model-gateway/personal-intent/correlated-calendar-projection";
import { readCorrelatedPersonalCalendarReviewList } from "@/server/model-gateway/personal-intent/correlated-calendar-review-list";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const context = () => ({ deadlineAt: Date.now() + 15000 });
const txOptions = { isolationLevel: "Serializable" as const, timeout: 15000 };
const temporalBody = "Ajoute inspection demain à 2h, fin 15h.";
const calendarBody = "Ajoute inspection le 2026-09-12 à 14:00 jusqu’à 15:00.";
const span = (body: string, quote: string) => ({ quote, start: body.indexOf(quote), end: body.indexOf(quote) + quote.length });

// Native SQL fixture only. Real persisted gateway chain, but injected synthetic
// model adapter; fake credential records never decrypted. SMS acceptance below
// is explicitly TEST-CREATED database evidence, never a provider/delivery claim.
async function fixture(temporalOptions: { body?: string; start?: string; end?: string; missingEnd?: boolean } = {}) {
  const chosenTemporalBody = temporalOptions.body ?? temporalBody;
  const f = await personalModelFixture(chosenTemporalBody);
  const actor = { userId: f.userId, workspaceId: f.workspaceId };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true",
    ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "20000000",
    TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
    ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example" };
  const modelCredential = await prisma.constructionConnectorCredential.create({ data: { workspaceId: f.workspaceId, connectorAccountId: f.modelAccountId, ciphertext: "SYNTHETIC_NEVER_DECRYPTED" } });
  await prisma.constructionConnectorAccount.update({ where: { id: f.modelAccountId }, data: { credentialRef: modelCredential.id } });
  const google = await prisma.constructionConnectorAccount.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId, provider: "google_calendar", status: "prepared",
    externalAccountKeyHash: sha(`synthetic-google:${f.workspaceId}`),
    grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grants: { create: { capability: "calendar_write", status: "active", grantedAt: f.now,
      requestedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] } } }, include: { grants: true } });
  const credential = await prisma.constructionConnectorCredential.create({ data: { workspaceId: f.workspaceId, connectorAccountId: google.id, ciphertext: "SYNTHETIC_NEVER_DECRYPTED" } });
  await prisma.constructionConnectorAccount.update({ where: { id: google.id }, data: { status: "connected", credentialRef: credential.id } });
  async function candidate(kind: "temporal" | "calendar" = "temporal", original = false, existingClaim?: PersonalSmsSourceClaim) {
    const body = kind === "temporal" ? chosenTemporalBody : calendarBody;
    const wire = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from, to: env.TWILIO_PHONE_NUMBER!, body };
    const sourceId = original ? f.sourceOperationId : (await enqueuePersonalSms({ ...wire, contentHash: sha(JSON.stringify(wire)) })).operationId;
    const claim = existingClaim ? { ...existingClaim } : { ...actor, operationId: sourceId, attempt: 1 as const, leaseUntil: new Date(Date.now() + 60000).toISOString() };
    if (existingClaim) {
      expect(existingClaim).toMatchObject({ ...actor, operationId: sourceId, attempt: 1 });
      expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: sourceId } })).toMatchObject({ status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil) });
    } else await prisma.personalAssistantOperation.update({ where: { id: sourceId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil) } });
    const envelope = { authorityId: PERSONAL_MODEL_AUTHORITY, reviewRef: "SYNTHETIC_ONLY", reviewedAt: new Date().toISOString(), nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 };
    const admitted = await admitPersonalIntent({ subject: { ...f.subject, operationId: sourceId }, policyVersionId: f.policy.id, rateConfiguration: f.rate, pilotEnvelopeReview: envelope, enabled: true }, env);
    if (admitted.status !== "ADMITTED_NOT_DISPATCHED") throw new Error("SYNTHETIC_ADMISSION_REQUIRED");
    const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: f.rate.model, providerEndpointSlug: f.rate.providerEndpoint,
      maxOutputTokens: f.rate.maxOutputTokens, timeoutMs: 1000, transportMode: "SYNTHETIC_LOCAL", transport: async () => ({ httpStatus: 200, body: JSON.stringify({ id: "synthetic-response", model: f.rate.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ schemaVersion: 1, requestFingerprint: admitted.source.input.requestFingerprint,
          actions: kind === "temporal" && temporalOptions.missingEnd ? [{ id: "event", kind: "CLARIFY", dependsOn: [], reason: "MISSING_END_TIME" }]
            : [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span(body, "inspection"), starts: span(body, kind === "temporal" ? temporalOptions.start ?? "demain à 2h" : "2026-09-12 à 14:00"), ends: span(body, kind === "temporal" ? temporalOptions.end ?? "15h" : "15:00") }] }) } }] }) }) });
    expect((await dispatchPersonalIntent({ admission: admitted, adapter, currentRateConfiguration: f.rate, currentPilotEnvelopeReview: envelope,
      abortSignal: new AbortController().signal, enabled: true, transportMode: "SYNTHETIC_LOCAL" }, env)).status).toBe("PROPOSAL_STORED_NOT_AUTHORIZED");
    return { claim, childId: admitted.childOperationId, kind, body };
  }
  return { ...f, actor, env, google, modelCredential, candidate };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Candidate = Awaited<ReturnType<Fixture["candidate"]>>;
async function prepareIn(tx: Prisma.TransactionClient, f: Fixture, c: Candidate, options: { finalize?: boolean; ttlMs?: number; afterInsert?: (tx: Prisma.TransactionClient) => Promise<void> } = {}) {
  const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, ...f.actor, sourceOperationId: c.claim.operationId, modelChildOperationId: c.childId }, f.env);
  if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED") throw new Error("SYNTHETIC_REVIEW_REQUIRED");
  if (c.kind === "calendar") {
    const action = review.actions[0]; if (!action.operationId) throw new Error("SYNTHETIC_CALENDAR_DRAFT_REQUIRED");
    const prepared = await prepareCalendarSmsConfirmationInTransaction(tx, { actor: f.actor, sourceClaim: c.claim, modelChildOperationId: c.childId, reviewActionId: "event", calendarOperationId: action.operationId }, f.env);
    if (prepared.status !== "PREPARED_DURABLE_OFF") throw new Error("SYNTHETIC_CONFIRMATION_REQUIRED");
    await tx.personalAssistantOperation.update({ where: { id: c.claim.operationId }, data: { status: "completed", leaseUntil: null,
      result: { source: "MODEL_REVIEW_ONLY", reply: "Aucun rendez-vous exécuté.", personalModelReview: prepared.requiredSourceReview } } });
    return { kind: c.kind, id: prepared.challengeId, questionId: prepared.summaryOperationId };
  }
  expect(review.actions).toMatchObject([{ status: "CLARIFY" }]);
  const text = formatPersonalModelReviewMessage(review), request = { to: f.from, from: f.env.TWILIO_PHONE_NUMBER!, text, sourceOperationId: c.claim.operationId };
  const question = await tx.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId, connectorAccountId: f.smsAccountId,
    kind: "sms_outbound", status: "pending", attempts: 0, idempotencyKey: `reply:${c.claim.operationId}`, request, requestHash: sha(JSON.stringify(request)) } });
  const prepared = await prepareSmsTemporalClarificationInTransaction(tx, { actor: f.actor, sourceClaim: c.claim, modelChildOperationId: c.childId,
    reviewActionId: "event", questionOutboundOperationId: question.id, ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }) }, f.env, context());
  if (prepared.status !== "PREPARED_FOR_SOURCE_COMMIT") throw new Error("SYNTHETIC_TEMPORAL_PREPARATION_REQUIRED");
  expect(prepared.requiredSourceReview).toEqual(review);
  if (options.afterInsert) await options.afterInsert(tx);
  if (options.finalize !== false) {
    // Actual exact CAS. The migration separately verifies OLD live claim at the
    // transition and exact final review when constraints fire at COMMIT.
    const n = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$3::jsonb
      WHERE id=$1 AND status='processing' AND attempts=1 AND "leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC')`, c.claim.operationId, new Date(c.claim.leaseUntil),
    JSON.stringify({ source: "MODEL_REVIEW_ONLY", reply: text, personalModelReview: prepared.requiredSourceReview }));
    if (n !== 1) throw new Error("SYNTHETIC_SOURCE_CAS_LOST");
  } else {
    // Invoke the same deferred final constraint while the source is incomplete;
    // an explicit SQL boundary exposes its exact error instead of a generic
    // Prisma COMMIT wrapper message. The whole transaction still rolls back.
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  }
  return { kind: c.kind, id: prepared.clarificationId, questionId: question.id };
}
const prepare = (f: Fixture, c: Candidate, options?: Parameters<typeof prepareIn>[3], zone = "UTC") => prisma.$transaction(async tx => {
  await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
  return prepareIn(tx, f, c, options);
}, txOptions);
type Prepared = Awaited<ReturnType<typeof prepare>>;
async function stored(id: string) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ id: string; phase: string; namespace: string; prepared: Record<string, unknown>; failedAttempts: number; consumedReplyId: string | null }>>('SELECT * FROM "PersonalSmsTemporalClarification" WHERE id=$1', id);
  return row;
}
async function syntheticAccepted(f: Fixture, p: Prepared, zone = "UTC") {
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
    await tx.personalAssistantOperation.update({ where: { id: p.questionId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(Date.now() + 30000) } });
    await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,"externalTransportPerformed"=true,
      result=jsonb_build_object('providerSid',$2::text,'acceptedByProvider',true,'delivered',false,'approvalHash',"requestHash",
        'acceptedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) WHERE id=$1`, p.questionId, `SM${randomUUID().replaceAll("-", "")}`);
    expect(await markSmsTemporalClarificationAskedInTransaction(tx, { actor: f.actor, clarificationId: p.id, questionOutboundOperationId: p.questionId }, f.env, context())).toMatchObject({ status: "WAITING_FOR_TEMPORAL_REPLY", committed: false });
  }, txOptions);
}
async function reply(f: Fixture, body = "14h") {
  await prisma.$queryRawUnsafe("SELECT pg_sleep(0.005)::text"); // Separate recorded ms; no assumed causal ordering from equal timestamps.
  const wire = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from, to: f.env.TWILIO_PHONE_NUMBER!, body };
  const source = await enqueuePersonalSms({ ...wire, contentHash: sha(JSON.stringify(wire)) });
  const claim = { ...f.actor, operationId: source.operationId, attempt: 1 as const, leaseUntil: new Date(Date.now() + 30000).toISOString() };
  await prisma.personalAssistantOperation.update({ where: { id: claim.operationId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil), result: { syntheticPrior: "preserve" } } });
  return claim;
}
const consume = (f: Fixture, p: Prepared, claim: Awaited<ReturnType<typeof reply>>, zone = "UTC") => prisma.$transaction(async tx => {
  await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
  return consumeSmsTemporalClarificationInTransaction(tx, { actor: f.actor, clarificationId: p.id, replySourceClaim: claim }, f.env, context());
}, txOptions);
async function counts(workspaceId: string) {
  return prisma.$queryRawUnsafe(`SELECT kind,count(*)::int FROM "PersonalAssistantOperation" WHERE "workspaceId"=$1 GROUP BY kind ORDER BY kind`, workspaceId);
}
async function budget() {
  return prisma.$queryRawUnsafe(`SELECT id,"reservedCadMicros","ceilingCadMicros" FROM "PersonalAssistantBudget" ORDER BY id`);
}

async function outboundFixture(ttlMs?: number) {
  const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c, ttlMs === undefined ? undefined : { ttlMs });
  const grant = await prisma.constructionConnectorGrant.create({ data: { connectorAccountId: f.smsAccountId, capability: "personal_sms_send",
    status: "active", grantedAt: new Date(), requestedScopes: ["personal_sms_send"], grantedScopes: ["personal_sms_send"] } });
  const env: NodeJS.ProcessEnv = { ...f.env, ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED",
    ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`, TWILIO_API_KEY_SECRET: "synthetic-secret",
    TWILIO_AUTH_TOKEN: "synthetic-token", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
    ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status", ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date().toISOString(),
    ENDVERA_TWILIO_RATE_REVIEW_REF: "SYNTHETIC_RECEIPT_TEST_ONLY", ENDVERA_PERSONAL_BUDGET_CAD: "30", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10" };
  const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: p.questionId } });
  const approve = () => approvePersonalOutbound({ ...f.actor, operationId: p.questionId, expectedRequestHash: question.requestHash }, env);
  const response = (status = "queued") => Response.json({ sid: `SM${randomUUID().replaceAll("-", "")}`, status, account_sid: f.accountSid,
    from: env.TWILIO_PHONE_NUMBER, to: f.from });
  return { f, p, env, grant, approve, response };
}

async function waitForQuestionExpiry(id: string) {
  // Real bounded DB-clock wait, never rewriting an immutable expiry to fake age.
  const [remaining] = await prisma.$queryRawUnsafe<Array<{ ms: number }>>(`SELECT GREATEST(0,EXTRACT(EPOCH FROM ("expiresAt"-(clock_timestamp() AT TIME ZONE 'UTC')))*1000)::float8 AS ms FROM "PersonalSmsTemporalClarification" WHERE id=$1`, id);
  if (!remaining || remaining.ms > 1500) throw new Error("SYNTHETIC_SHORT_EXPIRY_REQUIRED");
  await prisma.$queryRawUnsafe("SELECT pg_sleep($1::double precision)::text", (remaining.ms + 50) / 1000);
}

async function actualAnsweredQuestion(body = "14h", ttlMs?: number, prepareCalendar = false) {
  const x = await outboundFixture(ttlMs); await x.approve();
  // Only the HTTP boundary is synthetic. The existing dispatcher persists its
  // actual acceptance receipt and hook, then the real incoming worker consumes.
  const transport = vi.fn<typeof fetch>(async () => x.response());
  expect(await dispatchPersonalOutbound(x.p.questionId, x.env, transport)).toMatchObject({ delivered: false });
  expect((await stored(x.p.id)).phase).toBe("WAITING");
  await prisma.$queryRawUnsafe("SELECT pg_sleep(0.005)::text");
  const wire = { accountSid: x.f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: x.f.from, to: x.env.TWILIO_PHONE_NUMBER!, body };
  const source = await enqueuePersonalSms({ ...wire, contentHash: sha(JSON.stringify(wire)) });
  const env = { ...x.env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "true",
    ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: prepareCalendar ? "true" : "false" };
  // Ingress marks a received SMS as transport-performed. Preserve that historical
  // value; this injected fixture is not evidence of an actual provider call.
  const sourceBeforeWorker = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: source.operationId } });
  const budgetBeforeWorker = prepareCalendar ? await budget() : undefined;
  const model = vi.fn(async () => { throw new Error("SECOND_MODEL_REFUSED"); }), engine = vi.fn(async () => { throw new Error("LEGACY_ENGINE_REFUSED"); });
  expect(await processPersonalSms(source.operationId, env, { model, engine })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
  if (prepareCalendar) expect(await budget()).toEqual(budgetBeforeWorker);
  expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(transport).toHaveBeenCalledOnce();
  const receipts = await prisma.$queryRawUnsafe<Array<{ id: string; outcome: string; packet: unknown; packetHash: string }>>('SELECT id,outcome,packet,"packetHash" FROM "PersonalSmsTemporalClarificationReply" WHERE "sourceOperationId"=$1', source.operationId);
  expect(receipts).toHaveLength(1);
  return { ...x, env, source, sourceBeforeWorker, receipt: receipts[0], transport };
}
type Answered = Awaited<ReturnType<typeof actualAnsweredQuestion>>;
const readReviewList = (f: Fixture, env = f.env, actor = f.actor, readContext = context()) =>
  readCorrelatedPersonalCalendarReviewList({ enabled: true, actor },
    { ...env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" }, readContext);
const calendarReviewInput = (x: Answered) => ({ enabled: true, actor: x.f.actor, subject: { kind: "personal_sms_temporal_receipt" as const, receiptId: x.receipt.id } });
const calendarReviewEnv = (x: Answered) => ({ ...x.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true" });
const prepareAnsweredCalendar = (x: Answered, zone = "UTC") => prisma.$transaction(async tx => {
  await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
  const result = await prepareCorrelatedPersonalCalendarReviewInTransaction(tx, calendarReviewInput(x), calendarReviewEnv(x), context());
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  return result;
}, txOptions);
const readCalendarReview = (x: Answered, reviewId: string, zone = "UTC", actor = x.f.actor) => prisma.$transaction(async tx => {
  await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
  return loadCorrelatedPersonalCalendarReviewInTransaction(tx, { enabled: true, actor, reviewId },
    { ...x.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" }, context());
}, txOptions);
const inspectAnswered = (x: Answered, zone = "UTC", actor = x.f.actor) => prisma.$transaction(async tx => {
  await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone);
  return loadCorrelatedPersonalReceiptSubject(tx, { enabled: true, actor, subject: { kind: "personal_sms_temporal_receipt", receiptId: x.receipt.id } }, x.env, context());
}, txOptions);
async function answeredSnapshot(x: Answered) {
  return { operations: await prisma.personalAssistantOperation.findMany({ where: { workspaceId: x.f.workspaceId }, orderBy: { id: "asc" } }),
    question: await stored(x.p.id), budget: await budget(),
    receipts: await prisma.$queryRawUnsafe('SELECT * FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1 ORDER BY id', x.p.id),
    expectations: await prisma.$queryRawUnsafe('SELECT * FROM "PersonalSmsConversationExpectation" WHERE namespace=$1 ORDER BY id', (await stored(x.p.id)).namespace) };
}
describe("actual incoming worker prepares one correlated calendar review in PostgreSQL", () => {
  it("commits the accepted reply and one private draft through the production hook, not a direct test preparer", async () => {
    const x = await actualAnsweredQuestion("14h", undefined, true);
    expect(x.receipt.outcome).toBe("ACCEPTED");
    const reviews = await prisma.personalSmsCorrelatedCalendarReview.findMany({ where: { receiptId: x.receipt.id } });
    expect(reviews).toHaveLength(1);
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.source.operationId } });
    expect(source).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null,
      externalTransportPerformed: x.sourceBeforeWorker.externalTransportPerformed });
    const acknowledgement = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: x.f.workspaceId, idempotencyKey: `reply:${source.id}` } });
    expect(acknowledgement).toHaveLength(1);
    expect(acknowledgement[0]).toMatchObject({ kind: "sms_outbound", status: "pending", attempts: 0, externalTransportPerformed: false });
    const before = await answeredSnapshot(x), list = await readReviewList(x.f, x.env);
    if ("status" in list) throw new Error("NATIVE_LIST_REQUIRED");
    expect(list.reviews).toHaveLength(1);
    expect(list.reviews[0]).toMatchObject({ reviewId: reviews[0].id, currentStatus: "pending", approvalAvailable: false,
      executionAuthorized: false, evidence: { provenance: "UNKNOWN", draft: { title: "inspection" } } });
    expect(list.reviews[0].evidence.sources.map(source => source.text)).toEqual([temporalBody, "14h"]);
    expect(await processPersonalSms(source.id, x.env)).toEqual({ status: "NOT_PENDING" });
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
    expect(x.transport).toHaveBeenCalledOnce(); // The earlier synthetic question only; no additional SMS/Google transport.
  });
  it("OFF at source processing leaves the completed reply and acknowledgement without a calendar review", async () => {
    const x = await actualAnsweredQuestion();
    expect(x.receipt.outcome).toBe("ACCEPTED");
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
    const before = await answeredSnapshot(x);
    expect(await processPersonalSms(x.source.operationId, { ...x.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true" })).toEqual({ status: "NOT_PENDING" });
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
  });
  it("an ambiguous refused answer remains completed but does not produce a calendar review even with preparation ON", async () => {
    const x = await actualAnsweredQuestion("3h", undefined, true);
    expect(x.receipt.outcome).not.toBe("ACCEPTED");
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.source.operationId } })).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null });
    const before = await answeredSnapshot(x);
    expect(await processPersonalSms(x.source.operationId, x.env)).toEqual({ status: "NOT_PENDING" });
    expect(await answeredSnapshot(x)).toEqual(before); expect(x.transport).toHaveBeenCalledOnce();
  });
  it.each(["revocation", "expiry"] as const)("preserves actual committed source and acknowledgement after %s between consumption and preparation", async failure => {
    // A test-only await boundary wraps (never replaces) real consumption. The
    // state change is real SQL after its COMMIT, before the real worker's hook.
    // This is not timing evidence from a live provider or a forced fake receipt.
    const original = temporalReplyModule.processSmsTemporalReply;
    let committedBeforeHook: Awaited<ReturnType<typeof prisma.personalAssistantOperation.findMany>> | undefined;
    const history = async (receiptId: string) => ({ budget: await budget(),
      receipts: await prisma.$queryRawUnsafe('SELECT * FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=(SELECT "clarificationId" FROM "PersonalSmsTemporalClarificationReply" WHERE id=$1) ORDER BY id', receiptId),
      question: await prisma.$queryRawUnsafe('SELECT q.* FROM "PersonalSmsTemporalClarification" q JOIN "PersonalSmsTemporalClarificationReply" r ON r."clarificationId"=q.id WHERE r.id=$1', receiptId),
      expectations: await prisma.$queryRawUnsafe('SELECT e.* FROM "PersonalSmsConversationExpectation" e WHERE namespace=(SELECT q.namespace FROM "PersonalSmsTemporalClarification" q JOIN "PersonalSmsTemporalClarificationReply" r ON r."clarificationId"=q.id WHERE r.id=$1) ORDER BY id', receiptId) });
    let historyBeforeHook: Awaited<ReturnType<typeof history>> | undefined;
    const wrapped = vi.spyOn(temporalReplyModule, "processSmsTemporalReply").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (result.status !== "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED" || result.outcome !== "CORRELATED_NOT_EXECUTED")
        throw new Error("NATIVE_ACCEPTED_CONSUMPTION_REQUIRED");
      const workspaceId = args[0].claim.workspaceId;
      if (failure === "revocation") {
        const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId, provider: "google_calendar" } } });
        await prisma.constructionConnectorGrant.updateMany({ where: { connectorAccountId: account.id, capability: "calendar_write" },
          data: { status: "revoked", revokedAt: new Date(), stateVersion: { increment: 1 }, grantedScopes: [] } });
      } else {
        const [receipt] = await prisma.$queryRawUnsafe<Array<{ clarificationId: string }>>('SELECT "clarificationId" FROM "PersonalSmsTemporalClarificationReply" WHERE id=$1', result.receiptId);
        await waitForQuestionExpiry(receipt.clarificationId);
      }
      committedBeforeHook = await prisma.personalAssistantOperation.findMany({ where: { workspaceId }, orderBy: { id: "asc" } });
      historyBeforeHook = await history(result.receiptId);
      return result;
    });
    try {
      const x = await actualAnsweredQuestion("14h", failure === "expiry" ? 1000 : undefined, true);
      expect(wrapped).toHaveBeenCalledOnce(); expect(committedBeforeHook).toBeDefined();
      expect(await prisma.personalAssistantOperation.findMany({ where: { workspaceId: x.f.workspaceId }, orderBy: { id: "asc" } })).toEqual(committedBeforeHook);
      expect(historyBeforeHook).toBeDefined(); expect(await history(x.receipt.id)).toEqual(historyBeforeHook);
      expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
      expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.source.operationId } })).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null });
      expect(x.transport).toHaveBeenCalledOnce();
    } finally { wrapped.mockRestore(); }
  });
});

describe("private latest correlated calendar list against actual PostgreSQL", () => {
  it("returns an authorized empty collection but refuses a foreign or revoked member", async () => {
    const f = await fixture();
    expect(await readReviewList(f)).toEqual({ version: "personal-correlated-calendar-review-list-v1", workspaceId: f.workspaceId,
      readOnly: true, approvalAvailable: false, executionAuthorized: false, reviews: [], hasMore: false });
    await expect(readReviewList(f, f.env, { ...f.actor, userId: "foreign" })).rejects.toThrow("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } }, data: { status: "revoked" } });
    await expect(readReviewList(f)).rejects.toThrow("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
  });
  it("projects the real committed two-SMS draft without any manual review identifier", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_CALENDAR_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x), result = await readReviewList(x.f, x.env);
    expect(result).toMatchObject({ workspaceId: x.f.workspaceId, readOnly: true, approvalAvailable: false, executionAuthorized: false,
      hasMore: false, reviews: [{ reviewId: prepared.reviewId, currentStatus: "pending", evidence: { provenance: "UNKNOWN" } }] });
    if ("status" in result) throw new Error("NATIVE_LIST_REQUIRED");
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].evidence.sources.map(source => source.text)).toEqual([temporalBody, "14h"]);
    expect(result.reviews[0].evidence.draft).toEqual(prepared.draft);
    expect(JSON.stringify(result)).not.toContain(prepared.operationId);
    expect(await answeredSnapshot(x)).toEqual(before); expect(x.transport).toHaveBeenCalledOnce();
  });
  it("does not turn a damaged current authorization into an empty success", async () => {
    const x = await actualAnsweredQuestion(); await prepareAnsweredCalendar(x);
    await prisma.constructionConnectorGrant.update({ where: { id: x.f.google.grants[0].id },
      data: { status: "revoked", revokedAt: new Date(), stateVersion: { increment: 1 }, grantedScopes: [] } });
    const before = await answeredSnapshot(x);
    await expect(readReviewList(x.f, x.env)).rejects.toThrow("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
    expect(await answeredSnapshot(x)).toEqual(before); expect(x.transport).toHaveBeenCalledOnce();
  });
  it("does not recreate expired history or reset its preparation window", async () => {
    const x = await actualAnsweredQuestion("14h", 1000); await prepareAnsweredCalendar(x);
    await waitForQuestionExpiry(x.p.id); const before = await answeredSnapshot(x);
    await expect(readReviewList(x.f, x.env)).rejects.toThrow("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
  });
  it("two actual readers preserve the same single immutable review", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_CALENDAR_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x);
    const results = await Promise.all([readReviewList(x.f, x.env), readReviewList(x.f, x.env)]);
    for (const result of results) expect(result).toHaveProperty("reviews.0.reviewId", prepared.reviewId);
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
  });
  it("an already cancelled caller never receives even an empty list", async () => {
    const f = await fixture(), abort = new AbortController(); abort.abort();
    await expect(readCorrelatedPersonalCalendarReviewList({ enabled: true, actor: f.actor },
      { ...f.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" },
      { deadlineAt: Date.now() + 5000, signal: abort.signal })).rejects.toThrow("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
  });
  it("a concurrently revoked owner cannot publish the old empty-list snapshot", async () => {
    const f = await fixture();
    let unlock!: () => void, ready!: () => void, guardFired = false;
    const held = new Promise<void>(resolve => { unlock = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const guard = setTimeout(() => { guardFired = true; unlock(); }, 4000);
    const holder = prisma.$transaction(async tx => {
      await tx.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.userId } }, data: { status: "revoked" } });
      ready(); await held;
    }, txOptions);
    let reading: Promise<unknown> | undefined;
    try {
      await locked;
      // The initial MVCC owner SELECT sees active, but the final SHARE recheck
      // must wait on this real uncommitted member change before publishing [].
      reading = readReviewList(f).then(value => ({ value }), error => ({ error }));
      let waiter = false;
      const stop = Date.now() + 1200;
      while (!waiter && Date.now() < stop) {
        const [row] = await prisma.$queryRawUnsafe<Array<{ waiting: boolean }>>(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity a WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()
            AND a.wait_event_type='Lock' AND a.query LIKE '%FOR SHARE OF w,m%') AS waiting`);
        waiter = row?.waiting === true;
        if (!waiter) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiter).toBe(true); expect(guardFired).toBe(false);
      unlock(); await holder;
      const outcome = await reading as { error?: Error; value?: unknown };
      expect(outcome.value).toBeUndefined(); expect(outcome.error?.message).toBe("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE");
    } finally {
      clearTimeout(guard); unlock(); await holder; if (reading) await reading;
    }
  });
});

describe("atomic correlated calendar preparation from two real persisted synthetic SMS sources", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("commits exactly one isolated pending review and stable replay in %s", async zone => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    const first = await prepareAnsweredCalendar(x, zone);
    expect(first).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT", replay: false, committed: false,
      operationStatus: "pending", executionAuthorized: false, approvalAvailable: false, preparationProviderCalls: 0, newBudgetReservations: 0 });
    if (first.status === "DISABLED") throw new Error("NATIVE_CALENDAR_PREPARATION_REQUIRED");
    const second = await prepareCorrelatedPersonalCalendarReview(calendarReviewInput(x), calendarReviewEnv(x));
    expect(second).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_REPLAYED", operationId: first.operationId, reviewId: first.reviewId,
      requestHash: first.requestHash, committed: true, replay: true, operationStatus: "pending" });
    const after = await answeredSnapshot(x);
    expect(after.operations.filter(op => op.id !== first.operationId)).toEqual(before.operations);
    expect(after.question).toEqual(before.question); expect(after.receipts).toEqual(before.receipts);
    expect(after.expectations).toEqual(before.expectations); expect(after.budget).toEqual(before.budget);
    expect(after.operations.filter(op => op.kind === "calendar_write")).toHaveLength(1);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
    expect(await personalCalendarActions(x.f.userId, x.f.workspaceId)).toEqual({ operations: [] });
    await expect(preparePersonalCalendar({ ...x.f.actor, requestId: personalCorrelatedCalendarRequestId(x.receipt.id), draft: first.draft }))
      .rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
    await expect(prisma.$transaction(tx => claimPersonalCalendarWriteInTransaction(tx, { ...x.f.actor, operationId: first.operationId,
      expectedRequestHash: first.requestHash }, x.env), txOptions)).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
    expect(await answeredSnapshot(x)).toEqual(after); expect(x.transport).toHaveBeenCalledOnce();
  });
  it("remains OFF without writing a draft or changing sources", async () => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    expect(await prepareCorrelatedPersonalCalendarReview(calendarReviewInput(x), x.env)).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
  });
  it("refuses a preexisting generic operation instead of adopting its request UUID", async () => {
    const x = await actualAnsweredQuestion(), inspected = await inspectAnswered(x);
    if (inspected.status === "DISABLED") throw new Error("NATIVE_INSPECTION_REQUIRED");
    await preparePersonalCalendar({ ...x.f.actor, requestId: inspected.reference.requestId, draft: inspected.reference.proof.draft });
    const before = await answeredSnapshot(x);
    await expect(prepareAnsweredCalendar(x)).rejects.toThrow("CORRELATED_CALENDAR_ORPHAN_OR_REQUEST_CONFLICT");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
  });
  it("a marked operation without its review cannot commit", async () => {
    const x = await actualAnsweredQuestion(), inspected = await inspectAnswered(x), before = await answeredSnapshot(x);
    if (inspected.status === "DISABLED") throw new Error("NATIVE_INSPECTION_REQUIRED");
    await expect(prisma.$transaction(async tx => {
      await preparePersonalCalendarInTransaction(tx, { ...x.f.actor, requestId: inspected.reference.requestId, draft: inspected.reference.proof.draft },
        { kind: "personal_sms_temporal_receipt", receiptId: x.receipt.id });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    }, txOptions)).rejects.toThrow("CORRELATED_CALENDAR_FINAL_REVIEW_MISSING");
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("rolls back both new rows on a failure after provisional preparation", async () => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    await expect(prisma.$transaction(async tx => {
      await prepareCorrelatedPersonalCalendarReviewInTransaction(tx, calendarReviewInput(x), calendarReviewEnv(x), context());
      throw new Error("SYNTHETIC_FAILURE_BEFORE_COMMIT");
    }, txOptions)).rejects.toThrow("SYNTHETIC_FAILURE_BEFORE_COMMIT");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
  });
  it("a committed review and marker cannot be rewritten or removed", async () => {
    const x = await actualAnsweredQuestion(), first = await prepareAnsweredCalendar(x);
    if (first.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x);
    await expect(prisma.$executeRawUnsafe('UPDATE "PersonalSmsCorrelatedCalendarReview" SET "reviewActionId"=$2 WHERE id=$1', first.reviewId, "invented"))
      .rejects.toThrow("CORRELATED_CALENDAR_REVIEW_IMMUTABLE");
    await expect(prisma.$executeRawUnsafe('DELETE FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=$1', first.reviewId))
      .rejects.toThrow("CORRELATED_CALENDAR_REVIEW_IMMUTABLE");
    await expect(prisma.$executeRawUnsafe('UPDATE "PersonalAssistantOperation" SET "correlatedTemporalReceiptId"=NULL WHERE id=$1', first.operationId))
      .rejects.toThrow("CORRELATED_CALENDAR_MARKER_IMMUTABLE");
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("current revocation refuses even a known replay without changing the saved review", async () => {
    const x = await actualAnsweredQuestion(), first = await prepareAnsweredCalendar(x);
    if (first.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    await prisma.constructionConnectorGrant.update({ where: { id: x.f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), stateVersion: { increment: 1 }, grantedScopes: [] } });
    const before = await answeredSnapshot(x), review = await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: first.reviewId } });
    await expect(prepareAnsweredCalendar(x)).rejects.toThrow(/BINDING|GRANT|AUTHORITY|REVOKED/);
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: first.reviewId } })).toEqual(review);
  });
  it("cannot commit a just-prepared draft already claimed in that same transaction", async () => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    await expect(prisma.$transaction(async tx => {
      const prepared = await prepareCorrelatedPersonalCalendarReviewInTransaction(tx, calendarReviewInput(x), calendarReviewEnv(x), context());
      if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
      await tx.personalAssistantOperation.update({ where: { id: prepared.operationId }, data: { status: "processing", attempts: 1, leaseUntil: new Date(Date.now() + 10000) } });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    }, txOptions)).rejects.toThrow("CORRELATED_CALENDAR_FINAL_PENDING_CHANGED");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(0);
  });
  it("refuses an expired replay while keeping the original draft and provenance", async () => {
    const x = await actualAnsweredQuestion("14h", 1000), first = await prepareAnsweredCalendar(x);
    if (first.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x);
    await waitForQuestionExpiry(x.p.id);
    await expect(prepareAnsweredCalendar(x)).rejects.toThrow(/EXPIRED/);
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
  });
  it("serializes two actual backend preparations on the same receipt without duplicating", async () => {
    const x = await actualAnsweredQuestion();
    let ready!: () => void, release!: () => void, secondReady!: () => void, firstPid = 0, secondPid = 0, timedOut = false;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { secondReady = resolve; });
    const timer = setTimeout(() => { timedOut = true; ready(); release(); secondReady(); }, 2000);
    const first = prisma.$transaction(async tx => {
      [{ pid: firstPid }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
      const value = await prepareCorrelatedPersonalCalendarReviewInTransaction(tx, calendarReviewInput(x), calendarReviewEnv(x), context());
      ready(); await held; return value;
    }, txOptions).then(value => ({ ok: true as const, value }), error => { ready(); return { ok: false as const, error }; });
    let second: Promise<Awaited<typeof first>> | undefined, blocked = false;
    try {
      await acquired;
      second = prisma.$transaction(async tx => {
        [{ pid: secondPid }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
        secondReady();
        return prepareCorrelatedPersonalCalendarReviewInTransaction(tx, calendarReviewInput(x), calendarReviewEnv(x), context());
      }, txOptions).then(value => ({ ok: true as const, value }), error => { secondReady(); return { ok: false as const, error }; });
      await started;
      for (let i = 0; i < 40 && !timedOut; i++) {
        const [row] = await prisma.$queryRawUnsafe<Array<{ blocked: boolean }>>("SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS blocked", firstPid, secondPid);
        if (row.blocked) { blocked = true; break; }
        await prisma.$queryRawUnsafe("SELECT pg_sleep(0.01)::text");
      }
    } finally { release(); clearTimeout(timer); }
    const a = await first, b = second ? await second : undefined;
    expect(timedOut).toBe(false); expect(firstPid).toBeGreaterThan(0); expect(secondPid).not.toBe(firstPid); expect(blocked).toBe(true);
    if (!a.ok) throw a.error;
    if (!b) throw new Error("NATIVE_SECOND_BACKEND_REQUIRED");
    if (!b.ok) expect(String(b.error)).toMatch(/serializ|write conflict|deadlock|P2034/i);
    else expect(b.value).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_REPLAYED" });
    const replay = await prepareCorrelatedPersonalCalendarReview(calendarReviewInput(x), calendarReviewEnv(x));
    expect(replay).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_REPLAYED", committed: true });
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
    expect(await prisma.personalAssistantOperation.count({ where: { correlatedTemporalReceiptId: x.receipt.id } })).toBe(1);
    expect(x.transport).toHaveBeenCalledOnce();
  });
});

describe("private correlated calendar read from actually committed preparation", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("returns the two full sources and exact current draft without writes in %s", async zone => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x), saved = await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: prepared.reviewId } });
    const actual = await readCalendarReview(x, prepared.reviewId, zone);
    expect(actual).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false,
      review: { version: "personal-correlated-calendar-review-v1", reviewId: prepared.reviewId, currentStatus: "pending", readOnly: true,
        approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
        evidence: { provenance: "UNKNOWN", approvalAvailable: false, draft: prepared.draft } } });
    if (actual.status === "DISABLED") throw new Error("NATIVE_REVIEW_REQUIRED");
    expect(actual.review.evidence.sources.map(s => s.text)).toEqual([temporalBody, "14h"]);
    expect(actual.review.evidence.citations).toEqual((x.receipt.packet as { citations: unknown }).citations);
    expect(actual.review.preparedAt).toBe(saved.createdAt.toISOString());
    expect(actual.review.preparationExpiresAt).toBe(saved.preparationExpiresAt.toISOString());
    expect(actual.review).not.toHaveProperty("operationId"); expect(actual.review).not.toHaveProperty("requestHash");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: prepared.reviewId } })).toEqual(saved);
    expect(x.transport).toHaveBeenCalledOnce();
  });
  it("does not prepare a review when missing or OFF and does not disclose it to a foreign owner", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x);
    expect(await readCorrelatedPersonalCalendarReview({ enabled: true, actor: x.f.actor, reviewId: prepared.reviewId }, x.env))
      .toEqual({ status: "DISABLED", executionAuthorized: false });
    await expect(readCalendarReview(x, "nonexistent-review")).rejects.toThrow("CORRELATED_CALENDAR_READ_CHANGED_OR_UNAVAILABLE");
    await expect(readCalendarReview(x, prepared.reviewId, "UTC", { ...x.f.actor, userId: "foreign-owner" }))
      .rejects.toThrow("CORRELATED_CALENDAR_READ_CHANGED_OR_UNAVAILABLE");
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
  });
  it("refuses expired proof without resetting the saved preparation window", async () => {
    const x = await actualAnsweredQuestion("14h", 1000), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    const before = await answeredSnapshot(x), saved = await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: prepared.reviewId } });
    await waitForQuestionExpiry(x.p.id);
    await expect(readCalendarReview(x, prepared.reviewId)).rejects.toThrow(/EXPIRED/);
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.findUniqueOrThrow({ where: { id: prepared.reviewId } })).toEqual(saved);
  });
  it("current revoked Google authority refuses the read without altering immutable history", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    await prisma.constructionConnectorGrant.update({ where: { id: x.f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), stateVersion: { increment: 1 }, grantedScopes: [] } });
    const before = await answeredSnapshot(x);
    await expect(readCalendarReview(x, prepared.reviewId)).rejects.toThrow(/BINDING|GRANT|AUTHORITY|REVOKED/);
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("reads a synthetic current uncertain state as uncertain, never re-preparing pending", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    // Deliberate synthetic status mutation tests display only, NOT a provider outcome.
    await prisma.personalAssistantOperation.update({ where: { id: prepared.operationId }, data: { status: "uncertain" } });
    const before = await answeredSnapshot(x);
    const actual = await readCorrelatedPersonalCalendarReview({ enabled: true, actor: x.f.actor, reviewId: prepared.reviewId },
      { ...x.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" });
    expect(actual).toMatchObject({ committed: true, review: { currentStatus: "uncertain", approvalAvailable: false, executionAuthorized: false } });
    expect(await answeredSnapshot(x)).toEqual(before);
    expect(await prisma.personalSmsCorrelatedCalendarReview.count({ where: { receiptId: x.receipt.id } })).toBe(1);
  });
  it("bounds the first discovery against a real exclusive table lock", async () => {
    const x = await actualAnsweredQuestion(), prepared = await prepareAnsweredCalendar(x);
    if (prepared.status === "DISABLED") throw new Error("NATIVE_PREPARATION_REQUIRED");
    let ready!: () => void, release!: () => void, timedOut = false;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(() => { timedOut = true; ready(); release(); }, 2000);
    const holding = prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('LOCK TABLE "PersonalSmsCorrelatedCalendarReview" IN ACCESS EXCLUSIVE MODE');
      ready(); await held;
    }, txOptions).then(() => ({ ok: true as const }), error => { ready(); return { ok: false as const, error }; });
    let failed: unknown, elapsed = 0;
    try {
      await acquired; const start = Date.now();
      try {
        await prisma.$transaction(tx => loadCorrelatedPersonalCalendarReviewInTransaction(tx, { enabled: true, actor: x.f.actor, reviewId: prepared.reviewId },
          { ...x.env, ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" }, { deadlineAt: Date.now() + 200 }), txOptions);
      } catch (error) { failed = error; }
      elapsed = Date.now() - start;
    } finally { release(); clearTimeout(timer); }
    const outcome = await holding; if (!outcome.ok) throw outcome.error;
    expect(timedOut).toBe(false); expect(elapsed).toBeLessThan(1200);
    expect(String(failed)).toMatch(/55P03|57014|lock timeout|statement timeout/);
    expect(await readCalendarReview(x, prepared.reviewId)).toHaveProperty("review.currentStatus", "pending");
  });
});

describe("durable receipt inspection after actual synthetic HTTP acceptance and incoming SMS completion", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("recalculates the exact completed two-source packet in %s without any write", async zone => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    expect(x.receipt.outcome).toBe("ACCEPTED"); expect(before.question).toMatchObject({ phase: "CONSUMED", consumedReplyId: x.receipt.id });
    const first = await inspectAnswered(x, zone), second = await inspectAnswered(x, zone);
    expect(first).toMatchObject({ status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", executionAuthorized: false, persistencePerformed: false, committed: false, draft: null });
    if (first.status === "DISABLED" || second.status === "DISABLED") throw new Error("NATIVE_RECEIPT_INSPECTION_REQUIRED");
    expect(first.proof.originalPacket).toEqual(x.receipt.packet); expect(first.proof.packetHash).toBe(x.receipt.packetHash);
    expect(first.proof.resolution).toEqual(x.receipt.packet); expect(second.proof).toEqual(first.proof);
    expect(first.proof.resolution.sources.map(s => s.body)).toEqual([temporalBody, "14h"]);
    expect(await answeredSnapshot(x)).toEqual(before); expect(x.transport).toHaveBeenCalledOnce();
    expect(before.operations.filter(op => op.kind === "calendar_write")).toHaveLength(0);
  });
  it("does not disclose an accepted receipt to another owner or workspace", async () => {
    const x = await actualAnsweredQuestion(), before = await answeredSnapshot(x);
    await expect(inspectAnswered(x, "UTC", { ...x.f.actor, userId: "not-this-owner" })).rejects.toThrow("CORRELATED_RECEIPT_OWNER_REQUIRED");
    await expect(inspectAnswered(x, "UTC", { ...x.f.actor, workspaceId: "not-this-workspace" })).rejects.toThrow("CORRELATED_RECEIPT_OWNER_REQUIRED");
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("a genuine refused ambiguous answer is not recast as a consumed accepted receipt", async () => {
    const x = await actualAnsweredQuestion("3h"), before = await answeredSnapshot(x);
    expect(x.receipt.outcome).toBe("REFUSED"); expect(before.question.phase).toBe("WAITING");
    await expect(inspectAnswered(x)).rejects.toThrow(/CONSUMED/); expect(await answeredSnapshot(x)).toEqual(before);
  });
  it.each(["GOOGLE", "MODEL"])("current %s grant revocation refuses without changing the historical receipt", async kind => {
    const x = await actualAnsweredQuestion();
    await prisma.constructionConnectorGrant.update({ where: { id: kind === "GOOGLE" ? x.f.google.grants[0].id : x.f.modelGrantId },
      data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    const before = await answeredSnapshot(x);
    await expect(inspectAnswered(x)).rejects.toThrow(/GRANT|CONTEXT|AUTHORITY|BINDING|INACTIVE|REVOKED/);
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("retains but refuses an actually expired accepted receipt without inventing a fresh window", async () => {
    const x = await actualAnsweredQuestion("14h", 1000), before = await answeredSnapshot(x);
    await waitForQuestionExpiry(x.p.id);
    await expect(inspectAnswered(x)).rejects.toThrow(/EXPIRED/); expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("keeps a later active question intact while inspecting the earlier inactive receipt", async () => {
    const x = await actualAnsweredQuestion(), later = await prepare(x.f, await x.f.candidate("calendar"));
    const before = await answeredSnapshot(x);
    expect(before.expectations).toEqual(expect.arrayContaining([expect.objectContaining({ id: `calendar:${later.id}`, active: true })]));
    expect((await inspectAnswered(x)).status).toBe("CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED");
    expect(await answeredSnapshot(x)).toEqual(before);
  });
  it("holds current owner authority against a real concurrent revocation, then refuses the next read", async () => {
    const x = await actualAnsweredQuestion();
    let ready!: () => void, release!: () => void, writerReady!: () => void, writerPid = 0, timedOut = false;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const writerStarted = new Promise<void>(resolve => { writerReady = resolve; });
    const timer = setTimeout(() => { timedOut = true; ready(); release(); writerReady(); }, 2000);
    const reading = prisma.$transaction(async tx => {
      const result = await loadCorrelatedPersonalReceiptSubject(tx, { enabled: true, actor: x.f.actor,
        subject: { kind: "personal_sms_temporal_receipt", receiptId: x.receipt.id } }, x.env, context());
      ready(); await held; return result;
    }, txOptions).then(value => ({ ok: true as const, value }), error => { ready(); return { ok: false as const, error }; });
    let writing: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
    try {
      await acquired;
      writing = prisma.$transaction(async tx => {
        const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); writerPid = backend.pid; writerReady();
        await tx.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: x.f.workspaceId, userId: x.f.userId } }, data: { status: "revoked" } });
      }, txOptions).then(() => ({ ok: true as const }), error => { writerReady(); return { ok: false as const, error }; });
      await writerStarted;
      let blocked = false;
      for (let n = 0; n < 25 && !blocked; n++) {
        const [state] = await prisma.$queryRawUnsafe<Array<{ blocked: boolean }>>("SELECT cardinality(pg_blocking_pids($1::int))>0 AS blocked", writerPid);
        blocked = state.blocked; if (!blocked) await prisma.$queryRawUnsafe("SELECT pg_sleep(0.01)::text");
      }
      expect(blocked).toBe(true); expect(timedOut).toBe(false);
    } finally {
      clearTimeout(timer); release();
      const result = await reading; if (!result.ok) throw result.error;
      expect(result.value.status).toBe("CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED");
      if (writing) { const result = await writing; if (!result.ok) throw result.error; }
    }
    const before = await answeredSnapshot(x);
    await expect(inspectAnswered(x)).rejects.toThrow("TEMPORAL_REGISTRY_CURRENT_BINDING_REQUIRED");
    expect(await answeredSnapshot(x)).toEqual(before);
  });
});

describe("native temporal scheduling excludes retained invalid questions before LIMIT1", () => {
  it.each(["ELIGIBLE", "STORE_OFF", "BRIDGE_OFF", "EXPIRED", "TERMINAL", "GOOGLE_REVOKED", "MODEL_REVOKED", "IDENTITY_REVISED", "OWNER_REVISED"])("%s preserves evidence while selecting the correct oldest candidate", async mode => {
    const short = mode === "EXPIRED" || mode === "TERMINAL";
    const { f, p, env } = await outboundFixture(short ? 1000 : undefined);
    const selectorEnv: NodeJS.ProcessEnv = { ...env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" };
    // Create a genuinely later ordinary source/reply, retaining the old question.
    await prisma.$queryRawUnsafe("SELECT pg_sleep(0.005)::text");
    const next = await reply(f, "Quel est le statut du chantier?");
    const text = "Réponse ordinaire synthétique, aucun envoi.";
    await prisma.personalAssistantOperation.update({ where: { id: next.operationId }, data: { status: "completed", leaseUntil: null, result: { reply: text } } });
    const request = { to: f.from, from: env.TWILIO_PHONE_NUMBER!, text, sourceOperationId: next.operationId };
    const ordinary = await prisma.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId,
      connectorAccountId: f.smsAccountId, kind: "sms_outbound", status: "pending", attempts: 0,
      idempotencyKey: `reply:${next.operationId}`, request, requestHash: sha(JSON.stringify(request)) } });
    const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: p.questionId } });
    expect(question.createdAt.getTime()).toBeLessThan(ordinary.createdAt.getTime());
    if (mode === "STORE_OFF") selectorEnv.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false";
    if (mode === "BRIDGE_OFF") selectorEnv.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "false";
    if (short) await waitForQuestionExpiry(p.id);
    if (mode === "TERMINAL") expect(await maintainSmsTemporalClarifications({ actor: f.actor }, { ...env, ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "true" })).toMatchObject({ expired: 1 });
    if (mode === "GOOGLE_REVOKED" || mode === "MODEL_REVOKED") await prisma.constructionConnectorGrant.update({
      where: { id: mode === "GOOGLE_REVOKED" ? f.google.grants[0].id : f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    if (mode === "IDENTITY_REVISED") await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { updatedAt: new Date() } });
    if (mode === "OWNER_REVISED") await prisma.constructionWorkspaceMember.updateMany({ where: { workspaceId: f.workspaceId, userId: f.userId }, data: { updatedAt: new Date() } });
    const before = { entry: await stored(p.id), budget: await budget(), operations: await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }) };
    const selection = await selectPersonalAutomaticOutboundCandidates({ enabled: true, limit: 1 }, selectorEnv);
    expect(selection.candidates).toEqual([{ id: mode === "ELIGIBLE" ? p.questionId : ordinary.id, idempotencyKey: mode === "ELIGIBLE" ? question.idempotencyKey : ordinary.idempotencyKey }]);
    expect(selection.executionAuthorized).toBe(false);
    expect({ entry: await stored(p.id), budget: await budget(), operations: await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }) }).toEqual(before);
  });
});

describe("native incoming temporal lower commits receipt and acknowledgment together", () => {
  const flags = (f: Fixture) => ({ ...f.env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "true" });
  const snapshot = async (f: Fixture, p: Prepared) => ({ entry: await stored(p.id), budget: await budget(),
    operations: await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }),
    receipts: await prisma.$queryRawUnsafe('SELECT * FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1 ORDER BY id', p.id) });
  it("an orphan bare hour stays deterministic and never completes a source", async () => {
    const f = await fixture(), claim = await reply(f), before = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } });
    expect(await processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f))).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "NO_WAITING_QUESTION", sourceCompleted: false });
    expect(await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } })).toEqual(before);
  });
  it.each(["14h", "Ajoute inspection vendredi à 14h"])("a retained calendar confirmation reserves %s without interpreting it", async body => {
    const f = await fixture(); await prepare(f, await f.candidate("calendar")); const claim = await reply(f, body);
    const before = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } });
    expect(await processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f))).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_CONTEXT", sourceCompleted: false });
    expect(await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } })).toEqual(before);
  });
  it("two distinct live reply backends commit at most one canonical receipt and acknowledgment", async () => {
    const f = await fixture(), p = await prepare(f, await f.candidate("temporal", true)); await syntheticAccepted(f, p);
    const claims = [await reply(f), await reply(f)], nativeTransaction = prisma.$transaction.bind(prisma), pids: number[] = [];
    let release!: () => void, timedOut = false;
    const ready = new Promise<void>(resolve => { release = resolve; }), timer = setTimeout(() => { timedOut = true; release(); }, 750);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof prisma.$transaction>[1]) => nativeTransaction(async tx => {
      const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); pids.push(backend.pid); if (pids.length === 2) release();
      await ready; return work(tx);
    }, options)) as typeof prisma.$transaction);
    let outcomes: PromiseSettledResult<Awaited<ReturnType<typeof processSmsTemporalReply>>>[];
    try { outcomes = await Promise.allSettled(claims.map(claim => processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f)))); }
    finally { clearTimeout(timer); release(); wrapped.mockRestore(); }
    expect(timedOut).toBe(false); expect(new Set(pids).size).toBe(2);
    let handled = 0;
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        if (outcome.value.status === "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED") { handled++; expect(outcome.value.committed).toBe(true); }
        else expect(outcome.value).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", sourceCompleted: false });
      } else {
        const e = outcome.reason as { code?: string; meta?: { code?: string } };
        expect(e.code === "P2034" || e.code === "P2010" && e.meta?.code === "40001").toBe(true);
      }
    }
    expect(handled).toBe(1);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).toHaveLength(1);
    expect(await prisma.personalAssistantOperation.count({ where: { idempotencyKey: { in: claims.map(claim => `reply:${claim.operationId}`) } } })).toBe(1);
    expect((await stored(p.id)).phase).toBe("CONSUMED");
  });
  it.each(["14h", "3h"])("%s uses the canonical consumer once and creates exactly one matching unsent acknowledgment", async body => {
    const f = await fixture(), p = await prepare(f, await f.candidate("temporal", true)); await syntheticAccepted(f, p);
    const claim = await reply(f, body), beforeBudget = await budget();
    const result = await processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f));
    expect(result).toMatchObject({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: body === "14h" ? "CORRELATED_NOT_EXECUTED" : "REFUSED", committed: true, sourceCompleted: true, executionAuthorized: false });
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: claim.operationId } });
    const acks = await prisma.personalAssistantOperation.findMany({ where: { idempotencyKey: `reply:${claim.operationId}` } });
    expect(source).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null }); expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false,
      request: { to: f.from, from: f.env.TWILIO_PHONE_NUMBER, sourceOperationId: claim.operationId, text: (source.result as { reply: string }).reply } });
    expect(await budget()).toEqual(beforeBudget);
    const after = await snapshot(f, p);
    await expect(processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f))).rejects.toThrow("SOURCE_CLAIM_REQUIRED");
    expect(await snapshot(f, p)).toEqual(after);
  });
  it.each(["Qu’est-ce que j’ai demain?", "Ajoute inspection vendredi à 14h", "CONFIRME ENDVERA AGENDA bois lac lune sable"])("independent or reserved message %s does not consume a pending answer", async body => {
    const f = await fixture(), p = await prepare(f, await f.candidate("temporal", true)); await syntheticAccepted(f, p);
    const claim = await reply(f, body), before = await snapshot(f, p);
    const result = await processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, flags(f));
    expect(result).toMatchObject({ sourceCompleted: false, executionAuthorized: false });
    expect(result.status).toBe(body.startsWith("Qu") ? "INDEPENDENT_CALENDAR_DAY_READ" : body.startsWith("CONFIRME") ? "RESERVED_CALENDAR_CONFIRMATION" : "TEMPORAL_REPLY_FIXED_RESPONSE");
    expect(await snapshot(f, p)).toEqual(before);
  });
  it.each(["OFF", "BEFORE_ACCEPTANCE", "REVOKED"])("%s cannot consume or prepare an acknowledgment", async mode => {
    const f = await fixture(), p = await prepare(f, await f.candidate("temporal", true));
    if (mode !== "BEFORE_ACCEPTANCE") await syntheticAccepted(f, p);
    const claim = await reply(f), env = flags(f);
    if (mode === "OFF") env.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED = "false";
    if (mode === "REVOKED") await prisma.constructionConnectorGrant.update({ where: { id: f.modelGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    const before = await snapshot(f, p);
    const run = processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, env);
    if (mode === "REVOKED") await expect(run).rejects.toThrow();
    else expect(await run).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", sourceCompleted: false });
    expect(await snapshot(f, p)).toEqual(before);
  });
  it.each(["AFTER_INSERT_FAILURE", "AFTER_INSERT_REVOKED"])("%s rolls back the real consumer/source CAS and acknowledgment insert", async mode => {
    const f = await fixture(), p = await prepare(f, await f.candidate("temporal", true)); await syntheticAccepted(f, p);
    const claim = await reply(f), env = flags(f), before = await snapshot(f, p);
    const nativeTransaction = prisma.$transaction.bind(prisma);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof prisma.$transaction>[1]) => nativeTransaction(async tx => {
      const proxy = new Proxy(tx, { get(target, key) {
        if (key === "personalAssistantOperation") return new Proxy(target.personalAssistantOperation, { get(delegate, method) {
          if (method === "create") return async (args: Parameters<typeof delegate.create>[0]) => {
            const row = await delegate.create(args);
            if (mode === "AFTER_INSERT_FAILURE") throw new Error("SYNTHETIC_AFTER_ACK_INSERT");
            env.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED = "false"; return row;
          };
          return Reflect.get(delegate, method);
        } });
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
      return work(proxy);
    }, options)) as typeof prisma.$transaction);
    try { await expect(processSmsTemporalReply({ claim, deadlineAt: Date.now() + 5000 }, env)).rejects.toThrow(mode === "AFTER_INSERT_FAILURE" ? "SYNTHETIC_AFTER_ACK_INSERT" : "PROCESSING_DISABLED"); }
    finally { wrapped.mockRestore(); }
    expect(await snapshot(f, p)).toEqual(before);
  });
});

describe("native temporal expiry preserves evidence and frees only the active ledger mirror", () => {
  it.each(["PREPARED", "WAITING", "REVOKED"])("expires %s once, retains source/question/budget/history", async mode => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c, { ttlMs: 1000 });
    if (mode === "WAITING") await syntheticAccepted(f, p);
    if (mode === "REVOKED") await prisma.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    const sourceBefore = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: c.claim.operationId } });
    const questionBefore = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: p.questionId } });
    const budgetBefore = await budget(), entryBefore = await stored(p.id);
    const env = { ...f.env, ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "true" };
    expect(await maintainSmsTemporalClarifications({ actor: f.actor }, { ...env, ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "false" })).toMatchObject({ status: "DISABLED", expired: 0 });
    await waitForQuestionExpiry(p.id);
    expect(await maintainSmsTemporalClarifications({ actor: f.actor }, env)).toMatchObject({ status: "TEMPORAL_MAINTENANCE_COMMITTED", expired: 1, committed: true, executionAuthorized: false });
    const after = await stored(p.id);
    expect(after).toEqual({ ...entryBefore, phase: "EXPIRED", updatedAt: (after as unknown as { updatedAt: Date }).updatedAt });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: c.claim.operationId } })).toEqual(sourceBefore);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: p.questionId } })).toEqual(questionBefore);
    expect(await budget()).toEqual(budgetBefore);
    expect(await prisma.$queryRawUnsafe('SELECT id,active FROM "PersonalSmsConversationExpectation" WHERE "clarificationId"=$1', p.id)).toEqual([{ id: `temporal:${p.id}`, active: false }]);
    expect(await maintainSmsTemporalClarifications({ actor: f.actor }, env)).toMatchObject({ expired: 0 });
    expect(await stored(p.id)).toEqual(after);
  });
  it("two real backends expire the same question at most once without losing permanent history", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c, { ttlMs: 1000 });
    await waitForQuestionExpiry(p.id);
    const env = { ...f.env, ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "true" }, pids: number[] = [];
    let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; }), timer = setTimeout(release, 2000);
    const outcomes = await Promise.allSettled([0, 1].map(() => prisma.$transaction(async tx => {
      const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); pids.push(backend.pid); if (pids.length === 2) release();
      await ready;
      return maintainSmsTemporalClarificationsInTransaction(tx, { actor: f.actor }, env);
    }, txOptions))).finally(() => clearTimeout(timer));
    expect(new Set(pids).size).toBe(2);
    const successes = outcomes.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof maintainSmsTemporalClarificationsInTransaction>>> => r.status === "fulfilled");
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") expect(outcome.value).toMatchObject({ status: "TEMPORAL_MAINTENANCE_PREPARED_NOT_COMMITTED", committed: false });
      else {
        const error = outcome.reason as { code?: string; meta?: { code?: string } };
        expect(error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001")).toBe(true);
      }
    }
    expect(successes.reduce((n, r) => n + r.value.expired, 0)).toBe(1);
    expect((await stored(p.id)).phase).toBe("EXPIRED");
    expect(await prisma.$queryRawUnsafe('SELECT id,active FROM "PersonalSmsConversationExpectation" WHERE "clarificationId"=$1', p.id)).toEqual([{ id: `temporal:${p.id}`, active: false }]);
  });
});

describe("real SMS worker prepares its temporal question with a synthetic-only candidate", () => {
  it.each(["14h", "3h", "Ajoute une visite vendredi", "OFF"])("existing ingress worker routes %s without another model or source completion", async mode => {
    const x = await outboundFixture(), { f, p } = x; await syntheticAccepted(f, p);
    const body = mode === "OFF" ? "14h" : mode;
    await prisma.$queryRawUnsafe("SELECT pg_sleep(0.005)::text");
    const wire = { accountSid: f.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.from, to: x.env.TWILIO_PHONE_NUMBER!, body };
    const incoming = await enqueuePersonalSms({ ...wire, contentHash: sha(JSON.stringify(wire)) });
    const env = { ...x.env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: mode === "OFF" ? "false" : "true" };
    const model = vi.fn(async () => { throw new Error("UNEXPECTED_SECOND_MODEL"); }), engine = vi.fn(async () => { throw new Error("UNEXPECTED_LEGACY_ENGINE"); });
    const beforeBudget = await budget(), beforeQuestion = await stored(p.id);
    expect(await processPersonalSms(incoming.operationId, env, { model, engine })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled();
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: incoming.operationId } });
    const acks = await prisma.personalAssistantOperation.findMany({ where: { idempotencyKey: `reply:${incoming.operationId}` } });
    expect(source).toMatchObject({ status: "completed", attempts: 1, leaseUntil: null }); expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false, request: { text: (source.result as { reply: string }).reply } });
    const correlated = mode === "14h" || mode === "3h";
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).toHaveLength(correlated ? 1 : 0);
    if (!correlated) expect(await stored(p.id)).toEqual(beforeQuestion);
    expect(await budget()).toEqual(beforeBudget);
    expect(await processPersonalSms(incoming.operationId, env, { model, engine })).toMatchObject({ status: "NOT_PENDING" });
    expect(await prisma.personalAssistantOperation.count({ where: { idempotencyKey: `reply:${incoming.operationId}` } })).toBe(1);
  });
  it.each(["ON", "OFF", "REVOKED_AFTER_SOURCE_CAS"])("retains atomic source/question/registry with preparation %s", async mode => {
    const f = await fixture();
    const env: NodeJS.ProcessEnv = { ...f.env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED",
      TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token",
      ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: mode === "OFF" ? "false" : "true" };
    let modelCalls = 0, reachedFinalCas = false;
    const nativeTransaction = prisma.$transaction.bind(prisma);
    const wrapped = mode !== "REVOKED_AFTER_SOURCE_CAS" ? null : vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }) =>
      nativeTransaction(async tx => {
        const guarded = new Proxy(tx, { get(target, key) {
          if (key !== "$executeRawUnsafe") return Reflect.get(target, key);
          return async (sql: string, ...args: unknown[]) => {
            const result = await tx.$executeRawUnsafe(sql, ...args);
            if (sql.includes("status='completed'") && sql.includes("result=$6::jsonb") && args[0] === f.sourceOperationId) {
              expect(result).toBe(1); reachedFinalCas = true; env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false";
            }
            return result;
          };
        } });
        return work(guarded);
      }, options)) as typeof prisma.$transaction);
    let result;
    try {
      result = await processPersonalSms(f.sourceOperationId, env, { model: async ctx => {
        modelCalls++;
        const c = await f.candidate("temporal", true, ctx.claim);
        return { reply: "Proposition synthétique à vérifier.", finalizeReview: tx => prepareStoredPersonalIntentReview(tx,
          { enabled: true, ...f.actor, sourceOperationId: c.claim.operationId, modelChildOperationId: c.childId }, env) };
      } });
    } finally { wrapped?.mockRestore(); }
    expect(modelCalls).toBe(1);
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    const questions = await prisma.personalAssistantOperation.findMany({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } });
    const entries = await prisma.$queryRawUnsafe<Array<{ phase: string; questionOutboundOperationId: string }>>('SELECT phase,"questionOutboundOperationId" FROM "PersonalSmsTemporalClarification" WHERE "workspaceId"=$1', f.workspaceId);
    if (mode === "REVOKED_AFTER_SOURCE_CAS") {
      expect(reachedFinalCas).toBe(true); expect(result).toMatchObject({ status: "REVIEW_REQUIRED", recorded: true });
      expect(source.status).toBe("uncertain"); expect(questions).toEqual([]); expect(entries).toEqual([]);
    } else {
      expect(result).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" }); expect(source.status).toBe("completed");
      expect(questions).toHaveLength(1); expect(questions[0]).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false });
      expect((questions[0].request as { text: string }).text).toBe((source.result as { reply: string }).reply);
      expect(entries).toEqual(mode === "OFF" ? [] : [{ phase: "PREPARED", questionOutboundOperationId: questions[0].id }]);
    }
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(0);
  });
});

describe("standalone temporal lower uses real SQL before and after the existing question", () => {
  it.each(["START", "END"])("prepares only %s ambiguity and commits exact question plus source CAS", async slot => {
    const f = await fixture(slot === "END" ? { body: "Ajoute inspection demain à 14h, fin 3h.", start: "demain à 14h", end: "3h" } : {});
    const c = await f.candidate("temporal", true), env = { ...f.env, ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "true" };
    const beforeBudget = await budget();
    const result = await prisma.$transaction(async tx => {
      const args = { actor: f.actor, sourceClaim: c.claim, modelChildOperationId: c.childId };
      const inspected = await inspectSmsTemporalQuestionPreparationInTransaction(tx, args, env, context());
      expect(inspected).toMatchObject({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED", slot, executionAuthorized: false, registryPrepared: false });
      if (inspected.status !== "ELIGIBLE_QUESTION_NOT_AUTHORIZED") throw new Error("LOWER_NATIVE_ELIGIBILITY_REQUIRED");
      expect(await tx.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } })).toBe(0);
      expect(await tx.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarification" WHERE "workspaceId"=$1', f.workspaceId)).toEqual([]);
      const q = await tx.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId, connectorAccountId: f.smsAccountId,
        kind: "sms_outbound", status: "pending", attempts: 0, idempotencyKey: `reply:${c.claim.operationId}`, request: inspected.request, requestHash: inspected.requestHash } });
      const attached = await attachSmsTemporalQuestionInTransaction(tx, { ...args, questionOutboundOperationId: q.id }, env, context());
      expect(attached).toMatchObject({ status: "PREPARED_FOR_SOURCE_COMMIT", committed: false, executionAuthorized: false });
      if (attached.status !== "PREPARED_FOR_SOURCE_COMMIT") throw new Error("LOWER_NATIVE_ATTACHMENT_REQUIRED");
      const n = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$3::jsonb
        WHERE id=$1 AND status='processing' AND attempts=1 AND "leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC')`, c.claim.operationId, new Date(c.claim.leaseUntil),
      JSON.stringify({ source: "MODEL_REVIEW_ONLY", reply: inspected.wireText, personalModelReview: attached.requiredSourceReview }));
      expect(n).toBe(1);
      return { q, attached, inspected };
    }, txOptions);
    expect((await stored(result.attached.clarificationId)).phase).toBe("PREPARED");
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: c.claim.operationId } });
    expect(source.status).toBe("completed"); expect(source.result).toMatchObject({ reply: result.inspected.wireText });
    const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: result.q.id } });
    expect(question).toMatchObject({ status: "pending", attempts: 0, externalTransportPerformed: false, requestHash: result.inspected.requestHash });
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(0);
    expect(await budget()).toEqual(beforeBudget);
  });
  it("missing-end model template requests full reformulation before any misleading question is inserted", async () => {
    const f = await fixture({ body: "Ajoute inspection demain à 14h.", missingEnd: true }), c = await f.candidate("temporal", true);
    const env = { ...f.env, ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "true" }, beforeCounts = await counts(f.workspaceId), beforeBudget = await budget();
    const result = await prisma.$transaction(tx => inspectSmsTemporalQuestionPreparationInTransaction(tx,
      { actor: f.actor, sourceClaim: c.claim, modelChildOperationId: c.childId }, env, context()), txOptions);
    expect(result).toMatchObject({ status: "REFORMULATION_REQUIRED", reason: "INCOMPLETE_ORIGINAL_TEMPLATE", registryPrepared: false, executionAuthorized: false });
    if (result.status !== "REFORMULATION_REQUIRED") throw new Error("LOWER_NATIVE_REFORMULATION_REQUIRED");
    expect(result.reply).toContain("rendez-vous complet");
    expect(await counts(f.workspaceId)).toEqual(beforeCounts); expect(await budget()).toEqual(beforeBudget);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarification" WHERE "workspaceId"=$1', f.workspaceId)).toEqual([]);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } })).toBe(0);
  });
  it("current grant changed after inspection rolls back the inserted question and source state", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), env = { ...f.env, ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "true" };
    let insertedQuestionId: string | null = null, reachedAttachment = false;
    const beforeBudget = await budget();
    await expect(prisma.$transaction(async tx => {
      const args = { actor: f.actor, sourceClaim: c.claim, modelChildOperationId: c.childId };
      const inspected = await inspectSmsTemporalQuestionPreparationInTransaction(tx, args, env, context());
      if (inspected.status !== "ELIGIBLE_QUESTION_NOT_AUTHORIZED") throw new Error("LOWER_NATIVE_ELIGIBILITY_REQUIRED");
      const q = await tx.personalAssistantOperation.create({ data: { workspaceId: f.workspaceId, createdByUserId: f.userId, connectorAccountId: f.smsAccountId,
        kind: "sms_outbound", status: "pending", attempts: 0, idempotencyKey: `reply:${c.claim.operationId}`, request: inspected.request, requestHash: inspected.requestHash } });
      insertedQuestionId = q.id;
      await tx.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
      reachedAttachment = true;
      return attachSmsTemporalQuestionInTransaction(tx, { ...args, questionOutboundOperationId: q.id }, env, context());
    }, txOptions)).rejects.toThrow("TEMPORAL_REGISTRY_CURRENT_BINDING_REQUIRED");
    expect(reachedAttachment).toBe(true); expect(insertedQuestionId).not.toBeNull();
    expect(await prisma.personalAssistantOperation.findUnique({ where: { id: insertedQuestionId! } })).toBeNull();
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarification" WHERE "workspaceId"=$1', f.workspaceId)).toEqual([]);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: c.claim.operationId } })).toMatchObject({ status: "processing", attempts: 1, leaseUntil: new Date(c.claim.leaseUntil) });
    expect(await prisma.constructionConnectorGrant.findUniqueOrThrow({ where: { id: f.google.grants[0].id } })).toMatchObject({ status: "active" });
    expect(await budget()).toEqual(beforeBudget);
  });
});

describe("ordinary outbox completion atomically marks its temporal question WAITING", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("actual outbox + registry commit under %s with synthetic HTTP only", async zone => {
    const x = await outboundFixture(), nativeTransaction = prisma.$transaction.bind(prisma);
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }) =>
      nativeTransaction(async tx => { await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", zone); return work(tx); }, options)) as typeof prisma.$transaction);
    const transport = vi.fn<typeof fetch>(async () => x.response());
    try {
      await x.approve();
      expect(await dispatchPersonalOutbound(x.p.questionId, x.env, transport)).toMatchObject({ delivered: false });
      const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.p.questionId } });
      const [registry] = await prisma.$queryRawUnsafe<Array<{ phase: string; acceptedAt: Date; acceptedProviderSid: string }>>('SELECT phase,"acceptedAt","acceptedProviderSid" FROM "PersonalSmsTemporalClarification" WHERE id=$1', x.p.id);
      const receipt = question.result as { acceptedAt: string; providerSid: string; delivered: boolean };
      expect(question).toMatchObject({ status: "completed", attempts: 1, externalTransportPerformed: true });
      expect(registry).toMatchObject({ phase: "WAITING", acceptedProviderSid: receipt.providerSid });
      expect(registry.acceptedAt.toISOString()).toBe(receipt.acceptedAt); expect(receipt.delivered).toBe(false);
      expect(await consume(x.f, x.p, await reply(x.f), zone)).toMatchObject({ status: "CORRELATED_NOT_EXECUTED" });
      await expect(dispatchPersonalOutbound(x.p.questionId, x.env, transport)).rejects.toThrow("APPROVAL_REQUIRED");
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { wrapped.mockRestore(); }
  });
  it("attached but OFF refuses the ordinary approval path", async () => {
    const x = await outboundFixture(); x.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "false";
    await expect(x.approve()).rejects.toThrow("BRIDGE_DISABLED");
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.p.questionId } })).status).toBe("pending");
    expect((await stored(x.p.id)).phase).toBe("PREPARED");
  });
  it("post-response Google revocation keeps the entire exposure and never creates WAITING", async () => {
    const x = await outboundFixture(); await x.approve();
    const transport = vi.fn<typeof fetch>(async () => {
      await prisma.constructionConnectorGrant.update({ where: { id: x.f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
      return x.response();
    });
    await expect(dispatchPersonalOutbound(x.p.questionId, x.env, transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.p.questionId } });
    expect(question).toMatchObject({ status: "uncertain", attempts: 1, externalTransportPerformed: true });
    expect(question.reservedCadMicros).toBeGreaterThan(0n); expect(question.result).not.toHaveProperty("acceptedAt");
    expect((await stored(x.p.id)).phase).toBe("PREPARED");
    await expect(dispatchPersonalOutbound(x.p.questionId, x.env, transport)).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("a failed REST status leaves the question PREPARED and cannot retry", async () => {
    const x = await outboundFixture(); await x.approve(); const transport = vi.fn<typeof fetch>(async () => x.response("failed"));
    await expect(dispatchPersonalOutbound(x.p.questionId, x.env, transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const question = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: x.p.questionId } });
    expect(question.status).toBe("uncertain"); expect(question.reservedCadMicros).toBeGreaterThan(0n);
    expect((await stored(x.p.id)).phase).toBe("PREPARED");
    await expect(dispatchPersonalOutbound(x.p.questionId, x.env, transport)).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("OFF temporal registry / real disposable PostgreSQL constraints and source transactions", () => {
  it("OFF does not require valid input or mutate the DB", async () => {
    expect(await prisma.$transaction(tx => prepareSmsTemporalClarificationInTransaction(tx, {} as never, {}, { deadlineAt: NaN }))).toEqual({ status: "DISABLED", executionAuthorized: false });
  });
  it("commits exact complete wire + shared ledger without calendar draft or additional provider work", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), before = await budget(), p = await prepare(f, c);
    expect(await stored(p.id)).toMatchObject({ phase: "PREPARED", failedAttempts: 0 });
    const [ledger] = await prisma.$queryRawUnsafe<Array<{ active: boolean; kind: string; createdAt: Date; clock: Date }>>('SELECT *,clock_timestamp() AS clock FROM "PersonalSmsConversationExpectation" WHERE "clarificationId"=$1', p.id);
    expect(ledger).toMatchObject({ active: true, kind: "TEMPORAL_CLARIFICATION" }); expect(Math.abs(ledger.clock.getTime() - ledger.createdAt.getTime())).toBeLessThan(5000);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(0); expect(await budget()).toEqual(before);
  });
  it("rolls registry, question and shared ledger back if source completion is omitted", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), before = await counts(f.workspaceId);
    await expect(prepare(f, c, { finalize: false })).rejects.toThrow(/temporal final source candidate question binding mismatch/);
    expect(await counts(f.workspaceId)).toEqual(before);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarification" WHERE "workspaceId"=$1', f.workspaceId)).toEqual([]);
  });
  it("rejects lease replacement after registry insertion even if a raw UPDATE tries to complete", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), before = await counts(f.workspaceId);
    let reachedAfterInsert = false;
    await expect(prepare(f, c, { afterInsert: async tx => {
      reachedAfterInsert = true;
      await tx.$executeRawUnsafe('UPDATE "PersonalAssistantOperation" SET "leaseUntil"="leaseUntil"+interval \'1 second\' WHERE id=$1', c.claim.operationId);
      await tx.$executeRawUnsafe('UPDATE "PersonalAssistantOperation" SET status=\'completed\',"leaseUntil"=NULL WHERE id=$1', c.claim.operationId);
    } })).rejects.toThrow(/temporal original live source claim required at completion/); expect(reachedAfterInsert).toBe(true); expect(await counts(f.workspaceId)).toEqual(before);
  });
  it("rejects a source lease expiring after insertion but before the final exact completion", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), before = await counts(f.workspaceId);
    let reachedAfterInsert = false;
    c.claim.leaseUntil = new Date(Date.now() + 1500).toISOString();
    await prisma.personalAssistantOperation.update({ where: { id: c.claim.operationId }, data: { leaseUntil: new Date(c.claim.leaseUntil) } });
    await expect(prepare(f, c, { afterInsert: async tx => {
      reachedAfterInsert = true;
      await tx.$queryRawUnsafe("SELECT pg_sleep(1.55)::text");
    } })).rejects.toThrow(/temporal original live source claim required at completion/);
    expect(reachedAfterInsert).toBe(true); expect(await counts(f.workspaceId)).toEqual(before);
  });
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("preserves canonical DB acceptance time and two-source resolution in %s", async zone => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c, undefined, zone); await syntheticAccepted(f, p, zone);
    const before = await budget(), claim = await reply(f), result = await consume(f, p, claim, zone);
    expect(result).toMatchObject({ status: "CORRELATED_NOT_EXECUTED", executionAuthorized: false, committed: false });
    const row = await stored(p.id); expect(row.phase).toBe("CONSUMED");
    const [receipt] = await prisma.$queryRawUnsafe<Array<{ packet: { status: string; sources: Array<{ body: string }> }; packetHash: string }>>('SELECT * FROM "PersonalSmsTemporalClarificationReply" WHERE id=$1', row.consumedReplyId);
    expect(receipt.packet).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", sources: [{ body: temporalBody }, { body: "14h" }] }); expect(receipt.packetHash).toBe(sha(canonicalJson(receipt.packet)));
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: claim.operationId } })).result).toMatchObject({ syntheticPrior: "preserve", priorClaimResult: { syntheticPrior: "preserve" }, executionAuthorized: false, externalTransportPerformed: false });
    expect(await budget()).toEqual(before); expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "calendar_write" } })).toBe(0);
    await expect(consume(f, p, claim)).rejects.toThrow();
  });
  it("missing immutable acceptedAt refuses; historical updatedAt is never substituted", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c);
    await prisma.personalAssistantOperation.update({ where: { id: p.questionId }, data: { status: "completed", attempts: 1, externalTransportPerformed: true,
      result: { providerSid: `SM${randomUUID().replaceAll("-", "")}`, acceptedByProvider: true, delivered: false, approvalHash: (await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: p.questionId } })).requestHash } } });
    await expect(prisma.$transaction(tx => markSmsTemporalClarificationAskedInTransaction(tx, { actor: f.actor, clarificationId: p.id, questionOutboundOperationId: p.questionId }, f.env, context()), txOptions)).rejects.toThrow();
    expect((await stored(p.id)).phase).toBe("PREPARED");
  });
  it("an SMS received before the durable question receipt cannot become its answer later", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c), oldReply = await reply(f);
    await prisma.$queryRawUnsafe("SELECT pg_sleep(0.005)::text"); await syntheticAccepted(f, p);
    await expect(consume(f, p, oldReply)).rejects.toThrow("CAUSALITY");
    expect((await stored(p.id)).failedAttempts).toBe(0);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).toEqual([]);
  });
  it("another actor cannot load the question or consume its reply", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c); await syntheticAccepted(f, p); const claim = await reply(f);
    await expect(prisma.$transaction(tx => consumeSmsTemporalClarificationInTransaction(tx, { actor: { ...f.actor, userId: "another-user" }, clarificationId: p.id,
      replySourceClaim: { ...claim, userId: "another-user" } }, f.env, context()), txOptions)).rejects.toThrow("OWNER_REQUIRED");
    expect((await stored(p.id)).phase).toBe("WAITING"); expect((await stored(p.id)).failedAttempts).toBe(0);
  });
  it("each rejected SMS increments once; fifth closes active question and preserves evidence", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c); await syntheticAccepted(f, p);
    for (let n = 1; n <= 5; n++) {
      const claim = await reply(f, "oui"); expect(await consume(f, p, claim)).toMatchObject({ status: "REFUSED" });
      expect((await stored(p.id)).failedAttempts).toBe(n); await expect(consume(f, p, claim)).rejects.toThrow(); expect((await stored(p.id)).failedAttempts).toBe(n);
    }
    expect((await stored(p.id)).phase).toBe("REFUSED");
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsConversationExpectation" WHERE "clarificationId"=$1 AND active', p.id)).toEqual([]);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('DELETE FROM "PersonalSmsConversationExpectation" WHERE "clarificationId"=$1', p.id)).rejects.toThrow();
  });
  it("revocation remains possible but prevents attaching or consuming evidence", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c); await syntheticAccepted(f, p); const claim = await reply(f);
    await prisma.constructionConnectorGrant.update({ where: { id: f.google.grants[0].id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    await expect(consume(f, p, claim)).rejects.toThrow(); expect((await stored(p.id)).phase).toBe("WAITING");
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).toEqual([]);
  });
  it("rejects a minimal forged ACCEPTED packet at the actual INSERT trigger", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c); await syntheticAccepted(f, p); const claim = await reply(f);
    let reachedInsert = false;
    await expect(prisma.$transaction(async tx => {
      const guarded = { $queryRawUnsafe: tx.$queryRawUnsafe.bind(tx), $executeRawUnsafe: async (sql: string, ...args: unknown[]) => {
        if (sql.includes('INSERT INTO "PersonalSmsTemporalClarificationReply"')) {
          reachedInsert = true;
          const packet = { executionAuthorized: false, persistencePerformed: false }; args[8] = "ACCEPTED"; args[9] = JSON.stringify(packet); args[10] = sha(canonicalJson(packet));
        }
        return tx.$executeRawUnsafe(sql, ...args);
      } } as unknown as Prisma.TransactionClient;
      return consumeSmsTemporalClarificationInTransaction(guarded, { actor: f.actor, clarificationId: p.id, replySourceClaim: claim }, f.env, context());
    }, txOptions)).rejects.toThrow(/temporal accepted packet must be a bound resolution/);
    expect(reachedInsert).toBe(true);
    expect((await stored(p.id)).phase).toBe("WAITING");
    expect(await prisma.$queryRawUnsafe('SELECT id FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=$1', p.id)).toEqual([]);
  });
  it("competing consumption of the same SMS commits at most one permanent receipt", async () => {
    const f = await fixture(), c = await f.candidate("temporal", true), p = await prepare(f, c); await syntheticAccepted(f, p); const claim = await reply(f);
    const results = await Promise.allSettled([consume(f, p, claim), consume(f, p, claim)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int FROM "PersonalSmsTemporalClarificationReply" WHERE "sourceOperationId"=$1', claim.operationId)).toEqual([{ count: 1 }]);
    expect((await stored(p.id)).phase).toBe("CONSUMED");
  });
  it("five creations across both types share one permanent hourly cap", async () => {
    const f = await fixture();
    for (let n = 0; n < 5; n++) {
      const c = await f.candidate(n % 2 ? "calendar" : "temporal", n === 0), p = await prepare(f, c);
      const table = p.kind === "calendar" ? "PersonalCalendarSmsConfirmation" : "PersonalSmsTemporalClarification";
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET phase='REFUSED' WHERE id=$1`, p.id);
    }
    const sixth = await f.candidate(); await expect(prepare(f, sixth)).rejects.toThrow(/conversation global creation limit/);
    const [count] = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int FROM "PersonalSmsConversationExpectation" WHERE namespace=$1', sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", f.from, f.env.TWILIO_PHONE_NUMBER])));
    expect(count.count).toBe(5);
    await expect(prisma.$executeRawUnsafe('UPDATE "PersonalSmsConversationExpectation" SET "createdAt"="createdAt"-interval \'2 hours\' WHERE namespace=$1', sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", f.from, f.env.TWILIO_PHONE_NUMBER])))).rejects.toThrow();
    // Directly supplied ledger timestamps cannot alter the DB-clock cap. These
    // rows would also collide with permanent uniqueness; require the cap error
    // specifically to prove the BEFORE guard runs before that independent fence.
    for (const forgedTime of ["2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"]) {
      await expect(prisma.$transaction(tx => tx.$executeRawUnsafe(`INSERT INTO "PersonalSmsConversationExpectation"
        (id,namespace,kind,"confirmationId","clarificationId",active,"createdAt")
        SELECT id,namespace,kind,"confirmationId","clarificationId",active,($2::timestamptz AT TIME ZONE 'UTC')
        FROM "PersonalSmsConversationExpectation" WHERE namespace=$1 ORDER BY id LIMIT 1`,
      sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", f.from, f.env.TWILIO_PHONE_NUMBER])), forgedTime), txOptions)).rejects.toThrow(/conversation global creation limit/);
    }
  });
  it("keeps one visible pair namespace after re-pairing into another workspace/owner", async () => {
    const first = await fixture(), firstCandidate = await first.candidate("temporal", true), firstQuestion = await prepare(first, firstCandidate);
    const namespace = (await stored(firstQuestion.id)).namespace;
    await prisma.constructionCommunicationIdentity.update({ where: { id: first.identityId }, data: { status: "revoked", permissions: [] } });
    const second = await fixture();
    await prisma.constructionCommunicationIdentity.update({ where: { id: second.identityId }, data: { normalizedAddress: first.from } });
    const original = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: second.sourceOperationId } });
    const old = original.request as { accountSid: string; messageSid: string; to: string; body: string; identityId: string };
    const wire = { accountSid: old.accountSid, messageSid: old.messageSid, from: first.from, to: old.to, body: old.body }, requestHash = sha(JSON.stringify(wire));
    await prisma.personalAssistantOperation.update({ where: { id: original.id }, data: { request: { schemaVersion: 1, ...wire, contentHash: requestHash, identityId: old.identityId }, requestHash } });
    // candidate() closes over the same fixture's from field at creation time;
    // original=true uses the explicitly rebound stored source, not a new SMS.
    second.from = first.from;
    const secondCandidate = await second.candidate("temporal", true);
    await expect(prepare(second, secondCandidate)).rejects.toThrow(/sms_conversation_one_active_pair|namespace/);
    expect((await stored(firstQuestion.id)).phase).toBe("PREPARED");
    await prisma.$executeRawUnsafe('UPDATE "PersonalSmsTemporalClarification" SET phase=\'REFUSED\' WHERE id=$1', firstQuestion.id);
    const secondQuestion = await prepare(second, secondCandidate);
    expect((await stored(secondQuestion.id)).namespace).toBe(namespace);
    expect(await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int FROM "PersonalSmsConversationExpectation" WHERE namespace=$1', namespace)).toEqual([{ count: 2 }]);
  });
  it("two native backends competing for the fifth creation commit only one even when both terminalize", async () => {
    const f = await fixture();
    for (let n = 0; n < 4; n++) {
      const c = await f.candidate(n % 2 ? "calendar" : "temporal", n === 0), p = await prepare(f, c);
      const table = p.kind === "calendar" ? "PersonalCalendarSmsConfirmation" : "PersonalSmsTemporalClarification";
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET phase='REFUSED' WHERE id=$1`, p.id);
    }
    const candidates = [await f.candidate("temporal"), await f.candidate("calendar")], pids: number[] = [];
    let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; }), timer = setTimeout(release, 3000);
    const results = await Promise.allSettled(candidates.map(c => prisma.$transaction(async tx => {
      const [backend] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); pids.push(backend.pid); if (pids.length === 2) release();
      await ready; const p = await prepareIn(tx, f, c);
      const table = p.kind === "calendar" ? "PersonalCalendarSmsConfirmation" : "PersonalSmsTemporalClarification";
      await tx.$executeRawUnsafe(`UPDATE "${table}" SET phase='REFUSED' WHERE id=$1`, p.id);
      return p;
    }, txOptions))).finally(() => clearTimeout(timer));
    expect(new Set(pids).size).toBe(2); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const namespace = sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", f.from, f.env.TWILIO_PHONE_NUMBER]));
    expect(await prisma.$queryRawUnsafe<Array<{ count: number; active: number }>>('SELECT count(*)::int,count(*) FILTER (WHERE active)::int AS active FROM "PersonalSmsConversationExpectation" WHERE namespace=$1', namespace)).toEqual([{ count: 5, active: 0 }]);
  });
  it("native overlapping clarification/confirmation creation has one winner and different backends", async () => {
    const f = await fixture(), a = await f.candidate("temporal", true), b = await f.candidate("calendar"), pids: number[] = [];
    let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(release, 3000);
    const results = await Promise.allSettled([a, b].map(c => prisma.$transaction(async tx => {
      const [row] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid"); pids.push(row.pid); if (pids.length === 2) release();
      await ready; return prepareIn(tx, f, c);
    }, txOptions))).finally(() => clearTimeout(timer));
    expect(new Set(pids).size).toBe(2); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const namespace = sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", f.from, f.env.TWILIO_PHONE_NUMBER]));
    expect(await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int FROM "PersonalSmsConversationExpectation" WHERE namespace=$1 AND active', namespace)).toEqual([{ count: 1 }]);
  });
});
