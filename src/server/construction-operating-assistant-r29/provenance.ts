import "server-only";

import {
  fieldProjectProvenanceSchema,
  orderProvenanceEntries,
  ownerProjectProvenanceSchema,
  rejectFieldProvenanceLeaks,
  type FieldProvenanceEntry,
  type OwnerProvenanceEntry,
} from "@/lib/construction-operating-assistant-r29/provenance";
import { prisma } from "@/lib/db";
import { constructionProjectionRole } from "@/server/construction-operating-assistant-r7/gateway";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const FACT_LABEL: Record<string, string> = {
  PROJECT_ASSOCIATION: "Association au chantier",
  WORK_DESCRIPTION: "Description du travail",
  AMOUNT: "Montant du dossier",
  COMPLETION_ASSERTION: "Travail déclaré terminé",
  APPROVAL_STATE: "État de l’approbation",
};

const SOURCE_LABEL: Record<string, string> = {
  message_resolution: "Association confirmée depuis un message",
  message_claim: "Information déclarée dans un message",
  human_verification: "Vérification humaine autorisée",
  selected_evidence: "Preuve sélectionnée",
};

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function factValue(value: unknown): unknown {
  return jsonRecord(value)?.value ?? null;
}

function formatFactValue(field: string, value: unknown): string {
  const unwrapped = factValue(value);
  if (field === "AMOUNT") {
    const amount = jsonRecord(unwrapped);
    if (!amount || typeof amount.amountMinor !== "number" || amount.currency !== "CAD") return "Montant inconnu";
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount.amountMinor / 100);
  }
  if (unwrapped === null) return "Inconnu";
  if (typeof unwrapped === "boolean") return unwrapped ? "Oui" : "Non";
  if (typeof unwrapped === "string" || typeof unwrapped === "number") return String(unwrapped);
  return "Valeur structurée enregistrée";
}

function factTruthState(
  state: string,
  contradicted: boolean,
): "PROPOSED" | "CONTRADICTED" | "VERIFIED" | "SUPERSEDED" {
  if (contradicted || state === "disputed") return "CONTRADICTED";
  if (state === "verified") return "VERIFIED";
  if (state === "revoked") return "SUPERSEDED";
  return "PROPOSED";
}

function confidenceBand(confidence: number): "LOW" | "MEDIUM" | "HIGH" {
  return confidence >= 0.85 ? "HIGH" : confidence >= 0.6 ? "MEDIUM" : "LOW";
}

function summary(entries: readonly { kind: string; stateLabel: string }[]) {
  return {
    total: entries.length,
    verified: entries.filter((entry) => entry.stateLabel === "VERIFIED" || entry.kind === "VERIFIED_STATE").length,
    proposed: entries.filter((entry) => entry.stateLabel === "PROPOSED" || entry.stateLabel === "INFERENCE_ONLY").length,
    contradicted: entries.filter((entry) => entry.stateLabel === "CONTRADICTED" || entry.stateLabel === "OPEN_CONTRADICTION").length,
    humanAssisted: entries.filter((entry) => entry.kind === "HUMAN_RESULT").length,
  };
}

function safeFieldEntry(entry: OwnerProvenanceEntry): FieldProvenanceEntry | null {
  if (entry.kind === "FACT" && ["AMOUNT", "APPROVAL_STATE"].includes(entry.details.field)) return null;
  const workLabel = entry.kind === "FACT"
    ? (FACT_LABEL[entry.details.field] ?? "Information de chantier")
    : entry.kind === "INFERENCE"
      ? "Interprétation non vérifiée"
      : entry.kind === "DECISION"
        ? "Décision opérationnelle"
        : entry.kind === "ACTION"
          ? "Action de chantier"
          : entry.kind === "HUMAN_RESULT"
            ? "Appui humain"
            : "État opérationnel";
  const statement = entry.kind === "FACT"
    ? `Information de chantier: ${workLabel}.`
    : entry.kind === "INFERENCE"
      ? "ENDVERA a interprété une mise à jour sans la considérer comme vérifiée."
      : entry.kind === "DECISION"
        ? "Une décision opérationnelle a été enregistrée."
        : entry.kind === "ACTION"
          ? "Une action de chantier a changé d’état."
          : entry.kind === "HUMAN_RESULT"
            ? "Un appui humain a changé d’état."
            : "L’état opérationnel du dossier a été enregistré.";
  return {
    id: entry.id,
    kind: entry.kind,
    recordedAt: entry.recordedAt,
    statement,
    stateLabel: entry.stateLabel,
    canonicalRef: entry.canonicalRef,
    source: { kind: entry.source.kind, label: entry.source.label },
    causalParent: entry.causalParent,
    details: {
      workLabel,
      responsibleRole: entry.kind === "VERIFIED_STATE" ? entry.details.nextResponsibleRole : null,
    },
  };
}

