import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { boundOutboundActionSchema, buildActionFingerprint } from "@/lib/construction-assistant-v1/outbound";
import { preparedEvidenceRequestSchema } from "@/lib/construction-operating-assistant-r0/contracts";
import { deriveMessagingPermission } from "@/lib/construction-operating-assistant-r24/policy";
import { deriveOutboundCallPolicy } from "@/lib/construction-operating-assistant-r25/policy";
import { VOICE_CALL_POLICY_VERSION } from "@/lib/construction-operating-assistant-r25/contracts";
import { EMAIL_POLICY_VERSION } from "@/lib/construction-operating-assistant-r26/contracts";
import { emailDraftPayloadHash } from "@/lib/construction-operating-assistant-r26/policy";
import {
  buildProjectBrainUnderstandingSnapshot,
  canonicalProjectBrainUnderstandingSnapshotSchema,
} from "@/lib/construction-operating-assistant-r36x/project-brain-understanding-review";
import {
  buildProjectBrainFactCandidates,
  hashProjectBrainFactCandidateSet,
  projectBrainFactCandidateProjectionSchema,
} from "@/lib/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  PROJECT_BRAIN_MEMORY_QUESTIONS,
  buildProjectBrainMemoryAnswer,
  projectBrainAssistantCommandResultSchema,
  projectBrainAssistantCommandSchema,
  projectBrainAssistantFalseEffects,
  projectBrainAssistantMemoryProjectionSchema,
  projectBrainMemoryCitationSchema,
  projectBrainPrepareActionResultSchema,
  projectBrainPreparedActionProjectionSchema,
  projectBrainRecallResultSchema,
  type PrepareConfirmedMemoryProjectActionCommand,
  type ProjectBrainAssistantCommand,
  type ProjectBrainAssistantCommandResult,
  type ProjectBrainAssistantMemoryProjection,
  type ProjectBrainMemoryCitation,
  type RecallConfirmedProjectMemoryCommand,
} from "@/lib/construction-operating-assistant-r36y/project-brain-assistant-memory";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

type Tx = PrismaTypes.TransactionClient;
const TRANSACTION = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000 } as const;
const localTails = new Map<string, Promise<void>>();
const asJson = (value: unknown): PrismaTypes.InputJsonValue => JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;

async function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = localTails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = prior.then(() => gate);
  localTails.set(key, tail);
  await prior;
  try { return await operation(); } finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

async function requireMemoryManager(tx: Tx, userId: string, workspaceId: string): Promise<void> {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
}

type ConfirmedMemory = Awaited<ReturnType<typeof loadConfirmedMemoryByReview>>;

async function loadConfirmedMemoryByReview(tx: Tx, input: { workspaceId: string; projectId: string; reviewId: string }) {
  const review = await tx.constructionProjectBrainUnderstandingReview.findFirst({
    where: { id: input.reviewId, workspaceId: input.workspaceId, projectId: input.projectId, status: "CONFIRMED" },
    include: {
      snapshots: { where: { status: "CONFIRMED" }, orderBy: [{ stateVersion: "desc" }, { id: "asc" }] },
      decisions: { where: { decision: "CONFIRM_EXACT_UNDERSTANDING" }, orderBy: [{ nextStateVersion: "desc" }, { id: "asc" }] },
      dispositions: { orderBy: [{ nextStateVersion: "desc" }, { id: "asc" }] },
      contradictions: { include: { members: true, resolutions: { orderBy: [{ nextStateVersion: "desc" }, { id: "asc" }] } } },
      candidateBatch: { include: { candidates: true } },
      intake: { include: { sources: true, snapshots: { where: { status: "CONFIRMED" } } } },
    },
  });
  if (!review) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  return assertConfirmedMemoryIntegrity(review);
}

export async function loadCurrentConfirmedMemory(tx: Tx, input: { workspaceId: string; projectId: string }) {
  const reviews = await tx.constructionProjectBrainUnderstandingReview.findMany({
    where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "CONFIRMED" },
    orderBy: [{ confirmedUnderstandingSequence: "desc" }, { id: "desc" }],
    take: 2,
    select: { id: true, confirmedUnderstandingSequence: true },
  });
  const current = reviews[0];
  if (!current?.confirmedUnderstandingSequence) throw new Error("PROJECT_BRAIN_CONFIRMED_MEMORY_UNAVAILABLE");
  if (reviews[1]?.confirmedUnderstandingSequence === current.confirmedUnderstandingSequence) throw new Error("PROJECT_BRAIN_MEMORY_CURRENT_POINTER_AMBIGUOUS");
  return loadConfirmedMemoryByReview(tx, { ...input, reviewId: current.id });
}

