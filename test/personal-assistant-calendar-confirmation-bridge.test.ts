import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { inspectPreparedSmsCalendarConfirmation, prepareSmsCalendarConfirmation, SMS_CALENDAR_CONFIRMATION_VERSION } from "@/server/personal-assistant/calendar-sms-confirmation-contract";
import { inspectCalendarConfirmationBridgePreparationInTransaction, requireCalendarConfirmationOutboundSourceInTransaction } from "@/server/personal-assistant/calendar-confirmation-authority";
import { prepareCalendarConfirmationOutboundInTransaction } from "@/server/personal-assistant/calendar-confirmation-bridge";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const revision = new Date("2026-09-10T12:00:00.000Z"), now = new Date("2026-09-10T12:01:00.000Z");
  const actor = { userId: "owner", workspaceId: "workspace" };
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true",
    ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_PHONE_NUMBER: "+15005550006" };
  const sourceWire = { accountSid: env.TWILIO_ACCOUNT_SID!, messageSid: `SM${"b".repeat(32)}`, from: "+15005550001", to: env.TWILIO_PHONE_NUMBER!, body: "Ajoute Visite demain de 14h à 15h." };
  const draft = { title: "Visite", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" };
  const request = { ...draft, accountVersion: 2, requestId: "00000000-0000-4000-8000-000000000001" };
  const binding = { owner: { ...actor, memberId: "member", memberRole: "owner" as const, memberRevision: revision.toISOString(), workspaceRevision: revision.toISOString(),
    identityId: "identity", identityRevision: revision.toISOString(), smsAccountId: "sms", smsAccountVersion: 1, smsInboundGrantId: "inbound-grant", smsInboundGrantVersion: 1,
    ownerNumber: sourceWire.from, endveraNumber: sourceWire.to },
    source: { operationId: "source", requestHash: sha(JSON.stringify(sourceWire)), providerMessageId: sourceWire.messageSid, modelChildOperationId: "child", reviewActionId: "event" },
    calendar: { operationId: "calendar", requestHash: sha(JSON.stringify(request)), requestId: request.requestId, accountId: "google", accountVersion: 2,
      credentialId: "credential", writeGrantId: "write-grant", writeGrantVersion: 3 }, draft, policyVersion: SMS_CALENDAR_CONFIRMATION_VERSION };
  const prepared = prepareSmsCalendarConfirmation({ binding, entropyHex: "012345", createdAt: revision.toISOString(), expiresAt: "2026-09-10T12:10:00.000Z" });
  const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, semanticIntentVerified: false,
    modelChildOperationId: "child", source: { operationId: "source", text: sourceWire.body, receivedAt: revision.toISOString() },
    actions: [{ actionId: "event", kind: "PREPARE_CALENDAR_EVENT", status: "PREPARED_UNSENT", operationId: "calendar", requestHash: binding.calendar.requestHash, draft }] };
  const summaryRequest = { schemaVersion: 1, challengeId: "challenge", sourceOperationId: "source", modelChildOperationId: "child", calendarOperationId: "calendar",
    bindingHash: prepared.bindingHash, summaryHash: prepared.summaryHash, to: sourceWire.from, from: sourceWire.to, text: prepared.summary };
  const challenge = { id: "challenge", ...actor, sourceOperationId: "source", modelChildOperationId: "child", calendarOperationId: "calendar", summaryOperationId: "summary",
    reviewActionId: "event", phase: "PREPARED", prepared, bindingHash: prepared.bindingHash, summaryHash: prepared.summaryHash, summaryRequestHash: sha(JSON.stringify(summaryRequest)),
    namespace: prepared.namespace, nonReuseKey: prepared.nonReuseKey, reviewSnapshot: review, bridgeOutboundOperationId: null, acceptedAt: null, failedAttempts: 0, expiresAt: new Date(prepared.expiresAt) };
  const bindingRow = { sourceRequest: { schemaVersion: 1, ...sourceWire, contentHash: sha(JSON.stringify(sourceWire)), identityId: "identity" }, sourceRequestHash: binding.source.requestHash,
    sourceResult: { personalModelReview: review }, sourceCreatedAt: revision, identityId: "identity", identityRevision: revision,
    smsAccountId: "sms", smsAccountVersion: 1, smsInboundGrantId: "inbound-grant", smsInboundGrantVersion: 1, memberId: "member", memberRevision: revision, workspaceRevision: revision,
    calendarRequest: request, calendarRequestHash: binding.calendar.requestHash, accountId: "google", accountVersion: 2, credentialId: "credential", writeGrantId: "write-grant", writeGrantVersion: 3 };
  const grant = { grantId: "send-grant", grantVersion: 1, grantRevision: revision, grantScopes: ["personal_sms_send"] };
  const outboundRequest = { to: sourceWire.from, from: sourceWire.to, text: prepared.summary, sourceOperationId: "source" };
  const outbound = { id: "outbound", workspaceId: actor.workspaceId, createdByUserId: actor.userId, connectorAccountId: "sms", kind: "sms_outbound",
    idempotencyKey: "calendar-confirmation:challenge", requestHash: sha(JSON.stringify(outboundRequest)) };
  const state = { summaryAvailable: true, outboundAvailable: true, existing: [] as Array<{ id: string; status: string; matches: boolean }> };
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM "PersonalCalendarSmsConfirmation"')) return [challenge];
    if (sql.startsWith('SELECT s.request')) return [bindingRow];
    if (sql === 'SELECT clock_timestamp() AS now') return [{ now }];
    if (sql.includes('SELECT g.id "grantId"')) return state.summaryAvailable ? [grant] : [];
    if (sql.startsWith('SELECT id,status,')) return state.existing;
    if (sql.startsWith('SELECT id FROM "PersonalAssistantOperation"')) return state.outboundAvailable ? [{ id: outbound.id }] : [];
    throw new Error("unexpected synthetic query");
  });
  const execute = vi.fn(async () => 1);
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient;
  return { tx, query, execute, state, challenge, bindingRow, binding, prepared, now, env, actor, grant, outbound, outboundRequest };
}

