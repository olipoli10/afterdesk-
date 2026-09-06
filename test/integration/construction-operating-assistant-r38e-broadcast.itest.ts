import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { secretaryBroadcastCockpitForUser } from "@/server/construction-operating-assistant-r38e/broadcast-preparation";

async function fixture() {
  const owner = await prisma.user.create({
    data: { name: "R38E owner", email: `r38e-owner-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const field = await prisma.user.create({
    data: { name: "R38E field", email: `r38e-field-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const other = await prisma.user.create({
    data: { name: "R38E other", email: `r38e-other-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R38E secretary" });
  await prisma.constructionWorkspaceMember.create({
    data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    displayName: "Marc",
    normalizedPhone: "+15145550101",
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    displayName: "Julie",
    normalizedPhone: "+15145550202",
  });
  return { owner, field, other, workspaceId: workspace.workspaceId };
}

function request(workspaceId: string, message: string, requestId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    requestId,
    workspaceId,
    message,
    occurredAt: "2026-09-06T00:00:00.000Z",
  };
}

describe("R38E durable secretary broadcast preparation", () => {
  afterAll(() => prisma.$disconnect());

  it("prepares exactly one ordered unsent draft, reconstructs replay and refuses drift", async () => {
    const f = await fixture();
    const requestId = crypto.randomUUID();
    const command = request(
      f.workspaceId,
      "Texte Marc et Julie que le chantier ouvre à 7 h.",
      requestId,
    );
    const first = await processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: command,
    });
    const replay = await processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: command,
    });
    expect(first).toMatchObject({
      intent: "OUTBOUND_MESSAGE_DRAFT",
      status: "PREPARED_UNSENT",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(first.reply).toContain("Marc, Julie");
    expect(first.reply).toContain("Aucun texto n’a été envoyé");
    expect(replay).toMatchObject({
      replayed: true,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      canonicalEffectId: first.canonicalEffectId,
    });
    expect(await prisma.constructionSecretaryBroadcastDraft.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(1);
    const draft = await prisma.constructionSecretaryBroadcastDraft.findFirstOrThrow({
      where: { workspaceId: f.workspaceId },
    });
    expect(draft).toMatchObject({
      status: "PREPARED_UNSENT",
      channel: "SMS",
      body: "le chantier ouvre à 7 h.",
      externalTransportPerformed: false,
    });
    expect(draft.recipientSnapshot).toEqual([
      { contactId: expect.any(String), displayName: "Marc", normalizedRecipient: "+15145550101" },
      { contactId: expect.any(String), displayName: "Julie", normalizedRecipient: "+15145550202" },
    ]);
    await expect(processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: request(f.workspaceId, "Texte Marc et Julie que le chantier ouvre à 8 h.", requestId),
    })).rejects.toThrow("R38E_BROADCAST_REPLAY_MISMATCH");
    expect(await prisma.constructionSecretaryBroadcastDraft.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(1);
  });

  it("refuses unresolved audiences without creating a draft", async () => {
    const f = await fixture();
    const result = await processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: request(f.workspaceId, "Texte Marc et Karim que rendez-vous à 14 h."),
    });
    expect(result).toMatchObject({ status: "REFUSED", canonicalEffectId: null });
    expect(result.reply).toContain("Karim");
    expect(await prisma.constructionSecretaryBroadcastDraft.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(0);
  });

  it("shows owner details, redacts field-worker content and isolates workspaces", async () => {
    const f = await fixture();
    await processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "PORTAL",
      request: request(f.workspaceId, "Texte Marc et Julie que bonjour à tous."),
    });
    const ownerView = await secretaryBroadcastCockpitForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    expect(ownerView.drafts[0]).toMatchObject({
      visibility: "FULL",
      body: "bonjour à tous.",
      recipients: [
        { displayName: "Marc", maskedDestination: "••• ••• 0101" },
        { displayName: "Julie", maskedDestination: "••• ••• 0202" },
      ],
    });
    const fieldView = await secretaryBroadcastCockpitForUser({ userId: f.field.id, workspaceId: f.workspaceId });
    expect(fieldView.drafts[0]).toEqual(expect.objectContaining({
      visibility: "REDACTED",
      recipientCount: 2,
    }));
    expect(JSON.stringify(fieldView)).not.toContain("bonjour à tous");
    expect(JSON.stringify(fieldView)).not.toContain("Marc");
    await expect(secretaryBroadcastCockpitForUser({ userId: f.other.id, workspaceId: f.workspaceId }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