export function assertConfirmedMemoryIntegrity(review: {
  id: string; workspaceId: string; projectId: string; intakeId: string; confirmedIntakeSnapshotId: string;
  candidateBatchId: string; candidateSetHash: string; reviewFingerprint: string | null;
  confirmedUnderstandingSequence: number | null; status: string;
  snapshots: Array<{ id: string; reviewId: string; workspaceId: string; projectId: string; intakeId: string; confirmedIntakeSnapshotId: string; candidateBatchId: string; status: string; snapshot: unknown; canonicalHash: string; stateVersion: number }>;
  decisions: Array<{ id: string; reviewId: string; snapshotHash: string | null; decision: string }>;
  dispositions: Array<{ id: string; candidateId: string; disposition: string; nextStateVersion: number }>;
  contradictions: Array<{ id: string; members: Array<{ candidateId: string }>; resolutions: Array<{ id: string; mode: string; selectedCandidateIds: string[]; ownerResolutionText: string | null; provenance: string; nextStateVersion: number }> }>;
  candidateBatch: { id: string; workspaceId: string; projectId: string; intakeId: string; confirmedSnapshotId: string; confirmedSnapshotHash: string; candidateSetHash: string; status: string; candidateCount: number; candidates: Array<{ id: string; batchId: string; workspaceId: string; projectId: string; intakeId: string; confirmedSnapshotId: string; confirmedSnapshotHash: string; candidateFingerprint: string; adapter: string; kind: string; status: string; confidenceClass: string; value: string; ownerBriefField: string | null; rangeUnit: string | null; rangeStart: number | null; rangeEnd: number | null; sourceId: string | null; sourceOrdinal: number | null; sourceContentHash: string | null; metadataField: string | null }> };
  intake: { id: string; workspaceId: string; projectId: string; status: string; summary: string | null; scope: string | null; importantPeople: string | null; importantDates: string | null; blockers: string | null; nextDecision: string | null; sources: Array<{ id: string; ordinal: number; kind: string; displayName: string; mimeType: string; sizeBytes: number; durationMs: number | null; contentHash: string }>; snapshots: Array<{ id: string; canonicalHash: string; status: string }> };
}) {
  const snapshot = review.snapshots[0];
  const decision = review.decisions[0];
  if (
    review.status !== "CONFIRMED" || !review.confirmedUnderstandingSequence || !review.reviewFingerprint ||
    review.snapshots.length !== 1 || !snapshot || snapshot.status !== "CONFIRMED" || snapshot.reviewId !== review.id ||
    snapshot.workspaceId !== review.workspaceId || snapshot.projectId !== review.projectId || snapshot.intakeId !== review.intakeId ||
    snapshot.confirmedIntakeSnapshotId !== review.confirmedIntakeSnapshotId || snapshot.candidateBatchId !== review.candidateBatchId ||
    snapshot.canonicalHash !== review.reviewFingerprint || !decision || decision.reviewId !== review.id ||
    decision.snapshotHash !== snapshot.canonicalHash || review.candidateBatch.id !== review.candidateBatchId ||
    review.candidateBatch.workspaceId !== review.workspaceId || review.candidateBatch.projectId !== review.projectId ||
    review.candidateBatch.intakeId !== review.intakeId || review.candidateBatch.confirmedSnapshotId !== review.confirmedIntakeSnapshotId ||
    review.candidateBatch.candidateSetHash !== review.candidateSetHash || review.candidateBatch.status !== "COMPLETED_LOCAL" ||
    review.candidateBatch.candidateCount !== review.candidateBatch.candidates.length || review.intake.id !== review.intakeId ||
    review.intake.workspaceId !== review.workspaceId || review.intake.projectId !== review.projectId || review.intake.status !== "CONFIRMED"
  ) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const intakeSnapshot = review.intake.snapshots.find((item) => item.id === review.confirmedIntakeSnapshotId && item.status === "CONFIRMED");
  if (!intakeSnapshot) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const parsed = canonicalProjectBrainUnderstandingSnapshotSchema.safeParse(snapshot.snapshot);
  if (!parsed.success) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const rebuilt = buildProjectBrainUnderstandingSnapshot(parsed.data);
  if (rebuilt.canonicalHash !== snapshot.canonicalHash || parsed.data.inputs.intakeId !== review.intakeId || parsed.data.inputs.candidateBatchId !== review.candidateBatchId || parsed.data.inputs.candidateSetHash !== review.candidateSetHash || parsed.data.inputs.confirmedIntakeSnapshotHash !== intakeSnapshot.canonicalHash) {
    throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  }
  const batchCandidateIds = new Set(review.candidateBatch.candidates.map((item) => item.id));
  if (parsed.data.candidates.some((item) => !batchCandidateIds.has(item.candidateId))) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const expectedCandidates = buildProjectBrainFactCandidates({
    workspaceId: review.workspaceId,
    projectId: review.projectId,
    intakeId: review.intakeId,
    confirmedSnapshotId: review.confirmedIntakeSnapshotId,
    confirmedSnapshotHash: intakeSnapshot.canonicalHash,
    ownerBrief: {
      summary: review.intake.summary ?? "", scope: review.intake.scope ?? "", importantPeople: review.intake.importantPeople ?? "",
      importantDates: review.intake.importantDates ?? "", blockers: review.intake.blockers ?? "", nextDecision: review.intake.nextDecision ?? "",
    },
    sources: review.intake.sources.map((source) => ({ ...source, kind: source.kind as "PHOTO" | "DOCUMENT" | "VOICE_NOTE" })),
  });
  const persistedCandidates = review.candidateBatch.candidates.map((candidate) => projectBrainFactCandidateProjectionSchema.parse({
    id: candidate.id, candidateFingerprint: candidate.candidateFingerprint, workspaceId: candidate.workspaceId,
    projectId: candidate.projectId, intakeId: candidate.intakeId, confirmedSnapshotId: candidate.confirmedSnapshotId,
    confirmedSnapshotHash: candidate.confirmedSnapshotHash, adapter: candidate.adapter, kind: candidate.kind,
    status: candidate.status, confidenceClass: candidate.confidenceClass, value: candidate.value,
    ownerBriefField: candidate.ownerBriefField, rangeUnit: candidate.rangeUnit, rangeStart: candidate.rangeStart,
    rangeEnd: candidate.rangeEnd, sourceId: candidate.sourceId, sourceOrdinal: candidate.sourceOrdinal,
    sourceContentHash: candidate.sourceContentHash, metadataField: candidate.metadataField,
  }));
  const persistedByFingerprint = new Map(persistedCandidates.map((candidate) => [candidate.candidateFingerprint, candidate]));
  const orderedPersistedCandidates = expectedCandidates.map((candidate) => persistedByFingerprint.get(candidate.candidateFingerprint)).filter((candidate): candidate is (typeof persistedCandidates)[number] => Boolean(candidate));
  if (
    hashProjectBrainFactCandidateSet(expectedCandidates) !== review.candidateSetHash ||
    orderedPersistedCandidates.length !== expectedCandidates.length ||
    persistedCandidates.length !== expectedCandidates.length ||
    hashProjectBrainFactCandidateSet(orderedPersistedCandidates) !== review.candidateSetHash
  ) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const currentDispositions = new Map<string, (typeof review.dispositions)[number]>();
  for (const disposition of review.dispositions) if (!currentDispositions.has(disposition.candidateId)) currentDispositions.set(disposition.candidateId, disposition);
  for (const candidate of parsed.data.candidates) {
    const disposition = currentDispositions.get(candidate.candidateId);
    if (!disposition || disposition.disposition !== candidate.disposition) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  }
  const currentResolutions = new Map<string, (typeof review.contradictions)[number]["resolutions"][number]>();
  for (const contradiction of review.contradictions) {
    const resolution = contradiction.resolutions[0];
    if (!resolution) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
    currentResolutions.set(contradiction.id, resolution);
  }
  for (const contradiction of parsed.data.contradictions) {
    const actual = currentResolutions.get(contradiction.contradictionId);
    const persistedContradiction = review.contradictions.find((item) => item.id === contradiction.contradictionId);
    const members = [...(persistedContradiction?.members.map((item) => item.candidateId) ?? [])].sort();
    if (!actual || actual.mode !== contradiction.resolution.mode || JSON.stringify(members) !== JSON.stringify([...contradiction.memberCandidateIds].sort())) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
    if (actual.mode === "SELECT_SUPPORTED_CANDIDATES" && (contradiction.resolution.mode !== "SELECT_SUPPORTED_CANDIDATES" || JSON.stringify([...actual.selectedCandidateIds].sort()) !== JSON.stringify([...contradiction.resolution.selectedCandidateIds].sort()))) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
    if (actual.mode === "OWNER_RESOLUTION" && (contradiction.resolution.mode !== "OWNER_RESOLUTION" || actual.ownerResolutionText !== contradiction.resolution.ownerResolutionText || actual.provenance !== "OWNER_RESOLUTION")) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  }
  if (currentResolutions.size !== parsed.data.contradictions.length) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  return {
    reviewId: review.id,
    workspaceId: review.workspaceId,
    projectId: review.projectId,
    confirmedUnderstandingSequence: review.confirmedUnderstandingSequence,
    snapshotId: snapshot.id,
    memoryCanonicalHash: snapshot.canonicalHash,
    confirmedIntakeSnapshotId: review.confirmedIntakeSnapshotId,
    confirmationDecisionId: decision.id,
    snapshot: parsed.data,
    dispositionIdsByCandidateId: new Map([...currentDispositions].map(([candidateId, value]) => [candidateId, value.id])),
    resolutionIdsByContradictionId: new Map([...currentResolutions].map(([contradictionId, value]) => [contradictionId, value.id])),
  };
}

