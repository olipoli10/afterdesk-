import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  privacyCockpitForUser,
  processPrivacyCommand,
} from "@/server/construction-operating-assistant-r30/privacy";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const referenceNow = new Date("2026-09-02T06:30:00.000Z");

async function fixture(label: string) {
  const owner = await prisma.user.create({ data: { name: `R30 owner ${label}`, email: `r30-owner-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const admin = await prisma.user.create({ data: { name: `R30 office ${label}`, email: `r30-office-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const field = await prisma.user.create({ data: { name: `R30 field ${label}`, email: `r30-field-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const outsider = await prisma.user.create({ data: { name: `R30 outsider ${label}`, email: `r30-outsider-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R30 ${label}` });
  await prisma.constructionWorkspaceMember.createMany({ data: [
    { workspaceId: workspace.workspaceId, userId: admin.id, role: "admin", status: "active" },
    { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  ] });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: `R30-${label}`, name: `R30 ${label}` });
  const message = await prisma.constructionMessage.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, direction: "inbound", channel: "portal",
    idempotencyKey: crypto.randomUUID(), recipients: ["ENDVERA_LOCAL"], sender: `user:${owner.id}`,
    originalBody: "Preuve locale synthétique.", normalizedBody: "Preuve locale synthétique.", status: "received",
  } });
  const loop = await prisma.constructionOpenLoop.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, openedByMessageId: message.id,
    desiredOutcome: "Dossier local", idempotencyKey: crypto.randomUUID(), semanticKey: crypto.randomUUID(),
    nextResponsibleRole: "OWNER", nextAction: "Inspecter", decisionHash: "a".repeat(64), policyVersion: "r30-test",
  } });
  const eligible = await prisma.constructionOpenLoopEvidence.create({ data: {
    loopId: loop.id, workspaceId: workspace.workspaceId, projectId: project.id,
    evidenceKey: crypto.randomUUID(), kind: "photo", state: "present_unverified",
    sourceRef: "synthetic:r30:eligible", contentHash: "b".repeat(64), createdAt: new Date("2020-01-01T00:00:00.000Z"),
  } });
  const held = await prisma.constructionOpenLoopEvidence.create({ data: {
    loopId: loop.id, workspaceId: workspace.workspaceId, projectId: project.id,
    evidenceKey: crypto.randomUUID(), kind: "written_approval", state: "verified",
    sourceRef: "synthetic:r30:held", contentHash: "c".repeat(64), createdAt: new Date("2020-01-01T00:00:00.000Z"),
  } });
  return {
    ownerId: owner.id, adminId: admin.id, fieldId: field.id, outsiderId: outsider.id,
    workspaceId: workspace.workspaceId, projectId: project.id, eligibleEvidenceId: eligible.id, heldEvidenceId: held.id,
  };
}

async function activateBaseline(userId: string, workspaceId: string) {
  const createCommand = {
    schemaVersion: 1 as const, action: "CREATE_POLICY_DRAFT" as const, commandId: crypto.randomUUID(),
    workspaceId, sourcePolicySetId: null, expectedSourceStateVersion: null,
  };
  const draft = await processPrivacyCommand({ userId, command: createCommand, referenceNow });
  if (draft.resultType !== "POLICY_SET") throw new Error("R30_POLICY_RESULT_REQUIRED");
  const active = await processPrivacyCommand({ userId, command: {
    schemaVersion: 1, action: "ACTIVATE_POLICY_SET", commandId: crypto.randomUUID(), workspaceId,
    policySetId: draft.policySetId, expectedStateVersion: draft.stateVersion, expectedPolicyHash: draft.policyHash,
  }, referenceNow });
  if (active.resultType !== "POLICY_SET") throw new Error("R30_POLICY_RESULT_REQUIRED");
  return { createCommand, draft, active };
}

describe("R30 tenant privacy on disposable PostgreSQL", () => {
  it("creates, activates and exactly replays a complete owner-only policy", async () => {
    const f = await fixture("POLICY");
    const lifecycle = await activateBaseline(f.ownerId, f.workspaceId);
    expect(lifecycle.active).toMatchObject({ status: "ACTIVE", ruleCount: 8, externalEffectCount: 0 });
    const replay = await processPrivacyCommand({ userId: f.ownerId, command: lifecycle.createCommand, referenceNow });
    expect(replay).toMatchObject({ resultType: "POLICY_SET", policySetId: lifecycle.draft.policySetId, replayed: true });
    await expect(processPrivacyCommand({ userId: f.ownerId, command: { ...lifecycle.createCommand, sourcePolicySetId: lifecycle.active.policySetId, expectedSourceStateVersion: lifecycle.active.stateVersion }, referenceNow })).rejects.toThrow("PRIVACY_COMMAND_IDEMPOTENCY_CONFLICT");
    await expect(processPrivacyCommand({ userId: f.adminId, command: { ...lifecycle.createCommand, commandId: crypto.randomUUID() }, referenceNow })).rejects.toThrow();
  });

  it("isolates tenant inventory/export, survives reconnect and minimizes field output", async () => {
    const f = await fixture("INVENTORY");
    const other = await fixture("OTHER");
    const { active } = await activateBaseline(f.ownerId, f.workspaceId);
    const command = {
      schemaVersion: 1 as const, action: "PREPARE_EXPORT_MANIFEST" as const, commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId, expectedPolicySetId: active.policySetId, expectedPolicySetVersion: active.policySetVersion,
    };
    const exported = await processPrivacyCommand({ userId: f.ownerId, command, referenceNow });
    const replay = await processPrivacyCommand({ userId: f.ownerId, command, referenceNow: new Date("2029-01-01T00:00:00.000Z") });
    expect(exported).toMatchObject({ resultType: "EXPORT_MANIFEST", replayed: false, externalEffectCount: 0 });
    expect(replay).toMatchObject({ resultType: "EXPORT_MANIFEST", replayed: true });
    if (exported.resultType !== "EXPORT_MANIFEST" || replay.resultType !== "EXPORT_MANIFEST") throw new Error("R30_EXPORT_REQUIRED");
    expect(replay.manifestFingerprint).toBe(exported.manifestFingerprint);
    expect(exported.inventory).toHaveLength(8);
    await expect(processPrivacyCommand({ userId: other.ownerId, command: { ...command, commandId: crypto.randomUUID() }, referenceNow })).rejects.toThrow();

    const owner = await privacyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow });
    const office = await privacyCockpitForUser({ userId: f.adminId, workspaceId: f.workspaceId, referenceNow });
    const field = await privacyCockpitForUser({ userId: f.fieldId, workspaceId: f.workspaceId, referenceNow });
    expect(owner.role).toBe("OWNER");
    expect(office.role).toBe("OFFICE_MANAGER");
    expect(field).toEqual({ schemaVersion: 1, generatedAt: referenceNow.toISOString(), workspace: { id: f.workspaceId, name: "R30 INVENTORY" }, role: "FIELD_WORKER", ownAccess: { membershipStatus: "ACTIVE", accessClass: "PROJECT_ASSIGNED_ONLY", canManagePrivacy: false }, externalEffectCount: 0 });
    for (const forbidden of ["inventory", "policyHash", "targetId", "amountMinor", "credentialRef", "storageKey", "sourceRef"]) expect(JSON.stringify(field)).not.toContain(forbidden);
    await expect(privacyCockpitForUser({ userId: f.outsiderId, workspaceId: f.workspaceId, referenceNow })).rejects.toThrow();

    await prisma.$disconnect();
    await prisma.$connect();
    expect(await privacyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow })).toEqual(owner);
  });

  it("retains held evidence and creates exactly one eligible local tombstone", async () => {
    const f = await fixture("DELETE");
    const { active } = await activateBaseline(f.ownerId, f.workspaceId);
    const base = { schemaVersion: 1 as const, action: "REQUEST_DELETION" as const, workspaceId: f.workspaceId, expectedPolicySetId: active.policySetId, expectedPolicySetVersion: active.policySetVersion, targetType: "OPEN_LOOP_EVIDENCE" as const };
    const blocked = await processPrivacyCommand({ userId: f.ownerId, command: { ...base, commandId: crypto.randomUUID(), targetId: f.heldEvidenceId }, referenceNow });
    expect(blocked).toMatchObject({ resultType: "DELETION_REQUEST", status: "BLOCKED", localTombstoneCreated: false, reasonCodes: ["LEGAL_OR_OPERATIONAL_HOLD"] });
    await expect(processPrivacyCommand({ userId: f.ownerId, command: { ...base, commandId: crypto.randomUUID(), targetId: f.heldEvidenceId }, referenceNow })).rejects.toThrow("PRIVACY_DELETION_ALREADY_ACTIVE");

    const eligible = await processPrivacyCommand({ userId: f.ownerId, command: { ...base, commandId: crypto.randomUUID(), targetId: f.eligibleEvidenceId }, referenceNow });
    if (eligible.resultType !== "DELETION_REQUEST") throw new Error("R30_DELETION_REQUIRED");
    expect(eligible).toMatchObject({ status: "ELIGIBLE", localTombstoneCreated: false });
    const approval = {
      schemaVersion: 1 as const, action: "APPROVE_DELETION" as const, commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      deletionRequestId: eligible.deletionRequestId, expectedStateVersion: eligible.stateVersion, expectedEligibilityFingerprint: eligible.eligibilityFingerprint,
    };
    const tombstoned = await processPrivacyCommand({ userId: f.ownerId, command: approval, referenceNow });
    const replay = await processPrivacyCommand({ userId: f.ownerId, command: approval, referenceNow });
    expect(tombstoned).toMatchObject({ status: "TOMBSTONED", localTombstoneCreated: true, externalDeletionState: "EXTERNAL_DELETION_PENDING", externalEffectCount: 0 });
    expect(replay).toMatchObject({ status: "TOMBSTONED", replayed: true });
    await expect(processPrivacyCommand({ userId: f.ownerId, command: { ...approval, commandId: crypto.randomUUID() }, referenceNow })).rejects.toThrow("PRIVACY_DELETION_NOT_ELIGIBLE");
    expect(await prisma.constructionPrivacyTombstone.count({ where: { workspaceId: f.workspaceId, targetId: f.eligibleEvidenceId } })).toBe(1);
  });

  it("serializes concurrent policy activation and preserves one active version", async () => {
    const f = await fixture("CONCURRENT");
    const first = await processPrivacyCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "CREATE_POLICY_DRAFT", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, sourcePolicySetId: null, expectedSourceStateVersion: null }, referenceNow });
    const second = await processPrivacyCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "CREATE_POLICY_DRAFT", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, sourcePolicySetId: null, expectedSourceStateVersion: null }, referenceNow });
    if (first.resultType !== "POLICY_SET" || second.resultType !== "POLICY_SET") throw new Error("R30_POLICY_RESULT_REQUIRED");
    await Promise.all([
      processPrivacyCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "ACTIVATE_POLICY_SET", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, policySetId: first.policySetId, expectedStateVersion: first.stateVersion, expectedPolicyHash: first.policyHash }, referenceNow }),
      processPrivacyCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "ACTIVATE_POLICY_SET", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, policySetId: second.policySetId, expectedStateVersion: second.stateVersion, expectedPolicyHash: second.policyHash }, referenceNow }),
    ]);
    expect(await prisma.constructionPrivacyPolicySet.count({ where: { workspaceId: f.workspaceId, status: "ACTIVE" } })).toBe(1);
    expect(await prisma.constructionPrivacyPolicySet.count({ where: { workspaceId: f.workspaceId, status: "SUPERSEDED" } })).toBe(1);
  });

  it("reports opaque secret lifecycle without exposing refs or claiming provider effects", async () => {
    const f = await fixture("SECRETS");
    await activateBaseline(f.ownerId, f.workspaceId);
    await prisma.constructionConnectorAccount.create({ data: {
      workspaceId: f.workspaceId, provider: "google_calendar",
      externalAccountKeyHash: "d".repeat(64), credentialRef: "opaque:r30:not-a-secret", status: "connected",
      createdByUserId: f.ownerId,
    } });
    const cockpit = await privacyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow });
    expect(cockpit.role).toBe("OWNER");
    if (cockpit.role !== "OWNER") throw new Error("R30_OWNER_REQUIRED");
    expect(cockpit.secretLifecycle).toMatchObject({ opaqueReference: 1, externallyRevokedVerified: 0 });
    expect(JSON.stringify(cockpit)).not.toContain("opaque:r30:not-a-secret");
    expect(cockpit.externalEffectCount).toBe(0);
  });
});
