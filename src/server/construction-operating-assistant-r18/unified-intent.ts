import "server-only";

import { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  unifiedIntentBody,
  unifiedIntentEnvelopeSchema,
  unifiedIntentResultSchema,
  unifiedIntentVerificationState,
  type UnifiedIntentEnvelope,
  type UnifiedIntentResult,
} from "@/lib/construction-operating-assistant-r18/contracts";
import {
  resolveUnifiedIntent,
  unifiedIntentCanTransition,
} from "@/lib/construction-operating-assistant-r18/resolver";
import {
  operatingInterpretationSchema,
  type OperatingInterpretation,
  type OperatingInterpreterContext,
} from "@/lib/construction-operating-assistant-r2/contracts";
import {
  clientAssistantRoutingProjectionSchema,
  type ClientAssistantRoutingProjection,
} from "@/lib/construction-operating-assistant-r36c/contracts";
import { interpretOperatingAssistantCommand } from "@/lib/construction-operating-assistant-r2/interpreter";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import {
  createTrustedAssistantRoutingRequest,
  projectClientAssistantRouting,
  replyForNonInternalRouting,
} from "@/server/construction-operating-assistant-r36c/orchestrator";
import { prepareAssistantRoutingDecision } from "@/server/model-gateway/assistant-routing";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class UnifiedIntentConflict extends Error {
  constructor() {
    super("UNIFIED_INTENT_CONFLICT");
    this.name = "UnifiedIntentConflict";
  }
}

type LoadedContext = Readonly<{
  interpreter: OperatingInterpreterContext;
  projectId: string | null;
  contactId: string | null;
  projectLabel: string | null;
  contactLabel: string | null;
}>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function unifiedIntentRoutingChannel(sourceKind: UnifiedIntentEnvelope["source"]["kind"]) {
  if (sourceKind === "VOICE_TRANSCRIPT") return "VOICE_TRANSCRIPT" as const;
  if (sourceKind === "EMAIL_MESSAGE") return "EMAIL" as const;
  return "PORTAL" as const;
}

function routingInterpretation(input: {
  loaded: LoadedContext;
  clarification: boolean;
  reply: string;
  approvalRequired: boolean;
}): OperatingInterpretation {
  return operatingInterpretationSchema.parse({
    schemaVersion: 2,
    intent: input.clarification ? "CLARIFICATION_REQUIRED" : "UNSUPPORTED",
    confidence: 1,
    language: input.loaded.interpreter.locale === "en-CA" ? "en" : "fr",
    timezone: input.loaded.interpreter.timezone,
    projectId: input.loaded.projectId,
    contactId: input.loaded.contactId,
    calendarItemId: null,
    startsAtUtc: null,
    endsAtUtc: null,
    dueAtUtc: null,
    title: null,
    approvalRequired: input.approvalRequired,
    queryWindow: null,
    clarification: input.clarification
      ? {
          reason: "UNSUPPORTED_REQUEST",
          question: input.reply,
          candidateCount: 0,
        }
      : null,
    legacy: null,
  });
}

async function retainRoutingDecision(input: {
  userId: string;
  envelope: UnifiedIntentEnvelope;
  routing: ClientAssistantRoutingProjection;
  deferred: {
    intent: "CLARIFICATION_REQUIRED" | "UNSUPPORTED";
    status: "CLARIFICATION_REQUIRED" | "REFUSED";
    reply: string;
  } | null;
}) {
  const fingerprint = sha256Canonical({
    scope: "endvera-context-routing-r36e",
    workspaceId: input.envelope.workspaceId,
    sourceId: input.envelope.source.sourceId,
  });
  const event = await prisma.constructionAuditEvent.upsert({
    where: { fingerprint },
    create: {
      workspaceId: input.envelope.workspaceId,
      actorUserId: input.userId,
      entityType: "assistant_routing_decision",
      entityId: input.envelope.source.sourceId,
      action: "assistant_routing_decision_recorded",
      reasonCode: input.routing.disposition,
      metadata: asJson({
        schemaVersion: 1,
        envelopeId: input.envelope.envelopeId,
        sourceKind: input.envelope.source.kind,
        routing: input.routing,
        deferred: input.deferred,
      }),
      fingerprint,
    },
    update: {},
    select: { metadata: true },
  });
  return z.object({
    schemaVersion: z.literal(1),
    envelopeId: z.string().uuid(),
    sourceKind: z.enum(["PORTAL_TEXT", "VOICE_TRANSCRIPT", "FILE_OBSERVATION", "EMAIL_MESSAGE"]),
    routing: clientAssistantRoutingProjectionSchema,
    deferred: z.object({
      intent: z.enum(["CLARIFICATION_REQUIRED", "UNSUPPORTED"]),
      status: z.enum(["CLARIFICATION_REQUIRED", "REFUSED"]),
      reply: z.string().min(1),
    }).strict().nullable(),
  }).strict().parse(event.metadata);
}