function assertExpectedCurrent(command: ProjectBrainAssistantCommand, memory: ConfirmedMemory): void {
  if (command.expectedConfirmedUnderstandingSequence !== memory.confirmedUnderstandingSequence || command.expectedMemoryCanonicalHash !== memory.memoryCanonicalHash) {
    throw new Error("PROJECT_BRAIN_MEMORY_STALE_CURRENT_POINTER");
  }
}

function answerFor(memory: ConfirmedMemory, questionKind: RecallConfirmedProjectMemoryCommand["questionKind"]) {
  return buildProjectBrainMemoryAnswer({
    questionKind,
    snapshot: memory.snapshot,
    confirmedSnapshotId: memory.snapshotId,
    confirmationDecisionId: memory.confirmationDecisionId,
    confirmedIntakeSnapshotId: memory.confirmedIntakeSnapshotId,
    dispositionIdsByCandidateId: memory.dispositionIdsByCandidateId,
    resolutionIdsByContradictionId: memory.resolutionIdsByContradictionId,
  });
}

function citationCreateData(memory: ConfirmedMemory, citations: ProjectBrainMemoryCitation[]) {
  return citations.map((item) => ({
    id: randomUUID(),
    ordinal: item.ordinal, citationKind: item.citationKind, understandingReviewId: memory.reviewId,
    confirmedUnderstandingSnapshotId: item.understandingSnapshotId, confirmationDecisionId: item.confirmationDecisionId,
    dispositionId: item.dispositionId, resolutionId: item.resolutionId, candidateId: item.candidateId,
    candidateBatchId: item.candidateBatchId, intakeId: item.intakeId,
    confirmedIntakeSnapshotId: item.confirmedIntakeSnapshotId, sourceId: item.sourceId,
    provenanceFingerprint: item.provenanceFingerprint,
  }));
}

