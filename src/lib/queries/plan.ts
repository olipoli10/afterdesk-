import "server-only";
import { prisma } from "@/lib/db";
import { clientScopeFromPlanVersion, type ClientScope } from "@/lib/ai-work-engine/client-scope";
import { buildCompilePreview, type CompilePreview } from "@/lib/ai-work-engine/compile-preview";

export type { CompilePreview, CompilePreviewStep } from "@/lib/ai-work-engine/compile-preview";

/**
 * Role-shaped reads for the AI work engine, same discipline as
 * src/lib/queries/tasks.ts: the ADMIN read returns everything, the CLIENT
 * read returns a sanitized allowlist projection and nothing else. Nothing
 * in this file is ever selected into clientTaskSelect or vaTaskSelect —
 * price-wall.test.ts pins that.
 */

export const planStepSelect = {
  id: true,
  order: true,
  title: true,
  description: true,
  executor: true,
  humanRole: true,
  tool: true,
  // The execution contract. The admin edits primitiveId directly, so it has
  // to be READ here too: the editor round-trips what it was given, and a
  // column missing from this select is a column the next saved version loses.
  primitiveId: true,
  // 1E-alpha: the capability's frozen configuration, read back so the
  // editor can round-trip it instead of stripping it on save.
  params: true,
  primitiveVersion: true,
  fixedMinutes: true,
  secondsPerUnit: true,
  estimatedMinutesOptimistic: true,
  estimatedMinutesLikely: true,
  estimatedMinutesConservative: true,
  estimatedAiCostCents: true,
  estimatedToolUnits: true,
  verificationMethod: true,
  acceptanceCriteria: true,
  riskLevel: true,
  riskNote: true,
  dependsOnOrder: true,
} as const;

const planVersionSelect = {
  id: true,
  version: true,
  source: true,
  parentVersionId: true,
  editedByAdminId: true,
  editNote: true,
  deliverableDescription: true,
  assumptions: true,
  exclusions: true,
  internalCostLikelyCents: true,
  internalCostConservativeCents: true,
  suggestedPriceCents: true,
  suggestedVaPayoutCents: true,
  calibration: true,
  model: true,
  createdAt: true,
  steps: { select: planStepSelect, orderBy: { order: "asc" as const } },
  critique: {
    select: {
      provider: true,
      model: true,
      missingSteps: true,
      wrongToolFlags: true,
      timeRiskFlags: true,
      securityRiskFlags: true,
      overallAssessment: true,
      severity: true,
      computedAt: true,
    },
  },
} as const;

/**
 * ADMIN ONLY — the full picture for the pricing screen's blocks A-D:
 * classification, the latest plan version with steps and critique, and the
 * version history's pricing summaries for the diff column.
 */
export async function planReviewForAdmin(taskId: string) {
  const [classification, versions] = await Promise.all([
    prisma.taskAiClassification.findUnique({ where: { taskId } }),
    prisma.taskExecutionPlanVersion.findMany({
      where: { taskId },
      select: planVersionSelect,
      orderBy: { version: "desc" },
    }),
  ]);

  const latest = versions[0] ?? null;
  return {
    classification,
    latestVersion: latest,
    // Oldest-first summaries for the compact history strip; the full steps
    // of older versions are not loaded — the diff the admin needs is "what
    // did the numbers do", and drilling into an old version is a non-goal
    // for Phase 1A.
    history: versions
      .slice()
      .reverse()
      .map((v) => ({
        id: v.id,
        version: v.version,
        source: v.source,
        editNote: v.editNote,
        suggestedPriceCents: v.suggestedPriceCents,
        suggestedVaPayoutCents: v.suggestedVaPayoutCents,
        createdAt: v.createdAt,
      })),
  };
}

export type PlanReviewForAdmin = Awaited<ReturnType<typeof planReviewForAdmin>>;

/**
 * CLIENT — the scope block on the quote page. A separate narrow,
 * ownership-checked query (the latestPaymentStatusForClient pattern), never
 * a widening of clientTaskSelect. Returns the SANITIZED projection only:
 * no costs, no steps, no confidence, no critique — those have no client
 * representation at all.
 */
export async function quotedScopeForClient(
  taskId: string,
  clientId: string
): Promise<ClientScope | null> {
  const task = await prisma.task.findFirst({
    // Scope is shown while a quote is live and stays visible through
    // payment: the client is deciding against it. After acceptance the
    // snapshot is the authoritative record.
    where: { id: taskId, clientId, status: { in: ["quoted", "awaiting_payment"] } },
    select: {
      quotedPlanVersion: {
        select: { deliverableDescription: true, assumptions: true, exclusions: true },
      },
    },
  });
  return clientScopeFromPlanVersion(task?.quotedPlanVersion ?? null);
}

/* ────────────────────────── LOT B: compile preview ────────────────────────── */

/**
 * ADMIN ONLY — the pre-quote compile preview. A thin loader: every decision
 * lives in the pure `buildCompilePreview` (compile-preview.ts), which is what
 * the tests exercise. This function only fetches the latest plan version and
 * the classification; it creates nothing, reserves nothing, calls nothing.
 */
export async function compilePreviewForAdmin(taskId: string): Promise<CompilePreview | null> {
  const [version, classification] = await Promise.all([
    prisma.taskExecutionPlanVersion.findFirst({
      where: { taskId },
      orderBy: { version: "desc" },
      select: {
        dataClass: true,
        dataClassSignals: true,
        automationCostPolicyVersion: true,
        expectedAutomationCostMicros: true,
        conservativeAutomationCostMicros: true,
        automationSpendCeilingMicros: true,
        calibration: true,
        steps: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            title: true,
            executor: true,
            primitiveId: true,
            primitiveVersion: true,
            params: true,
            dependsOnOrder: true,
            demotedForBudget: true,
          },
        },
      },
    }),
    prisma.taskAiClassification.findUnique({
      where: { taskId },
      select: { sensitiveData: true, requiredAccess: true },
    }),
  ]);
  if (!version || version.steps.length === 0) return null;
  return buildCompilePreview(version, classification);
}
