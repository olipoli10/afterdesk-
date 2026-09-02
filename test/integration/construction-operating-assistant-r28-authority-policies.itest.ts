import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  authorityPolicyCockpitForUser,
  decideAuthorityEvaluation,
  evaluateActionAuthority,
  processAuthorityPolicyCommand,
} from "@/server/construction-operating-assistant-r28/authority-policies";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const future = "2027-09-02T12:00:00.000Z";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: { name: `R28 owner ${label}`, email: `r28-owner-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const admin = await prisma.user.create({
    data: { name: `R28 admin ${label}`, email: `r28-admin-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const field = await prisma.user.create({
    data: { name: `R28 field ${label}`, email: `r28-field-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R28 ${label}` });
  await prisma.constructionWorkspaceMember.createMany({ data: [
    { workspaceId: workspace.workspaceId, userId: admin.id, role: "admin", status: "active" },
    { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  ] });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `AUTH-${label}`,
    name: `Autorité ${label}`,
  });
  let policy = await processAuthorityPolicyCommand({ userId: owner.id, command: {
    schemaVersion: 1,
    action: "CREATE_POLICY_DRAFT",
    commandId: crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    sourcePolicySetId: null,
    expectedSourceStateVersion: null,
  } });
  policy = await processAuthorityPolicyCommand({ userId: owner.id, command: {
    schemaVersion: 1,
    action: "SET_POLICY_RULE",
    commandId: crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    policySetId: policy.policySetId,
    expectedStateVersion: policy.stateVersion,
    ruleKey: "BASELINE_INTERNAL_REMINDER_CREATE",
    actionKey: "INTERNAL_REMINDER_CREATE",
    projectId: null,
    roleScope: null,
    dataClassification: null,
    outcome: "AUTOMATIC_INTERNAL",
    amountCeilingMinor: null,
    reasonCode: "SAFE_INTERNAL_AUTOMATION",
  } });
  policy = await processAuthorityPolicyCommand({ userId: owner.id, command: {
    schemaVersion: 1,
    action: "SET_POLICY_RULE",
    commandId: crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    policySetId: policy.policySetId,
    expectedStateVersion: policy.stateVersion,
    ruleKey: "BASELINE_ACCOUNTING_RECONCILE",
    actionKey: "ACCOUNTING_RECONCILE",
    projectId: null,
    roleScope: null,
    dataClassification: null,
    outcome: "APPROVAL_REQUIRED",
    amountCeilingMinor: 120_000,
    reasonCode: "ACCOUNTING_REVIEW_LIMIT",
  } });
  policy = await processAuthorityPolicyCommand({ userId: owner.id, command: {
    schemaVersion: 1,
    action: "ACTIVATE_POLICY_SET",
    commandId: crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    policySetId: policy.policySetId,
    expectedStateVersion: policy.stateVersion,
    expectedPolicyHash: policy.policyHash,
  } });
  return {
    ownerId: owner.id,
    adminId: admin.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    policy,
  };
}

function evaluationCommand(
  f: Awaited<ReturnType<typeof fixture>>,
  input: {
    commandId?: string;
    actionKey?: "INTERNAL_REMINDER_CREATE" | "SEND_SMS" | "ACCOUNTING_RECONCILE" | "ACCOUNTING_POST" | "PAYMENT_INITIATE";
    projectId?: string | null;
    amountMinor?: number | null;
    payloadSeed?: string;
  } = {},
) {
  const actionKey = input.actionKey ?? "SEND_SMS";
  const payloadHash = sha256Canonical({ actionKey, seed: input.payloadSeed ?? crypto.randomUUID() });
  return {
    schemaVersion: 1 as const,
    action: "EVALUATE_ACTION_AUTHORITY" as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: f.workspaceId,
    actionKey,
    actionVersion: 1 as const,
    projectId: input.projectId === undefined ? f.projectId : input.projectId,
    targetRef: `authority_${sha256Canonical({ actionKey, target: f.projectId })}` as const,
    dataClassification: actionKey.startsWith("ACCOUNTING") || actionKey === "PAYMENT_INITIATE" ? "RESTRICTED" as const : "INTERNAL" as const,
    amountMinor: input.amountMinor === undefined ? null : input.amountMinor,
    sourceFingerprint: sha256Canonical({ source: f.projectId }),
    payloadHash,
    expiresAt: future,
    externalTransportPerformed: false as const,
    externalWritePerformed: false as const,
  };
}