async function persistRecall(tx: Tx, userId: string, command: RecallConfirmedProjectMemoryCommand, commandHash: string, memory: ConfirmedMemory) {
  const answer = answerFor(memory, command.questionKind);
  const receiptId = randomUUID();
  const core = {
    schemaVersion: 1 as const, commandId: command.commandId, action: command.action,
    workspaceId: command.workspaceId, projectId: command.projectId, receiptId,
    confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence,
    confirmedUnderstandingSnapshotId: memory.snapshotId, memoryCanonicalHash: memory.memoryCanonicalHash,
    answer, resultHash: "0".repeat(64), replayed: false, falseEffects: projectBrainAssistantFalseEffects(),
  };
  const resultHash = sha256Canonical({ ...core, resultHash: undefined });
  const result = projectBrainRecallResultSchema.parse({ ...core, resultHash });
  await tx.constructionProjectBrainRecallReceipt.create({ data: {
    id: receiptId, workspaceId: command.workspaceId, projectId: command.projectId,
    understandingReviewId: memory.reviewId, confirmedUnderstandingSnapshotId: memory.snapshotId,
    confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence, memoryCanonicalHash: memory.memoryCanonicalHash,
    questionKind: command.questionKind, commandId: command.commandId, commandHash, schemaVersion: 1,
    result: asJson(result), resultHash, actorUserId: userId,
    citations: { create: citationCreateData(memory, answer.citations) },
  } });
  await tx.constructionProjectBrainAssistantDecision.create({ data: {
    id: randomUUID(), workspaceId: command.workspaceId, projectId: command.projectId, commandId: command.commandId,
    commandHash, action: command.action, questionKind: command.questionKind,
    confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence, memoryCanonicalHash: memory.memoryCanonicalHash,
    entityId: receiptId, resultHash, outcome: "ANSWERED_FROM_CONFIRMED_MEMORY", actorUserId: userId,
  } });
  return result;
}

async function requireProjectContact(tx: Tx, command: PrepareConfirmedMemoryProjectActionCommand) {
  const contact = await tx.constructionContact.findFirst({ where: { id: command.recipientContactRef, workspaceId: command.workspaceId, projectId: command.projectId, status: "active" }, select: { id: true, displayName: true } });
  if (!contact) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  return contact;
}

