import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createConstructionContact, createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { goldenWorkflowForUser } from "@/server/construction-operating-assistant-r33/golden-workflow";

async function user(label: string) {
  return prisma.user.create({ data: { name: `R33 ${label}`, email: `r33-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
}

describe("R33 Golden Workflow on disposable PostgreSQL", () => {
  it("derives the same owner fingerprint and next action after reconnect", async () => {
    const owner = await user("owner");
    const initialized = await initializeConstructionWorkspace({ userId: owner.id, name: "Construction Laval", timezone: "America/Toronto", locale: "fr-CA" });
    const project = await createConstructionProject({ userId: owner.id, workspaceId: initialized.workspaceId, code: "LAVAL-001", name: "Rénovation Laval" });
    await createConstructionContact({ userId: owner.id, workspaceId: initialized.workspaceId, projectId: project.id, displayName: "Marc", role: "Fournisseur" });
    const before = await goldenWorkflowForUser({ userId: owner.id, workspaceId: initialized.workspaceId, now: new Date("2026-09-02T12:00:00.000Z") });
    expect(before).toMatchObject({ role: "OWNER", currentStep: "CAPTURE_WORK", completedCount: 1, providerObserved: false, externalEffectCount: 0 });
    await prisma.$disconnect();
    await prisma.$connect();
    const after = await goldenWorkflowForUser({ userId: owner.id, workspaceId: initialized.workspaceId, now: new Date("2026-09-02T12:01:00.000Z") });
    expect(after.stateFingerprint).toBe(before.stateFingerprint);
    expect(after.primaryAction).toEqual(before.primaryAction);
    expect(after.steps).toEqual(before.steps);
  });

  it("keeps field projection assigned and financially empty", async () => {
    const owner = await user("field-owner");
    const field = await user("field");
    const initialized = await initializeConstructionWorkspace({ userId: owner.id, name: "R33 Field", locale: "en-CA" });
    const project = await createConstructionProject({ userId: owner.id, workspaceId: initialized.workspaceId, code: "FIELD-001", name: "Field job" });
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: initialized.workspaceId, userId: field.id, role: "member", status: "active" } });
    await prisma.constructionJob.create({ data: { workspaceId: initialized.workspaceId, projectId: project.id, title: "Install cabinets", startsAt: new Date("2026-09-03T13:00:00.000Z"), endsAt: new Date("2026-09-03T17:00:00.000Z"), timezone: "America/Toronto", status: "scheduled", createdById: owner.id, assignments: { create: { workspaceId: initialized.workspaceId, assigneeKind: "member", assigneeId: field.id } } } });
    const projection = await goldenWorkflowForUser({ userId: field.id, workspaceId: initialized.workspaceId });
    expect(projection).toMatchObject({ role: "FIELD_WORKER", assignedProjectCount: 1, currentStep: "COLLECT_PROOF", providerObserved: false, externalEffectCount: 0 });
    expect(JSON.stringify(projection)).not.toMatch(/amountMinor|receivable|invoiceReference|pendingApprovalCount|activeExceptionCount|contact|import|policy|secret/u);
  });

  it("refuses a cross-workspace projection without disclosure", async () => {
    const first = await user("cross-a");
    const second = await user("cross-b");
    const one = await initializeConstructionWorkspace({ userId: first.id, name: "One" });
    const two = await initializeConstructionWorkspace({ userId: second.id, name: "Two" });
    await expect(goldenWorkflowForUser({ userId: first.id, workspaceId: two.workspaceId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(one.workspaceId).not.toBe(two.workspaceId);
  });
});
