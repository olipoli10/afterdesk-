import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  authorityDecisionResultSchema,
  authorityEvaluationResultSchema,
  authorityPolicyCockpitSchema,
  authorityPolicyCommandSchema,
  decideAuthorityEvaluationCommandSchema,
  evaluateActionAuthorityCommandSchema,
  policySetResultSchema,
  type AuthorityDataClassification,
  type AuthorityOutcome,
  type AuthorityPolicyCommand,
  type AuthorityRole,
} from "@/lib/construction-operating-assistant-r28/contracts";
import {
  AUTHORITY_ACTION_REGISTRY,
  authorityPolicyHash,
  baselineAuthorityRules,
  dataClassWithinReach,
  mandatoryOutcomeForDefinition,
  roleMeetsMinimum,
  stricterOutcome,
} from "@/lib/construction-operating-assistant-r28/policy";
import { prisma } from "@/lib/db";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class AuthorityPolicyConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AuthorityPolicyConflict";
  }
}

type Tx = Prisma.TransactionClient;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function lock(tx: Tx, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r28:${key}`}, 0))::text AS acquired
  `);
}

function roleFromMembership(role: string): AuthorityRole {
  if (role === "owner") return "OWNER";
  if (role === "admin") return "OFFICE_MANAGER";
  return "FIELD_WORKER";
}

async function requireOwner(tx: Tx, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner") throw new ConstructionAccessDenied();
  return membership;
}

async function requireOffice(tx: Tx, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role === "member") throw new ConstructionAccessDenied();
  return membership;
}

function refusalCode(error: unknown) {
  if (error instanceof AuthorityPolicyConflict) return error.code;
  if (error instanceof ConstructionAccessDenied) return "AUTHORITY_ACCESS_DENIED";
  return null;
}

async function withAuthorityRefusal<T>(input: {
  workspaceId: string;
  operationId: string;
  operationKind: string;
  inputHash: string;
  actorId: string;
}, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const code = refusalCode(error);
    if (code) {
      const authorized = await prisma.constructionWorkspaceMember.findFirst({
        where: { workspaceId: input.workspaceId, userId: input.actorId, status: "active" },
        select: { id: true },
      }).catch(() => null);
      if (authorized) {
        await prisma.constructionAuthorityRefusal.create({
          data: { ...input, refusalCode: code },
        }).catch(() => null);
      }
    }
    throw error;
  }
}

