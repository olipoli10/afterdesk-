import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace, createConstructionProject } from "@/server/construction-assistant-v1/workspace";
import {
  commercialAccountForUser,
  commercialPortfolioForAdmin,
  processCommercialCommand,
} from "@/server/construction-operating-assistant-r34/commercial";

async function user(label: string, role: "CLIENT" | "ADMIN" = "CLIENT") {
  return prisma.user.create({ data: { name: `R34 ${label}`, email: `r34-${label}-${crypto.randomUUID()}@example.invalid`, role, emailVerified: true } });
}

describe("R34 commercial account on disposable PostgreSQL", () => {
  it("assigns one exact account, replays once and survives reconnect", async () => {
    const owner = await user("owner");
    const admin = await user("admin", "ADMIN");
    const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "Construction Laval" });
    const command = { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 } as const;
    const first = await processCommercialCommand({ actorId: admin.id, command, now: new Date("2026-09-02T12:00:00.000Z") });
    const replay = await processCommercialCommand({ actorId: admin.id, command, now: new Date("2026-09-02T12:01:00.000Z") });
    expect(first).toMatchObject({ replayed: false, account: { accountVersion: 1, state: "PREPARED", monthlyPriceMinor: null, billingProvider: "DISABLED_LOCAL" }, externalEffectCount: 0 });
    expect(replay).toMatchObject({ replayed: true, account: first.account });
    expect(await prisma.constructionCommercialAccount.count({ where: { workspaceId: workspace.workspaceId } })).toBe(1);
    expect(await prisma.constructionCommercialDecision.count({ where: { workspaceId: workspace.workspaceId } })).toBe(1);
    await prisma.$disconnect(); await prisma.$connect();
    const projection = await commercialAccountForUser({ userId: owner.id, workspaceId: workspace.workspaceId, now: new Date("2026-09-02T12:02:00.000Z") });
    expect(projection.account).toEqual(first.account);
  });

  it("collapses concurrent identical assignment and refuses altered replay", async () => {
    const owner = await user("concurrent-owner");
    const admin = await user("concurrent-admin", "ADMIN");
    const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "Concurrent" });
    const command = { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 } as const;
    const results = await Promise.all([processCommercialCommand({ actorId: admin.id, command }), processCommercialCommand({ actorId: admin.id, command })]);
    expect(results.filter((item) => !item.replayed)).toHaveLength(1);
    expect(await prisma.constructionCommercialDecision.count({ where: { workspaceId: workspace.workspaceId } })).toBe(1);
    await expect(processCommercialCommand({ actorId: admin.id, command: { ...command, kind: "CHANGE_STATE", expectedAccountVersion: 1, nextState: "INTERNAL_TRIAL" } })).rejects.toThrow("COMMERCIAL_ALTERED_REPLAY_REFUSED");
  });

  it("changes state only at the expected version and refuses stale commands", async () => {
    const owner = await user("state-owner");
    const admin = await user("state-admin", "ADMIN");
    const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "State" });
    await processCommercialCommand({ actorId: admin.id, command: { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 } });
    const changed = await processCommercialCommand({ actorId: admin.id, command: { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "CHANGE_STATE", expectedAccountVersion: 1, nextState: "INTERNAL_TRIAL" } });
    expect(changed.account).toMatchObject({ state: "INTERNAL_TRIAL", accountVersion: 2 });
    await expect(processCommercialCommand({ actorId: admin.id, command: { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "CHANGE_STATE", expectedAccountVersion: 1, nextState: "SUSPENDED" } })).rejects.toThrow("COMMERCIAL_STALE_ACCOUNT_VERSION");
  });

  it("derives exact seven-metric usage without an amount due", async () => {
    const owner = await user("usage-owner");
    const admin = await user("usage-admin", "ADMIN");
    const field = await user("usage-field");
    const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "Usage" });
    const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: "LAVAL-001", name: "Rénovation Laval" });
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
    await prisma.constructionMessage.create({ data: { workspaceId: workspace.workspaceId, projectId: project.id, direction: "inbound", channel: "portal", idempotencyKey: crypto.randomUUID(), recipients: [], originalBody: "Travail terminé", normalizedBody: "Travail terminé", receivedAt: new Date("2026-09-02T12:00:00.000Z") } });
    await processCommercialCommand({ actorId: admin.id, command: { commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 }, now: new Date("2026-09-02T12:00:00.000Z") });
    const projection = await commercialAccountForUser({ userId: owner.id, workspaceId: workspace.workspaceId, now: new Date("2026-09-02T12:01:00.000Z") });
    expect(Object.fromEntries(projection.usage.readings.map((reading) => [reading.metric, reading.quantity]))).toMatchObject({ ACTIVE_PROJECTS: 1, ACTIVE_MEMBERS: 2, INGESTED_MESSAGES: 1 });
    expect(projection.usage).toMatchObject({ informationalOnly: true, amountDueMinor: null, currency: "CAD", providerObserved: false, externalEffectCount: 0 });
  });

  it("refuses field and cross-workspace commercial projections", async () => {
    const ownerA = await user("access-owner-a");
    const ownerB = await user("access-owner-b");
    const field = await user("access-field");
    const a = await initializeConstructionWorkspace({ userId: ownerA.id, name: "A" });
    const b = await initializeConstructionWorkspace({ userId: ownerB.id, name: "B" });
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: a.workspaceId, userId: field.id, role: "member", status: "active" } });
    await expect(commercialAccountForUser({ userId: field.id, workspaceId: a.workspaceId })).rejects.toThrow("COMMERCIAL_FIELD_ACCESS_REFUSED");
    await expect(commercialAccountForUser({ userId: ownerA.id, workspaceId: b.workspaceId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });

  it("orders missing-plan accounts ahead of healthy accounts without writing", async () => {
    const admin = await user("portfolio-admin", "ADMIN");
    const ownerA = await user("portfolio-a");
    const ownerB = await user("portfolio-b");
    const a = await initializeConstructionWorkspace({ userId: ownerA.id, name: "Alpha" });
    const b = await initializeConstructionWorkspace({ userId: ownerB.id, name: "Beta" });
    await processCommercialCommand({ actorId: admin.id, command: { commandId: crypto.randomUUID(), workspaceId: b.workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion: 0, planKey: "EARLY_ACCESS", planVersion: 1 } });
    const decisionsBefore = await prisma.constructionCommercialDecision.count();
    const portfolio = await commercialPortfolioForAdmin({ actorId: admin.id });
    expect(portfolio.workspaces.find((row) => row.workspaceId === a.workspaceId)).toMatchObject({ attentionReason: "MISSING_PLAN", safeNextAction: "ASSIGN_LOCAL_PLAN" });
    expect(portfolio.workspaces.find((row) => row.workspaceId === b.workspaceId)).toMatchObject({ attentionReason: "HEALTHY", safeNextAction: "NO_ACTION" });
    const firstHealthy = portfolio.workspaces.findIndex((row) => row.attentionReason === "HEALTHY");
    const lastMissing = portfolio.workspaces.findLastIndex((row) => row.attentionReason === "MISSING_PLAN");
    expect(lastMissing).toBeLessThan(firstHealthy);
    expect(await prisma.constructionCommercialDecision.count()).toBe(decisionsBefore);
  });
});
