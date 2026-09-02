import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  adminCommercialPortfolioSchema,
  commercialAccountSnapshotSchema,
  commercialCommandResultSchema,
  commercialCommandSchema,
  commercialUsageProjectionSchema,
  ownerCommercialProjectionSchema,
  type AdminCommercialPortfolio,
  type CommercialAccountSnapshot,
  type CommercialCommand,
  type CommercialCommandResult,
  type CommercialUsageProjection,
  type OwnerCommercialProjection,
} from "@/lib/construction-operating-assistant-r34/contracts";
import {
  COMMERCIAL_PLAN_REGISTRY,
  COMMERCIAL_USAGE_METRIC_KEYS,
  assertCommercialRegistryHonest,
  commercialPlan,
} from "@/lib/construction-operating-assistant-r34/registry";
import { prisma } from "@/lib/db";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

type Tx = Prisma.TransactionClient;

export class CommercialAccountConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CommercialAccountConflict";
  }
}

function currentUtcMonth(now: Date) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startsAt, endsAt };
}

function accountSnapshot(row: {
  id: string;
  workspaceId: string;
  planKey: string;
  planVersion: number;
  planHash: string;
  state: string;
  periodStartsAt: Date;
  periodEndsAt: Date;
  accountVersion: number;
  featureSnapshot: unknown;
  usageMetricSnapshot: unknown;
  priceState: string;
  monthlyPriceMinor: number | null;
  currency: string;
  billingProvider: string;
}): CommercialAccountSnapshot {
  return commercialAccountSnapshotSchema.parse({
    accountId: row.id,
    workspaceId: row.workspaceId,
    planKey: row.planKey,
    planVersion: row.planVersion,
    planHash: row.planHash,
    state: row.state,
    periodStartsAt: row.periodStartsAt.toISOString(),
    periodEndsAt: row.periodEndsAt.toISOString(),
    accountVersion: row.accountVersion,
    includedFeatures: row.featureSnapshot,
    usageMetricKeys: row.usageMetricSnapshot,
    priceState: row.priceState,
    monthlyPriceMinor: row.monthlyPriceMinor,
    currency: row.currency,
    billingProvider: row.billingProvider,
  });
}

async function requireAdmin(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== "ADMIN") throw new CommercialAccountConflict("COMMERCIAL_ADMIN_REQUIRED");
  return user;
}

async function usageInTransaction(input: {
  tx: Tx;
  workspaceId: string;
  periodStartsAt: Date;
  periodEndsAt: Date;
}): Promise<CommercialUsageProjection> {
  const period = { gte: input.periodStartsAt, lt: input.periodEndsAt };
  const [activeProjects, activeMembers, messages, mediaReferences, openLoopEvidence, preparedActions, openFollowUps, humanEscalations] = await Promise.all([
    input.tx.constructionProject.count({ where: { workspaceId: input.workspaceId, status: "active" } }),
    input.tx.constructionWorkspaceMember.count({ where: { workspaceId: input.workspaceId, status: "active" } }),
    input.tx.constructionMessage.count({ where: { workspaceId: input.workspaceId, createdAt: period } }),
    input.tx.constructionMessageMediaReference.count({ where: { workspaceId: input.workspaceId, createdAt: period } }),
    input.tx.constructionOpenLoopEvidence.count({ where: { workspaceId: input.workspaceId, createdAt: period } }),
    input.tx.constructionAction.count({ where: { workspaceId: input.workspaceId, status: "proposed" } }),
    input.tx.constructionFollowUp.count({ where: { workspaceId: input.workspaceId, status: { in: ["scheduled", "prepared_unsent", "ready_for_review", "awaiting_response", "escalated", "decision_required"] } } }),
    input.tx.constructionHumanEscalation.count({ where: { workspaceId: input.workspaceId, createdAt: period } }),
  ]);
  const quantities: Record<(typeof COMMERCIAL_USAGE_METRIC_KEYS)[number], number> = {
    ACTIVE_PROJECTS: activeProjects,
    ACTIVE_MEMBERS: activeMembers,
    INGESTED_MESSAGES: messages,
    EVIDENCE_REFERENCES: mediaReferences + openLoopEvidence,
    PREPARED_ACTIONS: preparedActions,
    OPEN_FOLLOW_UPS: openFollowUps,
    HUMAN_ESCALATIONS: humanEscalations,
  };
  const readings = COMMERCIAL_USAGE_METRIC_KEYS.map((metric) => ({
    metric,
    quantity: quantities[metric],
    sourceClass: metric === "ACTIVE_PROJECTS" || metric === "ACTIVE_MEMBERS" || metric === "PREPARED_ACTIONS" || metric === "OPEN_FOLLOW_UPS"
      ? "CURRENT_CANONICAL_STATE" as const
      : "CANONICAL_PERIOD_EVENTS" as const,
    periodStartsAt: input.periodStartsAt.toISOString(),
    periodEndsAt: input.periodEndsAt.toISOString(),
  }));
  const aggregateFingerprint = sha256Canonical({
    workspaceId: input.workspaceId,
    periodStartsAt: input.periodStartsAt.toISOString(),
    periodEndsAt: input.periodEndsAt.toISOString(),
    readings,
  });
  return commercialUsageProjectionSchema.parse({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    periodStartsAt: input.periodStartsAt.toISOString(),
    periodEndsAt: input.periodEndsAt.toISOString(),
    readings,
    aggregateFingerprint,
    informationalOnly: true,
    amountDueMinor: null,
    currency: "CAD",
    providerObserved: false,
    externalEffectCount: 0,
  });
}