async function existingOperation(tx: Tx, workspaceId: string, commandId: string, commandHash: string) {
  const existing = await tx.constructionAuthorityOperation.findUnique({
    where: { workspaceId_commandId: { workspaceId, commandId } },
    select: { commandHash: true, result: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) {
    throw new AuthorityPolicyConflict("AUTHORITY_COMMAND_IDEMPOTENCY_CONFLICT");
  }
  return existing.result;
}

async function saveOperation(tx: Tx, input: {
  workspaceId: string;
  commandId: string;
  commandHash: string;
  operationKind: string;
  result: unknown;
  actorId: string;
}) {
  await tx.constructionAuthorityOperation.create({
    data: { ...input, result: asJson(input.result) },
  });
}

type PolicyRuleForHash = {
  ruleKey: string;
  actionKey: string;
  projectId: string | null;
  roleScope: string | null;
  dataClassification: string | null;
  outcome: string;
  amountCeilingMinor: number | null;
  reasonCode: string;
};

function hashPolicy(version: number, rules: PolicyRuleForHash[]) {
  return authorityPolicyHash({
    version,
    rules: rules.map((rule) => ({
      ...rule,
      actionKey: rule.actionKey as Parameters<typeof authorityPolicyHash>[0]["rules"][number]["actionKey"],
      roleScope: rule.roleScope as AuthorityRole | null,
      dataClassification: rule.dataClassification as AuthorityDataClassification | null,
      outcome: rule.outcome as AuthorityOutcome,
    })),
  });
}

async function policySetResult(tx: Tx, input: {
  commandId: string;
  workspaceId: string;
  policySetId: string;
  replayed: boolean;
}) {
  const set = await tx.constructionAuthorityPolicySet.findFirstOrThrow({
    where: { id: input.policySetId, workspaceId: input.workspaceId },
    include: { rules: { orderBy: { ruleKey: "asc" } } },
  });
  return policySetResultSchema.parse({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    policySetId: set.id,
    policySetVersion: set.version,
    stateVersion: set.stateVersion,
    policyHash: set.policyHash,
    status: set.status,
    ruleCount: set.rules.length,
    replayed: input.replayed,
    externalTransportPerformed: false,
    externalWritePerformed: false,
    providerEffectCount: 0,
  });
}

async function nextPolicyVersion(tx: Tx, workspaceId: string) {
  const aggregate = await tx.constructionAuthorityPolicySet.aggregate({
    where: { workspaceId },
    _max: { version: true },
  });
  return (aggregate._max.version ?? 0) + 1;
}

async function createPolicyDraft(tx: Tx, userId: string, command: Extract<AuthorityPolicyCommand, { action: "CREATE_POLICY_DRAFT" }>) {
  let source: {
    id: string;
    stateVersion: number;
    rules: Array<PolicyRuleForHash & { ruleHash: string }>;
  } | null = null;
  if (command.sourcePolicySetId) {
    source = await tx.constructionAuthorityPolicySet.findFirst({
      where: { id: command.sourcePolicySetId, workspaceId: command.workspaceId },
      select: {
        id: true,
        stateVersion: true,
        rules: {
          orderBy: { ruleKey: "asc" },
          select: {
            ruleKey: true,
            actionKey: true,
            projectId: true,
            roleScope: true,
            dataClassification: true,
            outcome: true,
            amountCeilingMinor: true,
            reasonCode: true,
            ruleHash: true,
          },
        },
      },
    });
    if (!source) throw new ConstructionAccessDenied();
    if (source.stateVersion !== command.expectedSourceStateVersion) {
      throw new AuthorityPolicyConflict("AUTHORITY_POLICY_SOURCE_VERSION_CONFLICT");
    }
  }
  const version = await nextPolicyVersion(tx, command.workspaceId);
  const sourceRules = source?.rules ?? baselineAuthorityRules();
  const draft = await tx.constructionAuthorityPolicySet.create({
    data: {
      workspaceId: command.workspaceId,
      version,
      status: "DRAFT",
      policyHash: hashPolicy(version, sourceRules),
      sourcePolicySetId: source?.id ?? null,
      createdByUserId: userId,
      rules: {
        create: sourceRules.map((rule) => ({
          ruleKey: rule.ruleKey,
          actionKey: rule.actionKey,
          projectId: rule.projectId,
          roleScope: rule.roleScope,
          dataClassification: rule.dataClassification,
          outcome: rule.outcome,
          amountCeilingMinor: rule.amountCeilingMinor,
          reasonCode: rule.reasonCode,
          ruleHash: rule.ruleHash,
        })),
      },
    },
  });
  return policySetResult(tx, { commandId: command.commandId, workspaceId: command.workspaceId, policySetId: draft.id, replayed: false });
}

async function setPolicyRule(tx: Tx, command: Extract<AuthorityPolicyCommand, { action: "SET_POLICY_RULE" }>) {
  const set = await tx.constructionAuthorityPolicySet.findFirst({
    where: { id: command.policySetId, workspaceId: command.workspaceId },
  });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "DRAFT") throw new AuthorityPolicyConflict("AUTHORITY_POLICY_IMMUTABLE");
  if (set.stateVersion !== command.expectedStateVersion) {
    throw new AuthorityPolicyConflict("AUTHORITY_POLICY_VERSION_CONFLICT");
  }
  if (command.projectId) {
    const project = await tx.constructionProject.findFirst({
      where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!project) throw new ConstructionAccessDenied();
  }
  const definition = AUTHORITY_ACTION_REGISTRY.get(command.actionKey);
  if (!definition) throw new AuthorityPolicyConflict("AUTHORITY_ACTION_UNREGISTERED");
  if (command.outcome === "AUTOMATIC_INTERNAL" && (definition.externalEffectCapable || definition.risk !== "LOW" || !definition.reversible || definition.monetary)) {
    throw new AuthorityPolicyConflict("AUTHORITY_AUTOMATIC_OUTCOME_UNSAFE");
  }
  const ruleHash = sha256Canonical({
    schemaVersion: 1,
    ruleKey: command.ruleKey,
    actionKey: command.actionKey,
    projectId: command.projectId,
    roleScope: command.roleScope,
    dataClassification: command.dataClassification,
    outcome: command.outcome,
    amountCeilingMinor: command.amountCeilingMinor,
    reasonCode: command.reasonCode,
  });
  await tx.constructionAuthorityPolicyRule.upsert({
    where: { policySetId_ruleKey: { policySetId: set.id, ruleKey: command.ruleKey } },
    create: {
      policySetId: set.id,
      ruleKey: command.ruleKey,
      actionKey: command.actionKey,
      projectId: command.projectId,
      roleScope: command.roleScope,
      dataClassification: command.dataClassification,
      outcome: command.outcome,
      amountCeilingMinor: command.amountCeilingMinor,
      reasonCode: command.reasonCode,
      ruleHash,
    },
    update: {
      actionKey: command.actionKey,
      projectId: command.projectId,
      roleScope: command.roleScope,
      dataClassification: command.dataClassification,
      outcome: command.outcome,
      amountCeilingMinor: command.amountCeilingMinor,
      reasonCode: command.reasonCode,
      ruleHash,
    },
  });
  const rules = await tx.constructionAuthorityPolicyRule.findMany({
    where: { policySetId: set.id },
    orderBy: { ruleKey: "asc" },
  });
  await tx.constructionAuthorityPolicySet.update({
    where: { id: set.id },
    data: { policyHash: hashPolicy(set.version, rules), stateVersion: { increment: 1 } },
  });
  return policySetResult(tx, { commandId: command.commandId, workspaceId: command.workspaceId, policySetId: set.id, replayed: false });
}

async function activatePolicySet(tx: Tx, userId: string, command: Extract<AuthorityPolicyCommand, { action: "ACTIVATE_POLICY_SET" }>) {
  const set = await tx.constructionAuthorityPolicySet.findFirst({
    where: { id: command.policySetId, workspaceId: command.workspaceId },
    include: { rules: { orderBy: { ruleKey: "asc" } } },
  });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "DRAFT") throw new AuthorityPolicyConflict("AUTHORITY_POLICY_NOT_DRAFT");
  if (set.stateVersion !== command.expectedStateVersion || set.policyHash !== command.expectedPolicyHash) {
    throw new AuthorityPolicyConflict("AUTHORITY_POLICY_ACTIVATION_CONFLICT");
  }
  if (set.rules.length === 0) throw new AuthorityPolicyConflict("AUTHORITY_POLICY_RULES_REQUIRED");
  const now = new Date();
  await tx.constructionAuthorityPolicySet.updateMany({
    where: { workspaceId: command.workspaceId, status: "ACTIVE" },
    data: { status: "SUPERSEDED", supersededAt: now, stateVersion: { increment: 1 } },
  });
  await tx.constructionAuthorityPolicySet.update({
    where: { id: set.id },
    data: { status: "ACTIVE", activatedByUserId: userId, activatedAt: now, stateVersion: { increment: 1 } },
  });
  return policySetResult(tx, { commandId: command.commandId, workspaceId: command.workspaceId, policySetId: set.id, replayed: false });
}

async function revokePolicySet(tx: Tx, command: Extract<AuthorityPolicyCommand, { action: "REVOKE_POLICY_SET" }>) {
  const set = await tx.constructionAuthorityPolicySet.findFirst({
    where: { id: command.policySetId, workspaceId: command.workspaceId },
  });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "ACTIVE") throw new AuthorityPolicyConflict("AUTHORITY_POLICY_NOT_ACTIVE");
  if (set.stateVersion !== command.expectedStateVersion || set.policyHash !== command.expectedPolicyHash) {
    throw new AuthorityPolicyConflict("AUTHORITY_POLICY_REVOCATION_CONFLICT");
  }
  await tx.constructionAuthorityPolicySet.update({
    where: { id: set.id },
    data: { status: "REVOKED", revokedAt: new Date(), stateVersion: { increment: 1 } },
  });
  return policySetResult(tx, { commandId: command.commandId, workspaceId: command.workspaceId, policySetId: set.id, replayed: false });
}