async function prepareFamilyAction(tx: Tx, userId: string, command: PrepareConfirmedMemoryProjectActionCommand, commandHash: string, contact: { id: string; displayName: string }) {
  if (command.family === "OPEN_LOOP_EVIDENCE_REQUEST") {
    const loop = await tx.constructionOpenLoop.findFirst({ where: { id: command.openLoopId!, workspaceId: command.workspaceId, projectId: command.projectId, status: { notIn: ["revoked", "closed"] } }, select: { id: true, stateVersion: true, openedByMessageId: true } });
    if (!loop || loop.stateVersion !== command.expectedOpenLoopStateVersion) throw new Error("PROJECT_BRAIN_ACTION_CONTEXT_REFUSED");
    const identity = await tx.constructionCommunicationIdentity.findFirst({ where: { workspaceId: command.workspaceId, contactId: contact.id, channel: command.channel === "SMS" ? "sms" : "email", status: "active", verified: true }, select: { normalizedAddress: true } });
    if (!identity) throw new Error("PROJECT_BRAIN_ACTION_RECIPIENT_UNAVAILABLE");
    const actionId = randomUUID();
    const payload = preparedEvidenceRequestSchema.parse({ schemaVersion: 1, disposition: "PREPARED_UNSENT", transportAuthorized: false, workspaceId: command.workspaceId, projectId: command.projectId, loopId: loop.id, loopStateVersion: loop.stateVersion, actionId, actionVersion: 1, requestId: command.commandId, contactId: contact.id, channel: command.channel, normalizedRecipient: identity.normalizedAddress, body: command.body, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    const payloadFingerprint = sha256Canonical(payload);
    await tx.constructionAction.create({ data: { id: actionId, workspaceId: command.workspaceId, projectId: command.projectId, contactId: contact.id, openLoopId: loop.id, sourceMessageId: loop.openedByMessageId, type: "follow_up", status: "proposed", riskClass: "medium", approvalRequired: true, version: 1, payload: asJson(payload), payloadHash: payloadFingerprint } });
    return { familyEntityId: actionId, familyEntityVersion: 1, payloadFingerprint, recipientRef: identity.normalizedAddress, subject: null, body: command.body, requiredApprovingRole: "OWNER" as const };
  }
  if (command.family === "SMS_MMS") {
    if (command.channel !== "SMS") throw new Error("PROJECT_BRAIN_ACTION_LIMITATION");
    const [identity, permission] = await Promise.all([
      tx.constructionCommunicationIdentity.findFirst({ where: { workspaceId: command.workspaceId, contactId: contact.id, channel: "sms", status: "active", verified: true }, select: { normalizedAddress: true } }),
      tx.constructionMessagingPermission.findUnique({ where: { workspaceId_contactId_purpose: { workspaceId: command.workspaceId, contactId: contact.id, purpose: "service" } } }),
    ]);
    if (!identity) throw new Error("PROJECT_BRAIN_ACTION_RECIPIENT_UNAVAILABLE");
    const policy = deriveMessagingPermission({ consentStatus: permission?.consentStatus === "granted" || permission?.consentStatus === "withdrawn" ? permission.consentStatus : "unknown", suppressionStatus: permission?.suppressionStatus === "suppressed" || permission?.suppressionStatus === "review_required" ? permission.suppressionStatus : "allowed" });
    if (!policy.allowed) throw new Error(`PROJECT_BRAIN_ACTION_${policy.reason}`);
    const sourceMessageId = randomUUID();
    await tx.constructionMessage.create({ data: { id: sourceMessageId, workspaceId: command.workspaceId, projectId: command.projectId, contactId: contact.id, direction: "inbound", channel: "portal", idempotencyKey: `r36y:${command.commandId}`, sender: `user:${userId}`, recipients: ["ENDVERA"], originalBody: command.body, normalizedBody: command.body.normalize("NFKC").replace(/\s+/gu, " ").trim(), status: "interpreted", receivedAt: new Date() } });
    const actionId = randomUUID();
    const payload = boundOutboundActionSchema.parse({ workspaceId: command.workspaceId, actionId, version: 1, contactId: contact.id, channel: "SMS", normalizedRecipient: identity.normalizedAddress, body: command.body });
    const payloadFingerprint = buildActionFingerprint(payload);
    await tx.constructionAction.create({ data: { id: actionId, workspaceId: command.workspaceId, projectId: command.projectId, contactId: contact.id, sourceMessageId, type: "outbound_message", status: "proposed", riskClass: "medium", approvalRequired: true, version: 1, payload: asJson(payload), payloadHash: payloadFingerprint } });
    return { familyEntityId: actionId, familyEntityVersion: 1, payloadFingerprint, recipientRef: identity.normalizedAddress, subject: null, body: command.body, requiredApprovingRole: "OWNER" as const };
  }
  if (command.family === "VOICE_CALL") {
    const identity = await tx.constructionCommunicationIdentity.findFirst({ where: { workspaceId: command.workspaceId, contactId: contact.id, channel: "voice", status: "active", verified: true }, select: { normalizedAddress: true, permissions: true, verified: true } });
    const disclosureVersion = "endvera-r36y-local-v1";
    const disclosureScript = "Bonjour, ici l’assistant ENDVERA de votre contact.";
    const policy = deriveOutboundCallPolicy({ purpose: "service", disclosureVersion, identityVerified: Boolean(identity?.verified && identity.permissions.includes("CALL")) });
    if (!policy.allowed || !identity) throw new Error("PROJECT_BRAIN_ACTION_CALL_POLICY_REFUSED");
    const familyEntityId = randomUUID();
    await tx.constructionCallWork.create({ data: { id: familyEntityId, workspaceId: command.workspaceId, projectId: command.projectId, contactId: contact.id, commandId: command.commandId, commandHash, recipientRef: identity.normalizedAddress, purpose: "service", objective: command.body, objectiveHash: sha256Canonical(command.body), disclosureVersion, disclosureScript, resultSchema: ["CONTACT_REACHED", "RESULT_SUMMARY"], policyVersion: VOICE_CALL_POLICY_VERSION, policyDecision: policy.reason, status: "PREPARED_UNSENT", nextOwnerRole: "HUMAN_CALLER", createdByUserId: userId, externalTransportPerformed: false } });
    const payloadFingerprint = sha256Canonical({ familyEntityId, workspaceId: command.workspaceId, projectId: command.projectId, contactId: contact.id, recipientRef: identity.normalizedAddress, body: command.body, disclosureVersion, disclosureScript, policyVersion: VOICE_CALL_POLICY_VERSION, version: 1 });
    return { familyEntityId, familyEntityVersion: 1, payloadFingerprint, recipientRef: identity.normalizedAddress, subject: null, body: command.body, requiredApprovingRole: "HUMAN_CALLER" as const };
  }
  const [account, identity] = await Promise.all([
    tx.constructionEmailAccount.findFirst({ where: { id: command.emailAccountId!, workspaceId: command.workspaceId, status: "PREPARED_DISABLED", capabilities: { has: "PREPARE_DRAFT" } }, select: { id: true } }),
    tx.constructionCommunicationIdentity.findFirst({ where: { workspaceId: command.workspaceId, contactId: contact.id, channel: "email", normalizedAddress: command.emailToRef!, status: "active", verified: true }, select: { normalizedAddress: true } }),
  ]);
  if (!account || !identity || EMAIL_POLICY_VERSION !== "r26-local-disabled-v1") throw new Error("PROJECT_BRAIN_ACTION_EMAIL_POLICY_REFUSED");
  const familyEntityId = randomUUID();
  const payloadFingerprint = emailDraftPayloadHash({ workspaceId: command.workspaceId, accountId: account.id, projectId: command.projectId, contactId: contact.id, toRef: identity.normalizedAddress, ccRefs: [], subject: command.subject!, body: command.body, threadRef: null, selectedEvidenceIds: [], version: 1 });
  await tx.constructionEmailDraft.create({ data: { id: familyEntityId, workspaceId: command.workspaceId, accountId: account.id, projectId: command.projectId, contactId: contact.id, commandId: command.commandId, commandHash, toRef: identity.normalizedAddress, ccRefs: [], subject: command.subject!, body: command.body, threadRef: null, selectedEvidenceIds: [], version: 1, payloadHash: payloadFingerprint, status: "PREPARED_UNSENT", externalTransportPerformed: false } });
  return { familyEntityId, familyEntityVersion: 1, payloadFingerprint, recipientRef: identity.normalizedAddress, subject: command.subject!, body: command.body, requiredApprovingRole: "OFFICE_MANAGER" as const };
}

function selectedCitations(memory: ConfirmedMemory, command: PrepareConfirmedMemoryProjectActionCommand): ProjectBrainMemoryCitation[] {
  const deduplicated = new Map<string, ProjectBrainMemoryCitation>();
  for (const selection of command.citationSelections) {
    const answer = answerFor(memory, selection.kind);
    for (const item of answer.citations) deduplicated.set(item.provenanceFingerprint, item);
  }
  const citations = [...deduplicated.values()].map((item, index) => projectBrainMemoryCitationSchema.parse({ ...item, ordinal: index + 1 }));
  if (!citations.length) throw new Error("PROJECT_BRAIN_MEMORY_CITATION_UNAVAILABLE");
  return citations;
}

async function persistPreparedAction(tx: Tx, userId: string, command: PrepareConfirmedMemoryProjectActionCommand, commandHash: string, memory: ConfirmedMemory) {
  const contact = await requireProjectContact(tx, command);
  const citations = selectedCitations(memory, command);
  const prepared = await prepareFamilyAction(tx, userId, command, commandHash, contact);
  const bindingId = randomUUID();
  const preparedAction = projectBrainPreparedActionProjectionSchema.parse({ bindingId, family: command.family, ...prepared, recipientContactId: contact.id, recipientDisplayName: contact.displayName, channel: command.channel, status: "PREPARED_UNSENT", approvalRequired: true, citations });
  const core = { schemaVersion: 1 as const, commandId: command.commandId, action: command.action, workspaceId: command.workspaceId, projectId: command.projectId, confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence, confirmedUnderstandingSnapshotId: memory.snapshotId, memoryCanonicalHash: memory.memoryCanonicalHash, preparedAction, resultHash: "0".repeat(64), replayed: false, falseEffects: projectBrainAssistantFalseEffects() };
  const resultHash = sha256Canonical({ ...core, resultHash: undefined });
  const result = projectBrainPrepareActionResultSchema.parse({ ...core, resultHash });
  await tx.constructionProjectBrainPreparedActionBinding.create({ data: {
    id: bindingId, workspaceId: command.workspaceId, projectId: command.projectId, understandingReviewId: memory.reviewId,
    confirmedUnderstandingSnapshotId: memory.snapshotId, confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence,
    memoryCanonicalHash: memory.memoryCanonicalHash, family: command.family, familyEntityId: prepared.familyEntityId,
    familyEntityVersion: prepared.familyEntityVersion, payloadFingerprint: prepared.payloadFingerprint,
    recipientContactId: contact.id, recipientDisplayName: contact.displayName, recipientRef: prepared.recipientRef,
    channel: command.channel, subject: prepared.subject, body: prepared.body,
    frozenContentHash: sha256Canonical({ subject: prepared.subject, body: prepared.body }), status: "PREPARED_UNSENT",
    approvalRequired: true, requiredApprovingRole: prepared.requiredApprovingRole, commandId: command.commandId,
    commandHash, actorUserId: userId, citations: { create: citationCreateData(memory, citations) },
  } });
  await tx.constructionProjectBrainAssistantDecision.create({ data: { id: randomUUID(), workspaceId: command.workspaceId, projectId: command.projectId, commandId: command.commandId, commandHash, action: command.action, family: command.family, confirmedUnderstandingSequence: memory.confirmedUnderstandingSequence, memoryCanonicalHash: memory.memoryCanonicalHash, entityId: bindingId, resultHash, outcome: "PREPARED_UNSENT", actorUserId: userId } });
  return result;
}

function citationFromRow(row: { ordinal: number; citationKind: string; confirmedUnderstandingSnapshotId: string; confirmationDecisionId: string; dispositionId: string | null; resolutionId: string | null; candidateId: string | null; candidateBatchId: string; intakeId: string; confirmedIntakeSnapshotId: string | null; sourceId: string | null; provenanceFingerprint: string }): ProjectBrainMemoryCitation {
  return projectBrainMemoryCitationSchema.parse({ ordinal: row.ordinal, citationKind: row.citationKind, understandingSnapshotId: row.confirmedUnderstandingSnapshotId, confirmationDecisionId: row.confirmationDecisionId, dispositionId: row.dispositionId, resolutionId: row.resolutionId, candidateId: row.candidateId, candidateBatchId: row.candidateBatchId, intakeId: row.intakeId, confirmedIntakeSnapshotId: row.confirmedIntakeSnapshotId, sourceId: row.sourceId, provenanceFingerprint: row.provenanceFingerprint });
}

function projectionFromBinding(binding: { id: string; family: string; familyEntityId: string; familyEntityVersion: number; payloadFingerprint: string; recipientContactId: string; recipientDisplayName: string; recipientRef: string; channel: string; subject: string | null; body: string; status: string; approvalRequired: boolean; requiredApprovingRole: string; citations: Array<Parameters<typeof citationFromRow>[0]> }) {
  return projectBrainPreparedActionProjectionSchema.parse({ bindingId: binding.id, family: binding.family, familyEntityId: binding.familyEntityId, familyEntityVersion: binding.familyEntityVersion, payloadFingerprint: binding.payloadFingerprint, recipientContactId: binding.recipientContactId, recipientDisplayName: binding.recipientDisplayName, recipientRef: binding.recipientRef, channel: binding.channel, subject: binding.subject, body: binding.body, status: binding.status, approvalRequired: binding.approvalRequired, requiredApprovingRole: binding.requiredApprovingRole, citations: binding.citations.map(citationFromRow) });
}

async function replayExisting(tx: Tx, command: ProjectBrainAssistantCommand, commandHash: string): Promise<ProjectBrainAssistantCommandResult | null> {
  const decision = await tx.constructionProjectBrainAssistantDecision.findUnique({ where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } } });
  if (!decision) return null;
  if (decision.commandHash !== commandHash || decision.projectId !== command.projectId || decision.action !== command.action) throw new Error("PROJECT_BRAIN_MEMORY_COMMAND_CONFLICT");
  await loadConfirmedMemoryByReview(tx, { workspaceId: decision.workspaceId, projectId: decision.projectId, reviewId: command.action === "RECALL_CONFIRMED_PROJECT_MEMORY"
    ? (await tx.constructionProjectBrainRecallReceipt.findUniqueOrThrow({ where: { id: decision.entityId }, select: { understandingReviewId: true } })).understandingReviewId
    : (await tx.constructionProjectBrainPreparedActionBinding.findUniqueOrThrow({ where: { id: decision.entityId }, select: { understandingReviewId: true } })).understandingReviewId });
  if (command.action === "RECALL_CONFIRMED_PROJECT_MEMORY") {
    const receipt = await tx.constructionProjectBrainRecallReceipt.findUnique({ where: { id: decision.entityId } });
    if (!receipt || receipt.commandHash !== commandHash || receipt.resultHash !== decision.resultHash) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
    const stored = projectBrainRecallResultSchema.parse(receipt.result);
    if (stored.resultHash !== receipt.resultHash || sha256Canonical({ ...stored, resultHash: undefined }) !== receipt.resultHash) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
    return projectBrainRecallResultSchema.parse({ ...stored, replayed: true });
  }
  const binding = await tx.constructionProjectBrainPreparedActionBinding.findUnique({ where: { id: decision.entityId }, include: { citations: { orderBy: { ordinal: "asc" } } } });
  if (!binding || binding.commandHash !== commandHash) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  const preparedAction = projectionFromBinding(binding);
  const result = projectBrainPrepareActionResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, action: command.action, workspaceId: binding.workspaceId, projectId: binding.projectId, confirmedUnderstandingSequence: binding.confirmedUnderstandingSequence, confirmedUnderstandingSnapshotId: binding.confirmedUnderstandingSnapshotId, memoryCanonicalHash: binding.memoryCanonicalHash, preparedAction, resultHash: decision.resultHash, replayed: false, falseEffects: projectBrainAssistantFalseEffects() });
  if (sha256Canonical({ ...result, resultHash: undefined }) !== decision.resultHash) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
  return projectBrainPrepareActionResultSchema.parse({ ...result, replayed: true });
}