describe("R28 authority policies on disposable PostgreSQL", () => {
  it("creates a complete fail-closed baseline and preserves exact lifecycle replay", async () => {
    const f = await fixture("LIFECYCLE");
    expect(f.policy).toMatchObject({ status: "ACTIVE", ruleCount: 12, externalTransportPerformed: false, externalWritePerformed: false });
    const createCommand = {
      schemaVersion: 1 as const,
      action: "CREATE_POLICY_DRAFT" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      sourcePolicySetId: f.policy.policySetId,
      expectedSourceStateVersion: f.policy.stateVersion,
    };
    const draft = await processAuthorityPolicyCommand({ userId: f.ownerId, command: createCommand });
    const replay = await processAuthorityPolicyCommand({ userId: f.ownerId, command: createCommand });
    expect(replay).toMatchObject({ policySetId: draft.policySetId, replayed: true, ruleCount: 12 });
    await expect(processAuthorityPolicyCommand({
      userId: f.ownerId,
      command: { ...createCommand, sourcePolicySetId: null, expectedSourceStateVersion: null },
    })).rejects.toThrow("AUTHORITY_COMMAND_IDEMPOTENCY_CONFLICT");
    await expect(processAuthorityPolicyCommand({ userId: f.adminId, command: {
      ...createCommand,
      commandId: crypto.randomUUID(),
    } })).rejects.toThrow();
    await expect(processAuthorityPolicyCommand({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "SET_POLICY_RULE",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      policySetId: f.policy.policySetId,
      expectedStateVersion: f.policy.stateVersion,
      ruleKey: "SMS_AUTO",
      actionKey: "SEND_SMS",
      projectId: null,
      roleScope: null,
      dataClassification: null,
      outcome: "AUTOMATIC_INTERNAL",
      amountCeilingMinor: null,
      reasonCode: "UNSAFE_EXTERNAL_AUTO",
    } })).rejects.toThrow("AUTHORITY_POLICY_IMMUTABLE");
    await expect(processAuthorityPolicyCommand({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "SET_POLICY_RULE",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      policySetId: draft.policySetId,
      expectedStateVersion: draft.stateVersion,
      ruleKey: "BASELINE_SEND_SMS",
      actionKey: "SEND_SMS",
      projectId: null,
      roleScope: null,
      dataClassification: null,
      outcome: "AUTOMATIC_INTERNAL",
      amountCeilingMinor: null,
      reasonCode: "UNSAFE_EXTERNAL_AUTO",
    } })).rejects.toThrow("AUTHORITY_AUTOMATIC_OUTCOME_UNSAFE");
  });

  it("evaluates automatic, approval, ceiling and prohibited outcomes without external effects", async () => {
    const f = await fixture("EVALUATE");
    const reminder = await evaluateActionAuthority({ userId: f.fieldId, command: evaluationCommand(f, { actionKey: "INTERNAL_REMINDER_CREATE" }) });
    expect(reminder).toMatchObject({ outcome: "AUTOMATIC_INTERNAL", status: "AUTHORIZED_INTERNAL", providerEffectCount: 0 });
    const sms = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "SEND_SMS" }) });
    expect(sms).toMatchObject({ outcome: "APPROVAL_REQUIRED", status: "PENDING_APPROVAL" });
    const overCeiling = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "ACCOUNTING_RECONCILE", amountMinor: 120_001 }) });
    expect(overCeiling).toMatchObject({ outcome: "PROHIBITED", reasonCode: "AUTHORITY_AMOUNT_CEILING_EXCEEDED" });
    const unconfiguredCeiling = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "ACCOUNTING_POST", amountMinor: 1 }) });
    expect(unconfiguredCeiling).toMatchObject({ outcome: "PROHIBITED", reasonCode: "AUTHORITY_AMOUNT_CEILING_REQUIRED" });
    const payment = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "PAYMENT_INITIATE", amountMinor: 1 }) });
    expect(payment).toMatchObject({ outcome: "PROHIBITED", status: "PROHIBITED" });
    expect(await prisma.constructionAuthorityEvaluation.count({ where: {
      workspaceId: f.workspaceId,
      OR: [{ externalTransportPerformed: true }, { externalWritePerformed: true }, { providerEffectCount: { gt: 0 } }],
    } })).toBe(0);
  });

  it("applies one exact local decision, refuses replay drift and never approves a prohibition", async () => {
    const f = await fixture("DECIDE");
    const evaluated = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "SEND_SMS", payloadSeed: "stable" }) });
    const decision = {
      schemaVersion: 1 as const,
      action: "DECIDE_AUTHORITY_EVALUATION" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      evaluationId: evaluated.evaluationId,
      expectedEvaluationVersion: evaluated.evaluationVersion,
      expectedPolicySetVersion: evaluated.policySetVersion,
      expectedPayloadHash: evaluated.payloadHash,
      decision: "APPROVE" as const,
    };
    const outcomes = await Promise.all([
      decideAuthorityEvaluation({ userId: f.adminId, command: decision }),
      decideAuthorityEvaluation({ userId: f.adminId, command: decision }),
    ]);
    expect(outcomes.map((entry) => entry.replayed).sort()).toEqual([false, true]);
    expect(outcomes[0]).toMatchObject({ status: "APPROVED_LOCAL", localAuthorizationEffectCount: 1, externalWritePerformed: false });
    expect(await prisma.constructionAuthorityDecision.count({ where: { evaluationId: evaluated.evaluationId } })).toBe(1);
    await expect(decideAuthorityEvaluation({
      userId: f.adminId,
      command: { ...decision, commandId: crypto.randomUUID(), decision: "REJECT" },
    })).rejects.toThrow("AUTHORITY_EVALUATION_ALREADY_DECIDED");

    const prohibited = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "PAYMENT_INITIATE", amountMinor: 1 }) });
    await expect(decideAuthorityEvaluation({ userId: f.ownerId, command: {
      ...decision,
      commandId: crypto.randomUUID(),
      evaluationId: prohibited.evaluationId,
      expectedEvaluationVersion: prohibited.evaluationVersion,
      expectedPolicySetVersion: prohibited.policySetVersion,
      expectedPayloadHash: prohibited.payloadHash,
    } })).rejects.toThrow("AUTHORITY_PROHIBITED_NOT_DECIDABLE");
    expect(await prisma.constructionAuthorityRefusal.count({ where: {
      workspaceId: f.workspaceId,
      refusalCode: { in: ["AUTHORITY_EVALUATION_ALREADY_DECIDED", "AUTHORITY_PROHIBITED_NOT_DECIDABLE"] },
    } })).toBe(2);
    // Prisma Dev's local pooled proxy can retain the backend session used by
    // this deliberate concurrent transaction proof. Reconnect before the
    // next independent test so proxy session state is never product state.
    await prisma.$disconnect();
    await prisma.$connect();
  });

  it("deduplicates concurrent evaluations, refuses cross-workspace projects and survives reconnect", async () => {
    const f = await fixture("REPLAY");
    const command = evaluationCommand(f, { commandId: crypto.randomUUID(), actionKey: "SEND_SMS", payloadSeed: "concurrent" });
    const results = await Promise.all([
      evaluateActionAuthority({ userId: f.ownerId, command }),
      evaluateActionAuthority({ userId: f.ownerId, command }),
    ]);
    expect(results.map((entry) => entry.replayed).sort()).toEqual([false, true]);
    expect(await prisma.constructionAuthorityEvaluation.count({ where: { workspaceId: f.workspaceId, commandId: command.commandId } })).toBe(1);

    const other = await fixture("OTHER");
    await expect(evaluateActionAuthority({
      userId: other.ownerId,
      command: { ...evaluationCommand(other), projectId: f.projectId },
    })).rejects.toThrow();
    expect(await prisma.constructionAuthorityRefusal.count({ where: { workspaceId: other.workspaceId } })).toBeGreaterThanOrEqual(1);

    const before = await authorityPolicyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId });
    await prisma.$disconnect();
    await prisma.$connect();
    const after = await authorityPolicyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId });
    expect(after).toEqual(before);
  });

  it("minimizes field projections while preserving owner and office decision context", async () => {
    const f = await fixture("PROJECTION");
    await evaluateActionAuthority({ userId: f.fieldId, command: evaluationCommand(f, { actionKey: "INTERNAL_REMINDER_CREATE" }) });
    await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "SEND_SMS" }) });
    const owner = await authorityPolicyCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId });
    const field = await authorityPolicyCockpitForUser({ userId: f.fieldId, workspaceId: f.workspaceId });
    expect(owner).toMatchObject({ role: "owner", canManagePolicy: true, counts: { policySets: 1, pendingApprovals: 1 } });
    expect(owner.policySets[0]?.rules).toHaveLength(12);
    expect(field).toMatchObject({ role: "field_worker", canManagePolicy: false, policySets: [] });
    expect(field.evaluations).toHaveLength(1);
    expect(field.evaluations[0]).toMatchObject({ evaluationVersion: null, actorUserId: null, actionKey: null, payloadHash: null, policySetVersion: null, expiresAt: null });
  });

  it("marks expired and superseded evaluations durably without creating a decision", async () => {
    const f = await fixture("STALE");
    const expired = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "SEND_SMS", payloadSeed: "expired" }) });
    await prisma.constructionAuthorityEvaluation.update({ where: { id: expired.evaluationId }, data: { expiresAt: new Date("2026-01-01T00:00:00.000Z") } });
    await expect(decideAuthorityEvaluation({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "DECIDE_AUTHORITY_EVALUATION",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      evaluationId: expired.evaluationId,
      expectedEvaluationVersion: expired.evaluationVersion,
      expectedPolicySetVersion: expired.policySetVersion,
      expectedPayloadHash: expired.payloadHash,
      decision: "APPROVE",
    } })).rejects.toThrow("AUTHORITY_EVALUATION_EXPIRED");
    expect(await prisma.constructionAuthorityEvaluation.findUniqueOrThrow({ where: { id: expired.evaluationId } })).toMatchObject({ status: "EXPIRED", version: 2 });

    const stale = await evaluateActionAuthority({ userId: f.ownerId, command: evaluationCommand(f, { actionKey: "SEND_SMS", payloadSeed: "stale" }) });
    let successor = await processAuthorityPolicyCommand({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "CREATE_POLICY_DRAFT",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      sourcePolicySetId: f.policy.policySetId,
      expectedSourceStateVersion: f.policy.stateVersion,
    } });
    successor = await processAuthorityPolicyCommand({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "ACTIVATE_POLICY_SET",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      policySetId: successor.policySetId,
      expectedStateVersion: successor.stateVersion,
      expectedPolicyHash: successor.policyHash,
    } });
    expect(successor.status).toBe("ACTIVE");
    await expect(decideAuthorityEvaluation({ userId: f.ownerId, command: {
      schemaVersion: 1,
      action: "DECIDE_AUTHORITY_EVALUATION",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      evaluationId: stale.evaluationId,
      expectedEvaluationVersion: stale.evaluationVersion,
      expectedPolicySetVersion: stale.policySetVersion,
      expectedPayloadHash: stale.payloadHash,
      decision: "APPROVE",
    } })).rejects.toThrow("AUTHORITY_POLICY_STALE");
    expect(await prisma.constructionAuthorityEvaluation.findUniqueOrThrow({ where: { id: stale.evaluationId } })).toMatchObject({ status: "STALE", version: 2 });
    expect(await prisma.constructionAuthorityDecision.count({ where: { evaluationId: { in: [expired.evaluationId, stale.evaluationId] } } })).toBe(0);
  });
});