export async function projectProvenanceForUser(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  referenceNow?: Date;
}) {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const role = constructionProjectionRole(membership.role);
  const project = await prisma.constructionProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, status: "active" },
    select: { id: true, code: true, name: true },
  });
  if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");

  const [facts, interpretations, transitions, contradictions, evaluations, authorityDecisions, actions, humanResults, snapshots] = await Promise.all([
    prisma.constructionOpenLoopFact.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.constructionInterpretation.findMany({
      where: { workspaceId: input.workspaceId, message: { projectId: input.projectId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, messageId: true, intent: true, confidence: true, interpreterVersion: true, createdAt: true },
    }),
    prisma.constructionOpenLoopTransition.findMany({
      where: { workspaceId: input.workspaceId, loop: { projectId: input.projectId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, loopId: true, priorStatus: true, nextStatus: true, priorVersion: true, nextVersion: true, reasonCodes: true, authorityDecision: true, createdAt: true },
    }),
    prisma.constructionOpenLoopContradiction.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, loopId: true, field: true, claimIds: true, status: true, createdAt: true, resolvedAt: true },
    }),
    prisma.constructionAuthorityEvaluation.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, actionKey: true, outcome: true, reasonCode: true, status: true, policySetVersion: true, createdAt: true },
    }),
    prisma.constructionAuthorityDecision.findMany({
      where: { workspaceId: input.workspaceId, evaluation: { projectId: input.projectId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, evaluationId: true, decision: true, statusAfter: true, expectedPolicySetVersion: true, createdAt: true },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, sourceMessageId: true, type: true, status: true, simulatedDeliveryCount: true, createdAt: true },
    }),
    prisma.constructionHumanEscalation.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, openLoopId: true, purpose: true, sourceStateVersion: true, state: true, acceptedResultHash: true, appliedAt: true, createdAt: true },
    }),
    prisma.constructionOpenLoopSnapshot.findMany({
      where: { workspaceId: input.workspaceId, loop: { projectId: input.projectId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, loopId: true, stateVersion: true, canonicalHash: true, createdAt: true, loop: { select: { stateVersion: true, status: true, nextResponsibleRole: true, nextAction: true } } },
    }),
  ]);

  const openContradictedClaims = new Set(contradictions.filter((item) => item.status === "open").flatMap((item) => item.claimIds));
  const entries: OwnerProvenanceEntry[] = [];

  for (const fact of facts) {
    const truthState = factTruthState(fact.state, openContradictedClaims.has(fact.id));
    const label = FACT_LABEL[fact.field];
    if (!label) throw new Error("PROVENANCE_UNKNOWN_FACT_FIELD");
    const valueLabel = formatFactValue(fact.field, fact.value);
    entries.push({
      id: `FACT:${fact.id}`,
      kind: "FACT",
      recordedAt: fact.createdAt.toISOString(),
      statement: `${label}: ${valueLabel}. État: ${truthState.toLowerCase()}.`,
      stateLabel: truthState,
      canonicalRef: { entityType: "ConstructionOpenLoopFact", entityId: fact.id },
      source: { kind: fact.sourceType.includes("evidence") ? "EVIDENCE" : "MESSAGE", label: SOURCE_LABEL[fact.sourceType] ?? "Source opérationnelle enregistrée", sourceEntityId: fact.sourceId },
      causalParent: null,
      details: { field: fact.field as "PROJECT_ASSOCIATION" | "WORK_DESCRIPTION" | "AMOUNT" | "COMPLETION_ASSERTION" | "APPROVAL_STATE", valueLabel, truthState, sourceType: fact.sourceType, observedAt: fact.observedAt?.toISOString() ?? null },
    });
  }

  for (const interpretation of interpretations) {
    entries.push({
      id: `INFERENCE:${interpretation.id}`,
      kind: "INFERENCE",
      recordedAt: interpretation.createdAt.toISOString(),
      statement: `ENDVERA a interprété ce message comme « ${interpretation.intent} ». Cette interprétation n’est pas un fait vérifié.`,
      stateLabel: "INFERENCE_ONLY",
      canonicalRef: { entityType: "ConstructionInterpretation", entityId: interpretation.id },
      source: { kind: "MESSAGE", label: "Message reçu et conservé", sourceEntityId: interpretation.messageId },
      causalParent: null,
      details: { intent: interpretation.intent, confidenceBand: confidenceBand(interpretation.confidence), interpreterVersion: interpretation.interpreterVersion },
    });
  }

  for (const transition of transitions) {
    entries.push({
      id: `DECISION:${transition.id}`,
      kind: "DECISION",
      recordedAt: transition.createdAt.toISOString(),
      statement: `La règle du dossier a fait passer l’état de ${transition.priorStatus ?? "aucun"} à ${transition.nextStatus}.`,
      stateLabel: `STATE_${transition.nextStatus.toUpperCase()}`,
      canonicalRef: { entityType: "ConstructionOpenLoopTransition", entityId: transition.id },
      source: { kind: "CANONICAL_STATE", label: `Décision ${transition.authorityDecision}`, sourceEntityId: transition.loopId },
      causalParent: null,
      details: { decisionType: "OPEN_LOOP_TRANSITION", priorState: transition.priorStatus, nextState: transition.nextStatus, reasonCodes: transition.reasonCodes, policyVersion: null },
    });
  }

  for (const contradiction of contradictions) {
    const state = contradiction.status === "open" ? "OPEN_CONTRADICTION" : "RESOLVED_CONTRADICTION";
    entries.push({
      id: `DECISION:${contradiction.id}`,
      kind: "DECISION",
      recordedAt: (contradiction.resolvedAt ?? contradiction.createdAt).toISOString(),
      statement: contradiction.status === "open" ? `Une contradiction demeure ouverte pour ${FACT_LABEL[contradiction.field] ?? contradiction.field}.` : `La contradiction pour ${FACT_LABEL[contradiction.field] ?? contradiction.field} a été résolue sans effacer les affirmations originales.`,
      stateLabel: state,
      canonicalRef: { entityType: "ConstructionOpenLoopContradiction", entityId: contradiction.id },
      source: { kind: "CANONICAL_STATE", label: "Affirmations contradictoires conservées", sourceEntityId: contradiction.loopId },
      causalParent: contradiction.claimIds[0] ? { entryId: `FACT:${contradiction.claimIds[0]}`, relation: "DECIDED_FROM" } : null,
      details: { decisionType: "CONTRADICTION", priorState: contradiction.status === "resolved" ? "OPEN" : null, nextState: contradiction.status.toUpperCase(), reasonCodes: ["CONTRADICTION_PRESERVED"], policyVersion: null },
    });
  }

  for (const evaluation of evaluations) {
    entries.push({
      id: `DECISION:${evaluation.id}`,
      kind: "DECISION",
      recordedAt: evaluation.createdAt.toISOString(),
      statement: `La politique d’autorité a classé ${evaluation.actionKey} comme ${evaluation.outcome}.`,
      stateLabel: evaluation.status.toUpperCase(),
      canonicalRef: { entityType: "ConstructionAuthorityEvaluation", entityId: evaluation.id },
      source: { kind: "POLICY", label: `Politique active version ${evaluation.policySetVersion}`, sourceEntityId: null },
      causalParent: null,
      details: { decisionType: "AUTHORITY_EVALUATION", priorState: null, nextState: evaluation.outcome, reasonCodes: [evaluation.reasonCode], policyVersion: evaluation.policySetVersion },
    });
  }

  for (const decision of authorityDecisions) {
    entries.push({
      id: `DECISION:${decision.id}`,
      kind: "DECISION",
      recordedAt: decision.createdAt.toISOString(),
      statement: `Une personne autorisée a ${decision.decision === "APPROVE" ? "approuvé" : "refusé"} l’action exacte.`,
      stateLabel: decision.statusAfter.toUpperCase(),
      canonicalRef: { entityType: "ConstructionAuthorityDecision", entityId: decision.id },
      source: { kind: "POLICY", label: `Décision liée à la politique version ${decision.expectedPolicySetVersion}`, sourceEntityId: decision.evaluationId },
      causalParent: { entryId: `DECISION:${decision.evaluationId}`, relation: "DECIDED_FROM" },
      details: { decisionType: "AUTHORITY_DECISION", priorState: "PENDING_APPROVAL", nextState: decision.statusAfter, reasonCodes: [decision.decision], policyVersion: decision.expectedPolicySetVersion },
    });
  }

  for (const action of actions) {
    entries.push({
      id: `ACTION:${action.id}`,
      kind: "ACTION",
      recordedAt: action.createdAt.toISOString(),
      statement: `Action « ${action.type} » enregistrée avec l’état ${action.status}. Aucun effet externe R29.`,
      stateLabel: action.status.toUpperCase(),
      canonicalRef: { entityType: "ConstructionAction", entityId: action.id },
      source: { kind: "MESSAGE", label: "Demande source conservée", sourceEntityId: action.sourceMessageId },
      causalParent: null,
      details: { actionType: action.type, actionStatus: action.status, localSimulationCount: action.simulatedDeliveryCount, externalEffectPerformed: false },
    });
  }

  for (const human of humanResults) {
    const parentSnapshot = snapshots.find((snapshot) => snapshot.loopId === human.openLoopId && snapshot.stateVersion === human.sourceStateVersion);
    entries.push({
      id: `HUMAN_RESULT:${human.id}`,
      kind: "HUMAN_RESULT",
      recordedAt: (human.appliedAt ?? human.createdAt).toISOString(),
      statement: `Appui humain « ${human.purpose} »: ${human.state}.`,
      stateLabel: human.state.toUpperCase(),
      canonicalRef: { entityType: "ConstructionHumanEscalation", entityId: human.id },
      source: { kind: "HUMAN_WORK", label: "Appui humain borné", sourceEntityId: human.openLoopId },
      causalParent: parentSnapshot ? { entryId: `VERIFIED_STATE:${human.openLoopId}:${human.sourceStateVersion}`, relation: "ACTED_FROM" } : null,
      details: { purpose: human.purpose, lifecycleState: human.state, acceptedResultFingerprint: human.acceptedResultHash, appliedAt: human.appliedAt?.toISOString() ?? null },
    });
  }

  for (const snapshot of snapshots) {
    const current = snapshot.stateVersion === snapshot.loop.stateVersion;
    const transition = transitions.find((item) => item.loopId === snapshot.loopId && item.nextVersion === snapshot.stateVersion);
    entries.push({
      id: `VERIFIED_STATE:${snapshot.loopId}:${snapshot.stateVersion}`,
      kind: "VERIFIED_STATE",
      recordedAt: snapshot.createdAt.toISOString(),
      statement: current
        ? `État actuel du dossier: ${snapshot.loop.status}, version ${snapshot.stateVersion}.`
        : `Snapshot historique immuable du dossier, version ${snapshot.stateVersion}.`,
      stateLabel: current ? snapshot.loop.status.toUpperCase() : "HISTORICAL_STATE",
      canonicalRef: { entityType: "ConstructionOpenLoopSnapshot", entityId: snapshot.id },
      source: { kind: "CANONICAL_STATE", label: "Snapshot PostgreSQL immuable", sourceEntityId: snapshot.loopId },
      causalParent: transition ? { entryId: `DECISION:${transition.id}`, relation: "VERIFIED_FROM" } : null,
      details: {
        stateVersion: snapshot.stateVersion,
        snapshotFingerprint: snapshot.canonicalHash,
        current,
        nextResponsibleRole: current ? snapshot.loop.nextResponsibleRole : null,
        nextAction: current ? snapshot.loop.nextAction : null,
      },
    });
  }

  const ordered = orderProvenanceEntries(entries);
  const common = {
    schemaVersion: 1 as const,
    generatedAt: (input.referenceNow ?? new Date()).toISOString(),
    workspaceId: input.workspaceId,
    project,
    externalEffectCount: 0 as const,
  };
  if (role === "FIELD_WORKER") {
    const projected = ordered.map(safeFieldEntry).filter((entry): entry is FieldProvenanceEntry => entry !== null);
    const visibleIds = new Set(projected.map((entry) => entry.id));
    const fieldEntries = projected.map((entry) => ({
      ...entry,
      causalParent: entry.causalParent && visibleIds.has(entry.causalParent.entryId)
        ? entry.causalParent
        : null,
    }));
    const result = { ...common, role, summary: summary(fieldEntries), entries: fieldEntries };
    rejectFieldProvenanceLeaks(result);
    return fieldProjectProvenanceSchema.parse(result);
  }
  return ownerProjectProvenanceSchema.parse({ ...common, role, summary: summary(ordered), entries: ordered });
}
