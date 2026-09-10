import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { startPhonePairing, acceptPersonalSms, personalPhoneStatus, disconnectPersonalPhone } from "@/server/personal-assistant/phone-pairing";
import { preparePersonalOutbound, approvePersonalOutbound, dispatchPersonalOutbound, personalOutboxForOwner, sendAutomaticPersonalReply } from "@/server/personal-assistant/outbox";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import { storeTwilioReceipt } from "@/server/personal-assistant/delivery-receipts";
const dbUrl = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dbName = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(dbName) || dbUrl.pathname !== `/${dbName}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
afterAll(() => prisma.$disconnect());
let phoneCounter = 200;
async function fixture(budget = "10") {
  const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: `synthetic-${randomUUID()}`, ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_VOICE_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`, TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status", ENDVERA_PERSONAL_SMS_INGRESS_ENABLED: "true", ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date(Date.now() - 1000).toISOString(), ENDVERA_TWILIO_RATE_REVIEW_REF: "synthetic-rate-bound", ENDVERA_PERSONAL_BUDGET_CAD: budget, ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10", ENDVERA_VOICE_MINUTE_RESERVE_CAD: "0.50" };
  const user = await prisma.user.create({ data: { name: "Synthetic phone owner", email: `phone-210-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic phone workspace" });
  const pairing = await startPhonePairing({ userId: user.id, workspaceId, allowSelfSms: true, allowSelfVoice: true }, env);
  const envelope = { accountSid: env.TWILIO_ACCOUNT_SID, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: `+15005550${++phoneCounter}`, to: pairing.number, body: pairing.text, contentHash: createHash("sha256").update(pairing.text).digest("hex") };
  await acceptPersonalSms(envelope, env);
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const params = new URLSearchParams(String(init?.body));
    return Response.json({ sid: `SM${randomUUID().replaceAll("-", "")}`, account_sid: env.TWILIO_ACCOUNT_SID, from: params.get("From"), to: params.get("To"), status: "queued" });
  });
  return { env, userId: user.id, workspaceId, envelope, transport };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) { return preparePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, kind: "sms_outbound", to: f.envelope.from, text: "Bonjour synthétique", requestId: randomUUID() }, f.env); }
describe("PostgreSQL phone pairing, immutable approval and outbound reservation", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("persists DB-observed acceptance in canonical UTC under %s, not the provider timestamp", async timezone => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const nativeTransaction = prisma.$transaction.bind(prisma);
    const transaction = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) =>
      nativeTransaction(async tx => {
        await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
        return work(tx);
      }, options)) as typeof prisma.$transaction);
    const clock = async () => (await prisma.$queryRawUnsafe<{ epochMs: number }[]>("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::double precision AS \"epochMs\""))[0].epochMs;
    let responseObservedAfter = 0;
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      responseObservedAfter = await clock();
      return Response.json({ sid: `SM${randomUUID().replaceAll("-", "")}`, status: "queued", account_sid: f.env.TWILIO_ACCOUNT_SID,
        from: body.get("From"), to: body.get("To"), acceptedAt: "2099-01-01T00:00:00.000Z" });
    });
    try {
      const sent = await dispatchPersonalOutbound(prepared.operationId, f.env, transport);
      const after = await clock();
      const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
      const receipt = row.result as { acceptedAt: string; providerSid: string; acceptedByProvider: boolean; delivered: boolean; approvalHash: string };
      expect(row).toMatchObject({ status: "completed", attempts: 1, externalTransportPerformed: true, reservedCadMicros: 100000n });
      expect(receipt).toMatchObject({ providerSid: sent.providerSid, acceptedByProvider: true, delivered: false, approvalHash: prepared.requestHash });
      expect(receipt.acceptedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(new Date(receipt.acceptedAt).toISOString()).toBe(receipt.acceptedAt);
      expect(Date.parse(receipt.acceptedAt)).toBeGreaterThanOrEqual(responseObservedAfter);
      expect(Date.parse(receipt.acceptedAt)).toBeLessThanOrEqual(after);
      expect(sent).not.toHaveProperty("acceptedAt"); expect(sent.delivered).toBe(false);
      await expect(dispatchPersonalOutbound(row.id, f.env, transport)).rejects.toThrow("APPROVAL_REQUIRED");
      expect(transport).toHaveBeenCalledOnce();
      expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: row.id } })).result).toEqual(row.result);
    } finally { transaction.mockRestore(); }
  });
  it.each(["failed", "undelivered", "canceled"])("retains uncertainty, not an acceptance receipt, after a 2xx SMS %s response", async status => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      return Response.json({ sid: `SM${randomUUID().replaceAll("-", "")}`, status, account_sid: f.env.TWILIO_ACCOUNT_SID, from: body.get("From"), to: body.get("To") });
    });
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(row).toMatchObject({ status: "uncertain", attempts: 1, externalTransportPerformed: true, reservedCadMicros: 100000n });
    expect(row.result).toMatchObject({ reviewRequired: true, automaticRetry: false, deliveryConfirmed: false });
    expect(row.result).not.toHaveProperty("acceptedAt"); expect(row.result).not.toHaveProperty("acceptedByProvider");
    await expect(dispatchPersonalOutbound(row.id, f.env, transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(transport).toHaveBeenCalledOnce();
    expect((await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: row.budgetId! } })).reservedCadMicros).toBe(100000n);
  });
  it("automatically replies only to the original sender with standing self-SMS consent", async () => {
    const f = await fixture(); const workerEnv = { ...f.env, ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" };
    const wire = { accountSid: f.envelope.accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from: f.envelope.from, to: f.envelope.to, body: "Bonjour" };
    const inbound = await enqueuePersonalSms({ ...wire, contentHash: createHash("sha256").update(JSON.stringify(wire)).digest("hex") });
    await processPersonalSms(inbound.operationId, workerEnv, { engine: async () => ({ reply: "Bonjour, réponse synthétique." }) });
    const reply = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { idempotencyKey: `reply:${inbound.operationId}` } });
    await sendAutomaticPersonalReply(reply.id, workerEnv, f.transport);
    expect(new URLSearchParams(String(f.transport.mock.calls[0][1]?.body)).get("To")).toBe(f.envelope.from);
    const unrelated = await prepare(f); await expect(sendAutomaticPersonalReply(unrelated.operationId, workerEnv, f.transport)).rejects.toThrow("AUTOMATIC_REPLY_REFUSED"); expect(f.transport).toHaveBeenCalledOnce();
  });
  it("binds proof from signed intake once, never a phone entered as a string", async () => {
    const f = await fixture();
    expect((await personalPhoneStatus(f.userId, f.workspaceId, f.env)).boundPhone).toBe(f.envelope.from);
    expect((await acceptPersonalSms(f.envelope, f.env)).replayed).toBe(true);
    await expect(acceptPersonalSms({ ...f.envelope, from: "+15005550999" }, f.env)).rejects.toThrow("PAIRING_ALREADY_USED");
    await expect(preparePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, kind: "sms_outbound", to: "+15005550999", text: "No", requestId: randomUUID() }, f.env)).rejects.toThrow("VERIFIED_SELF_RECIPIENT_REQUIRED");
  });
  it("sends once after exact approval and records delivery separately", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    const input = { userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash };
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED");
    await approvePersonalOutbound(input, f.env);
    await expect(approvePersonalOutbound(input, f.env)).rejects.toThrow("APPROVAL_REFUSED_OR_ALREADY_USED");
    const sent = await dispatchPersonalOutbound(prepared.operationId, f.env, f.transport); expect(sent.delivered).toBe(false);
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.transport).toHaveBeenCalledOnce();
    expect((await personalOutboxForOwner(f.userId, f.workspaceId)).operations[0].deliveryConfirmed).toBe(false);
    const receipt = { operationId: prepared.operationId, providerSid: sent.providerSid, status: "delivered", kind: "sms_outbound", from: f.envelope.to, to: f.envelope.from };
    await storeTwilioReceipt(receipt); await storeTwilioReceipt(receipt);
    expect((await personalOutboxForOwner(f.userId, f.workspaceId)).operations[0].deliveryConfirmed).toBe(true);
    expect(await prisma.personalAssistantDeliveryReceipt.count({ where: { operationId: prepared.operationId } })).toBe(1);
    // Simulate an early callback with a different provider ID retained before
    // the REST outcome became available: projection must withhold success.
    await prisma.personalAssistantDeliveryReceipt.create({ data: { id: randomUUID(), operationId: prepared.operationId, providerSid: `SM${"e".repeat(32)}`, status: "delivered" } });
    expect((await personalOutboxForOwner(f.userId, f.workspaceId)).operations[0].deliveryConfirmed).toBe(false);
  });
  it("serializes competing reservations and never exceeds the configured local allowance", async () => {
    const f = await fixture("0.10"); const a = await prepare(f); const b = await prepare(f);
    for (const operation of [a, b]) await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: operation.operationId, expectedRequestHash: operation.requestHash }, f.env);
    const results = await Promise.allSettled([dispatchPersonalOutbound(a.operationId, f.env, f.transport), dispatchPersonalOutbound(b.operationId, f.env, f.transport)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(f.transport).toHaveBeenCalledOnce();
    const row = await prisma.personalAssistantOperation.findFirstOrThrow({ where: { workspaceId: f.workspaceId, budgetId: { not: null } } });
    expect((await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: row.budgetId! } })).reservedCadMicros).toBe(100000n);
  });
  it("retains reservation and refuses replay after an uncertain transport", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const failing = vi.fn().mockRejectedValue(new Error("synthetic timeout"));
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, failing)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, failing)).rejects.toThrow("APPROVAL_REQUIRED");
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } }); expect(row.status).toBe("uncertain"); expect(row.reservedCadMicros).toBe(100000n); expect(failing).toHaveBeenCalledOnce();
  });
  it("competing dispatchers of the same approval retain exactly one claim and reservation", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const results = await Promise.allSettled([dispatchPersonalOutbound(prepared.operationId, f.env, f.transport), dispatchPersonalOutbound(prepared.operationId, f.env, f.transport)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(f.transport).toHaveBeenCalledTimes(1);
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(row).toMatchObject({ status: "completed", attempts: 1, reservedCadMicros: 100000n });
    expect((await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: row.budgetId! } })).reservedCadMicros).toBe(100000n);
  });
  it("revokes pending authority without sending", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    await disconnectPersonalPhone(f.userId, f.workspaceId);
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED"); expect(f.transport).not.toHaveBeenCalled();
  });
  it("does not reserve or dispatch after the caller deadline has already expired", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, f.transport, { deadlineAt: Date.now() - 1 })).rejects.toThrow();
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(row).toMatchObject({ status: "approved", attempts: 0, budgetId: null });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("a late accepted response cannot overwrite an independently retained uncertain state", async () => {
    const f = await fixture(); const prepared = await prepare(f);
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      const processing = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
      expect(processing.status).toBe("processing");
      await prisma.personalAssistantOperation.update({ where: { id: processing.id }, data: { status: "uncertain", leaseUntil: null,
        result: { reviewRequired: true, reason: "SYNTHETIC_RECOVERY_WON", automaticRetry: false } } });
      return Response.json({ sid: `SM${"f".repeat(32)}`, account_sid: f.env.TWILIO_ACCOUNT_SID, from: f.env.TWILIO_PHONE_NUMBER, to: f.envelope.from, status: "queued" });
    });
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(row).toMatchObject({ status: "uncertain", result: { reason: "SYNTHETIC_RECOVERY_WON" } });
    expect(row.reservedCadMicros).toBe(100000n);
    await expect(dispatchPersonalOutbound(row.id, f.env, transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("caller cancellation after the one transport attempt retains uncertainty and the full hold", async () => {
    const f = await fixture(); const prepared = await prepare(f); const controller = new AbortController();
    await approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, f.env);
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(false); controller.abort(); expect(init?.signal?.aborted).toBe(true);
      return Response.json({ sid: `SM${"e".repeat(32)}`, account_sid: f.env.TWILIO_ACCOUNT_SID, from: f.env.TWILIO_PHONE_NUMBER, to: f.envelope.from, status: "queued" });
    });
    await expect(dispatchPersonalOutbound(prepared.operationId, f.env, transport, { signal: controller.signal })).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(row.status).toBe("uncertain"); expect(row.reservedCadMicros).toBe(100000n); expect(transport).toHaveBeenCalledTimes(1);
    expect((await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: row.budgetId! } })).reservedCadMicros).toBe(100000n);
  });
});
