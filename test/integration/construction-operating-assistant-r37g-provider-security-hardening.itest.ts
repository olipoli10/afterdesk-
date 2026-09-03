import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import {
  activateProviderActivationGrant,
  prepareProviderActivationGrant,
  setProviderLaneControl,
} from "@/server/construction-operating-assistant-r37b/activation";
import { executeControlledSyntheticProviderDelivery } from "@/server/construction-operating-assistant-r37f/provider-delivery";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";

const executorFingerprint = `sha256:${"7".repeat(64)}`;
const exactModelId = "example/controller-v1";
const trustedNow = new Date("2026-09-02T21:00:00.000Z");
let clockNow = new Date(trustedNow.getTime());
const clock = { now: () => new Date(clockNow.getTime()) };
const executionOptions = { clock };

beforeEach(() => {
  clockNow = new Date(trustedNow.getTime());
});

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function user(label: string, role: "CLIENT" | "ADMIN" = "CLIENT") {
  return prisma.user.create({
    data: {
      name: `R37G ${label}`,
      email: `r37g-${label}-${crypto.randomUUID()}@example.invalid`,
      role,
      emailVerified: true,
    },
  });
}

async function enableLane(adminId: string) {
  const current = await prisma.providerLaneControl.findUnique({ where: { id: "provider-lane-global" } });
  if (current?.state === "ENABLED") return;
  await setProviderLaneControl({
    commandId: crypto.randomUUID(),
    actorId: adminId,
    state: "ENABLED",
    reason: "R37G security hardening",
    expectedVersion: current?.version ?? 0,
  }, clock);
}

async function context(label: string, maxOutputTokens = 1_000) {
  const owner = await user(`${label}-owner`);
  const admin = await user(`${label}-admin`, "ADMIN");
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R37G ${label}` });
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: `R36B-R37G-${label.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
    caseVersion: 1,
    intent: "CONTROLLER_REASONING",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "project", value: `Laval synthetic ${label}` }],
    dataClass: "business_confidential",
    outputContractKey: "provider-hardening-v1",
    ceilings: { maxLatencyMs: 5_000, maxCostMicros: 500, maxOutputTokens, maxSources: 5 },
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
      authorizedAt: "2026-09-02T20:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId,
    },
    now: "2026-09-02T20:01:00.000Z",
  });
  await enableLane(admin.id);
  const prepared = await prepareProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    candidateKey: "OPENROUTER_CONTROLLER",
    exactModelId,
    sealedExecutorFingerprint: executorFingerprint,
    allowedCaseFingerprints: [sandboxCase.caseFingerprint],
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    maxCallCount: 3,
    maxTotalSpendMicros: 1_500n,
  }, clock);
  const activated = await activateProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    grantId: prepared.grant.id,
    expectedVersion: 1,
    sealedExecutorFingerprint: executorFingerprint,
  }, clock);
  return {
    owner,
    workspaceId: workspace.workspaceId,
    grantId: activated.grant.id,
    input: {
      actorId: owner.id,
      workspaceId: workspace.workspaceId,
      grantId: activated.grant.id,
      idempotencyKey: `r37g-${label}`,
      sealedExecutorFingerprint: executorFingerprint,
      reservedMicros: 500n,
      leaseDurationMs: 30_000,
      sealed,
    },
  };
}

function fixture() {
  return {
    fixture: {
      responseId: "synthetic-r37g",
      model: exactModelId,
      providerRoute: "OPENROUTER_CONTROLLER",
      choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "Exact synthetic answer." } }],
      usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
      externalTransportPerformed: false,
    },
    latencyMs: 10,
    costMicros: 100,
    externalTransportPerformed: false,
  };
}

