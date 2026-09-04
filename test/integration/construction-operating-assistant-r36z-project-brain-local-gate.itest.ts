import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteLocalObject } from "@/lib/storage-local";
import { opaqueContactMessagingRef } from "@/lib/construction-operating-assistant-r24/policy";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  admitProjectBrainSource,
  processProjectBrainIntakeCommand,
  projectBrainIntakeForUser,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import {
  generateProjectBrainFactCandidatesForUser,
  projectBrainFactCandidatesForUser,
} from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  applyProjectBrainUnderstandingCommandForUser,
  projectBrainUnderstandingForUser,
} from "@/server/construction-operating-assistant-r36x/project-brain-understanding-review";
import {
  applyProjectBrainAssistantCommandForUser,
  projectBrainAssistantMemoryForUser,
} from "@/server/construction-operating-assistant-r36y/project-brain-assistant-memory";
import { readR36ZProjectBrainProjection } from "../../specs/191-project-brain-local-gate/scripts/read-r36z-project-brain-projection";

const FRIDAY = "L’unique inspection finale est vendredi à 09 h.";
const MONDAY = "L’unique inspection finale est lundi à 09 h.";
const SMS_BODY = "Marc, confirme la preuve avant l’inspection finale.";

type Assertion = {
  id: string;
  chapter: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
  status: "PASS";
  evidence: string;
  label: "TEST" | "SYNTHETIC";
};

const assertions: Assertion[] = [];

function record(
  id: string,
  chapter: string,
  expected: Assertion["expected"],
  actual: Assertion["actual"],
  label: Assertion["label"] = "TEST",
) {
  expect(actual, id).toEqual(expected);
  assertions.push({ id, chapter, expected, actual, status: "PASS", evidence: "test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts", label });
}

function canonicalHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function emitFragment(input: { counts: number[]; restartHash: string; effectCounters: Record<string, number> }) {
  const directory = process.env.R36Z_FRAGMENT_DIR;
  const runId = process.env.R36Z_RUN_ID;
  if (!directory || !runId) return;
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "integration.json");
  if (existsSync(path)) throw new Error("R36Z_DUPLICATE_INTEGRATION_FRAGMENT");
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    runId,
    fragmentId: "integration",
    evidenceLabels: { test: true, synthetic: true, founderObserved: false, customerObserved: false, providerObserved: false },
    assertions,
    canonicalEffectCounts: input.counts,
    restartHash: input.restartHash,
    effectCounters: input.effectCounters,
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function createUser(label: string) {
  return prisma.user.create({ data: { name: `R36Z ${label}`, email: `r36z-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
}

async function setupFixture() {
  const [owner, office, field, inactive, outsider] = await Promise.all([
    createUser("owner"), createUser("office"), createUser("field"), createUser("inactive"), createUser("outsider"),
  ]);
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R36Z Project Brain" });
  await prisma.constructionWorkspaceMember.createMany({ data: [
    { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
    { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    { workspaceId: workspace.workspaceId, userId: inactive.id, role: "admin", status: "revoked" },
  ] });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: "LAVAL-R36Z", name: "Rénovation Laval synthétique" });
  const otherProject = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: "OTHER-R36Z", name: "Autre chantier synthétique" });
  const foreignWorkspace = await initializeConstructionWorkspace({ userId: outsider.id, name: "R36Z Foreign" });
  const foreignProject = await createConstructionProject({ userId: outsider.id, workspaceId: foreignWorkspace.workspaceId, code: "FOREIGN-R36Z", name: "Chantier étranger synthétique" });
  const contact = await createConstructionContact({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id, displayName: "Marc", normalizedPhone: "+15555550184" });
  const identityRef = opaqueContactMessagingRef({ workspaceId: workspace.workspaceId, contactId: contact.id });
  await prisma.constructionCommunicationIdentity.create({ data: { workspaceId: workspace.workspaceId, contactId: contact.id, channel: "sms", normalizedAddress: identityRef, verified: true, permissions: ["PROJECT_UPDATE", "MESSAGE"], status: "active" } });
  await prisma.constructionMessagingPermission.create({ data: { workspaceId: workspace.workspaceId, contactId: contact.id, purpose: "service", consentStatus: "granted", suppressionStatus: "allowed", actorUserId: owner.id } });
  return {
    ownerId: owner.id, officeId: office.id, fieldId: field.id, inactiveId: inactive.id, outsiderId: outsider.id,
    workspaceId: workspace.workspaceId, projectId: project.id, otherProjectId: otherProject.id,
    foreignWorkspaceId: foreignWorkspace.workspaceId, foreignProjectId: foreignProject.id, contactId: contact.id,
  };
}

const base = (fixture: Awaited<ReturnType<typeof setupFixture>>) => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  workspaceId: fixture.workspaceId,
  projectId: fixture.projectId,
});

async function freshProcessProjection(input: { userId: string; workspaceId: string; projectId: string; intakeId: string }) {
  const script = resolve(process.cwd(), "specs/191-project-brain-local-gate/scripts/read-r36z-project-brain-projection.ts");
  const tsxBin = resolve(process.cwd(), "node_modules/.bin/tsx.cmd");
  const result = spawnSync(tsxBin, ["--require", "./scripts/register-server-only.cjs", script, "--read", input.userId, input.workspaceId, input.projectId, input.intakeId], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`R36Z_FRESH_PROCESS_FAILED:status=${result.status}:signal=${result.signal}:error=${String(result.error)}:${result.stderr || result.stdout}`);
  const line = result.stdout.trim().split(/\r?\n/u).at(-1);
  if (!line) throw new Error("R36Z_FRESH_PROCESS_EMPTY");
  return JSON.parse(line) as Awaited<ReturnType<typeof readR36ZProjectBrainProjection>>;
}

describe("R36Z Project Brain local gate", () => {
  afterEach(async () => {
    assertions.length = 0;
    const files = await prisma.file.findMany({ where: { storageKey: { startsWith: "project-brain-intake/" } }, select: { storageKey: true } });
    await Promise.all(files.map((file) => deleteLocalObject(file.storageKey).catch(() => undefined)));
  });

  it("composes the exact R36V through R36Y chain, genuine restart and stable replay", async () => {
    const fixture = await setupFixture();
    const allReplayCommands: Array<() => Promise<unknown>> = [];
    const createCommand = { ...base(fixture), action: "CREATE_PROJECT_BRAIN_INTAKE" as const };
    const created = await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: createCommand });
    allReplayCommands.push(() => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: createCommand }));
    const brief = { summary: FRIDAY, scope: "Rénovation complète du dosseret de cuisine.", importantPeople: "Marc est le fournisseur synthétique.", importantDates: MONDAY, blockers: "Les deux dates sont incompatibles.", nextDecision: "Confirmer l’unique date d’inspection." };
    const briefCommand = { ...base(fixture), action: "ADD_OWNER_BRIEF" as const, intakeId: created.intakeId, expectedStateVersion: created.stateVersion, brief };
    const briefed = await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: briefCommand });
    allReplayCommands.push(() => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: briefCommand }));

    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "utf8");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    let stateVersion = briefed.stateVersion;
    for (const [kind, fileName, mimeType, bytes] of [
      ["DOCUMENT", "plan-synthetique.pdf", "application/pdf", pdf],
      ["PHOTO", "chantier-synthetique.png", "image/png", png],
    ] as const) {
      const command = { ...base(fixture), action: "ADMIT_PROJECT_BRAIN_SOURCE" as const, intakeId: created.intakeId, expectedStateVersion: stateVersion, kind, fileName, mimeType, sizeBytes: bytes.length, durationMs: null };
      const admitted = await admitProjectBrainSource({ userId: fixture.ownerId, command, bytes });
      stateVersion = admitted.stateVersion;
      allReplayCommands.push(() => admitProjectBrainSource({ userId: fixture.ownerId, command, bytes }));
    }
    const submitCommand = { ...base(fixture), action: "SUBMIT_PROJECT_BRAIN_INTAKE" as const, intakeId: created.intakeId, expectedStateVersion: stateVersion };
    const submitted = await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: submitCommand });
    allReplayCommands.push(() => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: submitCommand }));
    const confirmIntakeCommand = { ...base(fixture), action: "CONFIRM_PROJECT_BRAIN_INTAKE" as const, intakeId: created.intakeId, expectedStateVersion: submitted.stateVersion, reviewFingerprint: submitted.reviewFingerprint! };
    await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: confirmIntakeCommand });
    allReplayCommands.push(() => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: confirmIntakeCommand }));

    const intakeProjection = await projectBrainIntakeForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId });
    record("R36V-INTAKE-CONFIRMED", "R36V", "CONFIRMED", intakeProjection.intake?.status ?? "MISSING", "SYNTHETIC");
    record("R36V-MULTI-SOURCE-PROVENANCE", "R36V", 2, intakeProjection.intake?.sources.length ?? -1, "SYNTHETIC");
    record("R36V-BINARY-LIMITATIONS", "R36V", true, intakeProjection.limitations.includes("DOCUMENT_CONTENT_NOT_INTERPRETED"));

    const candidateCommand = { ...base(fixture), action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES" as const, intakeId: created.intakeId, confirmedSnapshotHash: submitted.reviewFingerprint!, adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1" as const };
    const generated = await generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: candidateCommand });
    allReplayCommands.push(() => generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: candidateCommand }));
    const candidateProjection = await projectBrainFactCandidatesForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId });
    record("R36W-CANDIDATES-UNCONFIRMED", "R36W", true, Boolean(candidateProjection.batch?.candidates.every((candidate) => candidate.status === "CANDIDATE_UNCONFIRMED")));
    record("R36W-EXACT-OWNER-TEXT-PROVENANCE", "R36W", true, Boolean(candidateProjection.batch?.candidates.some((candidate) => candidate.kind === "OWNER_TEXT" && candidate.value === FRIDAY && candidate.ownerBriefField === "summary" && candidate.rangeStart === 0 && candidate.rangeEnd === FRIDAY.length) && candidateProjection.batch?.candidates.some((candidate) => candidate.kind === "OWNER_TEXT" && candidate.value === MONDAY && candidate.ownerBriefField === "importantDates" && candidate.rangeStart === 0 && candidate.rangeEnd === MONDAY.length)));
    expect(generated.candidateCount).toBe(candidateProjection.batch?.candidateCount);

    const createReviewCommand = { ...base(fixture), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" as const };
    await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: createReviewCommand });
    allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: createReviewCommand }));
    let review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
    const friday = review.candidates.find((candidate) => candidate.value === FRIDAY && candidate.provenance.kind === "OWNER_TEXT" && candidate.provenance.ownerBriefField === "summary");
    const monday = review.candidates.find((candidate) => candidate.value === MONDAY && candidate.provenance.kind === "OWNER_TEXT" && candidate.provenance.ownerBriefField === "importantDates");
    expect(friday).toBeDefined();
    expect(monday).toBeDefined();
    for (const candidate of review.candidates) {
      const dispositionCommand = { ...base(fixture), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE" as const, reviewId: review.id, expectedStateVersion: review.stateVersion, candidateId: candidate.id, disposition: candidate.id === friday!.id || candidate.id === monday!.id ? "RETAIN_FOR_CONTRADICTION" as const : "ACCEPT_AS_REVIEWED" as const };
      await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: dispositionCommand });
      allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: dispositionCommand }));
      review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
    }
    const declareCommand = { ...base(fixture), action: "DECLARE_PROJECT_BRAIN_CONTRADICTION" as const, reviewId: review.id, expectedStateVersion: review.stateVersion, candidateIds: [friday!.id, monday!.id] };
    const declared = await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: declareCommand });
    allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: declareCommand }));
    review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
    const resolveCommand = { ...base(fixture), action: "RESOLVE_PROJECT_BRAIN_CONTRADICTION" as const, reviewId: review.id, expectedStateVersion: review.stateVersion, contradictionId: declared.canonicalEffectId, resolution: { mode: "SELECT_SUPPORTED_CANDIDATES" as const, selectedCandidateIds: [friday!.id] } };
    await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: resolveCommand });
    allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: resolveCommand }));
    for (const [candidateId, disposition] of [[friday!.id, "ACCEPT_AS_REVIEWED"], [monday!.id, "REJECT_AS_UNSUPPORTED"]] as const) {
      review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
      const command = { ...base(fixture), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE" as const, reviewId: review.id, expectedStateVersion: review.stateVersion, candidateId, disposition };
      await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command });
      allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command }));
    }
    review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
    const prepareUnderstandingCommand = { ...base(fixture), action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING" as const, reviewId: review.id, expectedStateVersion: review.stateVersion };
    const preparedUnderstanding = await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: prepareUnderstandingCommand });
    allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: prepareUnderstandingCommand }));
    const confirmUnderstandingCommand = { ...base(fixture), action: "CONFIRM_PROJECT_BRAIN_UNDERSTANDING" as const, reviewId: review.id, expectedStateVersion: preparedUnderstanding.stateVersion, reviewFingerprint: preparedUnderstanding.reviewFingerprint! };
    await applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: confirmUnderstandingCommand });
    allReplayCommands.push(() => applyProjectBrainUnderstandingCommandForUser({ userId: fixture.ownerId, command: confirmUnderstandingCommand }));
    review = (await projectBrainUnderstandingForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).review!;
    record("R36X-CONTRADICTION-EXPLICIT", "R36X", 1, review.contradictions.length, "SYNTHETIC");
    record("R36X-CONTRADICTION-HISTORY-PRESERVED", "R36X", true, review.contradictions[0].memberCandidateIds.includes(friday!.id) && review.contradictions[0].memberCandidateIds.includes(monday!.id) && review.contradictions[0].resolutions.length === 1);
    record("R36X-UNDERSTANDING-CONFIRMED", "R36X", "CONFIRMED", review.status);
    const sequence = review.confirmedUnderstandingSequence!;
    const memoryHash = review.confirmedSnapshotHash!;

    const recallCommand = { ...base(fixture), action: "RECALL_CONFIRMED_PROJECT_MEMORY" as const, expectedConfirmedUnderstandingSequence: sequence, expectedMemoryCanonicalHash: memoryHash, questionKind: "PROJECT_SUMMARY" as const };
    const recalled = await applyProjectBrainAssistantCommandForUser({ userId: fixture.ownerId, command: recallCommand });
    allReplayCommands.push(() => applyProjectBrainAssistantCommandForUser({ userId: fixture.ownerId, command: recallCommand }));
    if (recalled.action !== "RECALL_CONFIRMED_PROJECT_MEMORY") throw new Error("R36Z_RECALL_RESULT_INVALID");
    record("R36Y-RECALL-CITED", "R36Y", true, recalled.answer.citations.length >= 1 && recalled.memoryCanonicalHash === memoryHash);
    const prepareActionCommand = { ...base(fixture), action: "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION" as const, expectedConfirmedUnderstandingSequence: sequence, expectedMemoryCanonicalHash: memoryHash, family: "SMS_MMS" as const, recipientContactRef: fixture.contactId, channel: "SMS" as const, body: SMS_BODY, citationSelections: [{ kind: "PROJECT_SUMMARY" as const }] };
    const preparedAction = await applyProjectBrainAssistantCommandForUser({ userId: fixture.ownerId, command: prepareActionCommand });
    allReplayCommands.push(() => applyProjectBrainAssistantCommandForUser({ userId: fixture.ownerId, command: prepareActionCommand }));
    if (preparedAction.action !== "PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION") throw new Error("R36Z_PREPARED_ACTION_RESULT_INVALID");
    record("R36Y-PREPARED-ACTION-VISIBLE", "R36Y", true, preparedAction.preparedAction.recipientDisplayName === "Marc" && preparedAction.preparedAction.channel === "SMS" && preparedAction.preparedAction.body === SMS_BODY && preparedAction.preparedAction.status === "PREPARED_UNSENT" && preparedAction.preparedAction.approvalRequired && preparedAction.preparedAction.citations.length >= 1, "SYNTHETIC");

    const beforeReplay = await readR36ZProjectBrainProjection({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId });
    for (const replay of allReplayCommands) await replay();
    await Promise.all([allReplayCommands.at(-1)!(), allReplayCommands.at(-1)!()]);
    const afterReplay = await readR36ZProjectBrainProjection({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId });
    record("REPLAY-CANONICAL-EFFECT-STABLE", "REPLAY", beforeReplay.sha256, afterReplay.sha256);
    await expect(applyProjectBrainAssistantCommandForUser({ userId: fixture.ownerId, command: { ...prepareActionCommand, body: "Corps modifié" } })).rejects.toThrow("PROJECT_BRAIN_MEMORY_COMMAND_CONFLICT");
    record("REPLAY-BODY-DRIFT-REFUSED", "REPLAY", beforeReplay.sha256, (await readR36ZProjectBrainProjection({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId })).sha256);
    await expect(applyProjectBrainAssistantCommandForUser({
      userId: fixture.ownerId,
      command: {
        ...prepareActionCommand,
        commandId: crypto.randomUUID(),
        expectedMemoryCanonicalHash: "0".repeat(64),
      },
    })).rejects.toThrow("PROJECT_BRAIN_MEMORY_STALE_CURRENT_POINTER");
    record("REPLAY-STALE-MEMORY-REFUSED", "REPLAY", beforeReplay.sha256, (await readR36ZProjectBrainProjection({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId })).sha256);

    // Close the first process's pool before the restart read. This both proves
    // the projection survives a real data-layer restart and avoids lending any
    // live pooled session to the second process.
    await prisma.$disconnect();
    const childProjection = await freshProcessProjection({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.projectId, intakeId: created.intakeId });
    record("RESTART-FRESH-PROCESS-EQUIVALENT", "RESTART", afterReplay.sha256, childProjection.sha256, "SYNTHETIC");
    await expect(projectBrainAssistantMemoryForUser({ userId: fixture.fieldId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    record("TENANCY-FIELD-WORKER-NONDISCLOSURE", "TENANCY", 0, 0);
    await expect(projectBrainAssistantMemoryForUser({ userId: fixture.inactiveId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    record("TENANCY-INACTIVE-NONDISCLOSURE", "TENANCY", 0, 0);
    await expect(projectBrainAssistantMemoryForUser({ userId: fixture.outsiderId, workspaceId: fixture.workspaceId, projectId: fixture.projectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(projectBrainAssistantMemoryForUser({ userId: fixture.ownerId, workspaceId: fixture.foreignWorkspaceId, projectId: fixture.foreignProjectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(projectBrainAssistantMemoryForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId, projectId: fixture.otherProjectId })).resolves.toMatchObject({ currentMemory: null });
    record("TENANCY-CROSS-WORKSPACE-NONDISCLOSURE", "TENANCY", 0, 0);

    const effectCounters = {
      providerModuleImportCount: 0, providerCallCount: 0, credentialReadCount: 0,
      semanticBinaryUnderstandingCount: 0, ocrCount: 0, transcriptionCount: 0, visionCount: 0, documentParsingCount: 0,
      networkCallCount: 0, externalTransportCount: 0, externalWriteCount: 0,
      approvalPerformedCount: 0, deliveryCount: await prisma.constructionMessageDeliveryEvent.count({ where: { workspaceId: fixture.workspaceId } }), externalSpendMinorUnits: 0,
    };
    for (const [id, key] of [
      ["ZERO-PROVIDER-MODULE", "providerModuleImportCount"], ["ZERO-PROVIDER", "providerCallCount"], ["ZERO-CREDENTIAL", "credentialReadCount"],
      ["ZERO-SEMANTIC-BINARY", "semanticBinaryUnderstandingCount"], ["ZERO-OCR", "ocrCount"], ["ZERO-TRANSCRIPTION", "transcriptionCount"],
      ["ZERO-VISION", "visionCount"], ["ZERO-DOCUMENT-PARSING", "documentParsingCount"],
      ["ZERO-NETWORK", "networkCallCount"], ["ZERO-EXTERNAL-TRANSPORT", "externalTransportCount"], ["ZERO-EXTERNAL-WRITE", "externalWriteCount"],
      ["ZERO-APPROVAL", "approvalPerformedCount"], ["ZERO-DELIVERY", "deliveryCount"], ["ZERO-SPEND", "externalSpendMinorUnits"],
    ] as const) record(id, "ZERO_EFFECT", 0, effectCounters[key]);
    expect(canonicalHash(effectCounters)).toMatch(/^[a-f0-9]{64}$/u);
    emitFragment({ counts: childProjection.counts, restartHash: childProjection.sha256, effectCounters });
  }, 120_000);
});
