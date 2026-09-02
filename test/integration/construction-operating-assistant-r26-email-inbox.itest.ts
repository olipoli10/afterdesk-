import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { EMAIL_POLICY_VERSION } from "@/lib/construction-operating-assistant-r26/contracts";
import { opaqueEmailRef } from "@/lib/construction-operating-assistant-r26/policy";
import {
  approveEmailDraftR26,
  emailInboxCockpitForUserR26,
  manageEmailAccountR26,
  prepareEmailDraftR26,
  processEmailInboundR26,
} from "@/server/construction-operating-assistant-r26/email-inbox";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const assertion = {
  adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R26" as const,
  authenticityVerified: true,
  externalTransportPerformed: false as const,
};

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R26 owner ${label}`,
      email: `r26-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R26 field ${label}`,
      email: `r26-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R26 ${label}`,
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
    code: `EMAIL-${label}`,
    name: `Projet courriel ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Fournisseur",
    normalizedEmail: `marc-${label}@example.invalid`,
  });
  const emailRef = opaqueEmailRef({ workspaceId: workspace.workspaceId, contactId: contact.id });
  await prisma.constructionCommunicationIdentity.create({
    data: {
      workspaceId: workspace.workspaceId,
      contactId: contact.id,
      channel: "email",
      normalizedAddress: emailRef,
      verified: true,
      permissions: ["COMMAND"],
      status: "active",
    },
  });
  const accountRef = opaqueEmailRef({ workspace: workspace.workspaceId, account: "local" });
  const account = await manageEmailAccountR26({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_EMAIL_ACCOUNT",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      provider: "GOOGLE_GMAIL",
      accountRef,
      mailboxScopeRef: opaqueEmailRef({ workspace: workspace.workspaceId, scope: "project" }),
      capabilities: ["READ_METADATA", "READ_SELECTED_CONTENT", "PREPARE_DRAFT"],
    },
  }) as { accountId: string };
  return {
    ownerId: owner.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    contactId: contact.id,
    emailRef,
    accountId: account.accountId,
    accountRef,
  };
}

function inbound(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    schemaVersion: 1 as const,
    eventId: crypto.randomUUID(),
    workspaceId: f.workspaceId,
    accountId: f.accountId,
    providerMessageRef: opaqueEmailRef(crypto.randomUUID()),
    threadRef: opaqueEmailRef(crypto.randomUUID()),
    previousCursorRef: null,
    cursorRef: opaqueEmailRef(crypto.randomUUID()),
    cursorContinuity: "CURRENT" as const,
    senderIdentityRef: f.emailRef,
    recipientRefs: [opaqueEmailRef("endvera")],
    occurredAt: "2026-09-02T04:00:00.000Z",
    subject: "Matériel Laval",
    normalizedBody: "Le matériel est prêt pour mardi.",
    projectId: f.projectId,
    contactId: f.contactId,
    selectedEvidenceIds: [],
    verificationState: "HUMAN_CONFIRMED" as const,
    externalTransportPerformed: false as const,
  };
}

async function createSyntheticEvidence(f: Awaited<ReturnType<typeof fixture>>) {
  const source = await prisma.constructionMessage.create({
    data: {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: crypto.randomUUID(),
      recipients: [],
      originalBody: "Photo synthétique.",
      normalizedBody: "Photo synthétique.",
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
      policyVersion: "r26-test",
    },
  });
  return prisma.constructionOpenLoopEvidence.create({
    data: {
      loopId: loop.id,
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      evidenceKey: crypto.randomUUID(),
      kind: "photo",
      state: "present_unverified",
      sourceRef: "file:synthetic-r26",
      contentHash: "b".repeat(64),
    },
  });
}