export async function applyProjectBrainAssistantCommandForUser(input: { userId: string; command: ProjectBrainAssistantCommand | unknown }): Promise<ProjectBrainAssistantCommandResult> {
  const command = projectBrainAssistantCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return serialize(`${command.workspaceId}:${command.commandId}`, async () => prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r36y:${command.workspaceId}:${command.commandId}`}, 0))::text AS acquired`);
    await requireMemoryManager(tx, input.userId, command.workspaceId);
    const replay = await replayExisting(tx, command, commandHash);
    if (replay) return replay;
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r36y:project:${command.workspaceId}:${command.projectId}`}, 0))::text AS acquired`);
    const memory = await loadCurrentConfirmedMemory(tx, command);
    assertExpectedCurrent(command, memory);
    const result = command.action === "RECALL_CONFIRMED_PROJECT_MEMORY"
      ? await persistRecall(tx, input.userId, command, commandHash, memory)
      : await persistPreparedAction(tx, input.userId, command, commandHash, memory);
    return projectBrainAssistantCommandResultSchema.parse(result);
  }, TRANSACTION));
}

export async function projectBrainAssistantMemoryForUser(input: { userId: string; workspaceId: string; projectId: string }): Promise<ProjectBrainAssistantMemoryProjection> {
  return prisma.$transaction(async (tx) => {
    await requireMemoryManager(tx, input.userId, input.workspaceId);
    const project = await tx.constructionProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, status: "active" }, select: { id: true } });
    if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const current = await loadCurrentConfirmedMemory(tx, input).catch((error) => {
      if (error instanceof Error && error.message === "PROJECT_BRAIN_CONFIRMED_MEMORY_UNAVAILABLE") return null;
      throw error;
    });
    const [receipts, bindings] = await Promise.all([
      tx.constructionProjectBrainRecallReceipt.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
      tx.constructionProjectBrainPreparedActionBinding.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId }, include: { citations: { orderBy: { ordinal: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
    ]);
    const recallHistory = receipts.map((receipt) => {
      const result = projectBrainRecallResultSchema.parse(receipt.result);
      if (receipt.resultHash !== result.resultHash || sha256Canonical({ ...result, resultHash: undefined }) !== result.resultHash) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE");
      return result;
    });
    const preparedActions = bindings.map(projectionFromBinding);
    return projectBrainAssistantMemoryProjectionSchema.parse({
      schemaVersion: 1, workspaceId: input.workspaceId, projectId: input.projectId,
      currentMemory: current ? { confirmedUnderstandingSequence: current.confirmedUnderstandingSequence, confirmedUnderstandingSnapshotId: current.snapshotId, memoryCanonicalHash: current.memoryCanonicalHash, supportedQuestions: PROJECT_BRAIN_MEMORY_QUESTIONS } : null,
      recallHistory, preparedActions, falseEffects: projectBrainAssistantFalseEffects(),
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
