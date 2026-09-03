import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import {
  activateProviderActivationGrant,
  prepareProviderActivationGrant,
  releaseProviderSpend,
  reserveProviderSpend,
  revokeProviderActivationGrant,
  setProviderLaneControl,
  settleProviderSpend,
} from "@/server/construction-operating-assistant-r37b/activation";

const sealedFingerprint = `sha256:${"b".repeat(64)}`;
const caseFingerprint = `sha256:${"c".repeat(64)}`;
const model = "openai/gpt-5";
const trustedNow = new Date("2026-09-02T17:00:00.000Z");
const clock = { now: () => new Date(trustedNow.getTime()) };

async function user(label: string, role: "CLIENT" | "ADMIN" = "CLIENT") {
  return prisma.user.create({ data: { name: `R37B ${label}`, email: `r37b-${label}-${crypto.randomUUID()}@example.invalid`, role, emailVerified: true } });
}

async function enableLane(adminId: string) {
  const current = await prisma.providerLaneControl.findUnique({ where: { id: "provider-lane-global" } });
  return setProviderLaneControl({ commandId: crypto.randomUUID(), actorId: adminId, state: "ENABLED", reason: "Local synthetic validation", expectedVersion: current?.version ?? 0 }, clock);
}

async function activeGrant(label: string, limits?: { calls?: number; spend?: bigint }) {
  const owner = await user(`${label}-owner`);
  const admin = await user(`${label}-admin`, "ADMIN");
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R37B ${label}` });
  await enableLane(admin.id);
  const commandId = crypto.randomUUID();
  const preparedInput = {
    commandId,
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    candidateKey: "OPENROUTER_CONTROLLER" as const,
    exactModelId: model,
    sealedExecutorFingerprint: sealedFingerprint,
    allowedCaseFingerprints: [caseFingerprint],
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    maxCallCount: limits?.calls ?? 3,
    maxTotalSpendMicros: limits?.spend ?? 5_000n,
  };
  const prepared = await prepareProviderActivationGrant(preparedInput, clock);
  const activated = await activateProviderActivationGrant({ commandId: crypto.randomUUID(), actorId: owner.id, workspaceId: workspace.workspaceId, grantId: prepared.grant.id, expectedVersion: 1, sealedExecutorFingerprint: sealedFingerprint }, clock);
  return { owner, admin, workspaceId: workspace.workspaceId, grant: activated.grant, preparedInput };
}

function reservationInput(ctx: Awaited<ReturnType<typeof activeGrant>>, idempotencyKey: string, requestedMicros: bigint) {
  return { actorId: ctx.owner.id, workspaceId: ctx.workspaceId, grantId: ctx.grant.id, idempotencyKey, caseFingerprint, exactModelId: model, sealedExecutorFingerprint: sealedFingerprint, requestedMicros };
}

describe("R37B provider activation controls on disposable PostgreSQL", () => {
  it("prepares, replays and activates one exact bounded grant", async () => {
    const ctx = await activeGrant("exact");
    const replay = await prepareProviderActivationGrant(ctx.preparedInput, clock);
    expect(replay).toMatchObject({ replayed: true, grant: { id: ctx.grant.id, status: "PREPARED", maxTotalSpendMicros: "5000", externalTransportPerformed: false } });
    await expect(prepareProviderActivationGrant({ ...ctx.preparedInput, maxCallCount: 9 }, clock)).rejects.toThrow("R37B_ALTERED_REPLAY_REFUSED");
    expect(await prisma.providerActivationDecision.count({ where: { grantId: ctx.grant.id } })).toBe(2);
  });

  it("collapses exact replay and admits only one concurrent reservation within ceilings", async () => {
    const ctx = await activeGrant("concurrent", { calls: 1, spend: 700n });
    const same = reservationInput(ctx, "same-attempt", 700n);
    const first = await reserveProviderSpend(same, clock);
    const replay = await reserveProviderSpend(same, clock);
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, attempt: { id: first.attempt.id, reservedMicros: "700" } });
    const competing = await Promise.allSettled([
      reserveProviderSpend(reservationInput(ctx, "other-a", 1n), clock),
      reserveProviderSpend(reservationInput(ctx, "other-b", 1n), clock),
    ]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(0);
    expect(await prisma.providerSpendAttempt.count({ where: { grantId: ctx.grant.id } })).toBe(1);
    const grant = await prisma.providerActivationGrant.findUniqueOrThrow({ where: { id: ctx.grant.id } });
    expect(grant).toMatchObject({ attemptCount: 1, reservedCallCount: 1, reservedSpendMicros: 700n });
  });

  it("settles or releases exactly once and preserves integer ledger totals", async () => {
    const ctx = await activeGrant("terminal", { calls: 2, spend: 1_000n });
    const reserved = await reserveProviderSpend(reservationInput(ctx, "settle-me", 600n), clock);
    const commandId = crypto.randomUUID();
    const settledInput = { commandId, actorId: ctx.owner.id, workspaceId: ctx.workspaceId, grantId: ctx.grant.id, attemptId: reserved.attempt.id, expectedVersion: 1, settledMicros: 450n };
    const settled = await settleProviderSpend(settledInput, clock);
    const replay = await settleProviderSpend(settledInput, clock);
    expect(settled).toMatchObject({ replayed: false, attempt: { state: "SETTLED", settledMicros: "450", releasedMicros: "150" } });
    expect(replay.replayed).toBe(true);
    await expect(releaseProviderSpend({ commandId: crypto.randomUUID(), actorId: ctx.owner.id, workspaceId: ctx.workspaceId, grantId: ctx.grant.id, attemptId: reserved.attempt.id, expectedVersion: 2 }, clock)).rejects.toThrow("R37B_ATTEMPT_ALREADY_TERMINAL");
    const second = await reserveProviderSpend(reservationInput(ctx, "release-me", 300n), clock);
    await releaseProviderSpend({ commandId: crypto.randomUUID(), actorId: ctx.owner.id, workspaceId: ctx.workspaceId, grantId: ctx.grant.id, attemptId: second.attempt.id, expectedVersion: 1 }, clock);
    const grant = await prisma.providerActivationGrant.findUniqueOrThrow({ where: { id: ctx.grant.id } });
    expect(grant).toMatchObject({ attemptCount: 2, reservedCallCount: 0, reservedSpendMicros: 0n, settledCallCount: 1, settledSpendMicros: 450n, releasedCallCount: 1 });
  });

  it("enforces model, case, workspace, revocation and the global kill switch", async () => {
    const ctx = await activeGrant("guards", { calls: 5, spend: 5_000n });
    await expect(reserveProviderSpend({ ...reservationInput(ctx, "wrong-model", 10n), exactModelId: "other/model" }, clock)).rejects.toThrow("R37B_EXACT_MODEL_MISMATCH");
    await expect(reserveProviderSpend({ ...reservationInput(ctx, "wrong-case", 10n), caseFingerprint: `sha256:${"d".repeat(64)}` }, clock)).rejects.toThrow("R37B_CASE_NOT_ALLOWED");
    const outsider = await user("outsider");
    await expect(reserveProviderSpend({ ...reservationInput(ctx, "outsider", 10n), actorId: outsider.id }, clock)).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const current = await prisma.providerActivationGrant.findUniqueOrThrow({ where: { id: ctx.grant.id } });
    await revokeProviderActivationGrant({ commandId: crypto.randomUUID(), actorId: ctx.owner.id, workspaceId: ctx.workspaceId, grantId: ctx.grant.id, expectedVersion: current.version, reason: "Local revocation test" }, clock);
    await expect(reserveProviderSpend(reservationInput(ctx, "after-revoke", 10n), clock)).rejects.toThrow("R37B_GRANT_INACTIVE");

    const live = await activeGrant("kill", { calls: 2, spend: 500n });
    const lane = await prisma.providerLaneControl.findUniqueOrThrow({ where: { id: "provider-lane-global" } });
    const disableCommand = { commandId: crypto.randomUUID(), actorId: live.admin.id, state: "DISABLED" as const, reason: "Emergency local stop", expectedVersion: lane.version };
    const disabled = await setProviderLaneControl(disableCommand, clock);
    const replay = await setProviderLaneControl(disableCommand, clock);
    expect(disabled).toMatchObject({ replayed: false, control: { state: "DISABLED" }, externalTransportPerformed: false });
    expect(replay.replayed).toBe(true);
    await expect(reserveProviderSpend(reservationInput(live, "after-kill", 10n), clock)).rejects.toThrow("R37B_PROVIDER_LANE_DISABLED");
    expect(await prisma.providerSpendAttempt.count({ where: { grantId: live.grant.id } })).toBe(0);
  });
});