async function loadContext(input: {
  userId: string;
  envelope: UnifiedIntentEnvelope;
}): Promise<LoadedContext> {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(
      tx,
      input.userId,
      input.envelope.workspaceId,
    );
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ConstructionAccessDenied();
    }
    const workspace = await tx.constructionWorkspace.findUniqueOrThrow({
      where: { id: input.envelope.workspaceId },
      select: { defaultTimezone: true, defaultLocale: true },
    });
    const [projects, contacts, calendarItems, selectedProject, selectedContact, evidence] =
      await Promise.all([
        tx.constructionProject.findMany({
          where: { workspaceId: input.envelope.workspaceId, status: "active" },
          orderBy: [{ code: "asc" }, { id: "asc" }],
          select: { id: true, code: true, name: true },
        }),
        tx.constructionContact.findMany({
          where: { workspaceId: input.envelope.workspaceId, status: "active" },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          select: { id: true, displayName: true, preferredLanguage: true },
        }),
        tx.constructionCalendarItem.findMany({
          where: { workspaceId: input.envelope.workspaceId, status: "scheduled" },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          take: 500,
          select: {
            id: true,
            projectId: true,
            contactId: true,
            title: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        }),
        input.envelope.context.projectId
          ? tx.constructionProject.findFirst({
              where: {
                id: input.envelope.context.projectId,
                workspaceId: input.envelope.workspaceId,
                status: "active",
              },
              select: { id: true, code: true, name: true },
            })
          : null,
        input.envelope.context.contactId
          ? tx.constructionContact.findFirst({
              where: {
                id: input.envelope.context.contactId,
                workspaceId: input.envelope.workspaceId,
                status: "active",
              },
              select: { id: true, displayName: true, projectId: true },
            })
          : null,
        input.envelope.source.kind === "FILE_OBSERVATION"
          ? tx.constructionOpenLoopEvidence.findFirst({
              where: {
                id: input.envelope.source.evidenceId,
                workspaceId: input.envelope.workspaceId,
              },
              select: { id: true, projectId: true },
            })
          : null,
      ]);

    if (input.envelope.context.projectId && !selectedProject) throw new ConstructionAccessDenied();
    if (input.envelope.context.contactId && !selectedContact) throw new ConstructionAccessDenied();
    if (input.envelope.source.kind === "FILE_OBSERVATION" && !evidence) {
      throw new ConstructionAccessDenied();
    }

    const projectId = selectedProject?.id ?? evidence?.projectId ?? null;
    if (selectedProject && evidence && selectedProject.id !== evidence.projectId) {
      throw new UnifiedIntentConflict();
    }
    if (selectedContact?.projectId && projectId && selectedContact.projectId !== projectId) {
      throw new UnifiedIntentConflict();
    }
    const project = projectId
      ? projects.find((candidate) => candidate.id === projectId) ?? null
      : null;

    return {
      interpreter: {
        referenceNow: input.envelope.occurredAt,
        locale: workspace.defaultLocale === "en-CA" ? "en-CA" : "fr-CA",
        timezone: workspace.defaultTimezone,
        projects,
        contacts,
        calendarItems: calendarItems.map((item) => ({
          ...item,
          startsAtUtc: item.startsAt.toISOString(),
          endsAtUtc: item.endsAt?.toISOString() ?? null,
        })),
      },
      projectId,
      contactId: selectedContact?.id ?? null,
      projectLabel: project ? `${project.code} ${project.name}` : null,
      contactLabel: selectedContact?.displayName ?? null,
    };
  });
}

