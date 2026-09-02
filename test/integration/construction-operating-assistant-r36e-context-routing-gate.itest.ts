import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processUnifiedIntent } from "@/server/construction-operating-assistant-r18/unified-intent";

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: "R36E owner",
      email: `r36e-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R36E context" });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: "LAVAL-R36E",
    name: "Rénovation Laval R36E",
  });
  const source = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: crypto.randomUUID(),
      recipients: [],
      originalBody: "Photo synthétique R36E.",
      normalizedBody: "Photo synthétique R36E.",
    },
  });
  const loop = await prisma.constructionOpenLoop.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      openedByMessageId: source.id,
      desiredOutcome: "Contexte R36E",
      idempotencyKey: crypto.randomUUID(),
      semanticKey: crypto.randomUUID(),
      nextResponsibleRole: "OWNER",
      nextAction: "Vérifier",
      decisionHash: "a".repeat(64),
      policyVersion: "r36e-test",
    },
  });
  const evidence = await prisma.constructionOpenLoopEvidence.create({
    data: {
      loopId: loop.id,
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      evidenceKey: crypto.randomUUID(),
      kind: "photo",
      state: "present_unverified",
      sourceRef: "file:synthetic-r36e",
      contentHash: "b".repeat(64),
    },
  });
  return { userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id, evidenceId: evidence.id };
}

function envelope(input: {
  workspaceId: string;
  source: Record<string, unknown>;
  envelopeId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    envelopeId: input.envelopeId ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    occurredAt: "2026-09-02T16:00:00.000Z",
    mode: "APPLY_VALIDATED" as const,
    context: { projectId: null, contactId: null },
    source: input.source,
  };
}

describe("R36E context routing on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it.each(["PORTAL_TEXT", "VOICE_TRANSCRIPT", "EMAIL_MESSAGE", "FILE_OBSERVATION"] as const)(
    "retains one no-dispatch research decision for %s",
    async (kind) => {
      const f = await fixture();
      const sourceId = crypto.randomUUID();
      const body = "Recherche la réputation publique de l’entreprise ABC avec des sources.";
      const source = kind === "PORTAL_TEXT"
        ? { kind, sourceId, text: body }
        : kind === "VOICE_TRANSCRIPT"
          ? { kind, sourceId, transcript: body, verificationState: "HUMAN_CONFIRMED" }
          : kind === "EMAIL_MESSAGE"
            ? { kind, sourceId, text: body, verificationState: "HUMAN_CONFIRMED" }
            : { kind, sourceId, evidenceId: f.evidenceId, observation: body, verificationState: "HUMAN_CONFIRMED" };
      const request = envelope({ workspaceId: f.workspaceId, source });
      const first = await processUnifiedIntent({ userId: f.userId, envelope: request });
      const replay = await processUnifiedIntent({ userId: f.userId, envelope: request });
      expect(first).toMatchObject({
        status: "REFUSED",
        refusalReason: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
        transition: { performed: false, replayed: false },
        routing: {
          disposition: "CANDIDATE_PREPARED",
          readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
          externalDispatchPerformed: false,
        },
        externalTransportPerformed: false,
      });
      expect(first.reply).toContain("Aucune recherche n’a été exécutée");
      expect(replay).toMatchObject({ transition: { replayed: true }, routing: first.routing });
      expect(await prisma.constructionAuditEvent.count({
        where: {
          workspaceId: f.workspaceId,
          entityType: "assistant_routing_decision",
          entityId: sourceId,
        },
      })).toBe(1);
      expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
      expect(await prisma.constructionAction.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
      expect(await prisma.constructionConnectorOperation.count({
        where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
      })).toBe(0);
    },
  );
});
