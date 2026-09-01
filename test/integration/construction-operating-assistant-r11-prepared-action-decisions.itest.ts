import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { decidePreparedAction } from "@/server/construction-operating-assistant-r11/decisions";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R11 owner ${label}`,
      email: `r11-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R11 field ${label}`,
      email: `r11-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R11 Construction ${label}`,
  });
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: field.id,
      role: "member",
      status: "active",
    },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R11-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Fournisseur synthétique",
    normalizedPhone: "+15555550184",
    normalizedEmail: `marc-${label}@example.invalid`,
  });
  const prepared = await processConstructionMessage({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    channel: "portal",
    body: "Texte Marc que je serai 30 minutes en retard.",
    idempotencyKey: `r11-${label}-${crypto.randomUUID()}`,
    referenceNow: new Date("2026-09-01T13:00:00.000Z"),
  });
  if (!prepared.actionId) throw new Error("R11_ACTION_NOT_PREPARED");
  const action = await prisma.constructionAction.findUniqueOrThrow({
    where: { id: prepared.actionId },
    select: { id: true, version: true, payloadHash: true },
  });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    action,
  };
}

function command(
  f: Awaited<ReturnType<typeof fixture>>,
  decision: "APPROVE" | "REJECT" | "REVOKE",
  commandId = crypto.randomUUID(),
) {
  return {
    schemaVersion: 1 as const,
    commandId,
    workspaceId: f.workspaceId,
    actionId: f.action.id,
    expectedVersion: f.action.version,
    expectedFingerprint: f.action.payloadHash,
    decision,
    ...(decision === "APPROVE" ? {} : { reason: `Raison synthétique ${decision}` }),
  };
}

describe("Construction Operating Assistant R11 decisions on disposable PostgreSQL", () => {
  it("serializes concurrent exact approvals into one canonical transition", async () => {
    const f = await fixture("approve");
    const approve = command(f, "APPROVE");
    const results = await Promise.all([
      decidePreparedAction({ userId: f.ownerId, command: approve }),
      decidePreparedAction({ userId: f.ownerId, command: approve }),
    ]);
    expect(results.map((value) => value.replayed).sort()).toEqual([false, true]);
    expect(results.every((value) => value.state === "APPROVED_UNSENT")).toBe(true);
    expect(results.every((value) => !value.externalTransportPerformed)).toBe(true);
    const stored = await prisma.constructionAction.findUniqueOrThrow({
      where: { id: f.action.id },
      select: {
        status: true,
        approvedVersion: true,
        approvedPayloadHash: true,
        simulatedDeliveryCount: true,
      },
    });
    expect(stored).toEqual({
      status: "approved",
      approvedVersion: f.action.version,
      approvedPayloadHash: f.action.payloadHash,
      simulatedDeliveryCount: 0,
    });
    expect(
      await prisma.constructionAuditEvent.count({
        where: {
          workspaceId: f.workspaceId,
          entityId: f.action.id,
          action: "construction_outbound_approved_unsent_r11",
        },
      }),
    ).toBe(1);
  });

  it("rejects before approval, replays exactly and denies field-worker decisions", async () => {
    const f = await fixture("reject");
    const reject = command(f, "REJECT");
    const first = await decidePreparedAction({ userId: f.ownerId, command: reject });
    const replay = await decidePreparedAction({ userId: f.ownerId, command: reject });
    expect(first).toMatchObject({ state: "REJECTED", replayed: false });
    expect(replay).toMatchObject({ state: "REJECTED", replayed: true });
    await expect(
      decidePreparedAction({
        userId: f.ownerId,
        command: command(f, "APPROVE"),
      }),
    ).rejects.toThrow("DECISION_STATE_CHANGED");

    const fieldFixture = await fixture("field-denied");
    await expect(
      decidePreparedAction({
        userId: fieldFixture.fieldId,
        command: command(fieldFixture, "REJECT"),
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });

  it("revokes an exact approval, refuses command drift and never dispatches", async () => {
    const f = await fixture("revoke");
    await decidePreparedAction({
      userId: f.ownerId,
      command: command(f, "APPROVE"),
    });
    const commandId = crypto.randomUUID();
    const revoke = command(f, "REVOKE", commandId);
    const first = await decidePreparedAction({ userId: f.ownerId, command: revoke });
    const replay = await decidePreparedAction({ userId: f.ownerId, command: revoke });
    expect(first).toMatchObject({ state: "REVOKED", replayed: false });
    expect(replay).toMatchObject({ state: "REVOKED", replayed: true });
    await expect(
      decidePreparedAction({
        userId: f.ownerId,
        command: { ...revoke, decision: "REJECT", reason: "Commande modifiée" },
      }),
    ).rejects.toThrow("DECISION_IDEMPOTENCY_MISMATCH");
    expect(
      await prisma.constructionAction.findUniqueOrThrow({
        where: { id: f.action.id },
        select: { status: true, simulatedDeliveryCount: true },
      }),
    ).toEqual({ status: "revoked", simulatedDeliveryCount: 0 });
    expect(
      await prisma.constructionConnectorOperation.count({
        where: {
          workspaceId: f.workspaceId,
          externalTransportPerformed: true,
        },
      }),
    ).toBe(0);
  });
});