describe("R37G provider security hardening on disposable PostgreSQL", () => {
  it("creates no durable run for a cross-workspace grant reference", async () => {
    const local = await context("local");
    const foreign = await context("foreign");
    await expect(executeControlledSyntheticProviderDelivery({
      ...local.input,
      grantId: foreign.grantId,
      idempotencyKey: "r37g-cross-workspace",
    }, async () => fixture(), executionOptions)).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(await prisma.controlledProviderRun.count({
      where: { grantId: foreign.grantId, workspaceId: local.workspaceId },
    })).toBe(0);
  });

  it("rejects canonical snapshot drift even when both stored fingerprint copies agree", async () => {
    const ctx = await context("digest");
    const first = await executeControlledSyntheticProviderDelivery(ctx.input, async () => fixture(), executionOptions);
    const run = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: first.controlledRun.runId } });
    const driftFingerprint = `sha256:${"a".repeat(64)}`;
    await prisma.controlledProviderRun.update({
      where: { id: run.id },
      data: {
        canonicalEvidenceSnapshot: json({
          ...(run.canonicalEvidenceSnapshot as Record<string, unknown>),
          answer: "tampered synthetic answer",
          evidenceFingerprint: driftFingerprint,
        }),
        canonicalEvidenceFingerprint: driftFingerprint,
      },
    });
    await expect(executeControlledSyntheticProviderDelivery(ctx.input, async () => fixture(), executionOptions))
      .rejects.toThrow("R37F_CANONICAL_EVIDENCE_FINGERPRINT_DRIFT");
  });

  it("does not let a stale lease owner persist canonical evidence", async () => {
    const replacementSource = await context("stale-lease-replacement-source");
    const replacementResult = await executeControlledSyntheticProviderDelivery(
      replacementSource.input,
      async () => fixture(),
      executionOptions,
    );
    const replacementEvidence = replacementResult.canonicalEvidence!;
    const ctx = await context("stale-lease");
    let releaseAdapter!: () => void;
    let adapterStarted!: () => void;
    const started = new Promise<void>((resolve) => { adapterStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseAdapter = resolve; });
    const delivery = executeControlledSyntheticProviderDelivery(ctx.input, async () => {
      adapterStarted();
      await released;
      return fixture();
    }, executionOptions);
    await started;
    const active = await prisma.controlledProviderRun.findFirstOrThrow({
      where: { grantId: ctx.grantId, idempotencyKey: ctx.input.idempotencyKey, state: "RUNNING" },
    });
    await prisma.controlledProviderRun.update({
      where: { id: active.id },
      data: {
        leaseToken: crypto.randomUUID(),
        leaseExpiresAt: new Date(trustedNow.getTime() + 60_000),
        canonicalEvidenceSnapshot: json(replacementEvidence),
        canonicalEvidenceFingerprint: replacementEvidence.evidenceFingerprint,
      },
    });
    releaseAdapter();
    const result = await delivery;
    expect(result.controlledRun.disposition).toBe("IN_PROGRESS");
    expect(result.canonicalEvidence).toBeNull();
    const durable = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: active.id } });
    expect(durable.canonicalEvidenceSnapshot).toEqual(replacementEvidence);
    expect(durable.canonicalEvidenceFingerprint).toBe(replacementEvidence.evidenceFingerprint);
  });

  it("returns no canonical evidence for a failed durable disposition", async () => {
    const ctx = await context("failed-evidence");
    const succeeded = await executeControlledSyntheticProviderDelivery(ctx.input, async () => fixture(), executionOptions);
    await prisma.controlledProviderRun.update({
      where: { id: succeeded.controlledRun.runId },
      data: { state: "FAILED", failureCode: "R37C_SYNTHETIC_ADAPTER_FAILED" },
    });
    const result = await executeControlledSyntheticProviderDelivery(ctx.input, async () => {
      throw new Error("adapter must not be invoked for failed replay");
    }, executionOptions);
    expect(result.controlledRun.disposition).toBe("FAILED_REPLAY");
    expect(result.canonicalEvidence).toBeNull();
  });

  it("refuses evidence and releases spend when an unchanged lease token has expired", async () => {
    const ctx = await context("expired-lease");
    const result = await executeControlledSyntheticProviderDelivery({
      ...ctx.input,
      leaseDurationMs: 1_000,
    }, async () => {
      clockNow = new Date(trustedNow.getTime() + 1_001);
      return fixture();
    }, executionOptions);
    expect(result.controlledRun.disposition).toBe("FAILED");
    expect(result.canonicalEvidence).toBeNull();
    const durable = await prisma.controlledProviderRun.findUniqueOrThrow({
      where: { id: result.controlledRun.runId },
    });
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({
      where: { id: result.controlledRun.spendAttemptId! },
    });
    expect(durable.canonicalEvidenceSnapshot).toBeNull();
    expect(durable.canonicalEvidenceFingerprint).toBeNull();
    expect(durable.state).toBe("FAILED");
    expect(durable.completedAt?.toISOString()).toBe(clockNow.toISOString());
    expect(attempt.state).toBe("RELEASED");
    expect(attempt.releasedAt?.toISOString()).toBe(clockNow.toISOString());
  });

  it("clears canonical evidence when the lease expires after the provider write", async () => {
    const ctx = await context("expiry-after-provider-write");
    let clockReadCount = 0;
    const boundaryClock = {
      now: () => {
        clockReadCount += 1;
        return new Date(trustedNow.getTime() + (clockReadCount >= 4 ? 1_001 : 0));
      },
    };
    const result = await executeControlledSyntheticProviderDelivery({
      ...ctx.input,
      leaseDurationMs: 1_000,
    }, async () => fixture(), { clock: boundaryClock });
    expect(result.controlledRun.disposition).toBe("FAILED");
    expect(result.canonicalEvidence).toBeNull();
    const durable = await prisma.controlledProviderRun.findUniqueOrThrow({
      where: { id: result.controlledRun.runId },
    });
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({
      where: { id: result.controlledRun.spendAttemptId! },
    });
    expect(clockReadCount).toBeGreaterThanOrEqual(4);
    expect(durable.canonicalEvidenceSnapshot).toBeNull();
    expect(durable.canonicalEvidenceFingerprint).toBeNull();
    expect(durable.evidenceSnapshot).toBeNull();
    expect(attempt).toMatchObject({ state: "RELEASED", settledMicros: null });
  });

  it("clears canonical evidence when the terminal clock fails after the provider write", async () => {
    const ctx = await context("post-write-terminal-failure");
    let clockReadCount = 0;
    const oneShotFailureClock = {
      now: () => {
        clockReadCount += 1;
        if (clockReadCount === 4) throw new Error("synthetic terminal clock failure");
        return new Date(trustedNow.getTime());
      },
    };
    const result = await executeControlledSyntheticProviderDelivery(
      ctx.input,
      async () => fixture(),
      { clock: oneShotFailureClock },
    );
    expect(result.controlledRun).toMatchObject({
      disposition: "FAILED",
      failureCode: "R37C_SYNTHETIC_ADAPTER_FAILED",
    });
    expect(result.canonicalEvidence).toBeNull();
    const durable = await prisma.controlledProviderRun.findUniqueOrThrow({
      where: { id: result.controlledRun.runId },
    });
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({
      where: { id: result.controlledRun.spendAttemptId! },
    });
    expect(durable.canonicalEvidenceSnapshot).toBeNull();
    expect(durable.canonicalEvidenceFingerprint).toBeNull();
    expect(durable.evidenceSnapshot).toBeNull();
    expect(attempt).toMatchObject({ state: "RELEASED", settledMicros: null });
    expect(clockReadCount).toBeGreaterThanOrEqual(5);
  });
});
