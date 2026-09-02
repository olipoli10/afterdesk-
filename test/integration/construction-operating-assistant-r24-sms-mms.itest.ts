import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { boundOutboundActionSchema } from "@/lib/construction-assistant-v1/outbound";
import { opaqueContactMessagingRef } from "@/lib/construction-operating-assistant-r24/policy";
import {
  applyMessagingPolicyCommandR24,
  messagingCockpitForUserR24,
  observeSyntheticMessagingDeliveryR24,
  preparePolicyBoundSmsR24,
  processMessagingInboundR24,
} from "@/server/construction-operating-assistant-r24/messaging";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import { prepareCommunicationChannel } from "@/server/construction-operating-assistant-r4/connectors";
import { approveOutboundWithoutDispatch } from "@/server/construction-operating-assistant-r4/outbound";

const assertion = {
  adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4" as const,
  authenticityVerified: true,
  externalTransportPerformed: false as const,
};

async function fixture(label: string, withSecondProject = false) {
  const owner = await prisma.user.create({
    data: { name: `R24 owner ${label}`, email: `r24-owner-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const office = await prisma.user.create({
    data: { name: `R24 office ${label}`, email: `r24-office-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const field = await prisma.user.create({
    data: { name: `R24 field ${label}`, email: `r24-field-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R24 ${label}` });
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    ],
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `LAVAL-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  if (withSecondProject) {
    await createConstructionProject({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      code: `LONGUEUIL-${label}`,
      name: `Rénovation Longueuil ${label}`,
    });
  }
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: withSecondProject ? undefined : project.id,
    displayName: "Marc",
    normalizedPhone: "+15555550184",
  });
  const identityRef = opaqueContactMessagingRef({ workspaceId: workspace.workspaceId, contactId: contact.id });
  await prisma.constructionCommunicationIdentity.create({
    data: {
      workspaceId: workspace.workspaceId,
      contactId: contact.id,
      channel: "sms",
      normalizedAddress: identityRef,
      verified: true,
      permissions: ["PROJECT_UPDATE", "MESSAGE"],
      status: "active",
    },
  });
  return {
    ownerId: owner.id,
    officeId: office.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    projectCode: `LAVAL-${label}`,
    contactId: contact.id,
    identityRef,
  };
}

function inbound(f: Awaited<ReturnType<typeof fixture>>, body: string, eventId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    eventId,
    workspaceId: f.workspaceId,
    senderIdentityRef: f.identityRef,
    occurredAt: "2026-09-02T01:00:00.000Z",
    kind: "SMS_TEXT" as const,
    body,
    mediaReferences: [] as const,
  };
}

async function recordConsent(
  f: Awaited<ReturnType<typeof fixture>>,
  expectedStateVersion = 0,
) {
  return applyMessagingPolicyCommandR24({
    userId: f.ownerId,
    command: {
      schemaVersion: 1,
      action: "RECORD_CONSENT",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      contactId: f.contactId,
      purpose: "service",
      evidenceRef: `consent_${sha256Canonical({ fixture: f.workspaceId, purpose: "service" })}`,
      expectedStateVersion,
    },
  });
}

describe("Construction Operating Assistant R24 SMS/MMS on PostgreSQL", () => {
  it("routes one inbound message, replays exactly and refuses ambiguous project guesses", async () => {
    const f = await fixture("route");
    const event = inbound(f, "Le matériel est prêt.");
    const [first, second] = await Promise.all([
      processMessagingInboundR24({ event, assertion }),
      processMessagingInboundR24({ event, assertion }),
    ]);
    expect(new Set([first.messageId, second.messageId]).size).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first).toMatchObject({ projectId: f.projectId, status: "APPLIED", externalTransportPerformed: false });
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } })).toBe(1);

    const ambiguous = await fixture("ambiguous", true);
    const result = await processMessagingInboundR24({
      event: inbound(ambiguous, "Le matériel est prêt."),
      assertion,
    });
    expect(result).toMatchObject({ projectId: null, status: "CLARIFICATION_REQUIRED" });
    expect(await prisma.constructionMessage.count({
      where: { workspaceId: ambiguous.workspaceId, projectId: { not: null } },
    })).toBe(0);
  });

  it("persists STOP atomically, makes START review-only and blocks policy-bound preparation", async () => {
    const f = await fixture("stop");
    const consent = await recordConsent(f);
    expect(consent).toMatchObject({ consentStatus: "granted", suppressionStatus: "allowed" });
    const stopEvent = inbound(f, "STOP");
    const [a, b] = await Promise.all([
      processMessagingInboundR24({ event: stopEvent, assertion }),
      processMessagingInboundR24({ event: stopEvent, assertion }),
    ]);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(await prisma.constructionMessagingPermission.count({
      where: { workspaceId: f.workspaceId, suppressionStatus: "suppressed" },
    })).toBe(2);
    const start = await processMessagingInboundR24({ event: inbound(f, "START"), assertion });
    expect(start.status).toBe("CLARIFICATION_REQUIRED");
    expect(await prisma.constructionMessagingPermission.count({
      where: { workspaceId: f.workspaceId, consentStatus: "granted" },
    })).toBe(0);
    const persisted = await messagingCockpitForUserR24({ userId: f.ownerId, workspaceId: f.workspaceId });
    expect(persisted.policies.every((item) => item.suppressionStatus === "review_required")).toBe(true);
  });

  it("links only same-project selected MMS evidence", async () => {
    const f = await fixture("mms");
    const source = await prisma.constructionMessage.create({
      data: {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        direction: "inbound",
        channel: "portal",
        idempotencyKey: crypto.randomUUID(),
        recipients: [],
        originalBody: "Travail terminé.",
        normalizedBody: "Travail terminé.",
      },
    });
    const loop = await prisma.constructionOpenLoop.create({
      data: {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        openedByMessageId: source.id,
        desiredOutcome: "Dossier prêt à facturer",
        idempotencyKey: crypto.randomUUID(),
        semanticKey: crypto.randomUUID(),
        nextResponsibleRole: "OWNER",
        nextAction: "Ajouter les preuves",
        decisionHash: "a".repeat(64),
        policyVersion: "r24-test",
      },
    });
    const contentHash = "b".repeat(64);
    const evidence = await prisma.constructionOpenLoopEvidence.create({
      data: {
        loopId: loop.id,
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        evidenceKey: crypto.randomUUID(),
        kind: "photo",
        state: "present_unverified",
        sourceRef: "file:synthetic-r24",
        contentHash,
      },
    });
    const result = await processMessagingInboundR24({
      event: {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        senderIdentityRef: f.identityRef,
        occurredAt: "2026-09-02T01:02:00.000Z",
        kind: "MMS",
        body: "Photo du chantier.",
        mediaReferences: [{ evidenceId: evidence.id, contentHash, kind: "PHOTO" }],
      },
      assertion,
    });
    expect(result).toMatchObject({ projectId: f.projectId, mediaReferenceCount: 1 });
    expect(await prisma.constructionMessageMediaReference.count({ where: { messageId: result.messageId } })).toBe(1);
    await expect(processMessagingInboundR24({
      event: {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        senderIdentityRef: f.identityRef,
        occurredAt: "2026-09-02T01:03:00.000Z",
        kind: "MMS",
        body: "Photo changée.",
        mediaReferences: [{ evidenceId: evidence.id, contentHash: "c".repeat(64), kind: "PHOTO" }],
      },
      assertion,
    })).rejects.toThrow("MESSAGING_MEDIA_REFERENCE_REFUSED");
  });

  it("prepares one exact consented SMS and retains monotonic synthetic delivery state", async () => {
    const f = await fixture("outbound");
    await prepareCommunicationChannel({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_CHANNEL",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        channel: "SMS",
      },
    });
    await recordConsent(f);
    const draft = await processOperatingAssistantCommand({
      userId: f.ownerId,
      envelope: {
        schemaVersion: 1,
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        channel: "PORTAL",
        body: "Texte Marc que je serai 30 minutes en retard.",
        occurredAt: "2026-09-02T01:10:00.000Z",
        senderAddress: `user:${f.ownerId}`,
      },
    });
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: draft.canonicalEffectId ?? "" } });
    const payload = boundOutboundActionSchema.parse(action.payload);
    await approveOutboundWithoutDispatch({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "APPROVE_OUTBOUND",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        actionId: action.id,
        expectedVersion: action.version,
        expectedPayloadHash: action.payloadHash,
      },
    });
    const command = {
      schemaVersion: 1 as const,
      action: "PREPARE_POLICY_BOUND_SMS" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      actionId: action.id,
      purpose: "service" as const,
      expectedVersion: action.version,
      expectedPayloadHash: action.payloadHash,
    };
    const prepared = await preparePolicyBoundSmsR24({ userId: f.officeId, command });
    const replay = await preparePolicyBoundSmsR24({ userId: f.officeId, command });
    expect(prepared).toMatchObject({
      status: "PREPARED_UNSENT",
      body: payload.body,
      maskedRecipient: "••••0184",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(replay).toMatchObject({ operationId: prepared.operationId, replayed: true });
    const persisted = await prisma.constructionConnectorOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(JSON.stringify(persisted.request)).not.toContain(payload.normalizedRecipient);
    expect(JSON.stringify(persisted.request)).not.toContain(payload.body);

    const delivered = {
      schemaVersion: 1 as const,
      eventId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      operationId: prepared.operationId,
      providerEventRef: `event_${"d".repeat(64)}`,
      status: "DELIVERED" as const,
      proofLevel: "SYNTHETIC_LOCAL" as const,
      observedAt: "2026-09-02T01:11:00.000Z",
      externalTransportPerformed: false as const,
    };
    const observed = await observeSyntheticMessagingDeliveryR24({ observation: delivered, assertion });
    const observedReplay = await observeSyntheticMessagingDeliveryR24({ observation: delivered, assertion });
    expect(observed).toMatchObject({ status: "DELIVERED", proofLevel: "SYNTHETIC_LOCAL", replayed: false });
    expect(observedReplay.replayed).toBe(true);
    await expect(observeSyntheticMessagingDeliveryR24({
      observation: {
        ...delivered,
        eventId: crypto.randomUUID(),
        providerEventRef: `event_${"e".repeat(64)}`,
        status: "SENT",
        observedAt: "2026-09-02T01:12:00.000Z",
      },
      assertion,
    })).rejects.toThrow("DELIVERY_STATE_REGRESSION");

    const field = await messagingCockpitForUserR24({ userId: f.fieldId, workspaceId: f.workspaceId });
    expect(field).toMatchObject({ role: "field_worker", policies: [], timeline: [], deliveries: [] });
    expect(JSON.stringify(field)).not.toMatch(/Marc|0184|retard|consent_/u);
    const owner = await messagingCockpitForUserR24({ userId: f.ownerId, workspaceId: f.workspaceId });
    expect(owner.providerDeliveryObserved).toBe(false);
    expect(owner.deliveries[0]).toMatchObject({ status: "DELIVERED", proofLevel: "SYNTHETIC_LOCAL" });
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });
});
