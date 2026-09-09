import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { controlledRunCommandFingerprint } from "@/lib/construction-operating-assistant-r37c/contracts";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import {
  activateProviderActivationGrant,
  prepareProviderActivationGrant,
  reserveProviderSpend,
  revokeProviderActivationGrant,
  setProviderLaneControl,
} from "@/server/construction-operating-assistant-r37b/activation";
import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";

const executorFingerprint = `sha256:${"e".repeat(64)}`;
const exactModelId = "example/controller-v1";
const now = new Date("2026-09-02T18:00:00.000Z");
let clockNow = new Date(now.getTime());
const clock = { now: () => new Date(clockNow.getTime()) };
const executionOptions = { clock };

beforeEach(() => {
  clockNow = new Date(now.getTime());
});

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function user(label: string, role: "CLIENT" | "ADMIN" = "CLIENT") {
  return prisma.user.create({
    data: {
      name: `R37C ${label}`,
      email: `r37c-${label}-${crypto.randomUUID()}@example.invalid`,
      role,
      emailVerified: true,
    },
  });
}

async function setLane(adminId: string, state: "ENABLED" | "DISABLED") {
  const current = await prisma.providerLaneControl.findUnique({ where: { id: "provider-lane-global" } });
  return setProviderLaneControl({
    commandId: crypto.randomUUID(),
    actorId: adminId,
    state,
    reason: `R37C local ${state.toLowerCase()}`,
    expectedVersion: current?.version ?? 0,
  }, clock);
}

async function context(label: string, limits?: { calls?: number; spend?: bigint }) {
  const owner = await user(`${label}-owner`);
  const admin = await user(`${label}-admin`, "ADMIN");
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R37C ${label}` });
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: `R36B-R37C-${label.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
    caseVersion: 1,
    intent: "CONTROLLER_REASONING",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "chantier", value: `Laval synthétique ${label}` }],
    dataClass: "business_confidential",
    outputContractKey: "controlled-run-v1",
    ceilings: { maxLatencyMs: 10_000, maxCostMicros: 500, maxOutputTokens: 1_000, maxSources: 5 },
    syntheticOnly: true,
  });
  const campaign = createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [sandboxCase] });
  const sealed = sealSyntheticAttempt({
    campaign,
    sandboxCase,
    requestPlan: prepareOpenRouterControllerPlan(crypto.randomUUID(), sandboxCase),
    authorization: {
      schemaVersion: 1,
      executionMode: "SYNTHETIC_TRANSPORT",
      authorizationId: crypto.randomUUID(),
      authorizedAt: "2026-09-02T17:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId,
    },
    now: "2026-09-02T17:01:00.000Z",
  });
  await setLane(admin.id, "ENABLED");
  const prepared = await prepareProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    candidateKey: "OPENROUTER_CONTROLLER",
    exactModelId,
    sealedExecutorFingerprint: executorFingerprint,
    allowedCaseFingerprints: [sandboxCase.caseFingerprint],
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    maxCallCount: limits?.calls ?? 4,
    maxTotalSpendMicros: limits?.spend ?? 4_000n,
  }, clock);
  const activated = await activateProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    grantId: prepared.grant.id,
    expectedVersion: 1,
    sealedExecutorFingerprint: executorFingerprint,
  }, clock);
  const input = {
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    grantId: activated.grant.id,
    idempotencyKey: `run-${label}`,
    sealedExecutorFingerprint: executorFingerprint,
    reservedMicros: 500n,
    leaseDurationMs: 30_000,
    sealed,
  };
  return { owner, admin, workspaceId: workspace.workspaceId, grantId: activated.grant.id, sealed, input };
}

