import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { preparedActionInspectionSchema } from "@/lib/construction-operating-assistant-r10/prepared-action-contracts";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { constructionSharedCockpitForUser } from "@/server/construction-operating-assistant-r7/gateway";
import { decidePreparedAction } from "@/server/construction-operating-assistant-r11/decisions";

describe("Construction Operating Assistant R12 native control on disposable PostgreSQL", () => {
  it("round-trips an exact native approval and remains approved-unsent on retry", async () => {
    const owner = await prisma.user.create({
      data: {
        name: "R12 owner",
        email: `r12-owner-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const workspace = await initializeConstructionWorkspace({
      userId: owner.id,
      name: "R12 Construction",
    });
    const project = await createConstructionProject({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      code: "LAVAL-001",
      name: "Rénovation Laval",
    });
    await createConstructionContact({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      displayName: "Marc",
      role: "Fournisseur synthétique",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc-r12@example.invalid",
    });
    const prepared = await processConstructionMessage({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      channel: "portal",
      body: "Texte Marc que je serai 30 minutes en retard.",
      idempotencyKey: `r12-${crypto.randomUUID()}`,
      referenceNow: new Date("2026-09-01T13:00:00.000Z"),
    });
    const before = await constructionSharedCockpitForUser({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
    });
    const raw = before.actions.find((action) => action.id === prepared.actionId);
    if (!raw || !("payload" in raw)) throw new Error("R12_ACTION_MISSING");
    const inspection = preparedActionInspectionSchema.parse(raw.payload);
    expect(inspection).toMatchObject({
      recipient: "+15555550184",
      channel: "SMS",
      state: "PREPARED_UNSENT",
      externalTransportPerformed: false,
    });

    const command = {
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      actionId: inspection.actionId,
      expectedVersion: inspection.version,
      expectedFingerprint: inspection.fingerprint,
      decision: "APPROVE",
    } as const;
    const first = await decidePreparedAction({ userId: owner.id, command });
    const replay = await decidePreparedAction({ userId: owner.id, command });
    expect(first).toMatchObject({
      state: "APPROVED_UNSENT",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(replay).toMatchObject({
      state: "APPROVED_UNSENT",
      replayed: true,
      externalTransportPerformed: false,
    });

    const after = await constructionSharedCockpitForUser({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
    });
    const approvedRaw = after.actions.find((action) => action.id === prepared.actionId);
    if (!approvedRaw || !("payload" in approvedRaw)) {
      throw new Error("R12_APPROVED_ACTION_MISSING");
    }
    const approved = preparedActionInspectionSchema.parse(approvedRaw.payload);
    expect(approved.state).toBe("APPROVED_UNSENT");
    expect(approved.fingerprint).toBe(inspection.fingerprint);
    expect(approved.approval).toMatchObject({
      approvedVersion: inspection.version,
      approvedFingerprint: inspection.fingerprint,
    });
    expect(
      await prisma.constructionAction.findUniqueOrThrow({
        where: { id: inspection.actionId },
        select: { simulatedDeliveryCount: true },
      }),
    ).toEqual({ simulatedDeliveryCount: 0 });
    expect(
      await prisma.constructionConnectorOperation.count({
        where: {
          workspaceId: workspace.workspaceId,
          externalTransportPerformed: true,
        },
      }),
    ).toBe(0);
  });
});