export async function commercialUsageForWorkspace(input: {
  workspaceId: string;
  periodStartsAt?: Date;
  periodEndsAt?: Date;
  now?: Date;
}): Promise<CommercialUsageProjection> {
  const defaultPeriod = currentUtcMonth(input.now ?? new Date());
  const periodStartsAt = input.periodStartsAt ?? defaultPeriod.startsAt;
  const periodEndsAt = input.periodEndsAt ?? defaultPeriod.endsAt;
  if (!(periodStartsAt < periodEndsAt)) throw new CommercialAccountConflict("COMMERCIAL_PERIOD_INVALID");
  return prisma.$transaction(
    (tx) => usageInTransaction({ tx, workspaceId: input.workspaceId, periodStartsAt, periodEndsAt }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

function supportSummary(rows: Array<{ state: string }>) {
  const prepared = rows.filter((row) => row.state === "prepared").length;
  const active = rows.filter((row) => row.state === "active" || row.state === "resumed").length;
  const attentionRequired = rows.filter((row) => row.state === "paused" || row.state === "exhausted").length;
  const nextOwner = attentionRequired > 0 ? "OPERATOR" as const : active > 0 ? "WORKER" as const : prepared > 0 ? "OWNER" as const : "NONE" as const;
  return { prepared, active, attentionRequired, nextOwner };
}

export async function commercialAccountForUser(input: {
  userId: string;
  workspaceId: string;
  now?: Date;
}): Promise<OwnerCommercialProjection> {
  assertCommercialRegistryHonest();
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (membership.role === "member") throw new CommercialAccountConflict("COMMERCIAL_FIELD_ACCESS_REFUSED");
    const workspace = await tx.constructionWorkspace.findFirst({
      where: { id: input.workspaceId, status: "active" },
      select: {
        id: true,
        name: true,
        commercialAccount: true,
        humanEscalations: { where: { state: { in: ["prepared", "active", "resumed", "paused", "exhausted"] } }, select: { state: true } },
      },
    });
    if (!workspace) throw new CommercialAccountConflict("COMMERCIAL_WORKSPACE_NOT_FOUND");
    const plan = COMMERCIAL_PLAN_REGISTRY[0];
    const period = workspace.commercialAccount
      ? { startsAt: workspace.commercialAccount.periodStartsAt, endsAt: workspace.commercialAccount.periodEndsAt }
      : currentUtcMonth(now);
    const usage = await usageInTransaction({ tx, workspaceId: workspace.id, periodStartsAt: period.startsAt, periodEndsAt: period.endsAt });
    return ownerCommercialProjectionSchema.parse({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      workspace: { id: workspace.id, name: workspace.name },
      role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
      account: workspace.commercialAccount ? accountSnapshot(workspace.commercialAccount) : null,
      planAvailable: true,
      plan: {
        planKey: plan.planKey,
        version: plan.version,
        nameKey: plan.nameKey,
        descriptionKey: plan.descriptionKey,
        includedFeatures: plan.includedFeatures,
        priceState: plan.priceState,
        monthlyPriceMinor: plan.monthlyPriceMinor,
        currency: plan.currency,
        billingProvider: plan.billingProvider,
      },
      usage,
      support: supportSummary(workspace.humanEscalations),
      unavailableCapabilities: ["LIVE_BILLING", "LIVE_SMS", "LIVE_CALLS", "LIVE_CALENDAR", "LIVE_ACCOUNTING"],
      providerObserved: false,
      externalEffectCount: 0,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function validStateTransition(previous: string, next: string) {
  const allowed: Record<string, string[]> = {
    PREPARED: ["INTERNAL_TRIAL", "SUSPENDED", "CANCELLED"],
    INTERNAL_TRIAL: ["SUSPENDED", "CANCELLED"],
    SUSPENDED: ["INTERNAL_TRIAL", "CANCELLED"],
    CANCELLED: [],
  };
  return allowed[previous]?.includes(next) ?? false;
}

async function replayResult(command: CommercialCommand, actorId: string) {
  const fingerprint = sha256Canonical({ actorId, command });
  const decision = await prisma.constructionCommercialDecision.findUnique({
    where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
    select: { decisionFingerprint: true, nextSnapshot: true },
  });
  if (!decision) return null;
  if (decision.decisionFingerprint !== fingerprint) throw new CommercialAccountConflict("COMMERCIAL_ALTERED_REPLAY_REFUSED");
  return commercialCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    decisionKind: command.kind,
    account: commercialAccountSnapshotSchema.parse(decision.nextSnapshot),
    replayed: true,
    providerObserved: false,
    externalEffectCount: 0,
  });
}

export async function processCommercialCommand(input: {
  actorId: string;
  command: unknown;
  now?: Date;
  retryCount?: number;
}): Promise<CommercialCommandResult> {
  assertCommercialRegistryHonest();
  const command = commercialCommandSchema.parse(input.command);
  const existing = await replayResult(command, input.actorId);
  if (existing) return existing;
  const now = input.now ?? new Date();
  const fingerprint = sha256Canonical({ actorId: input.actorId, command });
  try {
    return await prisma.$transaction(async (tx) => {
      await requireAdmin(tx, input.actorId);
      const workspace = await tx.constructionWorkspace.findFirst({
        where: { id: command.workspaceId, status: "active" },
        select: { id: true, commercialAccount: true },
      });
      if (!workspace) throw new CommercialAccountConflict("COMMERCIAL_WORKSPACE_NOT_FOUND");
      const concurrentDecision = await tx.constructionCommercialDecision.findUnique({
        where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
        select: { decisionFingerprint: true, nextSnapshot: true },
      });
      if (concurrentDecision) {
        if (concurrentDecision.decisionFingerprint !== fingerprint) throw new CommercialAccountConflict("COMMERCIAL_ALTERED_REPLAY_REFUSED");
        return commercialCommandResultSchema.parse({
          schemaVersion: 1, commandId: command.commandId, workspaceId: command.workspaceId, decisionKind: command.kind,
          account: concurrentDecision.nextSnapshot, replayed: true, providerObserved: false, externalEffectCount: 0,
        });
      }

      const prior = workspace.commercialAccount ? accountSnapshot(workspace.commercialAccount) : null;
      let nextRow;
      if (command.kind === "ASSIGN_PLAN") {
        if (workspace.commercialAccount || command.expectedAccountVersion !== 0) throw new CommercialAccountConflict("COMMERCIAL_ASSIGNMENT_CONFLICT");
        const plan = commercialPlan(command.planKey!, command.planVersion!);
        const period = currentUtcMonth(now);
        nextRow = await tx.constructionCommercialAccount.create({ data: {
          workspaceId: command.workspaceId,
          planKey: plan.planKey,
          planVersion: plan.version,
          planHash: plan.canonicalHash,
          state: "PREPARED",
          periodStartsAt: period.startsAt,
          periodEndsAt: period.endsAt,
          accountVersion: 1,
          featureSnapshot: [...plan.includedFeatures],
          usageMetricSnapshot: [...plan.usageMetrics],
          priceState: "PRICE_NOT_SET",
          monthlyPriceMinor: null,
          currency: "CAD",
          billingProvider: "DISABLED_LOCAL",
          createdById: input.actorId,
        } });
      } else {
        if (!workspace.commercialAccount) throw new CommercialAccountConflict("COMMERCIAL_ACCOUNT_REQUIRED");
        if (workspace.commercialAccount.accountVersion !== command.expectedAccountVersion) throw new CommercialAccountConflict("COMMERCIAL_STALE_ACCOUNT_VERSION");
        let update: Prisma.ConstructionCommercialAccountUpdateManyMutationInput;
        if (command.kind === "CHANGE_PLAN") {
          const plan = commercialPlan(command.planKey!, command.planVersion!);
          if (workspace.commercialAccount.planKey === plan.planKey && workspace.commercialAccount.planVersion === plan.version) throw new CommercialAccountConflict("COMMERCIAL_PLAN_ALREADY_ASSIGNED");
          update = {
            planKey: plan.planKey, planVersion: plan.version, planHash: plan.canonicalHash,
            featureSnapshot: [...plan.includedFeatures], usageMetricSnapshot: [...plan.usageMetrics],
            priceState: "PRICE_NOT_SET", monthlyPriceMinor: null, currency: "CAD", billingProvider: "DISABLED_LOCAL",
            accountVersion: { increment: 1 },
          };
        } else {
          if (!validStateTransition(workspace.commercialAccount.state, command.nextState!)) throw new CommercialAccountConflict("COMMERCIAL_STATE_TRANSITION_REFUSED");
          update = { state: command.nextState!, accountVersion: { increment: 1 } };
        }
        const updated = await tx.constructionCommercialAccount.updateMany({
          where: { id: workspace.commercialAccount.id, workspaceId: command.workspaceId, accountVersion: command.expectedAccountVersion },
          data: update,
        });
        if (updated.count !== 1) throw new CommercialAccountConflict("COMMERCIAL_CONCURRENT_CHANGE_REFUSED");
        nextRow = await tx.constructionCommercialAccount.findUniqueOrThrow({ where: { id: workspace.commercialAccount.id } });
      }
      const next = accountSnapshot(nextRow);
      await tx.constructionCommercialDecision.create({ data: {
        workspaceId: command.workspaceId,
        accountId: next.accountId,
        commandId: command.commandId,
        kind: command.kind,
        expectedAccountVersion: command.expectedAccountVersion,
        resultingAccountVersion: next.accountVersion,
        priorSnapshot: prior ? prior as Prisma.InputJsonValue : Prisma.JsonNull,
        nextSnapshot: next as Prisma.InputJsonValue,
        actorId: input.actorId,
        decisionFingerprint: fingerprint,
      } });
      return commercialCommandResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        decisionKind: command.kind,
        account: next,
        replayed: false,
        providerObserved: false,
        externalEffectCount: 0,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof CommercialAccountConflict) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await replayResult(command, input.actorId);
      if (replay) return replay;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && (input.retryCount ?? 0) < 3) {
      const replay = await replayResult(command, input.actorId);
      if (replay) return replay;
      return processCommercialCommand({ ...input, command, retryCount: (input.retryCount ?? 0) + 1 });
    }
    throw error;
  }
}

export async function commercialPortfolioForAdmin(input: {
  actorId: string;
  now?: Date;
}): Promise<AdminCommercialPortfolio> {
  assertCommercialRegistryHonest();
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await requireAdmin(tx, input.actorId);
    const workspaces = await tx.constructionWorkspace.findMany({
      where: { status: "active" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        commercialAccount: true,
        commercialDecisions: { orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 1, select: { createdAt: true } },
        humanEscalations: { where: { state: { in: ["prepared", "active", "resumed", "paused", "exhausted"] } }, select: { state: true } },
      },
    });
    const rows = [];
    for (const workspace of workspaces) {
      const period = workspace.commercialAccount
        ? { startsAt: workspace.commercialAccount.periodStartsAt, endsAt: workspace.commercialAccount.periodEndsAt }
        : currentUtcMonth(now);
      const usage = await usageInTransaction({ tx, workspaceId: workspace.id, periodStartsAt: period.startsAt, periodEndsAt: period.endsAt });
      const openSupportCount = workspace.humanEscalations.length;
      const attentionReason = !workspace.commercialAccount
        ? "MISSING_PLAN" as const
        : openSupportCount > 0
          ? "SUPPORT_EXCEPTION" as const
          : "HEALTHY" as const;
      rows.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        account: workspace.commercialAccount ? accountSnapshot(workspace.commercialAccount) : null,
        usage,
        openSupportCount,
        attentionReason,
        safeNextAction: attentionReason === "MISSING_PLAN" ? "ASSIGN_LOCAL_PLAN" as const : attentionReason === "SUPPORT_EXCEPTION" ? "REVIEW_SUPPORT" as const : "NO_ACTION" as const,
        lastDecisionAt: workspace.commercialDecisions[0]?.createdAt.toISOString() ?? null,
      });
    }
    const rank = { MISSING_PLAN: 0, SUPPORT_EXCEPTION: 1, USAGE_REVIEW: 2, HEALTHY: 3 } as const;
    rows.sort((a, b) => rank[a.attentionReason] - rank[b.attentionReason] || a.workspaceName.localeCompare(b.workspaceName) || a.workspaceId.localeCompare(b.workspaceId));
    return adminCommercialPortfolioSchema.parse({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      workspaces: rows,
      providerObserved: false,
      externalEffectCount: 0,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
