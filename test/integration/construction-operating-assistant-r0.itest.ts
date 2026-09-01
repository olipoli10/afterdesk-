import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addInvoiceReadinessEvidence,
  openLoopFocusForUser,
  openLoopProjectionForUser,
  prepareInvoiceEvidenceRequest,
  recordOpenLoopContradiction,
  recordWorkFinished,
  resolveOpenLoopContradiction,
  revokeOpenLoopEvidence,
} from "@/server/construction-operating-assistant-r0/open-loops";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";

type TruthLedger = {
  workspace: { name: string; timezone: string; locale: string };
  project: { code: string; name: string; address: string };
  report: {
    billingBasis: "CHANGE_ORDER";
    workDescription: string;
    amountMinor: number;
    currency: "CAD";
    completion: true;
    approvalState: "APPROVED";
  };
  evidence: Array<{
    kind: "WRITTEN_APPROVAL" | "PHOTO";
    sourceRef: string;
    contentHash: string;
  }>;
  expected: { initialStatus: string; finalStatus: string };
};

const ledger = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "specs",
      "080-construction-operating-assistant-open-loop-r0",
      "fixtures",
      "laval-invoice-readiness-ledger.json",
    ),
    "utf8",
  ),
) as TruthLedger;

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `Owner ${label}`,
      email: `owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `Field ${label}`,
      email: `field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `Outsider ${label}`,
      email: `outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `${ledger.workspace.name} ${label}`,
    timezone: ledger.workspace.timezone,
    locale: ledger.workspace.locale,
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
    code: `${ledger.project.code}-${label}`,
    name: `${ledger.project.name} ${label}`,
    address: ledger.project.address,
  });
  const message = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `source-${label}`,
      sender: `user:${owner.id}`,
      recipients: ["ENDVERA_LOCAL"],
      originalBody: "Travail terminé pour l'extra de cuisine.",
      normalizedBody: "Travail terminé pour l'extra de cuisine.",
      status: "received",
      receivedAt: new Date("2026-09-01T13:00:00.000Z"),
    },
  });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    messageId: message.id,
  };
}

function command(f: Awaited<ReturnType<typeof fixture>>, commandId: string) {
  return {
    schemaVersion: 1 as const,
    commandId,
    workspaceId: f.workspaceId,
    projectId: f.projectId,
    actorId: f.ownerId,
    sourceMessageId: f.messageId,
    commandType: "REPORT_WORK_FINISHED" as const,
    claims: ledger.report,
  };
}

describe("Construction Operating Assistant R0 on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("commits one incomplete loop, facts, transition, snapshot and audit atomically", async () => {
    const f = await fixture("atomic");
    const result = await recordWorkFinished(command(f, "report-atomic-001"));

    expect(result.replayed).toBe(false);
    expect(result.decision.status).toBe(ledger.expected.initialStatus);
    expect(result.decision.missing).toEqual(["SUPPORTING_EVIDENCE", "WRITTEN_APPROVAL"]);
    const [loops, facts, transitions, snapshots, audit] = await Promise.all([
      prisma.constructionOpenLoop.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionOpenLoopFact.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionOpenLoopTransition.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionOpenLoopSnapshot.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionAuditEvent.count({
        where: { workspaceId: f.workspaceId, action: "construction_invoice_readiness_loop_opened" },
      }),
    ]);
    expect({ loops, facts, transitions, snapshots, audit }).toEqual({
      loops: 1,
      facts: 5,
      transitions: 1,
      snapshots: 1,
      audit: 1,
    });
  });

  it("bridges one natural-language message to inbox, interpretation and open loop atomically", async () => {
    const f = await fixture("intake");
    const input = {
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      channel: "portal" as const,
      body: "Travail terminé pour Rénovation Laval intake, 1 200 $. Le client dit que c'est approuvé.",
      idempotencyKey: "intake-work-finished-001",
      referenceNow: new Date("2026-09-01T13:00:00.000Z"),
    };
    const result = await processConstructionMessage(input);

    expect(result).toMatchObject({
      intent: "REPORT_WORK_FINISHED",
      status: "interpreted",
      replayed: false,
    });
    expect(result.openLoopId).toBeTruthy();
    expect(result.reply).toContain("WRITTEN_APPROVAL");
    const message = await prisma.constructionMessage.findUniqueOrThrow({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: f.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        projectId: true,
        interpretation: { select: { intent: true } },
        openedOpenLoops: { select: { id: true } },
      },
    });
    expect(message).toMatchObject({
      projectId: f.projectId,
      interpretation: { intent: "report_work_finished" },
    });
    expect(message.openedOpenLoops).toEqual([{ id: result.openLoopId }]);

    const replay = await processConstructionMessage(input);
    expect(replay).toMatchObject({ replayed: true, openLoopId: result.openLoopId });
    expect(await prisma.constructionOpenLoop.count({ where: { openedByMessageId: result.messageId } })).toBe(1);

    const duplicateEnvelope = await processConstructionMessage({
      ...input,
      idempotencyKey: "intake-work-finished-duplicate-envelope-001",
    });
    expect(duplicateEnvelope).toMatchObject({ openLoopId: result.openLoopId });
    expect(await prisma.constructionOpenLoop.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    const duplicateMessage = await prisma.constructionMessage.findUniqueOrThrow({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: f.workspaceId,
          idempotencyKey: "intake-work-finished-duplicate-envelope-001",
        },
      },
      select: { relatedOpenLoopId: true },
    });
    expect(duplicateMessage.relatedOpenLoopId).toBe(result.openLoopId);
  });

  it("converges concurrent duplicate reports and refuses a changed replay", async () => {
    const f = await fixture("race");
    const input = command(f, "report-race-001");
    const results = await Promise.all([recordWorkFinished(input), recordWorkFinished(input)]);

    expect(results.filter((item) => item.replayed)).toHaveLength(1);
    expect(results[0].loopId).toBe(results[1].loopId);
    expect(await prisma.constructionOpenLoop.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    await expect(
      recordWorkFinished({
        ...input,
        claims: { ...input.claims, amountMinor: input.claims.amountMinor + 1 },
      }),
    ).rejects.toThrow("OPEN_LOOP_IDEMPOTENCY_CONFLICT");
  });

  it("converges concurrent equivalent envelopes and links both sources to one loop", async () => {
    const f = await fixture("semantic-race");
    const secondMessage = await prisma.constructionMessage.create({
      data: {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        direction: "inbound",
        channel: "sms",
        provider: "ENDVERA_LOCAL_SIMULATOR",
        providerMessageId: "semantic-race-provider-002",
        idempotencyKey: "semantic-race-source-002",
        sender: `user:${f.ownerId}`,
        recipients: ["ENDVERA_LOCAL"],
        originalBody: "Travail terminé pour l'extra de cuisine.",
        normalizedBody: "Travail terminé pour l'extra de cuisine.",
        status: "received",
        receivedAt: new Date("2026-09-01T13:00:01.000Z"),
      },
    });
    const first = command(f, "semantic-race-command-001");
    const second = {
      ...first,
      commandId: "semantic-race-command-002",
      sourceMessageId: secondMessage.id,
    };
    const results = await Promise.all([recordWorkFinished(first), recordWorkFinished(second)]);

    expect(results[0].loopId).toBe(results[1].loopId);
    expect(results.filter((item) => item.replayed)).toHaveLength(1);
    expect(await prisma.constructionOpenLoop.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    const sources = await prisma.constructionMessage.findMany({
      where: { id: { in: [f.messageId, secondMessage.id] } },
      orderBy: { id: "asc" },
      select: { relatedOpenLoopId: true },
    });
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.relatedOpenLoopId === results[0].loopId)).toBe(true);
  });

  it("reaches invoice-ready once, restores the same projection and refuses evidence replay", async () => {
    const f = await fixture("ready");
    const opened = await recordWorkFinished(command(f, "report-ready-001"));
    const approvalInput = {
      schemaVersion: 1 as const,
      eventId: "evidence-approval-ready-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      expectedStateVersion: 1,
      kind: ledger.evidence[0].kind,
      state: "VERIFIED" as const,
      sourceRef: ledger.evidence[0].sourceRef,
      contentHash: ledger.evidence[0].contentHash,
    };
    const approved = await addInvoiceReadinessEvidence(approvalInput);
    expect(approved.decision.status).toBe("WAITING_FOR_EVIDENCE");
    const completed = await addInvoiceReadinessEvidence({
      ...approvalInput,
      eventId: "evidence-photo-ready-001",
      expectedStateVersion: 2,
      kind: ledger.evidence[1].kind,
      sourceRef: ledger.evidence[1].sourceRef,
      contentHash: ledger.evidence[1].contentHash,
    });
    expect(completed.decision.status).toBe(ledger.expected.finalStatus);
    expect(completed.decision.ready).toBe(true);
    expect(completed.decision.nextAction).toBe("PREPARE_INVOICE");

    const replay = await addInvoiceReadinessEvidence(approvalInput);
    expect(replay.replayed).toBe(true);
    expect(await prisma.constructionOpenLoopEvidence.count({ where: { loopId: opened.loopId } })).toBe(2);
    expect(await prisma.constructionOpenLoopTransition.count({ where: { loopId: opened.loopId } })).toBe(3);
    expect(await prisma.constructionOpenLoopSnapshot.count({ where: { loopId: opened.loopId } })).toBe(3);

    const beforeRestart = await openLoopProjectionForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
    });
    const afterFreshQuery = await openLoopProjectionForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
    });
    expect(afterFreshQuery).toEqual(beforeRestart);
    expect(afterFreshQuery).toMatchObject({
      ready: true,
      amountMinor: ledger.report.amountMinor,
      currency: "CAD",
    });
    const focus = await openLoopFocusForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      referenceNow: new Date("2026-09-01T13:00:00.000Z"),
    });
    expect(focus.today).toHaveLength(1);
    expect(focus.today[0]).toMatchObject({
      loopId: opened.loopId,
      status: "READY_TO_INVOICE",
      dueAt: null,
      dueState: "actionable_now",
      amountMinor: ledger.report.amountMinor,
    });
    expect(focus.tomorrow).toEqual([]);
  });

  it("enforces workspace and role boundaries without financial leakage", async () => {
    const f = await fixture("access");
    const opened = await recordWorkFinished(command(f, "report-access-001"));

    await expect(
      openLoopProjectionForUser({
        userId: f.outsiderId,
        workspaceId: f.workspaceId,
        loopId: opened.loopId,
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const fieldProjection = await openLoopProjectionForUser({
      userId: f.fieldId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
    });
    expect(fieldProjection).not.toHaveProperty("amountMinor");
    expect(fieldProjection.nextAction).toBe("OBTAIN_WRITTEN_APPROVAL");
    await expect(
      addInvoiceReadinessEvidence({
        schemaVersion: 1,
        eventId: "field-cannot-verify-001",
        userId: f.fieldId,
        workspaceId: f.workspaceId,
        loopId: opened.loopId,
        expectedStateVersion: 1,
        kind: "PHOTO",
        state: "VERIFIED",
        sourceRef: "synthetic://access/photo",
        contentHash: null,
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(await prisma.constructionOpenLoopEvidence.count({ where: { loopId: opened.loopId } })).toBe(0);
  });

  it("preserves a contradiction until an authorized verifier resolves it", async () => {
    const f = await fixture("contradiction");
    const opened = await recordWorkFinished(command(f, "report-contradiction-001"));
    const contradictory = await recordOpenLoopContradiction({
      schemaVersion: 1,
      eventId: "contradiction-amount-001",
      userId: f.fieldId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      expectedStateVersion: 1,
      field: "AMOUNT",
      claimIds: ["source-claim-120000", "source-claim-145000"],
    });

    expect(contradictory.decision.status).toBe("WAITING_FOR_EVIDENCE");
    expect(contradictory.decision.contradictions).toHaveLength(1);
    const stored = await prisma.constructionOpenLoopContradiction.findFirstOrThrow({
      where: { loopId: opened.loopId },
    });
    expect(stored.claimIds).toEqual(["source-claim-120000", "source-claim-145000"]);
    await expect(
      resolveOpenLoopContradiction({
        schemaVersion: 1,
        eventId: "resolve-amount-member-001",
        userId: f.fieldId,
        workspaceId: f.workspaceId,
        loopId: opened.loopId,
        contradictionId: stored.id,
        expectedStateVersion: 2,
        acceptedClaimId: "source-claim-120000",
        reason: "Fixture member must not verify financial truth",
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    const resolved = await resolveOpenLoopContradiction({
      schemaVersion: 1,
      eventId: "resolve-amount-owner-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      contradictionId: stored.id,
      expectedStateVersion: 2,
      acceptedClaimId: "source-claim-120000",
      reason: "Synthetic written source selected by owner",
    });
    expect(resolved.decision.contradictions).toEqual([]);
    const after = await prisma.constructionOpenLoopContradiction.findUniqueOrThrow({
      where: { id: stored.id },
    });
    expect(after.status).toBe("resolved");
    expect(after.claimIds).toEqual(["source-claim-120000", "source-claim-145000"]);
  });

  it("revokes accepted evidence, removes readiness and refuses stale or repeated effects", async () => {
    const f = await fixture("revocation");
    const opened = await recordWorkFinished(command(f, "report-revocation-001"));
    const approval = await addInvoiceReadinessEvidence({
      schemaVersion: 1,
      eventId: "revocation-approval-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      expectedStateVersion: 1,
      kind: "WRITTEN_APPROVAL",
      state: "VERIFIED",
      sourceRef: "synthetic://revocation/approval",
      contentHash: ledger.evidence[0].contentHash,
    });
    const completed = await addInvoiceReadinessEvidence({
      schemaVersion: 1,
      eventId: "revocation-photo-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      expectedStateVersion: approval.decision.stateVersion,
      kind: "PHOTO",
      state: "VERIFIED",
      sourceRef: "synthetic://revocation/photo",
      contentHash: ledger.evidence[1].contentHash,
    });
    expect(completed.decision.ready).toBe(true);
    const photo = await prisma.constructionOpenLoopEvidence.findFirstOrThrow({
      where: { loopId: opened.loopId, evidenceKey: "revocation-photo-001" },
    });

    const revoked = await revokeOpenLoopEvidence({
      schemaVersion: 1,
      eventId: "revoke-photo-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      evidenceId: photo.id,
      expectedStateVersion: completed.decision.stateVersion,
      reason: "Synthetic photo was linked to the wrong work item",
    });
    expect(revoked.decision.ready).toBe(false);
    expect(revoked.decision.status).toBe("WAITING_FOR_EVIDENCE");
    expect(revoked.decision.missing).toContain("SUPPORTING_EVIDENCE");
    const replay = await revokeOpenLoopEvidence({
      schemaVersion: 1,
      eventId: "revoke-photo-001",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      evidenceId: photo.id,
      expectedStateVersion: completed.decision.stateVersion,
      reason: "Synthetic photo was linked to the wrong work item",
    });
    expect(replay.replayed).toBe(true);
    await expect(
      revokeOpenLoopEvidence({
        schemaVersion: 1,
        eventId: "revoke-photo-stale-001",
        userId: f.ownerId,
        workspaceId: f.workspaceId,
        loopId: opened.loopId,
        evidenceId: photo.id,
        expectedStateVersion: completed.decision.stateVersion,
        reason: "Stale second revocation",
      }),
    ).rejects.toThrow("OPEN_LOOP_STALE_STATE_VERSION");
    expect(await prisma.constructionOpenLoopTransition.count({ where: { loopId: opened.loopId } })).toBe(4);
  });

  it("prepares one exact evidence request with zero delivery and refuses payload drift", async () => {
    const f = await fixture("prepared");
    const contact = await prisma.constructionContact.create({
      data: {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        displayName: "Marc Synthetic",
        role: "Client",
        normalizedPhone: "+15555550184",
        status: "active",
      },
    });
    const opened = await recordWorkFinished(command(f, "report-prepared-001"));
    const request = {
      schemaVersion: 1 as const,
      requestId: "00000000-0000-4000-8000-000000000801",
      userId: f.ownerId,
      workspaceId: f.workspaceId,
      loopId: opened.loopId,
      expectedStateVersion: 1,
      contactId: contact.id,
      channel: "SMS" as const,
      body: "Bonjour Marc, il manque la photo synthétique liée à l'extra Laval.",
    };
    const prepared = await prepareInvoiceEvidenceRequest(request);
    expect(prepared).toMatchObject({ disposition: "PREPARED_UNSENT", replayed: false });
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: prepared.actionId } });
    expect(action).toMatchObject({
      type: "follow_up",
      status: "proposed",
      simulatedDeliveryCount: 0,
      openLoopId: opened.loopId,
      contactId: contact.id,
    });
    expect(action.payload).toMatchObject({
      disposition: "PREPARED_UNSENT",
      transportAuthorized: false,
      normalizedRecipient: "+15555550184",
      body: request.body,
    });
    const replay = await prepareInvoiceEvidenceRequest(request);
    expect(replay).toMatchObject({ actionId: prepared.actionId, replayed: true });
    await expect(
      prepareInvoiceEvidenceRequest({ ...request, body: `${request.body} changé` }),
    ).rejects.toThrow("OPEN_LOOP_PREPARED_ACTION_CONFLICT");
    expect(await prisma.constructionAction.count({ where: { openLoopId: opened.loopId } })).toBe(1);
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId, direction: "outbound" } })).toBe(0);
  });
});
