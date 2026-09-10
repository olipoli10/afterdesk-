import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { recoverExpiredPersonalActionClaims } from "@/server/personal-assistant/claim-recovery";

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
const name = process.env.ENDVERA_210_DATABASE_NAME ?? '';
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(name) || url.pathname !== `/${name}`) throw new Error('DISPOSABLE_PERSONAL_DATABASE_REQUIRED');
afterAll(() => prisma.$disconnect());

/** Committed expired claims model process loss; these fixtures are NOT observed OS crashes or provider receipts. */
async function fixture() {
  const user = await prisma.user.create({ data: { email: `recovery-${randomUUID()}@example.invalid`, name: 'Synthetic recovery owner', role: 'CLIENT' } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: 'Synthetic recovery workspace' });
  const account = await prisma.constructionConnectorAccount.create({ data: { workspaceId, provider: 'endvera_sms', createdByUserId: user.id, status: 'revoked', revokedAt: new Date() } });
  const [{ now }] = await prisma.$queryRawUnsafe<Array<{ now: Date }>>('SELECT clock_timestamp() AS now');
  const budget = await prisma.personalAssistantBudget.create({ data: { id: randomUUID(), ceilingCadMicros: 10000000n, reservedCadMicros: 1000000n, expiresAt: new Date(now.getTime() - 1000) } });
  async function row(kind = 'sms_outbound', status = 'processing', attempts = 1, leaseUntil: Date | null = new Date(now.getTime() - 1000)) {
    const request = { synthetic: true, scenario: randomUUID() };
    const prior = { approvedBy: user.id, approvalToken: randomUUID(), outboundClaimToken: randomUUID(), providerSid: `SM${randomUUID().replaceAll('-', '')}`, dispatchStarted: true };
    return prisma.personalAssistantOperation.create({ data: { workspaceId, createdByUserId: user.id, connectorAccountId: account.id, kind, status, attempts, leaseUntil,
      request, requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'), idempotencyKey: `synthetic-recovery:${randomUUID()}`,
      result: prior, budgetId: budget.id, reservedCadMicros: 100000n, externalTransportPerformed: false } });
  }
  return { row, now, budget };
}

describe('expired personal action recovery on disposable PostgreSQL, with no transport', () => {
  it('records all three expired kinds once while retaining full budgets, prior claims and receipt rows after revocation', async () => {
    const f = await fixture();
    const originals = await Promise.all(['calendar_write', 'sms_outbound', 'voice_outbound'].map(kind => f.row(kind)));
    const sid = (originals[1].result as { providerSid: string }).providerSid;
    const receipt = await prisma.personalAssistantDeliveryReceipt.create({ data: { id: randomUUID(), operationId: originals[1].id, providerSid: sid, status: 'queued' } });
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    for (const original of originals) {
      const current = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } });
      expect(current).toMatchObject({ status: 'uncertain', leaseUntil: null, attempts: 1, requestHash: original.requestHash,
        budgetId: original.budgetId, reservedCadMicros: original.reservedCadMicros, externalTransportPerformed: false });
      expect(current.request).toEqual(original.request);
      expect(current.result).toMatchObject({ ...(original.result as object), priorClaimResult: original.result,
        automaticRetry: false, reviewRequired: true, executionAuthorized: false, transportKnowledge: 'UNKNOWN_AFTER_PROCESS_LOSS' });
    }
    expect(await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: f.budget.id } })).toEqual(f.budget);
    expect(await prisma.personalAssistantDeliveryReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toEqual(receipt);
    const snapshots = await prisma.personalAssistantOperation.findMany({ where: { id: { in: originals.map(row => row.id) } }, orderBy: { id: 'asc' } });
    await recoverExpiredPersonalActionClaims({ enabled: true });
    expect(await prisma.personalAssistantOperation.findMany({ where: { id: { in: originals.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(snapshots);
  });
  it('excludes nonprocessing statuses, wrong attempt, null/future lease, and inbound/OAuth kinds', async () => {
    const f = await fixture();
    const rows = await Promise.all([
      ...['pending', 'approved', 'received', 'completed', 'refused', 'uncertain'].map(status => f.row('sms_outbound', status)),
      f.row('sms_outbound', 'processing', 0), f.row('sms_outbound', 'processing', 2),
      f.row('sms_outbound', 'processing', 1, null), f.row('sms_outbound', 'processing', 1, new Date(f.now.getTime() + 60000)),
      f.row('personal_sms_inbound'), f.row('google_oauth'), f.row('sms_pairing'),
    ]);
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    for (const original of rows) expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  });
  it('skips an independently locked expired claim and recovers it only after that transaction releases it', async () => {
    const f = await fixture(), original = await f.row();
    let release!: () => void, locked!: () => void;
    const lockReady = new Promise<void>(resolve => { locked = resolve; });
    const releaseLock = new Promise<void>(resolve => { release = resolve; });
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM "PersonalAssistantOperation" WHERE id=$1 FOR UPDATE', original.id);
      locked(); await releaseLock;
    }, { timeout: 10000 });
    try {
      await lockReady;
      await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
      expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('processing');
    } finally { release(); await holder; }
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('uncertain');
  });
  it('two recovery transactions cannot process the same claim twice or release its reservation', async () => {
    const f = await fixture(), original = await f.row('voice_outbound');
    // Existing unrelated expired fixtures are drained before this exact one is admitted.
    await prisma.personalAssistantOperation.update({ where: { id: original.id }, data: { leaseUntil: new Date(f.now.getTime() + 60000) } });
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    await prisma.personalAssistantOperation.update({ where: { id: original.id }, data: { leaseUntil: original.leaseUntil } });
    const results = await Promise.allSettled([recoverExpiredPersonalActionClaims({ enabled: true }), recoverExpiredPersonalActionClaims({ enabled: true })]);
    expect(results.filter(result => result.status === 'fulfilled').reduce((total, result) => total + (result.status === 'fulfilled' ? result.value.recovered : 0), 0)).toBe(1);
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).status).toBe('uncertain');
    expect(await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: f.budget.id } })).toEqual(f.budget);
  });
  it('the prior processing CAS cannot overwrite recovered uncertainty with a late claimed success', async () => {
    const f = await fixture(), original = await f.row('calendar_write');
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    const changed = await prisma.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',result='{"confirmed":true}'::jsonb
      WHERE id=$1 AND status='processing' AND attempts=1 AND "leaseUntil"=$2 AND "requestHash"=$3 AND result=$4::jsonb`,
    original.id, original.leaseUntil, original.requestHash, JSON.stringify(original.result));
    expect(changed).toBe(0);
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).result).toMatchObject({ transportKnowledge: 'UNKNOWN_AFTER_PROCESS_LOSS', automaticRetry: false });
  });
});
