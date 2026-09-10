import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { recoverExpiredPersonalSmsClaims } from "@/server/personal-assistant/sms-inbound-recovery";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import { personalModelFixture } from "./personal-model.fixture";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const name = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(name) || url.pathname !== `/${name}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
afterAll(() => prisma.$disconnect());

/** Committed synthetic expired claims model worker loss, not an observed OS crash.
 * These are SQL behavior tests; a PGlite run is not native multibackend proof. */
async function fixture() {
  const user = await prisma.user.create({ data: { email: `sms-recovery-${randomUUID()}@example.invalid`, name: "Synthetic SMS owner", role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic SMS recovery workspace" });
  const account = await prisma.constructionConnectorAccount.create({ data: { workspaceId, provider: "endvera_sms", createdByUserId: user.id, status: "revoked", revokedAt: new Date() } });
  const [{ now }] = await prisma.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
  const budget = await prisma.personalAssistantBudget.create({ data: { id: randomUUID(), ceilingCadMicros: 10000000n, reservedCadMicros: 1000000n, expiresAt: new Date(now.getTime() - 1000) } });
  async function row(options: { kind?: string; status?: string; attempts?: number; leaseUntil?: Date | null; result?: Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull } = {}) {
    const request = { from: "+15005550006", to: "+15005550007", body: "Question synthétique seulement", messageSid: `SM${randomUUID().replaceAll("-", "")}`, synthetic: true };
    return prisma.personalAssistantOperation.create({ data: {
      workspaceId, createdByUserId: user.id, connectorAccountId: account.id,
      kind: options.kind ?? "personal_sms_inbound", status: options.status ?? "processing", attempts: options.attempts ?? 1,
      leaseUntil: options.leaseUntil === undefined ? new Date(now.getTime() - 1000) : options.leaseUntil,
      request, requestHash: createHash("sha256").update(JSON.stringify(request)).digest("hex"), idempotencyKey: `synthetic-sms-recovery:${randomUUID()}`,
      result: options.result ?? { durableTraceId: randomUUID(), priorReview: { notAuthority: true, actions: ["synthetic"] }, recovery: { preservedPreviousEvidence: true } },
      budgetId: budget.id, reservedCadMicros: 100000n, externalTransportPerformed: false,
    } });
  }
  return { row, now, budget, account, user, workspaceId };
}

describe("inbound SMS recovery SQL on a disposable database, zero transport", () => {
  it("updates at most 25 of 31 eligible rows, drains the remainder once, then replay is zero", async () => {
    const f = await fixture();
    const originals = await Promise.all(Array.from({ length: 31 }, () => f.row()));
    const ids = originals.map(row => row.id);
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 })).recovered).toBe(25);
    expect(await prisma.personalAssistantOperation.count({ where: { id: { in: ids }, status: "uncertain" } })).toBe(25);
    expect(await prisma.personalAssistantOperation.count({ where: { id: { in: ids }, status: "processing" } })).toBe(6);
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 })).recovered).toBe(6);
    const snapshots = await prisma.personalAssistantOperation.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 })).recovered).toBe(0);
    expect(await prisma.personalAssistantOperation.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).toEqual(snapshots);
    expect(await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: f.budget.id } })).toEqual(f.budget);
  });

  it("excludes attempts 0/2, nonprocessing rows, null/future leases and other ordinary operation kinds", async () => {
    const f = await fixture();
    const rows = await Promise.all([
      f.row({ attempts: 0 }), f.row({ attempts: 2 }), f.row({ leaseUntil: null }), f.row({ leaseUntil: new Date(f.now.getTime() + 600000) }),
      ...["received", "pending", "approved", "completed", "refused", "uncertain"].map(status => f.row({ status })),
      ...["calendar_write", "sms_outbound", "voice_outbound", "google_oauth", "sms_pairing"].map(kind => f.row({ kind })),
    ]);
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 })).recovered).toBe(0);
    for (const original of rows) expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  });

  it("preserves exact prior object, array, scalar, JSON null and SQL null evidence", async () => {
    const f = await fixture();
    const results = [{ schemaVersion: 7, reason: "PRIOR_REASON", recovery: { exact: "old" }, nested: [false, 42, { source: "synthetic" }] }, ["synthetic", { trace: true }], "synthetic scalar", 17, Prisma.JsonNull, Prisma.DbNull];
    const originals = await Promise.all(results.map(result => f.row({ result })));
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 })).recovered).toBe(originals.length);
    for (const original of originals) {
      const current = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } });
      expect(current.result).toMatchObject({ priorClaimResult: original.result, automaticRetry: false, reviewRequired: true,
        executionAuthorized: false, processingOutcome: "UNKNOWN_AFTER_WORKER_LOSS", reason: "WORKER_LEASE_EXPIRED" });
      expect((current.result as Prisma.JsonObject).recovery).toMatchObject({ kind: "EXPIRED_PERSONAL_SMS_CLAIM", attempt: 1, budgetReservationReleased: false });
      // Only bookkeeping fields change; immutable source, owner/account, attempt and hold remain exact.
      expect(current).toEqual({ ...original, status: "uncertain", leaseUntil: null, updatedAt: current.updatedAt, result: current.result });
    }
    expect(await prisma.personalAssistantBudget.findUniqueOrThrow({ where: { id: f.budget.id } })).toEqual(f.budget);
    expect(await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: f.account.id } })).toEqual(f.account);
  });

  it("is OFF without exact enable and leaves the complete claim unchanged", async () => {
    const f = await fixture(), original = await f.row();
    expect(await recoverExpiredPersonalSmsClaims()).toEqual({ status: "DISABLED", recovered: 0, executionAuthorized: false });
    expect(await recoverExpiredPersonalSmsClaims({ enabled: false })).toEqual({ status: "DISABLED", recovered: 0, executionAuthorized: false });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true })).recovered).toBe(1);
  });

  it("does not let the former exact source completion CAS replace recovered uncertainty", async () => {
    const f = await fixture(), original = await f.row();
    const priorMatch = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalAssistantOperation"
      WHERE id=$1 AND status='processing' AND attempts=1 AND "leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC') AND "requestHash"=$3 AND result=$4::jsonb`,
    original.id, original.leaseUntil, original.requestHash, JSON.stringify(original.result));
    expect(priorMatch).toEqual([{ id: original.id }]);
    expect((await recoverExpiredPersonalSmsClaims({ enabled: true })).recovered).toBe(1);
    const snapshot = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } });
    const count = await prisma.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',result='{"reply":"not delivered"}'::jsonb
      WHERE id=$1 AND status='processing' AND attempts=1 AND "leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC') AND "requestHash"=$3 AND result=$4::jsonb`,
    original.id, original.leaseUntil, original.requestHash, JSON.stringify(original.result));
    expect(count).toBe(0);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: original.id } })).toEqual(snapshot);
  });

  it("the real SMS worker retains prior durable evidence after its injected interpreter loses its result", async () => {
    const f = await personalModelFixture("Prépare une note synthétique pour le chantier.");
    const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-only", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
      ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
      TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_PHONE_NUMBER: "+15005550006", TWILIO_API_KEY_SID: "synthetic-key-id",
      TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
      ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 600000).toISOString() };
    const proof = { durableTraceId: randomUUID(), syntheticPreparedEvidence: { executionAuthorized: false, exact: ["old", { nested: true }] },
      priorClaimResult: { earlierEvidence: "also retained" } };
    let interpreterCalls = 0;
    const model: NonNullable<Parameters<typeof processPersonalSms>[2]>["model"] = async context => {
      interpreterCalls++;
      const count = await prisma.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET result=$4::jsonb
        WHERE id=$1 AND status='processing' AND attempts=1 AND "workspaceId"=$2 AND "leaseUntil"=($3::timestamptz AT TIME ZONE 'UTC')`,
      context.claim.operationId, context.claim.workspaceId, new Date(context.claim.leaseUntil), JSON.stringify(proof));
      expect(count).toBe(1);
      expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: context.claim.operationId } })).result).toEqual(proof);
      // Synthetic loss of the interpreter result after its local evidence write;
      // this does not model a provider request, OS kill or confirmed side effect.
      throw new Error("SYNTHETIC_INTERPRETER_RESULT_LOST");
    };
    const before = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(await processPersonalSms(f.sourceOperationId, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED", recorded: true, automaticRetry: false });
    const after = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(after.result).toMatchObject({ durableTraceId: proof.durableTraceId, syntheticPreparedEvidence: proof.syntheticPreparedEvidence,
      priorClaimResult: proof, reason: "WORKER_OUTCOME_UNKNOWN", processingOutcome: "UNKNOWN_AFTER_WORKER_LOSS", executionAuthorized: false, effectsConfirmed: false });
    expect(after).toEqual({ ...before, status: "uncertain", attempts: 1, leaseUntil: null, updatedAt: after.updatedAt, result: after.result });
    expect(await prisma.personalAssistantOperation.count({ where: { idempotencyKey: `reply:${f.sourceOperationId}` } })).toBe(0);
    expect(await processPersonalSms(f.sourceOperationId, env, { model })).toEqual({ status: "NOT_PENDING" });
    expect(interpreterCalls).toBe(1);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } })).toEqual(after);
  });
});