describe("OFF source-bound calendar summary preparation", () => {
  it.each([{}, { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true" }, { ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true" }])("requires both literal switches before input or DB access: %j", async flags => {
    const f = fixture(), env = { NODE_ENV: "test" as const, ...flags };
    expect(await prepareCalendarConfirmationOutboundInTransaction(f.tx, {} as never, env)).toEqual({ status: "DISABLED", executionAuthorized: false });
    await expect(requireCalendarConfirmationOutboundSourceInTransaction(f.tx, {} as never, {}, env)).rejects.toThrow("CONFIRMATION_BRIDGE_DISABLED");
    expect(f.query).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("validates a prepared snapshot without pretending it was delivered or confirmed", () => {
    const f = fixture();
    const result = inspectPreparedSmsCalendarConfirmation({ prepared: f.prepared, currentBinding: f.binding, now: f.now.toISOString() });
    expect(result.status).toBe("PREPARED_SNAPSHOT_VERIFIED_NOT_AUTHORIZED"); expect(result.executionAuthorized).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("creates only one pending exact-source draft, without approval, budget or consent writes", async () => {
    const f = fixture(), result = await prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env);
    expect(result).toMatchObject({ status: "PREPARED_UNSENT", executionAuthorized: false, requestHash: f.outbound.requestHash, replayed: false });
    expect(f.execute).toHaveBeenCalledTimes(1);
    const args = f.execute.mock.calls[0] as unknown as unknown[];
    expect(args[0]).toContain("'sms_outbound','pending'"); expect(args[0]).not.toMatch(/approved|Budget|Grant|credential|externalTransportPerformed/);
    expect(JSON.parse(args[6] as string)).toEqual(f.outboundRequest);
  });
  it("replays only a matching pending row and never makes an uncertain attempt retryable", async () => {
    const f = fixture(); f.state.existing = [{ id: "existing", status: "pending", matches: true }];
    expect(await prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).toMatchObject({ operationId: "existing", replayed: true });
    f.state.existing[0].status = "uncertain";
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_BRIDGE_REPLAY_REFUSED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects extra supplied recipient or text instead of accepting caller authority", async () => {
    const f = fixture();
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge", text: "caller text" } as never, f.env)).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(["WAITING", "CONSUMED", "UNCERTAIN", "EXPIRED"])("does not prepare a bridge from phase %s", async phase => {
    const f = fixture(); f.challenge.phase = phase;
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_NOT_PREPARED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects current owner/SMS grant/Google epoch changes rather than rebinding the old summary", async () => {
    const f = fixture(); f.bindingRow.smsInboundGrantVersion++;
    await expect(inspectCalendarConfirmationBridgePreparationInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_BINDING_CHANGED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("refuses a missing exact summary, nonce, unique challenge or send consent row", async () => {
    const f = fixture(); f.state.summaryAvailable = false;
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_SUMMARY_OR_SMS_SEND_GRANT_REQUIRED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("pins the current send grant version in the immutable source proof", async () => {
    const f = fixture(), first = await requireCalendarConfirmationOutboundSourceInTransaction(f.tx, f.outbound, f.outboundRequest, f.env);
    f.grant.grantVersion++;
    const second = await requireCalendarConfirmationOutboundSourceInTransaction(f.tx, f.outbound, f.outboundRequest, f.env);
    expect(first).toMatchObject({ kind: "CALENDAR_CONFIRMATION", challengeId: "challenge", executionAuthorized: false });
    expect(second.fingerprint).not.toBe(first.fingerprint); expect(Object.isFrozen(first)).toBe(true);
  });
  it("requires the exact durable outbound row and refuses a SELF recipient substitution", async () => {
    const f = fixture();
    await expect(requireCalendarConfirmationOutboundSourceInTransaction(f.tx, f.outbound, { ...f.outboundRequest, to: "+15005550009" }, f.env)).rejects.toThrow("CONFIRMATION_OUTBOUND_CHANGED");
    f.state.outboundAvailable = false;
    await expect(requireCalendarConfirmationOutboundSourceInTransaction(f.tx, f.outbound, f.outboundRequest, f.env)).rejects.toThrow("CONFIRMATION_OUTBOUND_CHANGED");
  });
  it("does not insert if bridge enablement changes during the final replay lookup", async () => {
    const f = fixture(), original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async sql => { const result = await original(sql); if (sql.startsWith('SELECT id,status,')) f.env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED = "false"; return result; });
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_BRIDGE_DISABLED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not acknowledge preparation if the DB lifetime guard refused insertion", async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce(0);
    await expect(prepareCalendarConfirmationOutboundInTransaction(f.tx, { actor: f.actor, challengeId: "challenge" }, f.env)).rejects.toThrow("CONFIRMATION_NOT_PREPARED");
    expect((f.execute.mock.calls[0] as unknown as unknown[])[0]).toContain('"expiresAt">(clock_timestamp() AT TIME ZONE \'UTC\')');
  });
});