describe("R26 email inbox on disposable PostgreSQL", () => {
  it("admits one project email under concurrent replay and refuses drift", async () => {
    const f = await fixture("REPLAY");
    const event = inbound(f);
    const results = await Promise.all([
      processEmailInboundR26({ event, assertion }),
      processEmailInboundR26({ event, assertion }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]).toMatchObject({
      projectId: f.projectId,
      contactId: f.contactId,
      status: "RESOLVED",
      canonicalEffectId: null,
      externalTransportPerformed: false,
    });
    expect(await prisma.constructionEmailEvent.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionMessage.count({
      where: { workspaceId: f.workspaceId, channel: "email" },
    })).toBe(1);
    await expect(processEmailInboundR26({
      event: { ...event, normalizedBody: "Contenu modifié" },
      assertion,
    })).rejects.toThrow("EMAIL_EVENT_IDEMPOTENCY_CONFLICT");
  });

  it("fails closed on cursor drift and on a revoked account", async () => {
    const f = await fixture("CURSOR");
    const first = inbound(f);
    await processEmailInboundR26({ event: first, assertion });
    const stale = {
      ...inbound(f),
      previousCursorRef: opaqueEmailRef("wrong-previous-cursor"),
    };
    const result = await processEmailInboundR26({ event: stale, assertion });
    expect(result).toMatchObject({
      projectId: null,
      status: "REFUSED",
      cursorStatus: "SYNC_REQUIRED",
      canonicalEffectId: null,
      externalTransportPerformed: false,
    });
    const accountAfterDrift = await prisma.constructionEmailAccount.findUniqueOrThrow({
      where: { id: f.accountId },
    });
    expect(accountAfterDrift).toMatchObject({
      status: "SYNC_REQUIRED",
      cursorRef: first.cursorRef,
      cursorVersion: 1,
    });
    expect(await prisma.constructionMessage.count({
      where: { providerMessageId: stale.providerMessageRef, projectId: { not: null } },
    })).toBe(0);

    const prepared = await manageEmailAccountR26({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_EMAIL_ACCOUNT",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        provider: "GOOGLE_GMAIL",
        accountRef: f.accountRef,
        mailboxScopeRef: opaqueEmailRef({ workspace: f.workspaceId, scope: "project-reset" }),
        capabilities: ["READ_METADATA", "READ_SELECTED_CONTENT", "PREPARE_DRAFT"],
      },
    }) as { version: number };
    await manageEmailAccountR26({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "REVOKE_EMAIL_ACCOUNT",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        accountId: f.accountId,
        expectedVersion: prepared.version,
      },
    });
    await expect(processEmailInboundR26({ event: inbound(f), assertion }))
      .rejects.toThrow("EMAIL_ACCOUNT_NOT_ACTIVE");
  });

  it("clarifies an unbound project and refuses cross-workspace evidence", async () => {
    const unbound = await fixture("UNBOUND");
    await prisma.constructionContact.update({
      where: { id: unbound.contactId },
      data: { projectId: null },
    });
    const ambiguous = { ...inbound(unbound), projectId: null };
    const clarification = await processEmailInboundR26({ event: ambiguous, assertion });
    expect(clarification).toMatchObject({
      projectId: null,
      status: "CLARIFICATION_REQUIRED",
      canonicalEffectId: null,
    });
    expect(await prisma.constructionMessage.count({
      where: { providerMessageId: ambiguous.providerMessageRef, projectId: { not: null } },
    })).toBe(0);

    const target = await fixture("TARGET");
    const foreign = await fixture("FOREIGN");
    const evidence = await createSyntheticEvidence(foreign);
    const event = { ...inbound(target), selectedEvidenceIds: [evidence.id] };
    await expect(processEmailInboundR26({ event, assertion }))
      .rejects.toThrow("EMAIL_EVIDENCE_NOT_ADMITTED");
    expect(await prisma.constructionEmailEvent.count({ where: { eventId: event.eventId } })).toBe(0);
  });

  it("preserves exact state over restart and admits one exact unsent approval", async () => {
    const f = await fixture("DRAFT");
    const command = {
      schemaVersion: 1 as const,
      action: "PREPARE_EMAIL_DRAFT" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      accountId: f.accountId,
      projectId: f.projectId,
      contactId: f.contactId,
      toRef: f.emailRef,
      ccRefs: [],
      subject: "Preuve requise",
      body: "Marc, peux-tu envoyer la photo?",
      threadRef: null,
      selectedEvidenceIds: [],
      expectedPolicyVersion: EMAIL_POLICY_VERSION,
    };
    const draft = await prepareEmailDraftR26({ userId: f.ownerId, command });
    expect(draft).toMatchObject({
      status: "PREPARED_UNSENT",
      replayed: false,
      externalTransportPerformed: false,
    });
    const approvals = await Promise.allSettled([0, 1].map(() => approveEmailDraftR26({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "APPROVE_EMAIL_DRAFT",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        draftId: draft.draftId,
        expectedVersion: draft.version,
        expectedPayloadHash: draft.payloadHash,
      },
    })));
    expect(approvals.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(approvals.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const beforeRestart = await prisma.constructionEmailDraft.findUniqueOrThrow({
      where: { id: draft.draftId },
      select: { status: true, payloadHash: true, version: true, deliveryCount: true },
    });
    await prisma.$disconnect();
    await prisma.$connect();
    const afterRestart = await prisma.constructionEmailDraft.findUniqueOrThrow({
      where: { id: draft.draftId },
      select: { status: true, payloadHash: true, version: true, deliveryCount: true },
    });
    expect(afterRestart).toEqual(beforeRestart);
    expect(afterRestart).toMatchObject({ status: "APPROVED_UNSENT", deliveryCount: 0 });

    const field = await emailInboxCockpitForUserR26({
      userId: f.fieldId,
      workspaceId: f.workspaceId,
    });
    expect(field).toMatchObject({
      role: "field_worker",
      accounts: [],
      contacts: [],
      events: [],
      drafts: [],
      externalTransportEnabled: false,
    });
    expect(JSON.stringify(field)).not.toMatch(/Marc|Preuve requise|photo/u);
  });
});
