import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteLocalObject } from "@/lib/storage-local";
import { opaqueContactMessagingRef } from "@/lib/construction-operating-assistant-r24/policy";
import {
  applyProjectBrainAssistantCommandForUser,
  projectBrainAssistantMemoryForUser,
} from "@/server/construction-operating-assistant-r36y/project-brain-assistant-memory";
import { admitProjectBrainSource, processProjectBrainIntakeCommand } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { generateProjectBrainFactCandidatesForUser } from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  applyProjectBrainUnderstandingCommandForUser,
  projectBrainUnderstandingForUser,
} from "@/server/construction-operating-assistant-r36x/project-brain-understanding-review";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function fixture(label: string) {
  const owner = await prisma.user.create({ data: { name: `R36Y owner ${label}`, email: `r36y-owner-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const field = await prisma.user.create({ data: { name: `R36Y field ${label}`, email: `r36y-field-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R36Y ${label}` });
  await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: `R36Y-${label}`, name: `Rénovation ${label}` });
  const contact = await createConstructionContact({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id, displayName: "Marc", normalizedPhone: "+15555550184" });
  const identityRef = opaqueContactMessagingRef({ workspaceId: workspace.workspaceId, contactId: contact.id });
  await prisma.constructionCommunicationIdentity.create({ data: { workspaceId: workspace.workspaceId, contactId: contact.id, channel: "sms", normalizedAddress: identityRef, verified: true, permissions: ["PROJECT_UPDATE", "MESSAGE"], status: "active" } });
  const voiceRef = `voice_${crypto.randomUUID()}`;
  const emailRef = `email_${crypto.randomUUID()}@example.invalid`;
  await prisma.constructionCommunicationIdentity.createMany({ data: [
    { workspaceId: workspace.workspaceId, contactId: contact.id, channel: "voice", normalizedAddress: voiceRef, verified: true, permissions: ["CALL"], status: "active" },
    { workspaceId: workspace.workspaceId, contactId: contact.id, channel: "email", normalizedAddress: emailRef, verified: true, permissions: ["COMMAND"], status: "active" },
  ] });
  await prisma.constructionMessagingPermission.create({ data: { workspaceId: workspace.workspaceId, contactId: contact.id, purpose: "service", consentStatus: "granted", suppressionStatus: "allowed", actorUserId: owner.id } });
  const emailAccount = await prisma.constructionEmailAccount.create({ data: { workspaceId: workspace.workspaceId, provider: "GOOGLE_GMAIL", accountRef: `account_${crypto.randomUUID()}`, mailboxScopeRef: `scope_${crypto.randomUUID()}`, capabilities: ["PREPARE_DRAFT"], status: "PREPARED_DISABLED", credentialStored: false, externalTransportEnabled: false, preparedByUserId: owner.id } });
  const loopMessage = await prisma.constructionMessage.create({ data: { workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id, direction: "inbound", channel: "portal", idempotencyKey: `r36y-loop-${crypto.randomUUID()}`, sender: `user:${owner.id}`, recipients: ["ENDVERA"], originalBody: "Preuve requise", normalizedBody: "Preuve requise", status: "interpreted", receivedAt: new Date() } });
  const openLoop = await prisma.constructionOpenLoop.create({ data: { workspaceId: workspace.workspaceId, projectId: project.id, openedByMessageId: loopMessage.id, desiredOutcome: "Obtenir la preuve", policyVersion: "r36y-local-v1", idempotencyKey: `r36y-loop-${crypto.randomUUID()}`, semanticKey: `r36y-semantic-${crypto.randomUUID()}`, nextResponsibleRole: "supplier", nextAction: "Demander la preuve", decisionHash: "a".repeat(64), stateVersion: 1 } });

  const base = () => ({ schemaVersion: 1 as const, commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id });
  const intake = await processProjectBrainIntakeCommand({ userId: owner.id, command: { ...base(), action: "CREATE_PROJECT_BRAIN_INTAKE" } });
  await processProjectBrainIntakeCommand({ userId: owner.id, command: { ...base(), action: "ADD_OWNER_BRIEF", intakeId: intake.intakeId, expectedStateVersion: 1, brief: { summary: "Dosseret terminé", scope: "Cuisine Laval", importantPeople: "Marc", importantDates: "Mardi 14 h", blockers: "Approbation écrite manquante", nextDecision: "Demander la preuve" } } });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await admitProjectBrainSource({ userId: owner.id, bytes, command: { ...base(), action: "ADMIT_PROJECT_BRAIN_SOURCE", intakeId: intake.intakeId, expectedStateVersion: 2, kind: "PHOTO", fileName: "preuve.png", mimeType: "image/png", sizeBytes: bytes.length, durationMs: null } });
  const proposed = await processProjectBrainIntakeCommand({ userId: owner.id, command: { ...base(), action: "SUBMIT_PROJECT_BRAIN_INTAKE", intakeId: intake.intakeId, expectedStateVersion: 3 } });
  await processProjectBrainIntakeCommand({ userId: owner.id, command: { ...base(), action: "CONFIRM_PROJECT_BRAIN_INTAKE", intakeId: intake.intakeId, expectedStateVersion: proposed.stateVersion, reviewFingerprint: proposed.reviewFingerprint! } });
  await generateProjectBrainFactCandidatesForUser({ userId: owner.id, command: { ...base(), action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES", intakeId: intake.intakeId, confirmedSnapshotHash: proposed.reviewFingerprint!, adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1" } });
  await applyProjectBrainUnderstandingCommandForUser({ userId: owner.id, command: { ...base(), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" } });
  let view = await projectBrainUnderstandingForUser({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id });
  for (const candidate of view.review!.candidates) {
    await applyProjectBrainUnderstandingCommandForUser({ userId: owner.id, command: { ...base(), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE", reviewId: view.review!.id, expectedStateVersion: view.review!.stateVersion, candidateId: candidate.id, disposition: "ACCEPT_AS_REVIEWED" } });
    view = await projectBrainUnderstandingForUser({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id });
  }
  const prepared = await applyProjectBrainUnderstandingCommandForUser({ userId: owner.id, command: { ...base(), action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING", reviewId: view.review!.id, expectedStateVersion: view.review!.stateVersion } });
  await applyProjectBrainUnderstandingCommandForUser({ userId: owner.id, command: { ...base(), action: "CONFIRM_PROJECT_BRAIN_UNDERSTANDING", reviewId: view.review!.id, expectedStateVersion: prepared.stateVersion, reviewFingerprint: prepared.reviewFingerprint! } });
  view = await projectBrainUnderstandingForUser({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id });
  const confirmedSequence = view.review?.confirmedUnderstandingSequence;
  const confirmedHash = view.review?.confirmedSnapshotHash;
  if (!confirmedSequence || !confirmedHash || view.review?.status !== "CONFIRMED") throw new Error("R36Y_FIXTURE_CONFIRMATION_FAILED");
  return { ownerId: owner.id, fieldId: field.id, workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id, sequence: confirmedSequence, hash: confirmedHash, voiceRef, emailRef, emailAccountId: emailAccount.id, openLoopId: openLoop.id };
}

const questions = ["PROJECT_SUMMARY", "PROJECT_SCOPE", "IMPORTANT_PEOPLE", "IMPORTANT_DATES", "BLOCKERS", "NEXT_DECISION", "REVIEWED_SOURCE_INVENTORY", "RESOLVED_CONTRADICTION_HISTORY"] as const;

describe("R36Y confirmed Project Brain assistant memory", () => {
  afterEach(async () => {
    const files = await prisma.file.findMany({ where: { storageKey: { startsWith: "project-brain-intake/" } }, select: { storageKey: true } });
    await Promise.all(files.map((file) => deleteLocalObject(file.storageKey).catch(() => undefined)));
  });

  it("answers the eight bounded questions from one exact confirmed pointer and survives restart", async () => {
    const f = await fixture("recall");
    for (const questionKind of questions) {
      const command = { schemaVersion: 1 as const, action: "RECALL_CONFIRMED_PROJECT_MEMORY" as const, commandId: crypto.randomUUID(), workspaceId: f.workspaceId, projectId: f.projectId, expectedConfirmedUnderstandingSequence: f.sequence, expectedMemoryCanonicalHash: f.hash, questionKind };
      const result = await applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command });
      if (result.action !== "RECALL_CONFIRMED_PROJECT_MEMORY") throw new Error("R36Y_RECALL_RESULT_MISMATCH");
      expect(result).toMatchObject({ action: command.action, memoryCanonicalHash: f.hash, replayed: false, falseEffects: { providerExecutionPerformed: false, binaryUnderstandingPerformed: false, externalTransportPerformed: false, externalWritePerformed: false, approvalPerformed: false, automaticResolutionPerformed: false } });
      const replay = await applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command });
      expect(replay).toMatchObject({ receiptId: result.receiptId, replayed: true });
    }
    expect(await prisma.constructionProjectBrainRecallReceipt.count({ where: { workspaceId: f.workspaceId } })).toBe(8);
    const before = await projectBrainAssistantMemoryForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    await prisma.$disconnect();
    const after = await projectBrainAssistantMemoryForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("prepares one cited SMS without approval or delivery and refuses drift, stale memory and field access", async () => {
    const f = await fixture("prepare");
    const command = { schemaVersion: 1 as const, action: "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION" as const, commandId: crypto.randomUUID(), workspaceId: f.workspaceId, projectId: f.projectId, expectedConfirmedUnderstandingSequence: f.sequence, expectedMemoryCanonicalHash: f.hash, family: "SMS_MMS" as const, recipientContactRef: f.contactId, channel: "SMS" as const, body: "Marc, apporte la preuve du dosseret.", citationSelections: [{ kind: "PROJECT_SUMMARY" as const }] };
    const raced = await Promise.all([applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command }), applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command })]);
    if (raced.some((item) => item.action !== "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION")) throw new Error("R36Y_PREPARE_RESULT_MISMATCH");
    const preparedResults = raced.filter((item): item is Extract<typeof item, { action: "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION" }> => item.action === "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION");
    expect(new Set(preparedResults.map((item) => item.preparedAction.bindingId))).toHaveLength(1);
    expect(preparedResults.some((item) => item.replayed)).toBe(true);
    expect(preparedResults[0].preparedAction).toMatchObject({ recipientDisplayName: "Marc", channel: "SMS", body: command.body, status: "PREPARED_UNSENT", approvalRequired: true });
    const common = { schemaVersion: 1 as const, action: "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION" as const, workspaceId: f.workspaceId, projectId: f.projectId, expectedConfirmedUnderstandingSequence: f.sequence, expectedMemoryCanonicalHash: f.hash, recipientContactRef: f.contactId, citationSelections: [{ kind: "PROJECT_SUMMARY" as const }] };
    const evidence = await applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command: { ...common, commandId: crypto.randomUUID(), family: "OPEN_LOOP_EVIDENCE_REQUEST", channel: "SMS", body: "Marc, peux-tu fournir la preuve?", openLoopId: f.openLoopId, expectedOpenLoopStateVersion: 1 } });
    const voice = await applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command: { ...common, commandId: crypto.randomUUID(), family: "VOICE_CALL", channel: "VOICE", body: "Demander à Marc la preuve du dosseret." } });
    const email = await applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command: { ...common, commandId: crypto.randomUUID(), family: "EMAIL", channel: "EMAIL", subject: "Preuve du dosseret", body: "Marc, peux-tu fournir la preuve du dosseret?", emailAccountId: f.emailAccountId, emailToRef: f.emailRef } });
    for (const result of [evidence, voice, email]) {
      if (result.action !== "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION") throw new Error("R36Y_FAMILY_RESULT_MISMATCH");
      expect(result.preparedAction).toMatchObject({ recipientDisplayName: "Marc", status: "PREPARED_UNSENT", approvalRequired: true });
      expect(result.preparedAction.citations).toHaveLength(1);
    }
    expect(await prisma.constructionProjectBrainPreparedActionBinding.count({ where: { workspaceId: f.workspaceId } })).toBe(4);
    expect(await prisma.constructionMessageDeliveryEvent.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    await expect(applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command: { ...command, body: "Texte modifié" } })).rejects.toThrow("PROJECT_BRAIN_MEMORY_COMMAND_CONFLICT");
    await expect(applyProjectBrainAssistantCommandForUser({ userId: f.ownerId, command: { ...command, commandId: crypto.randomUUID(), expectedMemoryCanonicalHash: "0".repeat(64) } })).rejects.toThrow("PROJECT_BRAIN_MEMORY_STALE_CURRENT_POINTER");
    await expect(projectBrainAssistantMemoryForUser({ userId: f.fieldId, workspaceId: f.workspaceId, projectId: f.projectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(prisma.$executeRawUnsafe(`UPDATE "ConstructionProjectBrainPreparedActionBinding" SET "body" = 'forged' WHERE "workspaceId" = $1`, f.workspaceId)).rejects.toThrow(/immutable/i);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "ConstructionProjectBrainAssistantDecision" WHERE "workspaceId" = $1`, f.workspaceId)).rejects.toThrow(/immutable/i);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE TABLE "ConstructionProjectBrainRecallReceipt" CASCADE`)).rejects.toThrow(/immutable/i);
  });
});
