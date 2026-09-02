import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  onboardingCockpitForUser,
  processOnboardingCommand,
} from "@/server/construction-operating-assistant-r32/onboarding";

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      name: `R32 ${label}`,
      email: `r32-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
}

async function firstValue(label: string) {
  const owner = await createUser(`${label}-owner`);
  const initializeCommand = {
    schemaVersion: 1 as const,
    action: "INITIALIZE_WORKSPACE" as const,
    commandId: crypto.randomUUID(),
    name: `R32 ${label}`,
    timezone: "America/Toronto",
    locale: "fr-CA" as const,
  };
  const initialized = await processOnboardingCommand({ userId: owner.id, command: initializeCommand });
  if (initialized.resultType !== "WORKSPACE") throw new Error("R32_WORKSPACE_REQUIRED");
  const initializeReplay = await processOnboardingCommand({ userId: owner.id, command: initializeCommand });
  expect(initializeReplay).toMatchObject({ resultType: "WORKSPACE", workspaceId: initialized.workspaceId, replayed: true });
  await expect(processOnboardingCommand({ userId: owner.id, command: { ...initializeCommand, name: "Collision" } })).rejects.toThrow("ONBOARDING_COMMAND_IDEMPOTENCY_CONFLICT");

  const project = await processOnboardingCommand({ userId: owner.id, command: {
    schemaVersion: 1, action: "CREATE_FIRST_PROJECT", commandId: crypto.randomUUID(),
    workspaceId: initialized.workspaceId, code: `R32-${label}`, name: `Chantier ${label}`,
  } });
  if (project.resultType !== "PROJECT") throw new Error("R32_PROJECT_REQUIRED");
  const contact = await processOnboardingCommand({ userId: owner.id, command: {
    schemaVersion: 1, action: "CREATE_FIRST_CONTACT", commandId: crypto.randomUUID(),
    workspaceId: initialized.workspaceId, projectId: project.projectId, displayName: "Marc",
    role: "Fournisseur", phone: "+15555550184", email: "marc@example.invalid",
  } });
  if (contact.resultType !== "CONTACT") throw new Error("R32_CONTACT_REQUIRED");
  expect(contact.firstValueReady).toBe(true);
  return { ownerId: owner.id, workspaceId: initialized.workspaceId, projectId: project.projectId, contactId: contact.contactId };
}

describe("R32 onboarding and bounded import on disposable PostgreSQL", () => {
  it("reaches first value without a connector and keeps owner commands exactly idempotent", async () => {
    const fixture = await firstValue("FIRST");
    const cockpit = await onboardingCockpitForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId });
    expect(cockpit).toMatchObject({ role: "OWNER", externalEffectCount: 0, providerObserved: false });
    if (cockpit.role === "FIELD_WORKER") throw new Error("R32_OWNER_REQUIRED");
    expect(cockpit.projects).toHaveLength(1);
    expect(cockpit.contacts).toHaveLength(1);
    expect(cockpit.session?.firstValueReady).toBe(true);
    expect(await prisma.constructionOnboardingSession.count({ where: { ownerUserId: fixture.ownerId } })).toBe(1);
  });

  it("previews without canonical writes, resolves duplicates, commits atomically once and resumes exactly", async () => {
    const fixture = await firstValue("IMPORT");
    const csvText = [
      "display_name,role,phone,email,project_code",
      "Marc,Fournisseur,+15555550184,marc@example.invalid,R32-IMPORT",
      "Jean,Plombier,+15555550185,jean@example.invalid,R32-IMPORT",
    ].join("\n");
    const beforeCount = await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId } });
    const preview = () => processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "PREVIEW_IMPORT", commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId, kind: "CONTACTS_CSV", csvText,
    } });
    // Prisma Dev multiplexes backend sessions and cannot issue concurrent SET
    // TRANSACTION statements. The proportional direct-Postgres gate opts into
    // actual concurrency; the routine disposable proxy gate stays sequential.
    const previews = process.env.R32_DIRECT_POSTGRES_CONCURRENCY === "1"
      ? await Promise.all([preview(), preview()])
      : [await preview(), await preview()];
    for (const preview of previews) expect(preview).toMatchObject({ resultType: "IMPORT_PREVIEW", rowCount: 2, counts: { ready: 1, duplicate: 1, conflict: 0, invalid: 0 }, externalEffectCount: 0 });
    if (previews[0].resultType !== "IMPORT_PREVIEW" || previews[1].resultType !== "IMPORT_PREVIEW") throw new Error("R32_PREVIEW_REQUIRED");
    expect(previews[1].batchId).toBe(previews[0].batchId);
    expect(await prisma.constructionImportBatch.count({ where: { workspaceId: fixture.workspaceId } })).toBe(1);
    expect(await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId } })).toBe(beforeCount);
    expect(JSON.stringify(await prisma.constructionImportBatch.findUniqueOrThrow({ where: { id: previews[0].batchId } }))).not.toContain(csvText);

    const previewCockpit = await onboardingCockpitForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId });
    if (previewCockpit.role === "FIELD_WORKER" || !previewCockpit.activeBatch) throw new Error("R32_ACTIVE_BATCH_REQUIRED");
    const duplicate = previewCockpit.activeBatch.rows.find((row) => row.state === "DUPLICATE");
    if (!duplicate?.candidateCanonicalIds[0]) throw new Error("R32_DUPLICATE_CANDIDATE_REQUIRED");
    const decision = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId, batchId: previewCockpit.activeBatch.id, rowId: duplicate.id,
      expectedBatchVersion: previewCockpit.activeBatch.stateVersion, decision: "USE_EXISTING",
      matchedCanonicalId: duplicate.candidateCanonicalIds[0],
    } });
    if (decision.resultType !== "IMPORT_DECISION") throw new Error("R32_DECISION_REQUIRED");
    const commitCommand = {
      schemaVersion: 1 as const, action: "COMMIT_IMPORT" as const, commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId, batchId: previewCockpit.activeBatch.id,
      expectedBatchVersion: decision.batchVersion, sourceHash: previews[0].sourceHash,
      previewFingerprint: previews[0].previewFingerprint,
    };
    const committed = await processOnboardingCommand({ userId: fixture.ownerId, command: commitCommand });
    const replayed = await processOnboardingCommand({ userId: fixture.ownerId, command: commitCommand });
    expect(committed).toMatchObject({ resultType: "IMPORT_COMMIT", status: "COMMITTED", createdContactIds: [expect.any(String)], reusedCanonicalIds: [fixture.contactId], replayed: false, externalEffectCount: 0 });
    expect(replayed).toMatchObject({ resultType: "IMPORT_COMMIT", status: "COMMITTED", replayed: true });
    expect(await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId } })).toBe(beforeCount + 1);
    expect(await prisma.constructionImportCommit.count({ where: { workspaceId: fixture.workspaceId } })).toBe(1);
    await expect(processOnboardingCommand({ userId: fixture.ownerId, command: { ...commitCommand, commandId: crypto.randomUUID() } })).rejects.toThrow("ONBOARDING_IMPORT_STALE_PREVIEW");
    await expect(processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "PREVIEW_IMPORT", commandId: crypto.randomUUID(), workspaceId: fixture.workspaceId,
      kind: "CONTACTS_CSV", csvText,
    } })).rejects.toThrow("ONBOARDING_IMPORT_SOURCE_ALREADY_TERMINAL");

    const beforeRestart = await onboardingCockpitForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId });
    await prisma.$disconnect();
    await prisma.$connect();
    const afterRestart = await onboardingCockpitForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId });
    expect({ ...afterRestart, generatedAt: undefined }).toEqual({ ...beforeRestart, generatedAt: undefined });
  });

  it("rolls back every canonical write when one preview row becomes stale", async () => {
    const fixture = await firstValue("ROLLBACK");
    const csvText = [
      "display_name,role,phone,email,project_code",
      "Jean,Plombier,+15555550190,jean-rollback@example.invalid,R32-ROLLBACK",
      "Paul,Électricien,+15555550191,paul-rollback@example.invalid,R32-ROLLBACK",
    ].join("\n");
    const preview = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "PREVIEW_IMPORT", commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId, kind: "CONTACTS_CSV", csvText,
    } });
    if (preview.resultType !== "IMPORT_PREVIEW") throw new Error("R32_PREVIEW_REQUIRED");
    expect(preview.nextAction).toBe("COMMIT_IMPORT");
    await prisma.constructionContact.create({ data: {
      workspaceId: fixture.workspaceId, projectId: fixture.projectId, displayName: "Paul externe",
      role: "Électricien", normalizedPhone: "+15555550191", normalizedEmail: "paul-external@example.invalid",
    } });
    const countBeforeCommit = await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId } });
    await expect(processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "COMMIT_IMPORT", commandId: crypto.randomUUID(), workspaceId: fixture.workspaceId,
      batchId: preview.batchId, expectedBatchVersion: preview.batchVersion,
      sourceHash: preview.sourceHash, previewFingerprint: preview.previewFingerprint,
    } })).rejects.toThrow("ONBOARDING_IMPORT_CANONICAL_STATE_CHANGED");
    expect(await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId } })).toBe(countBeforeCommit);
    expect(await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId, displayName: "Jean" } })).toBe(0);
    expect(await prisma.constructionImportCommit.count({ where: { workspaceId: fixture.workspaceId } })).toBe(0);
  });

  it("allows one explicit create-new decision for a within-file ambiguity", async () => {
    const fixture = await firstValue("CREATE-NEW");
    const csvText = [
      "display_name,role,phone,email,project_code",
      "Alex,Charpentier,+15555550192,alex@example.invalid,R32-CREATE-NEW",
      "Alex,Charpentier,+15555550192,alex@example.invalid,R32-CREATE-NEW",
    ].join("\n");
    const preview = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "PREVIEW_IMPORT", commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId, kind: "CONTACTS_CSV", csvText,
    } });
    if (preview.resultType !== "IMPORT_PREVIEW") throw new Error("R32_PREVIEW_REQUIRED");
    expect(preview.counts).toEqual({ ready: 0, duplicate: 0, conflict: 2, invalid: 0 });
    const cockpit = await onboardingCockpitForUser({ userId: fixture.ownerId, workspaceId: fixture.workspaceId });
    if (cockpit.role === "FIELD_WORKER" || !cockpit.activeBatch) throw new Error("R32_ACTIVE_BATCH_REQUIRED");
    const [createRow, skipRow] = cockpit.activeBatch.rows;
    const createDecision = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: crypto.randomUUID(), workspaceId: fixture.workspaceId,
      batchId: preview.batchId, rowId: createRow.id, expectedBatchVersion: preview.batchVersion, decision: "CREATE_NEW",
    } });
    if (createDecision.resultType !== "IMPORT_DECISION") throw new Error("R32_DECISION_REQUIRED");
    const skipDecision = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "DECIDE_IMPORT_ROW", commandId: crypto.randomUUID(), workspaceId: fixture.workspaceId,
      batchId: preview.batchId, rowId: skipRow.id, expectedBatchVersion: createDecision.batchVersion, decision: "SKIP",
    } });
    if (skipDecision.resultType !== "IMPORT_DECISION") throw new Error("R32_DECISION_REQUIRED");
    const committed = await processOnboardingCommand({ userId: fixture.ownerId, command: {
      schemaVersion: 1, action: "COMMIT_IMPORT", commandId: crypto.randomUUID(), workspaceId: fixture.workspaceId,
      batchId: preview.batchId, expectedBatchVersion: skipDecision.batchVersion,
      sourceHash: preview.sourceHash, previewFingerprint: preview.previewFingerprint,
    } });
    expect(committed).toMatchObject({ resultType: "IMPORT_COMMIT", status: "COMMITTED", skippedCount: 1, createdContactIds: [expect.any(String)] });
    expect(await prisma.constructionContact.count({ where: { workspaceId: fixture.workspaceId, normalizedPhone: "+15555550192" } })).toBe(1);
  });

  it("refuses cross-workspace and field mutations while exposing a minimized field projection", async () => {
    const first = await firstValue("AUTH-A");
    const second = await firstValue("AUTH-B");
    const field = await createUser("field");
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: first.workspaceId, userId: field.id, role: "member", status: "active" } });
    await expect(processOnboardingCommand({ userId: first.ownerId, command: {
      schemaVersion: 1, action: "CREATE_FIRST_PROJECT", commandId: crypto.randomUUID(), workspaceId: second.workspaceId,
      code: "CROSS", name: "Cross workspace",
    } })).rejects.toThrow();
    await expect(processOnboardingCommand({ userId: field.id, command: {
      schemaVersion: 1, action: "CREATE_FIRST_PROJECT", commandId: crypto.randomUUID(), workspaceId: first.workspaceId,
      code: "FIELD", name: "Field mutation",
    } })).rejects.toThrow("ONBOARDING_OWNER_REQUIRED");
    const projection = await onboardingCockpitForUser({ userId: field.id, workspaceId: first.workspaceId });
    expect(projection).toMatchObject({ role: "FIELD_WORKER", providerObserved: false, externalEffectCount: 0 });
    for (const forbidden of ["activeBatch", "contacts", "sourceHash", "previewFingerprint", "normalizedPhone", "normalizedEmail", "rowCount"]) {
      expect(JSON.stringify(projection)).not.toContain(forbidden);
    }
  });
});