async function claimEnvelope(input: {
  userId: string;
  envelope: UnifiedIntentEnvelope;
  bodySha256: string;
}): Promise<{ envelopeReplayed: boolean; sourceReplayed: boolean }> {
  const sourceHash = sha256Canonical({
    workspaceId: input.envelope.workspaceId,
    sourceKind: input.envelope.source.kind,
    sourceId: input.envelope.source.sourceId,
    occurredAt: input.envelope.occurredAt,
    bodySha256: input.bodySha256,
    evidenceId:
      input.envelope.source.kind === "FILE_OBSERVATION"
        ? input.envelope.source.evidenceId
        : null,
    context: input.envelope.context,
  });
  const envelopeHash = sha256Canonical(input.envelope);
  const claims = [
    {
      key: `envelope:${input.envelope.envelopeId}`,
      hash: envelopeHash,
      action: "unified_intent_envelope_claimed",
    },
    {
      key: `source:${input.envelope.source.sourceId}`,
      hash: sourceHash,
      action: "unified_intent_source_claimed",
    },
  ] as const;

  return prisma.$transaction(async (tx) => {
    for (const claim of claims) {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`r18:${claim.key}`}, 0))::text AS acquired
      `);
    }
    let envelopeReplayed = false;
    let sourceReplayed = false;
    for (const claim of claims) {
      const fingerprint = sha256Canonical({ scope: "endvera-unified-intent-r18", key: claim.key });
      const existing = await tx.constructionAuditEvent.findUnique({
        where: { fingerprint },
        select: { metadata: true },
      });
      if (existing) {
        const metadata = existing.metadata as { claimHash?: string; workspaceId?: string } | null;
        if (
          metadata?.claimHash !== claim.hash ||
          metadata.workspaceId !== input.envelope.workspaceId
        ) {
          throw new UnifiedIntentConflict();
        }
        if (claim.key.startsWith("envelope:")) envelopeReplayed = true;
        if (claim.key.startsWith("source:")) sourceReplayed = true;
        continue;
      }
      await tx.constructionAuditEvent.create({
        data: {
          workspaceId: input.envelope.workspaceId,
          actorUserId: input.userId,
          entityType: "unified_intent_source",
          entityId: claim.key,
          action: claim.action,
          reasonCode: input.envelope.source.kind,
          metadata: asJson({
            claimHash: claim.hash,
            workspaceId: input.envelope.workspaceId,
            envelopeId: input.envelope.envelopeId,
            sourceId: input.envelope.source.sourceId,
            sourceKind: input.envelope.source.kind,
            suppliedByUserId: input.userId,
            occurredAt: input.envelope.occurredAt,
            bodySha256: input.bodySha256,
            evidenceId:
              input.envelope.source.kind === "FILE_OBSERVATION"
                ? input.envelope.source.evidenceId
                : null,
          }),
          fingerprint,
        },
      });
    }
    return { envelopeReplayed, sourceReplayed };
  });
}

function bridgeBody(
  envelope: UnifiedIntentEnvelope,
  context: LoadedContext,
): string {
  const suffix: string[] = [];
  if (context.projectLabel) suffix.push(`Chantier sélectionné: ${context.projectLabel}.`);
  if (context.contactLabel) suffix.push(`Contact sélectionné: ${context.contactLabel}.`);
  return suffix.length
    ? `${unifiedIntentBody(envelope)}\n${suffix.join(" ")}`
    : unifiedIntentBody(envelope);
}

function sameCanonicalResolution(
  expected: OperatingInterpretation,
  actual: OperatingInterpretation,
): boolean {
  return sha256Canonical({
    intent: expected.intent,
    projectId: expected.projectId,
    contactId: expected.contactId,
    calendarItemId: expected.calendarItemId,
    startsAtUtc: expected.startsAtUtc,
    endsAtUtc: expected.endsAtUtc,
    dueAtUtc: expected.dueAtUtc,
    title: expected.title,
    clarification: expected.clarification,
  }) === sha256Canonical({
    intent: actual.intent,
    projectId: actual.projectId,
    contactId: actual.contactId,
    calendarItemId: actual.calendarItemId,
    startsAtUtc: actual.startsAtUtc,
    endsAtUtc: actual.endsAtUtc,
    dueAtUtc: actual.dueAtUtc,
    title: actual.title,
    clarification: actual.clarification,
  });
}

async function recordTransitionProvenance(input: {
  userId: string;
  envelope: UnifiedIntentEnvelope;
  canonicalEffectId: string | null;
  status: string;
}) {
  const fingerprint = sha256Canonical({
    scope: "endvera-unified-intent-r18-transition",
    workspaceId: input.envelope.workspaceId,
    sourceId: input.envelope.source.sourceId,
  });
  await prisma.constructionAuditEvent.upsert({
    where: { fingerprint },
    create: {
      workspaceId: input.envelope.workspaceId,
      actorUserId: input.userId,
      entityType: "unified_intent_transition",
      entityId: input.envelope.source.sourceId,
      action: "unified_intent_transition_recorded",
      reasonCode: input.status,
      metadata: asJson({
        envelopeId: input.envelope.envelopeId,
        sourceId: input.envelope.source.sourceId,
        sourceKind: input.envelope.source.kind,
        canonicalEffectId: input.canonicalEffectId,
        externalTransportPerformed: false,
      }),
      fingerprint,
    },
    update: {},
  });
}

export async function processUnifiedIntent(input: {
  userId: string;
  envelope: UnifiedIntentEnvelope | unknown;
}): Promise<UnifiedIntentResult> {
  const envelope = unifiedIntentEnvelopeSchema.parse(input.envelope);
  const loaded = await loadContext({ userId: input.userId, envelope });
  const bodySha256 = sha256Canonical(unifiedIntentBody(envelope));
  const claim = await claimEnvelope({
    userId: input.userId,
    envelope,
    bodySha256,
  });
  const routingDecision = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
    userId: input.userId,
    channel: unifiedIntentRoutingChannel(envelope.source.kind),
    request: {
      schemaVersion: 1,
      requestId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      message: unifiedIntentBody(envelope),
      occurredAt: envelope.occurredAt,
    },
  }));
  const routingSeed = projectClientAssistantRouting(routingDecision);
  const retainedRouting = await retainRoutingDecision({
    userId: input.userId,
    envelope,
    routing: routingSeed,
    deferred: routingDecision.disposition === "INTERNAL_TOOL"
      ? null
      : replyForNonInternalRouting(routingDecision),
  });
  const routing = retainedRouting.routing;
  const provenance = {
    sourceKind: envelope.source.kind,
    sourceId: envelope.source.sourceId,
    suppliedByUserId: input.userId,
    occurredAt: envelope.occurredAt,
    bodySha256,
    evidenceId: envelope.source.kind === "FILE_OBSERVATION" ? envelope.source.evidenceId : null,
    verificationState: unifiedIntentVerificationState(envelope),
  } as const;
  const baseTransition = {
    requested: envelope.mode === "APPLY_VALIDATED",
    validated: unifiedIntentCanTransition(envelope),
    performed: false,
    canonicalCommandId: null,
    canonicalEffectId: null,
    replayed: claim.envelopeReplayed,
  } as const;

  if (routing.disposition !== "INTERNAL_TOOL") {
    if (!retainedRouting.deferred) throw new Error("ASSISTANT_ROUTING_AUDIT_RESULT_MISSING");
    const deferred = retainedRouting.deferred;
    const clarification = routing.disposition === "CLARIFICATION_REQUIRED";
    const refusalReason = routing.disposition === "CANDIDATE_PREPARED"
      ? "PROVIDER_REQUIRED_NOT_AUTHORIZED"
      : routing.disposition === "HUMAN_HANDOFF"
        ? "HUMAN_SUPPORT_REQUIRED"
        : clarification
          ? "ROUTING_CLARIFICATION_REQUIRED"
          : "ROUTING_POLICY_REFUSED";
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation: routingInterpretation({
        loaded,
        clarification,
        reply: deferred.reply,
        approvalRequired: routing.approvalRequired,
      }),
      status: clarification ? "CLARIFICATION_REQUIRED" : "REFUSED",
      reply: deferred.reply,
      refusalReason,
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }
  const interpretation = resolveUnifiedIntent(envelope, loaded.interpreter, {
    projectId: loaded.projectId,
    contactId: loaded.contactId,
  });
  const exactTransitionReplay =
    claim.envelopeReplayed &&
    envelope.mode === "APPLY_VALIDATED" &&
    unifiedIntentCanTransition(envelope);

  if (!exactTransitionReplay && interpretation.intent === "CLARIFICATION_REQUIRED") {
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation,
      status: "CLARIFICATION_REQUIRED",
      reply: interpretation.clarification?.question ?? "Une clarification est requise.",
      refusalReason: null,
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }

  if (!exactTransitionReplay && interpretation.intent === "UNSUPPORTED") {
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation,
      status: "REFUSED",
      reply: "Cette demande n’est pas encore prise en charge.",
      refusalReason: "UNSUPPORTED_INTENT",
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }

  if (envelope.mode === "RESOLVE_ONLY") {
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation,
      status: "RESOLVED",
      reply: null,
      refusalReason: null,
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }

  if (!unifiedIntentCanTransition(envelope)) {
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation,
      status: "REFUSED",
      reply: "Confirmez d’abord cette transcription ou observation avant de modifier l’état du chantier.",
      refusalReason: "UNVERIFIED_SOURCE",
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }

  const canonicalBody = bridgeBody(envelope, loaded);
  const canonicalInterpretation = interpretOperatingAssistantCommand(canonicalBody, loaded.interpreter);
  if (!claim.envelopeReplayed && !sameCanonicalResolution(interpretation, canonicalInterpretation)) {
    return unifiedIntentResultSchema.parse({
      schemaVersion: 1,
      envelopeId: envelope.envelopeId,
      workspaceId: envelope.workspaceId,
      interpretation,
      status: "REFUSED",
      reply: "Le contexte sélectionné ne peut pas être appliqué sans nouvelle clarification.",
      refusalReason: "CONTEXT_TRANSITION_MISMATCH",
      transition: baseTransition,
      provenance,
      routing,
      externalTransportPerformed: false,
    });
  }

  const canonical = await processOperatingAssistantCommand({
    userId: input.userId,
    envelope: {
      schemaVersion: 1,
      commandId: envelope.source.sourceId,
      workspaceId: envelope.workspaceId,
      channel: "PORTAL",
      body: canonicalBody,
      occurredAt: envelope.occurredAt,
      senderAddress: `user:${input.userId}`,
    },
  });
  await recordTransitionProvenance({
    userId: input.userId,
    envelope,
    canonicalEffectId: canonical.canonicalEffectId,
    status: canonical.status,
  });
  const persistedInterpretation = claim.envelopeReplayed
    ? await prisma.constructionInterpretation.findUnique({
        where: { messageId: canonical.messageId },
        select: { structuredResult: true },
      })
    : null;
  const replayInterpretation = operatingInterpretationSchema.safeParse(
    persistedInterpretation?.structuredResult,
  );

  return unifiedIntentResultSchema.parse({
    schemaVersion: 1,
    envelopeId: envelope.envelopeId,
    workspaceId: envelope.workspaceId,
    interpretation: replayInterpretation.success ? replayInterpretation.data : interpretation,
    status: canonical.status,
    reply: canonical.reply,
    refusalReason: null,
    transition: {
      requested: true,
      validated: true,
      performed: canonical.status !== "REFUSED" && canonical.status !== "CLARIFICATION_REQUIRED",
      canonicalCommandId: canonical.commandId,
      canonicalEffectId: canonical.canonicalEffectId,
      replayed: canonical.replayed,
    },
    provenance,
    routing,
    externalTransportPerformed: false,
  });
}
