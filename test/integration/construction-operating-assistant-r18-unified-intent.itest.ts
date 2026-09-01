import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  processUnifiedIntent,
  UnifiedIntentConflict,
} from "@/server/construction-operating-assistant-r18/unified-intent";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function createWorkspace(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R18 ${label}`,
      email: `r18-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R18 ${label} Construction`,
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `LAVAL-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Fournisseur synthétique",
    normalizedPhone: "+15555550184",
  });
  return { userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id };
}

function portalEnvelope(input: {
  workspaceId: string;
  sourceId: string;
  envelopeId?: string;
  body?: string;
}) {
  return {
    schemaVersion: 1 as const,
    envelopeId: input.envelopeId ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    occurredAt: "2026-08-31T13:00:00.000Z",
    mode: "APPLY_VALIDATED" as const,
    context: { projectId: null, contactId: null },
    source: {
      kind: "PORTAL_TEXT" as const,
      sourceId: input.sourceId,
      text: input.body ?? "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval MAIN.",
    },
  };
}

describe("R18 unified intent on disposable PostgreSQL", () => {
  it("applies one canonical effect, reconstructs exact replay and refuses changed or cross-workspace reuse", async () => {
    const main = await createWorkspace("MAIN");
    const other = await createWorkspace("OTHER");
    const sourceId = crypto.randomUUID();
    const firstEnvelope = portalEnvelope({ workspaceId: main.workspaceId, sourceId });

    const first = await processUnifiedIntent({ userId: main.userId, envelope: firstEnvelope });
    expect(first).toMatchObject({
      status: "APPLIED",
      externalTransportPerformed: false,
      transition: { performed: true, replayed: false, canonicalCommandId: sourceId },
      provenance: {
        sourceKind: "PORTAL_TEXT",
        sourceId,
        suppliedByUserId: main.userId,
      },
    });
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: main.workspaceId, status: "scheduled" },
    })).toBe(1);

    const replay = await processUnifiedIntent({ userId: main.userId, envelope: firstEnvelope });
    expect(replay.transition.replayed).toBe(true);
    expect(replay.transition.canonicalEffectId).toBe(first.transition.canonicalEffectId);
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: main.workspaceId, status: "scheduled" },
    })).toBe(1);

    await expect(processUnifiedIntent({
      userId: main.userId,
      envelope: portalEnvelope({
        workspaceId: main.workspaceId,
        sourceId,
        body: "Rendez-vous avec Marc mardi à 16 h pour Rénovation Laval MAIN.",
      }),
    })).rejects.toBeInstanceOf(UnifiedIntentConflict);

    await expect(processUnifiedIntent({
      userId: other.userId,
      envelope: portalEnvelope({
        workspaceId: other.workspaceId,
        sourceId,
        body: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval OTHER.",
      }),
    })).rejects.toBeInstanceOf(UnifiedIntentConflict);
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: other.workspaceId },
    })).toBe(0);
  });

  it("keeps ambiguity and unverified transcripts out of consequential state", async () => {
    const fixture = await createWorkspace("GUARDS");
    const ambiguous = await processUnifiedIntent({
      userId: fixture.userId,
      envelope: {
        schemaVersion: 1,
        envelopeId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        occurredAt: "2026-08-31T13:00:00.000Z",
        mode: "APPLY_VALIDATED",
        context: { projectId: null, contactId: null },
        source: {
          kind: "VOICE_TRANSCRIPT",
          sourceId: crypto.randomUUID(),
          transcript: "Rendez-vous avec Marc mardi à 2 pour Rénovation Laval GUARDS.",
          verificationState: "HUMAN_CONFIRMED",
        },
      },
    });
    expect(ambiguous.status).toBe("CLARIFICATION_REQUIRED");
    expect(ambiguous.transition.performed).toBe(false);

    const unverified = await processUnifiedIntent({
      userId: fixture.userId,
      envelope: {
        schemaVersion: 1,
        envelopeId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        occurredAt: "2026-08-31T13:00:00.000Z",
        mode: "APPLY_VALIDATED",
        context: { projectId: null, contactId: null },
        source: {
          kind: "VOICE_TRANSCRIPT",
          sourceId: crypto.randomUUID(),
          transcript: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval GUARDS.",
          verificationState: "UNVERIFIED",
        },
      },
    });
    expect(unverified).toMatchObject({
      status: "REFUSED",
      refusalReason: "UNVERIFIED_SOURCE",
      externalTransportPerformed: false,
      transition: { performed: false, validated: false },
    });
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: fixture.workspaceId },
    })).toBe(0);
    expect(await prisma.constructionAction.count({
      where: { workspaceId: fixture.workspaceId },
    })).toBe(0);
    expect(await prisma.constructionOpenLoop.count({
      where: { workspaceId: fixture.workspaceId },
    })).toBe(0);
  });

  it("reconstructs an exact reschedule replay after the calendar state changed", async () => {
    const fixture = await createWorkspace("RESCHEDULE");
    await processUnifiedIntent({
      userId: fixture.userId,
      envelope: portalEnvelope({
        workspaceId: fixture.workspaceId,
        sourceId: crypto.randomUUID(),
        body: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval RESCHEDULE.",
      }),
    });
    const rescheduleEnvelope = portalEnvelope({
      workspaceId: fixture.workspaceId,
      sourceId: crypto.randomUUID(),
      body: "Déplace le rendez-vous avec Marc mardi de 14 h à 16 h pour Rénovation Laval RESCHEDULE.",
    });
    const first = await processUnifiedIntent({
      userId: fixture.userId,
      envelope: rescheduleEnvelope,
    });
    expect(first.interpretation.intent).toBe("CALENDAR_ITEM_RESCHEDULE");
    expect(first.transition).toMatchObject({ performed: true, replayed: false });

    const replay = await processUnifiedIntent({
      userId: fixture.userId,
      envelope: rescheduleEnvelope,
    });
    expect(replay.interpretation.intent).toBe("CALENDAR_ITEM_RESCHEDULE");
    expect(replay.transition).toMatchObject({
      performed: true,
      replayed: true,
      canonicalEffectId: first.transition.canonicalEffectId,
    });
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: fixture.workspaceId, status: "scheduled" },
    })).toBe(1);
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: fixture.workspaceId, status: "rescheduled" },
    })).toBe(1);
  });

  it("serializes concurrent copies into one canonical effect", async () => {
    const fixture = await createWorkspace("CONCURRENT");
    const duplicate = portalEnvelope({
      workspaceId: fixture.workspaceId,
      sourceId: crypto.randomUUID(),
      body: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval CONCURRENT.",
    });
    const results = await Promise.all([
      processUnifiedIntent({ userId: fixture.userId, envelope: duplicate }),
      processUnifiedIntent({ userId: fixture.userId, envelope: duplicate }),
    ]);
    expect(results.map((result) => result.transition.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => result.transition.canonicalEffectId)).size).toBe(1);
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: fixture.workspaceId, status: "scheduled" },
    })).toBe(1);
  });
});