export async function processAuthorityPolicyCommand(input: { userId: string; command: unknown }) {
  const command = authorityPolicyCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAuthorityRefusal({
    workspaceId: command.workspaceId,
    operationId: command.commandId,
    operationKind: command.action,
    inputHash: commandHash,
    actorId: input.userId,
  }, () => prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:policy-command:${command.commandId}`);
    await lock(tx, `${command.workspaceId}:policy-lifecycle`);
    await requireOwner(tx, input.userId, command.workspaceId);
    const replay = await existingOperation(tx, command.workspaceId, command.commandId, commandHash);
    if (replay) return policySetResultSchema.parse({ ...policySetResultSchema.parse(replay), replayed: true });

    let result;
    if (command.action === "CREATE_POLICY_DRAFT") result = await createPolicyDraft(tx, input.userId, command);
    else if (command.action === "SET_POLICY_RULE") result = await setPolicyRule(tx, command);
    else if (command.action === "ACTIVATE_POLICY_SET") result = await activatePolicySet(tx, input.userId, command);
    else result = await revokePolicySet(tx, command);

    await saveOperation(tx, {
      workspaceId: command.workspaceId,
      commandId: command.commandId,
      commandHash,
      operationKind: command.action,
      result,
      actorId: input.userId,
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 }));
}

function applicableRules(input: {
  rules: Array<{
    actionKey: string;
    projectId: string | null;
    roleScope: string | null;
    dataClassification: string | null;
    outcome: string;
    amountCeilingMinor: number | null;
    reasonCode: string;
    ruleKey: string;
  }>;
  actionKey: string;
  projectId: string | null;
  role: AuthorityRole;
  dataClassification: AuthorityDataClassification;
}) {
  return input.rules.filter((rule) =>
    rule.actionKey === input.actionKey &&
    (rule.projectId === null || rule.projectId === input.projectId) &&
    (rule.roleScope === null || rule.roleScope === input.role) &&
    (rule.dataClassification === null || rule.dataClassification === input.dataClassification)
  ).sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
}

function evaluationResult(row: {
  commandId: string;
  workspaceId: string;
  id: string;
  version: number;
  policySetId: string;
  policySetVersion: number;
  actionKey: string;
  actionVersion: number;
  outcome: string;
  reasonCode: string;
  payloadHash: string;
  status: string;
  expiresAt: Date;
}, replayed: boolean) {
  return authorityEvaluationResultSchema.parse({
    schemaVersion: 1,
    commandId: row.commandId,
    workspaceId: row.workspaceId,
    evaluationId: row.id,
    evaluationVersion: row.version,
    policySetId: row.policySetId,
    policySetVersion: row.policySetVersion,
    actionKey: row.actionKey,
    actionVersion: row.actionVersion,
    outcome: row.outcome,
    reasonCode: row.reasonCode,
    payloadHash: row.payloadHash,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    replayed,
    externalTransportPerformed: false,
    externalWritePerformed: false,
    providerEffectCount: 0,
  });
}

export async function evaluateActionAuthority(input: { userId: string; command: unknown }) {
  const command = evaluateActionAuthorityCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAuthorityRefusal({
    workspaceId: command.workspaceId,
    operationId: command.commandId,
    operationKind: command.action,
    inputHash: commandHash,
    actorId: input.userId,
  }, () => prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:evaluation:${command.commandId}`);
    const membership = await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
    const role = roleFromMembership(membership.role);
    const replay = await tx.constructionAuthorityEvaluation.findUnique({
      where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
    });
    if (replay) {
      if (replay.commandHash !== commandHash) throw new AuthorityPolicyConflict("AUTHORITY_EVALUATION_IDEMPOTENCY_CONFLICT");
      return evaluationResult(replay, true);
    }
    if (new Date(command.expiresAt).getTime() <= Date.now()) {
      throw new AuthorityPolicyConflict("AUTHORITY_EVALUATION_EXPIRED");
    }
    const definition = AUTHORITY_ACTION_REGISTRY.get(command.actionKey);
    if (!definition || definition.version !== command.actionVersion) {
      throw new AuthorityPolicyConflict("AUTHORITY_ACTION_UNREGISTERED");
    }
    if (command.projectId) {
      const project = await tx.constructionProject.findFirst({
        where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
        select: { id: true },
      });
      if (!project) throw new ConstructionAccessDenied();
    }
    const policySet = await tx.constructionAuthorityPolicySet.findFirst({
      where: { workspaceId: command.workspaceId, status: "ACTIVE" },
      include: { rules: { orderBy: { ruleKey: "asc" } } },
    });
    if (!policySet) throw new AuthorityPolicyConflict("AUTHORITY_ACTIVE_POLICY_REQUIRED");

    let outcome: AuthorityOutcome = mandatoryOutcomeForDefinition(definition);
    let reasonCode = `REGISTRY_${outcome}`;
    if (!roleMeetsMinimum(role, definition.minimumRole)) {
      outcome = "PROHIBITED";
      reasonCode = "AUTHORITY_ROLE_INSUFFICIENT";
    } else if (!dataClassWithinReach(command.dataClassification, definition.maximumDataClassification)) {
      outcome = "PROHIBITED";
      reasonCode = "AUTHORITY_DATA_CLASSIFICATION_EXCEEDS_REACH";
    } else if (definition.monetary && command.amountMinor === null) {
      outcome = "PROHIBITED";
      reasonCode = "AUTHORITY_AMOUNT_CONTEXT_REQUIRED";
    } else {
      const rules = applicableRules({
        rules: policySet.rules,
        actionKey: command.actionKey,
        projectId: command.projectId,
        role,
        dataClassification: command.dataClassification,
      });
      if (rules.length === 0) {
        outcome = "PROHIBITED";
        reasonCode = "AUTHORITY_POLICY_RULE_MISSING";
      } else {
        for (const rule of rules) {
          if (definition.monetary && rule.amountCeilingMinor === null) {
            outcome = "PROHIBITED";
            reasonCode = "AUTHORITY_AMOUNT_CEILING_REQUIRED";
            break;
          }
          if (rule.amountCeilingMinor !== null && (command.amountMinor === null || command.amountMinor > rule.amountCeilingMinor)) {
            outcome = "PROHIBITED";
            reasonCode = command.amountMinor === null ? "AUTHORITY_AMOUNT_CONTEXT_REQUIRED" : "AUTHORITY_AMOUNT_CEILING_EXCEEDED";
            break;
          }
          const candidate = rule.outcome as AuthorityOutcome;
          const strictest = stricterOutcome(outcome, candidate);
          if (strictest !== outcome || reasonCode.startsWith("REGISTRY_")) reasonCode = rule.reasonCode;
          outcome = strictest;
        }
      }
    }
    if (definition.externalEffectCapable && outcome === "AUTOMATIC_INTERNAL") {
      outcome = "APPROVAL_REQUIRED";
      reasonCode = "AUTHORITY_EXTERNAL_EFFECT_REQUIRES_APPROVAL";
    }
    const status = outcome === "AUTOMATIC_INTERNAL"
      ? "AUTHORIZED_INTERNAL"
      : outcome === "APPROVAL_REQUIRED"
        ? "PENDING_APPROVAL"
        : "PROHIBITED";
    const row = await tx.constructionAuthorityEvaluation.create({
      data: {
        workspaceId: command.workspaceId,
        policySetId: policySet.id,
        commandId: command.commandId,
        commandHash,
        actorUserId: input.userId,
        actorRole: role,
        actionKey: command.actionKey,
        actionVersion: command.actionVersion,
        projectId: command.projectId,
        targetRef: command.targetRef,
        risk: definition.risk,
        dataClassification: command.dataClassification,
        amountMinor: command.amountMinor,
        sourceFingerprint: command.sourceFingerprint,
        payloadHash: command.payloadHash,
        policySetVersion: policySet.version,
        outcome,
        reasonCode,
        status,
        expiresAt: new Date(command.expiresAt),
        externalTransportPerformed: false,
        externalWritePerformed: false,
        providerEffectCount: 0,
      },
    });
    return evaluationResult(row, false);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 }));
}