describe("R37C controlled provider orchestration on disposable PostgreSQL", () => {
  it("stores evidence before settlement and replays it after reconnect without reinvocation", async () => {
    const ctx = await context("success");
    let calls = 0;
    const first = await executeControlledSyntheticAttempt(ctx.input, async () => {
      calls += 1;
      return { body: { answer: "preuve synthétique" }, latencyMs: 20, costMicros: 300, externalTransportPerformed: false };
    }, executionOptions);
    expect(first).toMatchObject({ disposition: "SUCCEEDED", adapterInvoked: true, externalTransportPerformed: false });
    expect(first.evidence).toMatchObject({ evidenceLabel: "SYNTHETIC", costMicros: 300, externalDispatchPerformed: false });
    await prisma.$disconnect();
    await prisma.$connect();
    const replay = await executeControlledSyntheticAttempt(ctx.input, async () => {
      calls += 1;
      throw new Error("adapter must not be reinvoked");
    }, executionOptions);
    expect(replay).toMatchObject({ disposition: "SUCCEEDED_REPLAY", adapterInvoked: false, evidence: first.evidence });
    expect(calls).toBe(1);
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: first.spendAttemptId! } });
    expect(attempt).toMatchObject({ state: "SETTLED", settledMicros: 300n, releasedMicros: 200n });
    expect(await prisma.controlledProviderRun.count({ where: { grantId: ctx.grantId } })).toBe(1);
  });

  it("releases the exact reservation and persists a bounded terminal failure", async () => {
    const ctx = await context("failure");
    const failed = await executeControlledSyntheticAttempt(ctx.input, async () => {
      throw new Error("untrusted adapter text with a credential-like detail");
    }, executionOptions);
    expect(failed).toMatchObject({ disposition: "FAILED", failureCode: "R37C_SYNTHETIC_ADAPTER_FAILED", adapterInvoked: true });
    const replay = await executeControlledSyntheticAttempt(ctx.input, async () => {
      throw new Error("must not run");
    }, executionOptions);
    expect(replay).toMatchObject({ disposition: "FAILED_REPLAY", adapterInvoked: false });
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: failed.spendAttemptId! } });
    const grant = await prisma.providerActivationGrant.findUniqueOrThrow({ where: { id: ctx.grantId } });
    expect(attempt.state).toBe("RELEASED");
    expect(grant).toMatchObject({ reservedCallCount: 0, reservedSpendMicros: 0n, releasedCallCount: 1 });
  });

  it("collapses concurrent identical submissions behind one live lease", async () => {
    const ctx = await context("concurrent", { calls: 1, spend: 500n });
    let calls = 0;
    const adapter = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { body: { ok: true }, latencyMs: 40, costMicros: 200, externalTransportPerformed: false as const };
    };
    const results = await Promise.all(
      Array.from({ length: 100 }, () => executeControlledSyntheticAttempt(ctx.input, adapter, executionOptions)),
    );
    expect(calls).toBe(1);
    expect(results.some((item) => item.disposition === "SUCCEEDED")).toBe(true);
    expect(results.every((item) => ["SUCCEEDED", "SUCCEEDED_REPLAY", "IN_PROGRESS"].includes(item.disposition))).toBe(true);
    expect(await prisma.providerSpendAttempt.count({ where: { grantId: ctx.grantId } })).toBe(1);
    expect(await prisma.controlledProviderRun.count({ where: { grantId: ctx.grantId } })).toBe(1);
  });

  it("reclaims an expired synthetic lease and refuses a disabled lane at point of use", async () => {
    const reclaim = await context("reclaim", { calls: 1, spend: 500n });
    const reservation = await reserveProviderSpend({
      actorId: reclaim.owner.id,
      workspaceId: reclaim.workspaceId,
      grantId: reclaim.grantId,
      candidateKey: reclaim.sealed.authorization.candidateKey,
      idempotencyKey: `r37c:${reclaim.input.idempotencyKey}`,
      caseFingerprint: reclaim.sealed.sandboxCase.caseFingerprint,
      exactModelId,
      sealedExecutorFingerprint: executorFingerprint,
      requestedMicros: 500n,
    }, clock);
    await prisma.controlledProviderRun.create({
      data: {
        workspaceId: reclaim.workspaceId,
        grantId: reclaim.grantId,
        spendAttemptId: reservation.attempt.id,
        idempotencyKey: reclaim.input.idempotencyKey,
        commandFingerprint: controlledRunCommandFingerprint(reclaim.input),
        sealedAttemptFingerprint: reclaim.sealed.sealedAttemptFingerprint,
        caseFingerprint: reclaim.sealed.sandboxCase.caseFingerprint,
        exactModelId,
        sealedExecutorFingerprint: executorFingerprint,
        reservedMicros: 500n,
        state: "RUNNING",
        sealedSnapshot: json(reclaim.sealed),
        leaseToken: crypto.randomUUID(),
        leaseExpiresAt: new Date(now.getTime() - 1),
        settlementCommandId: crypto.randomUUID(),
        releaseCommandId: crypto.randomUUID(),
        createdById: reclaim.owner.id,
        startedAt: new Date(now.getTime() - 60_000),
      },
    });
    const recovered = await executeControlledSyntheticAttempt(reclaim.input, async () => ({ body: { recovered: true }, latencyMs: 10, costMicros: 100, externalTransportPerformed: false }), executionOptions);
    expect(recovered).toMatchObject({ disposition: "SUCCEEDED", adapterInvoked: true });

    const revoked = await context("revoked", { calls: 1, spend: 500n });
    const grantBeforeRevoke = await prisma.providerActivationGrant.findUniqueOrThrow({ where: { id: revoked.grantId } });
    await revokeProviderActivationGrant({
      commandId: crypto.randomUUID(),
      actorId: revoked.owner.id,
      workspaceId: revoked.workspaceId,
      grantId: revoked.grantId,
      expectedVersion: grantBeforeRevoke.version,
      reason: "R37C point-of-use revocation test",
    }, clock);
    let revokedAdapterCalls = 0;
    await expect(executeControlledSyntheticAttempt(revoked.input, async () => {
      revokedAdapterCalls += 1;
      return { body: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false };
    }, executionOptions)).rejects.toThrow("R37B_GRANT_INACTIVE");
    expect(revokedAdapterCalls).toBe(0);
    expect(await prisma.providerSpendAttempt.count({ where: { grantId: revoked.grantId } })).toBe(0);

    const killed = await context("kill", { calls: 1, spend: 500n });
    await reserveProviderSpend({
      actorId: killed.owner.id,
      workspaceId: killed.workspaceId,
      grantId: killed.grantId,
      candidateKey: killed.sealed.authorization.candidateKey,
      idempotencyKey: `r37c:${killed.input.idempotencyKey}`,
      caseFingerprint: killed.sealed.sandboxCase.caseFingerprint,
      exactModelId,
      sealedExecutorFingerprint: executorFingerprint,
      requestedMicros: 500n,
    }, clock);
    await setLane(killed.admin.id, "DISABLED");
    let adapterCalls = 0;
    const refused = await executeControlledSyntheticAttempt(killed.input, async () => {
      adapterCalls += 1;
      return { body: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false };
    }, executionOptions);
    expect(refused).toMatchObject({ disposition: "FAILED", failureCode: "R37C_PROVIDER_LANE_DISABLED_AT_USE", adapterInvoked: false });
    expect(adapterCalls).toBe(0);
    const killedAttempt = await prisma.providerSpendAttempt.findUniqueOrThrow({
      where: { grantId_idempotencyKey: { grantId: killed.grantId, idempotencyKey: `r37c:${killed.input.idempotencyKey}` } },
    });
    expect(killedAttempt.state).toBe("RELEASED");
  });

  it("releases spend when direct adapter evidence returns after lease expiry", async () => {
    const ctx = await context("direct-expiry", { calls: 1, spend: 500n });
    const result = await executeControlledSyntheticAttempt({
      ...ctx.input,
      leaseDurationMs: 1_000,
    }, async () => {
      clockNow = new Date(now.getTime() + 1_001);
      return {
        body: { answer: "expired synthetic evidence" },
        latencyMs: 10,
        costMicros: 100,
        externalTransportPerformed: false,
      };
    }, executionOptions);
    expect(result).toMatchObject({
      disposition: "FAILED",
      failureCode: "R37C_LEASE_EXPIRED_BEFORE_EVIDENCE",
      evidence: null,
      adapterInvoked: true,
    });
    const run = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: result.runId } });
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: result.spendAttemptId! } });
    expect(run.evidenceSnapshot).toBeNull();
    expect(run.completedAt?.toISOString()).toBe(clockNow.toISOString());
    expect(attempt).toMatchObject({ state: "RELEASED", settledMicros: null });
    expect(attempt.releasedAt?.toISOString()).toBe(clockNow.toISOString());
  });
});
