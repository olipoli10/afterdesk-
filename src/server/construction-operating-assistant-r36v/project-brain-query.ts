import "server-only";

import { Prisma, type ConstructionChannel } from "@prisma-client";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  canonicalProjectBrainSnapshotSchema,
  projectBrainLimitationSchema,
  type CanonicalProjectBrainSnapshot,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import type { ConstructionMobileAssistantRequest } from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  clientAssistantRoutingProjectionSchema,
  trustedAdmittedAssistantSourceSchema,
  unifiedAssistantResultSchema,
  type ClientAssistantRoutingProjection,
  type TrustedAdmittedAssistantSource,
  type UnifiedAssistantResult,
} from "@/lib/construction-operating-assistant-r36c/contracts";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export const PROJECT_BRAIN_QUERY_KINDS = [
  "SUMMARY",
  "BLOCKERS",
  "NEXT_DECISION",
  "SOURCE_INVENTORY",
  "BINARY_INTERPRETATION",
] as const;

export type ProjectBrainQueryKind = (typeof PROJECT_BRAIN_QUERY_KINDS)[number];

export type ProjectBrainSnapshotCandidate = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  intakeSequence: number;
  stateVersion: number;
  status: "PROPOSED" | "CONFIRMED";
  canonicalHash: string;
  snapshot: unknown;
  createdAt: string;
}>;

type ConfirmedProjectBrainSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  intakeSequence: number;
  stateVersion: number;
  status: "CONFIRMED";
  canonicalHash: string;
  snapshot: CanonicalProjectBrainSnapshot;
  createdAt: string;
}>;

export type ProjectBrainQueryAnswer = Readonly<{
  queryKind: ProjectBrainQueryKind;
  status: "ANSWERED" | "CLARIFICATION_REQUIRED" | "REFUSED";
  projectId: string | null;
  snapshotId: string | null;
  canonicalHash: string | null;
  provenance: "OWNER_CONFIRMED" | null;
  limitations: Array<z.infer<typeof projectBrainLimitationSchema>>;
  reply: string;
  providerExecutionPerformed: false;
  externalTransportPerformed: false;
}>;

type ProjectBrainQueryChannel = "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL";

const projectBrainQueryAnswerSchema = z.object({
  queryKind: z.enum(PROJECT_BRAIN_QUERY_KINDS),
  status: z.enum(["ANSWERED", "CLARIFICATION_REQUIRED", "REFUSED"]),
  projectId: z.string().min(1).nullable(),
  snapshotId: z.string().min(1).nullable(),
  canonicalHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  provenance: z.literal("OWNER_CONFIRMED").nullable(),
  limitations: z.array(projectBrainLimitationSchema).max(2),
  reply: z.string().min(1),
  providerExecutionPerformed: z.literal(false),
  externalTransportPerformed: z.literal(false),
}).strict();

const projectBrainQueryReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("R36V_PROJECT_BRAIN_QUERY"),
  queryKind: z.enum(PROJECT_BRAIN_QUERY_KINDS),
  routing: clientAssistantRoutingProjectionSchema,
  answer: projectBrainQueryAnswerSchema,
}).strict();

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr-CA")
    .replace(/[’']/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

const binaryArtifactPattern = [
  "audio",
  "enregistrement",
  "fichier",
  "image",
  "note vocale",
  "pdf",
  "photo",
  "piece jointe",
  "plan",
  "document",
  "docx",
  "devis",
  "soumission",
  "facture",
  "voice note",
  "attachment",
  "blueprint",
  "drawing",
  "estimate",
  "quote",
  "invoice",
  "scan",
].join("|");

const directBinaryAction = new RegExp(
  `\\b(?:analyse|analyser|analyze|ecoute|ecouter|listen|extrais|extraire|extract|interprete|interpreter|interpret|lis|lire|read|ocr|transcris|transcrire|transcribe|resume|resumer|summarize)\\b(?:\\s+(?:le|la|les|un|une|ce|cet|cette|the|this|that|du|de|des|of|contenu|content)){0,5}\\s+\\b(?:${binaryArtifactPattern})\\b`,
  "u",
);
const binaryMeaningQuestion = new RegExp(
  `(?:\\b(?:que dit|que montre|qu'est-ce qui est dans|what does|what is in)\\b.{0,40}\\b(?:${binaryArtifactPattern})\\b|\\b(?:${binaryArtifactPattern})\\b.{0,40}\\b(?:dit quoi|montre quoi|say|show|contain|contains)\\b)`,
  "u",
);
const binaryFactNamePattern = [
  "combien",
  "montant",
  "prix",
  "total",
  "date",
  "echeance",
  "delai",
  "dimension",
  "dimensions",
  "mesure",
  "mesures",
  "quantite",
  "adresse",
  "numero",
  "how much",
  "amount",
  "price",
  "total",
  "date",
  "deadline",
  "due date",
  "dimension",
  "dimensions",
  "measurement",
  "measurements",
  "quantity",
  "address",
  "number",
].join("|");
const binaryFactFromArtifact = new RegExp(
  `\\b(?:${binaryFactNamePattern})\\b.{0,48}\\b(?:dans|sur|selon|d'apres|du|de la|des|from|in|on|according to|of)\\b\\s+(?:(?:le|la|les|the)\\s+)?\\b(?:${binaryArtifactPattern})\\b`,
  "u",
);
const binaryFactAdjacentArtifact = new RegExp(
  `\\b(?:${binaryFactNamePattern})\\b(?:\\s+(?:est|is|does|do|du|de|la|des|of|on|dans|sur|selon|the|from|in|according|to|indique|indicated|shown|listed)){0,6}\\s+\\b(?:${binaryArtifactPattern})\\b`,
  "u",
);
const binaryArtifactStatesFact = new RegExp(
  `\\b(?:${binaryArtifactPattern})\\b.{0,48}\\b(?:indique|mentionne|affiche|contient|dit|shows|states|lists|contains|says)\\b.{0,32}\\b(?:${binaryFactNamePattern})\\b`,
  "u",
);

function asksForBinarySourceInterpretation(text: string): boolean {
  return directBinaryAction.test(text)
    || binaryMeaningQuestion.test(text)
    || binaryFactFromArtifact.test(text)
    || binaryFactAdjacentArtifact.test(text)
    || binaryArtifactStatesFact.test(text);
}

const consequentialAction = new RegExp(
  [
    "\\b(?:envoie|envoyer|send|ajoute|add|modifie|modifier|change|changer|deplace|deplacer|move|planifie|planifier|schedule|rappelle|rappeler|remind|appelle|appeler|call|cree|creer|create|supprime|supprimer|delete|annule|annuler|cancel|approuve|approuver|approve|paie|payer|pay|transmets|transmettre|forward)\\b",
    // `texte` is also a French noun. Treat it as an action only when it is
    // followed by a recipient-like token, not in requests such as
    // "quel est le texte du PDF?".
    "\\b(?:texte|texter|text)\\s+(?!(?:du|de la|des|dans|sur|exact|complet|integral|original)\\b)(?:a\\s+)?[\\p{L}\\p{N}]",
  ].join("|"),
  "u",
);

function containsConsequentialAction(text: string): boolean {
  return consequentialAction.test(text);
}

export function classifyProjectBrainQuery(message: string): ProjectBrainQueryKind | null {
  const text = normalizeText(message);
  // Project-memory reads never pre-empt an existing consequential command.
  // The action can be polite, infinitive, or appear after a read clause. It
  // must still reach the established prepare/approval router.
  if (containsConsequentialAction(text)) {
    return null;
  }
  if (asksForBinarySourceInterpretation(text)) {
    return "BINARY_INTERPRETATION";
  }
  if (
    /\b(inventaire|liste|quels?|quelles?|montre)\b.*\b(sources?|fichiers?|documents?|photos?|notes? vocales?)\b/u.test(text)
    || /\b(source inventory|source list|attached files)\b/u.test(text)
  ) {
    return "SOURCE_INVENTORY";
  }
  if (
    /\b(?:quels?\s+(?:sont\s+les?\s+)?|quel\s+est\s+le\s+|montre(?: moi)?\s+(?:les?\s+)?|liste\s+(?:les?\s+)?|y\s+a\s+t\s+il\s+(?:des?\s+)?|what\s+(?:are|is)\s+(?:the\s+)?|show\s+(?:me\s+)?(?:the\s+)?|list\s+(?:the\s+)?|any\s+)(?:blocages?|blockers?|obstacles?)\b/u.test(text)
  ) return "BLOCKERS";
  if (/\b(prochaine decision|decision suivante|quoi decider|next decision)\b/u.test(text)) {
    return "NEXT_DECISION";
  }
  if (
    /\b(resume|sommaire|synthese|summary|etat|status|ou en est)\b.*\b(chantier|projet|dossier|project)\b/u.test(text)
    || /\b(chantier|projet|dossier|project)\b.*\b(resume|sommaire|synthese|summary|etat|status)\b/u.test(text)
  ) {
    return "SUMMARY";
  }
  return null;
}

export function selectLatestConfirmedProjectBrainSnapshot(input: {
  workspaceId: string;
  projectId: string;
  candidates: readonly ProjectBrainSnapshotCandidate[];
}): ConfirmedProjectBrainSnapshot | null {
  const candidate = input.candidates
    .filter((item) => (
      item.status === "CONFIRMED"
      && item.workspaceId === input.workspaceId
      && item.projectId === input.projectId
    ))
    .sort((left, right) => (
      right.intakeSequence - left.intakeSequence
      || right.stateVersion - left.stateVersion
      || right.createdAt.localeCompare(left.createdAt)
      || right.canonicalHash.localeCompare(left.canonicalHash)
    ))[0];
  if (!candidate) return null;

  const snapshot = canonicalProjectBrainSnapshotSchema.parse(candidate.snapshot);
  if (
    snapshot.project.id !== input.projectId
    || sha256Canonical(snapshot) !== candidate.canonicalHash
  ) {
    throw new Error("PROJECT_BRAIN_CONFIRMED_SNAPSHOT_CORRUPT");
  }
  return {
    ...candidate,
    status: "CONFIRMED",
    snapshot,
  };
}

function limitationText(limitations: ConfirmedProjectBrainSnapshot["snapshot"]["limitations"]): string {
  const labels = limitations.map((limitation) => (
    limitation === "VOICE_NOT_TRANSCRIBED"
      ? "audio non transcrit"
      : "documents et photos non interprétés"
  ));
  return labels.length > 0
    ? `Limites : ${labels.join("; ")}.`
    : "Limite : cette lecture ne prétend interpréter aucun contenu binaire.";
}

function sourceInventory(snapshot: ConfirmedProjectBrainSnapshot["snapshot"]): string {
  if (snapshot.sources.length === 0) return "Aucune source admise dans ce snapshot confirmé.";
  const firstOrdinalByHash = new Map<string, number>();
  return snapshot.sources.map((source, index) => {
    const limitation = source.kind === "VOICE_NOTE"
      ? "note vocale non transcrite"
      : "contenu non interprété";
    const firstOrdinal = firstOrdinalByHash.get(source.contentHash);
    if (firstOrdinal === undefined) firstOrdinalByHash.set(source.contentHash, index + 1);
    const byteIdentity = firstOrdinal === undefined
      ? ""
      : ` — mêmes octets que la source ${firstOrdinal}; aucune preuve distincte`;
    return `${index + 1}. ${source.kind} — ${source.displayName} — ${limitation}${byteIdentity}`;
  }).join("\n");
}

export function answerProjectBrainQueryFromSnapshots(input: {
  queryKind: ProjectBrainQueryKind;
  workspaceId: string;
  projectId: string;
  candidates: readonly ProjectBrainSnapshotCandidate[];
}): ProjectBrainQueryAnswer {
  const confirmed = selectLatestConfirmedProjectBrainSnapshot(input);
  if (!confirmed) {
    return projectBrainQueryAnswerSchema.parse({
      queryKind: input.queryKind,
      status: "REFUSED",
      projectId: input.projectId,
      snapshotId: null,
      canonicalHash: null,
      provenance: null,
      limitations: [],
      reply: "Aucune mémoire de chantier confirmée n’est disponible pour ce chantier. Les brouillons et les propositions ne sont pas utilisés.",
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
  }

  const { snapshot } = confirmed;
  if (input.queryKind === "BINARY_INTERPRETATION") {
    return projectBrainQueryAnswerSchema.parse({
      queryKind: input.queryKind,
      status: "REFUSED",
      projectId: input.projectId,
      snapshotId: confirmed.id,
      canonicalHash: confirmed.canonicalHash,
      provenance: "OWNER_CONFIRMED",
      limitations: snapshot.limitations,
      reply: "Le contenu binaire lié à la mémoire confirmée n’a pas été analysé. L’audio n’a pas été transcrit; les documents, photos et plans n’ont subi ni OCR ni interprétation.",
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
  }

  const content = input.queryKind === "SUMMARY"
    ? snapshot.ownerBrief.summary
    : input.queryKind === "BLOCKERS"
      ? snapshot.ownerBrief.blockers || "Aucun blocage n’a été confirmé par le propriétaire."
      : input.queryKind === "NEXT_DECISION"
        ? snapshot.ownerBrief.nextDecision || "Aucune prochaine décision n’a été confirmée par le propriétaire."
        : sourceInventory(snapshot);
  const label = input.queryKind === "SUMMARY"
    ? "Résumé"
    : input.queryKind === "BLOCKERS"
      ? "Blocages"
      : input.queryKind === "NEXT_DECISION"
        ? "Prochaine décision"
        : "Sources admises";

  return projectBrainQueryAnswerSchema.parse({
    queryKind: input.queryKind,
    status: "ANSWERED",
    projectId: input.projectId,
    snapshotId: confirmed.id,
    canonicalHash: confirmed.canonicalHash,
    provenance: "OWNER_CONFIRMED",
    limitations: snapshot.limitations,
    reply: `${label} — mémoire confirmée par le propriétaire :\n${content}\nProvenance : snapshot OWNER_CONFIRMED. ${limitationText(snapshot.limitations)}`,
    providerExecutionPerformed: false,
    externalTransportPerformed: false,
  });
}

export function projectBrainRoutingProjection(
  queryKind: ProjectBrainQueryKind,
): ClientAssistantRoutingProjection {
  const binary = queryKind === "BINARY_INTERPRETATION";
  return clientAssistantRoutingProjectionSchema.parse({
    schemaVersion: 1,
    intentClass: binary ? "DOCUMENT_UNDERSTANDING" : "CANONICAL_STATE_QUERY",
    capabilityKey: binary ? "DOCUMENT_UNDERSTANDING" : "CANONICAL_STATE",
    disposition: binary ? "REFUSED" : "INTERNAL_TOOL",
    readiness: binary ? "REFUSED" : "INTERNAL_READY",
    citationsRequired: false,
    approvalRequired: false,
    providerExecutionAuthorized: false,
    externalDispatchPerformed: false,
  });
}

function databaseChannel(channel: ProjectBrainQueryChannel): ConstructionChannel {
  if (channel === "VOICE_TRANSCRIPT") return "voice";
  if (channel === "MOBILE_APP") return "portal";
  return channel.toLocaleLowerCase("en-CA") as ConstructionChannel;
}

function requestKey(workspaceId: string, requestId: string): string {
  return sha256Canonical({ source: "endvera-project-brain-query-r36v", workspaceId, requestId });
}

function responseKey(workspaceId: string, requestId: string): string {
  return sha256Canonical({ source: "endvera-project-brain-query-r36v-reply", workspaceId, requestId });
}

export function projectBrainQueryAuditAction(input: {
  status: ProjectBrainQueryAnswer["status"];
  replayed: boolean;
}): string {
  const disposition = input.status === "ANSWERED"
    ? "answered"
    : input.status === "REFUSED"
      ? "refused"
      : "clarification_required";
  return input.replayed
    ? `project_brain_query_${disposition}_replayed`
    : `project_brain_query_${disposition}`;
}

function sourceIdentity(input: {
  userId: string;
  request: ConstructionMobileAssistantRequest;
  admittedSource: TrustedAdmittedAssistantSource | null;
}) {
  return {
    sender: input.admittedSource?.senderAddress ?? `user:${input.userId}`,
    provider: input.admittedSource?.provider ?? "ENDVERA_PROJECT_BRAIN_R36V",
    providerMessageId: input.admittedSource?.providerMessageId
      ?? `request:${input.request.workspaceId}:${input.request.requestId}:project-brain-r36v`,
  };
}

function referenceSpans(text: string, reference: string): Array<Readonly<{ start: number; end: number }>> {
  const spans: Array<Readonly<{ start: number; end: number }>> = [];
  const wordCharacter = /[\p{L}\p{N}]/u;
  let cursor = 0;
  while (cursor <= text.length - reference.length) {
    const start = text.indexOf(reference, cursor);
    if (start === -1) break;
    const end = start + reference.length;
    const leftBoundary = !wordCharacter.test(reference[0] ?? "")
      || start === 0
      || !wordCharacter.test(text[start - 1] ?? "");
    const rightBoundary = !wordCharacter.test(reference.at(-1) ?? "")
      || end === text.length
      || !wordCharacter.test(text[end] ?? "");
    if (leftBoundary && rightBoundary) spans.push({ start, end });
    cursor = start + Math.max(reference.length, 1);
  }
  return spans;
}

function projectsMatchingReference(
  text: string,
  projects: ReadonlyArray<{ id: string; code: string; name: string }>,
  selectReference: (project: { id: string; code: string; name: string }) => string,
) {
  const matches = projects.flatMap((project) => {
    const reference = normalizeText(selectReference(project));
    if (reference.length === 0) return [];
    return referenceSpans(text, reference).map((span) => ({ project, span }));
  });
  const maximalMatches = matches.filter((candidate) => !matches.some((other) => (
    other.project.id !== candidate.project.id
    && other.span.start <= candidate.span.start
    && other.span.end >= candidate.span.end
    && (other.span.start < candidate.span.start || other.span.end > candidate.span.end)
  )));
  const distinctProjects = new Map(maximalMatches.map(({ project }) => [project.id, project]));
  return [...distinctProjects.values()];
}

export function resolveProjectFromMessage(
  message: string,
  projects: ReadonlyArray<{ id: string; code: string; name: string }>,
) {
  const text = normalizeText(message);
  const distinctProjects = new Map([
    ...projectsMatchingReference(text, projects, (project) => project.code),
    ...projectsMatchingReference(text, projects, (project) => project.name),
  ].map((project) => [project.id, project]));
  return distinctProjects.size === 1 ? [...distinctProjects.values()][0] : null;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function resultFromReceipt(input: {
  commandId: string;
  messageId: string;
  assistantMessageId: string;
  receipt: z.infer<typeof projectBrainQueryReceiptSchema>;
  replayed: boolean;
}): UnifiedAssistantResult {
  return unifiedAssistantResultSchema.parse({
    schemaVersion: 1,
    commandId: input.commandId,
    messageId: input.messageId,
    assistantMessageId: input.assistantMessageId,
    intent: "PROJECT_BRAIN_QUERY",
    status: input.receipt.answer.status,
    reply: input.receipt.answer.reply,
    canonicalEffectId: null,
    replayed: input.replayed,
    externalTransportPerformed: false,
    routing: input.receipt.routing,
  });
}

export async function processProjectBrainQuery(input: {
  userId: string;
  channel: ProjectBrainQueryChannel;
  request: ConstructionMobileAssistantRequest;
  queryKind: ProjectBrainQueryKind;
  admittedSource?: TrustedAdmittedAssistantSource | unknown;
}): Promise<UnifiedAssistantResult> {
  const admittedSource = input.channel === "MOBILE_APP" || input.channel === "PORTAL"
    ? null
    : trustedAdmittedAssistantSourceSchema.parse(input.admittedSource);
  const routing = projectBrainRoutingProjection(input.queryKind);
  const identity = sourceIdentity({ userId: input.userId, request: input.request, admittedSource });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.request.workspaceId}:${input.request.requestId}:r36v-project-brain-query`}, 0))::text AS acquired
    `);
    const membership = await requireActiveConstructionMember(
      tx,
      input.userId,
      input.request.workspaceId,
    );
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ConstructionAccessDenied();
    }

    const key = requestKey(input.request.workspaceId, input.request.requestId);
    const existing = await tx.constructionMessage.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.request.workspaceId,
          idempotencyKey: key,
        },
      },
      select: {
        id: true,
        originalBody: true,
        sender: true,
        channel: true,
        provider: true,
        providerMessageId: true,
        receivedAt: true,
        interpretation: { select: { structuredResult: true } },
      },
    });
    if (existing) {
      if (
        existing.originalBody !== input.request.message
        || existing.sender !== identity.sender
        || existing.channel !== databaseChannel(input.channel)
        || existing.provider !== identity.provider
        || existing.providerMessageId !== identity.providerMessageId
        || existing.receivedAt?.toISOString() !== new Date(input.request.occurredAt).toISOString()
      ) {
        throw new Error("PROJECT_BRAIN_QUERY_REPLAY_MISMATCH");
      }
      const receipt = projectBrainQueryReceiptSchema.parse(existing.interpretation?.structuredResult);
      if (receipt.queryKind !== input.queryKind) {
        throw new Error("PROJECT_BRAIN_QUERY_REPLAY_MISMATCH");
      }
      const response = await tx.constructionMessage.findUniqueOrThrow({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.request.workspaceId,
            idempotencyKey: responseKey(input.request.workspaceId, input.request.requestId),
          },
        },
        select: { id: true, originalBody: true },
      });
      if (response.originalBody !== receipt.answer.reply) {
        throw new Error("PROJECT_BRAIN_QUERY_RECEIPT_CORRUPT");
      }
      const replayAction = projectBrainQueryAuditAction({
        status: receipt.answer.status,
        replayed: true,
      });
      await tx.constructionAuditEvent.createMany({
        data: [{
          workspaceId: input.request.workspaceId,
          actorUserId: input.userId,
          entityType: "message",
          entityId: existing.id,
          action: replayAction,
          reasonCode: input.queryKind,
          metadata: asJson({
            projectId: receipt.answer.projectId,
            snapshotId: receipt.answer.snapshotId,
            canonicalHash: receipt.answer.canonicalHash,
            replayed: true,
            canonicalEffectCreated: false,
            providerExecutionPerformed: false,
            externalTransportPerformed: false,
          }),
          fingerprint: sha256Canonical({
            source: "project-brain-query-audit-r36v",
            workspaceId: input.request.workspaceId,
            requestId: input.request.requestId,
            action: replayAction,
          }),
        }],
        skipDuplicates: true,
      });
      return resultFromReceipt({
        commandId: input.request.requestId,
        messageId: existing.id,
        assistantMessageId: response.id,
        receipt,
        replayed: true,
      });
    }

    const projects = await tx.constructionProject.findMany({
      where: { workspaceId: input.request.workspaceId, status: "active" },
      select: { id: true, code: true, name: true },
    });
    const project = resolveProjectFromMessage(input.request.message, projects);
    let answer: ProjectBrainQueryAnswer;
    if (!project) {
      answer = projectBrainQueryAnswerSchema.parse({
        queryKind: input.queryKind,
        status: "CLARIFICATION_REQUIRED",
        projectId: null,
        snapshotId: null,
        canonicalHash: null,
        provenance: null,
        limitations: [],
        reply: "Je ne peux pas identifier un seul chantier à partir de cette demande. Nomme le code ou le nom exact du chantier. Aucune mémoire brouillon n’a été utilisée.",
        providerExecutionPerformed: false,
        externalTransportPerformed: false,
      });
    } else {
      const confirmed = await tx.constructionProjectBrainSnapshot.findFirst({
        where: {
          workspaceId: input.request.workspaceId,
          projectId: project.id,
          status: "CONFIRMED",
          intake: { status: "CONFIRMED" },
        },
        orderBy: [
          { intake: { intakeSequence: "desc" } },
          { stateVersion: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          stateVersion: true,
          status: true,
          canonicalHash: true,
          snapshot: true,
          createdAt: true,
          intake: { select: { intakeSequence: true } },
        },
      });
      answer = answerProjectBrainQueryFromSnapshots({
        queryKind: input.queryKind,
        workspaceId: input.request.workspaceId,
        projectId: project.id,
        candidates: confirmed ? [{
          ...confirmed,
          intakeSequence: confirmed.intake.intakeSequence,
          status: confirmed.status === "CONFIRMED" ? "CONFIRMED" : "PROPOSED",
          createdAt: confirmed.createdAt.toISOString(),
        }] : [],
      });
    }

    const messageStatus = answer.status === "ANSWERED"
      ? "answered"
      : answer.status === "CLARIFICATION_REQUIRED"
        ? "needs_clarification"
        : "refused";
    const inbound = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        projectId: answer.projectId,
        direction: "inbound",
        channel: databaseChannel(input.channel),
        provider: identity.provider,
        providerMessageId: identity.providerMessageId,
        idempotencyKey: key,
        sender: identity.sender,
        recipients: ["ENDVERA"],
        originalBody: input.request.message,
        normalizedBody: normalizeText(input.request.message),
        status: messageStatus,
        receivedAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });
    const receipt = projectBrainQueryReceiptSchema.parse({
      schemaVersion: 1,
      kind: "R36V_PROJECT_BRAIN_QUERY",
      queryKind: input.queryKind,
      routing,
      answer,
    });
    await tx.constructionInterpretation.create({
      data: {
        workspaceId: input.request.workspaceId,
        messageId: inbound.id,
        intent: answer.status === "CLARIFICATION_REQUIRED"
          ? "clarification_required"
          : "project_brain_query",
        confidence: 1,
        language: "fr-CA",
        structuredResult: asJson(receipt),
        clarification: answer.status === "CLARIFICATION_REQUIRED"
          ? asJson({
              reason: "PROJECT_NOT_FOUND",
              question: answer.reply,
              candidateCount: 0,
            })
          : Prisma.JsonNull,
        interpreterVersion: "construction-project-brain-query-r36v-v1",
      },
    });
    const response = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        projectId: answer.projectId,
        direction: "outbound",
        channel: databaseChannel(input.channel),
        provider: "ENDVERA_PROJECT_BRAIN_R36V",
        providerMessageId: `reply:${input.request.workspaceId}:${input.request.requestId}:project-brain-r36v`,
        idempotencyKey: responseKey(input.request.workspaceId, input.request.requestId),
        sender: "ENDVERA",
        recipients: [identity.sender],
        originalBody: answer.reply,
        normalizedBody: normalizeText(answer.reply),
        status: messageStatus,
        sentAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.request.workspaceId,
      actorUserId: input.userId,
      entityType: "message",
      entityId: inbound.id,
      action: projectBrainQueryAuditAction({ status: answer.status, replayed: false }),
      reasonCode: input.queryKind,
      metadata: asJson({
        projectId: answer.projectId,
        snapshotId: answer.snapshotId,
        canonicalHash: answer.canonicalHash,
        replayed: false,
        canonicalEffectCreated: false,
        providerExecutionPerformed: false,
        externalTransportPerformed: false,
      }),
    });

    return resultFromReceipt({
      commandId: input.request.requestId,
      messageId: inbound.id,
      assistantMessageId: response.id,
      receipt,
      replayed: false,
    });
  });
}