export async function decideAuthorityEvaluation(input: { userId: string; command: unknown }) {
  const command = decideAuthorityEvaluationCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAuthorityRefusal({
    workspaceId: command.workspaceId,
    operationId: command.commandId,
    operationKind: command.action,
    inputHash: commandHash,
    actorId: input.userId,
  }, async () => {
    const result = await prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:authority-decision:${command.commandId}`);
    await requireOffice(tx, input.userId, command.workspaceId);
    const replay = await tx.constructionAuthorityDecision.findUnique({
      where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
      select: { commandHash: true, result: true },
    });
    if (replay) {
      if (replay.commandHash !== commandHash) throw new AuthorityPolicyConflict("AUTHORITY_DECISION_IDEMPOTENCY_CONFLICT");
      return authorityDecisionResultSchema.parse({ ...authorityDecisionResultSchema.parse(replay.result), replayed: true });
    }
    await lock(tx, `${command.workspaceId}:authority-evaluation:${command.evaluationId}`);
    const evaluation = await tx.constructionAuthorityEvaluation.findFirst({
      where: { id: command.evaluationId, workspaceId: command.workspaceId },
      include: { policySet: true, decisions: { take: 1 } },
    });
    if (!evaluation) throw new ConstructionAccessDenied();
    if (evaluation.outcome === "PROHIBITED") throw new AuthorityPolicyConflict("AUTHORITY_PROHIBITED_NOT_DECIDABLE");
    if (evaluation.outcome !== "APPROVAL_REQUIRED") throw new AuthorityPolicyConflict("AUTHORITY_DECISION_NOT_REQUIRED");
    if (evaluation.decisions.length > 0) throw new AuthorityPolicyConflict("AUTHORITY_EVALUATION_ALREADY_DECIDED");
    if (evaluation.version !== command.expectedEvaluationVersion ||
        evaluation.policySetVersion !== command.expectedPolicySetVersion ||
        evaluation.payloadHash !== command.expectedPayloadHash) {
      throw new AuthorityPolicyConflict("AUTHORITY_DECISION_EXACT_BINDING_CONFLICT");
    }
    if (evaluation.policySet.status !== "ACTIVE" || evaluation.policySet.version !== command.expectedPolicySetVersion) {
      await tx.constructionAuthorityEvaluation.update({
        where: { id: evaluation.id },
        data: { status: "STALE", version: { increment: 1 } },
      });
      return { refusal: "AUTHORITY_POLICY_STALE" as const };
    }
    if (evaluation.expiresAt.getTime() <= Date.now()) {
      await tx.constructionAuthorityEvaluation.update({
        where: { id: evaluation.id },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
      return { refusal: "AUTHORITY_EVALUATION_EXPIRED" as const };
    }
    const status = command.decision === "APPROVE" ? "APPROVED_LOCAL" : "REJECTED";
    const result = authorityDecisionResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      evaluationId: evaluation.id,
      evaluationVersion: evaluation.version,
      policySetVersion: evaluation.policySetVersion,
      payloadHash: evaluation.payloadHash,
      decision: command.decision,
      status,
      localAuthorizationEffectCount: 1,
      replayed: false,
      externalTransportPerformed: false,
      externalWritePerformed: false,
      providerEffectCount: 0,
    });
    await tx.constructionAuthorityEvaluation.update({
      where: { id: evaluation.id },
      data: { status, version: { increment: 1 } },
    });
    await tx.constructionAuthorityDecision.create({
      data: {
        workspaceId: command.workspaceId,
        evaluationId: evaluation.id,
        commandId: command.commandId,
        commandHash,
        expectedEvaluationVersion: command.expectedEvaluationVersion,
        expectedPolicySetVersion: command.expectedPolicySetVersion,
        expectedPayloadHash: command.expectedPayloadHash,
        decision: command.decision,
        statusAfter: status,
        actorId: input.userId,
        result: asJson(result),
        localAuthorizationEffectCount: 1,
        externalTransportPerformed: false,
        externalWritePerformed: false,
        providerEffectCount: 0,
      },
    });
    return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });
    if ("refusal" in result) throw new AuthorityPolicyConflict(result.refusal);
    return result;
  });
}

export async function authorityPolicyCockpitForUser(input: { userId: string; workspaceId: string }) {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const role = membership.role === "owner" ? "owner" : membership.role === "admin" ? "admin" : "field_worker";
  if (role === "field_worker") {
    const evaluations = await prisma.constructionAuthorityEvaluation.findMany({
      where: { workspaceId: input.workspaceId, actorUserId: input.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return authorityPolicyCockpitSchema.parse({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      role,
      canManagePolicy: false,
      policySets: [],
      evaluations: evaluations.map((entry) => ({
        id: entry.id,
        evaluationVersion: null,
        actorUserId: null,
        actionKey: null,
        projectId: entry.projectId,
        outcome: entry.outcome,
        reasonCode: entry.reasonCode,
        status: entry.status,
        payloadHash: null,
        policySetVersion: null,
        expiresAt: null,
        createdAt: entry.createdAt.toISOString(),
      })),
      counts: {
        policySets: 0,
        pendingApprovals: evaluations.filter((entry) => entry.status === "PENDING_APPROVAL").length,
        prohibited: evaluations.filter((entry) => entry.outcome === "PROHIBITED").length,
      },
      externalTransportPerformed: false,
      externalWritePerformed: false,
      providerEffectCount: 0,
    });
  }

  const [policySets, evaluations] = await Promise.all([
    prisma.constructionAuthorityPolicySet.findMany({
      where: { workspaceId: input.workspaceId },
      include: { rules: { orderBy: { ruleKey: "asc" } } },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      take: 25,
    }),
    prisma.constructionAuthorityEvaluation.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  return authorityPolicyCockpitSchema.parse({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    role,
    canManagePolicy: role === "owner",
    policySets: policySets.map((set) => ({
      id: set.id,
      version: set.version,
      stateVersion: set.stateVersion,
      status: set.status,
      policyHash: set.policyHash,
      rules: set.rules.map((rule) => ({
        id: rule.id,
        ruleKey: rule.ruleKey,
        actionKey: rule.actionKey,
        roleScope: rule.roleScope,
        projectId: rule.projectId,
        dataClassification: rule.dataClassification,
        outcome: rule.outcome,
        amountCeilingMinor: rule.amountCeilingMinor,
        reasonCode: rule.reasonCode,
      })),
      createdAt: set.createdAt.toISOString(),
    })),
    evaluations: evaluations.map((entry) => ({
      id: entry.id,
      evaluationVersion: entry.version,
      actorUserId: entry.actorUserId,
      actionKey: entry.actionKey,
      projectId: entry.projectId,
      outcome: entry.outcome,
      reasonCode: entry.reasonCode,
      status: entry.status,
      payloadHash: entry.payloadHash,
      policySetVersion: entry.policySetVersion,
      expiresAt: entry.expiresAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    })),
    counts: {
      policySets: policySets.length,
      pendingApprovals: evaluations.filter((entry) => entry.status === "PENDING_APPROVAL").length,
      prohibited: evaluations.filter((entry) => entry.outcome === "PROHIBITED").length,
    },
    externalTransportPerformed: false,
    externalWritePerformed: false,
    providerEffectCount: 0,
  });
}
