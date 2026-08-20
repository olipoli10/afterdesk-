import "server-only";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";

/**
 * R5 — THE ACCOUNT-LEVEL PROVIDER SPEND CIRCUIT BREAKER.
 *
 * WorkflowBudgetHold (workflow-budget.ts) protects ONE accepted run. This
 * protects AfterDesk itself: cumulative exposure across EVERY billable
 * Anthropic call the platform makes — every workflow-run primitive AND the
 * Phase 1A pipeline (classify/plan/critique), which has no run and no step
 * at all — against an operator-set operational ceiling.
 *
 * Three concepts, kept separate on purpose:
 *   A. the accepted contract's economics (frozen, immutable, untouched here);
 *   B. one run's budget (WorkflowBudgetHold, untouched here);
 *   C. AfterDesk's own account-wide ceiling (this file).
 * A block here never rewrites A or B. It only decides whether THIS attempt
 * may dispatch right now.
 *
 * ── WHY A RESERVATION, NOT A COMPARISON — same reasoning as workflow-budget.ts ──
 *
 * `pg_advisory_xact_lock`, keyed on (provider, period), serialises every
 * concurrent reserver against the SAME window before either of them can read
 * committed spend. Two attempts racing for the last dollar of the ceiling
 * cannot both pass: the second one's read already sees the first one's hold.
 *
 * ── WHAT THIS COVERS (R5.2 — the perimeter, closed) ──
 *
 * Every billable AI-provider call the production application makes:
 *   - workflow execution primitives  (workflow-runs.ts)
 *   - Phase 1A classify/plan/critique (ai-work-engine/index.ts)
 *   - Voyage embeddings              (ai-work-engine/index.ts, provider="voyage")
 *   - client intake chat             (server/actions/intake.ts)
 *   - the worker assistant           (server/actions/va-assistant.ts)
 *   - admin closed-job analysis      (server/actions/admin-closed-jobs.ts)
 * The list is not maintained by hand: test/capability-substrate.test.ts pins
 * the provider-client allowlist AND requires every module on it to declare how
 * it is metered, so a new provider call fails CI unless it joins this boundary.
 *
 * STILL OUTSIDE, and deliberately: non-AI vendors that bill on other axes —
 * Resend (email), Cloudflare R2 (storage), Stripe (payments). They are not
 * per-call model spend and are not what this ceiling governs; naming them here
 * is the honest alternative to implying they are covered.
 *
 * Scope is PER DATABASE. Holds live in whichever database the process is
 * connected to, so a test/canary deployment's spend never appears in
 * production's ledger even when both bill the same provider organisation. A
 * genuinely account-wide figure could only come from the provider's own usage
 * API, never from a table one deployment owns — which is why the provider's
 * own monthly hard cap remains a required, separate control.
 *
 * ── WHY A DAILY WINDOW ──
 *
 * An unwindowed lifetime ceiling only ever counts up and eventually always
 * trips — that is not an emergency brake, it is a shutdown switch. A UTC
 * calendar day is the smallest concept that makes "operational ceiling"
 * actually operational, and it is the only windowing this file adds: no
 * per-model, per-customer or per-vertical dimension exists here.
 *
 * ── WHY (operationKey, attempt) AND NOT A NEW IDENTITY ──
 *
 * Every caller already has one: a workflow-run primitive's own
 * `{primitiveId}:{snapshotId}:{order}` (globally unique — snapshotId is),
 * or `AiOperation.operationKey` (`engine:{taskId}:{runKey}:{stage}`) for
 * Phase 1A. Reusing it is what makes the unique index below a real
 * idempotency guarantee rather than a second bookkeeping surface that can
 * drift from the first.
 *
 * ── WHY PRODUCTION CODE HAS NO live/synthetic/replay BRANCH ──
 *
 * None of the rest of this engine's provider path knows about test mode —
 * `new Anthropic(...)` is called unconditionally everywhere, and vitest
 * mocks the whole Anthropic SDK module before this code ever runs. This
 * file follows the same rule: it always reserves for real. "Synthetic/
 * replay spends zero real account-level quota" is proven
 * the same way R1-R4 already proved "zero real spend" — a test database
 * physically separate from production, plus `providerStats().budget.calls
 * === 0` showing no HTTP request ever left the process — never by teaching
 * production code to recognise a test.
 */

export const ACCOUNT_SPEND_CEILING_REASON_KEY = "ACCOUNT_PROVIDER_SPEND_CEILING";
export const ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY = "ACCOUNT_PROVIDER_SPEND_CEILING_NOT_CONFIGURED";
/** Stable TaskEvent.action for a block — queryable, never only a sentence. */
export const ACCOUNT_SPEND_BLOCKED_EVENT_ACTION = "account_provider_spend_blocked";
/**
 * R5.2 — the same durable fact for paths that have NO taskId to hang a
 * TaskEvent on (client intake). Written into the AiUsage row those paths
 * already create for a failed turn, so the block is queryable without adding a
 * table or a second taxonomy.
 */
export const ACCOUNT_SPEND_BLOCKED_USAGE_STOP_REASON = "account_spend_blocked";

const DEFAULT_PROVIDER = "anthropic";

/**
 * R5.2 — ONE CEILING PER PROVIDER, because one ceiling across providers would
 * be a FALSE SAFETY CLAIM.
 *
 * The committed aggregate is scoped to (provider, periodKey). If a single
 * `ACCOUNT_PROVIDER_SPEND_CEILING_MICROS` were compared against each provider's
 * own aggregate, a "$10 ceiling" would in fact permit $10 of Anthropic PLUS
 * $10 of Voyage — the operator would read one number and be exposed to N times
 * it. Naming the provider in the variable makes the real limit the stated one.
 *
 * BACKWARD COMPATIBLE: anthropic still reads the original variable when the
 * provider-specific one is absent, so every existing deployment, harness and
 * R5 test keeps working unchanged.
 */
const CEILING_ENV_VAR = "ACCOUNT_PROVIDER_SPEND_CEILING_MICROS";
const CEILING_ENV_BY_PROVIDER: Record<string, string> = {
  anthropic: "ACCOUNT_PROVIDER_SPEND_CEILING_ANTHROPIC_MICROS",
  voyage: "ACCOUNT_PROVIDER_SPEND_CEILING_VOYAGE_MICROS",
};

/** UTC calendar day. Deterministic, no library, no locale. */
export function dailyPeriodKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The raw ceiling, resolved from AfterDesk's own configuration — never from
 * the model, customer text, an accepted plan, or a provider response. `null`
 * means "not configured or not a valid positive integer"; what that MEANS is
 * decided by the caller (see `isProductionEnvironment` below), not here —
 * this function only reads.
 */
export function resolveAccountSpendCeilingMicros(
  provider: string = DEFAULT_PROVIDER,
  env: NodeJS.ProcessEnv = process.env
): bigint | null {
  const specific = CEILING_ENV_BY_PROVIDER[provider];
  const raw =
    (specific ? env[specific] : undefined) ??
    // Only the default provider inherits the original, un-suffixed variable.
    // A new provider must be configured explicitly or it fails closed.
    (provider === DEFAULT_PROVIDER ? env[CEILING_ENV_VAR] : undefined);
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  try {
    const value = BigInt(raw.trim());
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

/**
 * PRODUCTION FAILS CLOSED: an unset or invalid ceiling in production means
 * every reservation is refused (`ceiling_not_configured`) rather than
 * defaulting to unlimited — a missing ceiling silently meaning "no limit" is
 * precisely the failure mode this lot exists to close. Same
 * `NODE_ENV === "production"` gate already used by src/lib/auth.ts,
 * src/lib/storage.ts and src/lib/file-security.ts for their own fail-fast
 * checks.
 *
 * NON-PRODUCTION (dev, plain test) is UNCONSTRAINED when the variable is
 * unset: reservations still write real rows (this file has no test-mode
 * branch — see the file header), but nothing is compared against a ceiling
 * that does not exist. This is what keeps every existing .scratch/*.e2e.ts
 * harness (R1-R4, none of which set this variable, and none of which this
 * lot may modify) unaffected: an R5 test that wants to prove the BLOCKING
 * path sets the variable explicitly, exactly like existing harnesses already
 * set TEST_PROVIDER_MODE and a run-scoped ledger path.
 */
function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export type AccountSpendGrant = {
  ok: true;
  holdId: string;
  grantedMicros: bigint;
  periodKey: string;
  /** Whether this call created the unique attempt reservation. */
  created: boolean;
};

export type AccountSpendRefusal = {
  ok: false;
  reason: "ceiling_not_configured" | "would_exceed_account_ceiling";
  provider: string;
  periodKey: string;
  ceilingMicros: bigint | null;
  committedMicros: bigint;
  requestedMicros: bigint;
};

/**
 * Thrown by callers that cannot express a refusal as a return value without
 * disturbing an existing contract (Phase 1A's runClassification/
 * runPlanGeneration/runCritique, which already propagate a throw through
 * failAiOperation exactly like any other provider error). `.message` always
 * contains ACCOUNT_SPEND_CEILING_REASON_KEY — greppable in AiOperation.lastError
 * and AiUsage — and `.refusal` carries the structured facts for a caller that
 * wants to build its own durable record instead.
 */
export class AccountSpendCeilingError extends Error {
  readonly refusal: AccountSpendRefusal;
  constructor(refusal: AccountSpendRefusal) {
    const key =
      refusal.reason === "ceiling_not_configured"
        ? ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY
        : ACCOUNT_SPEND_CEILING_REASON_KEY;
    super(
      `${key}: provider=${refusal.provider} period=${refusal.periodKey} ` +
        `committed=${refusal.committedMicros}µ requested=${refusal.requestedMicros}µ ` +
        `ceiling=${refusal.ceilingMicros ?? "unset"}µ`
    );
    this.name = "AccountSpendCeilingError";
    this.refusal = refusal;
  }
}

/**
 * Reserve the worst case of one attempt against AfterDesk's account-wide
 * daily ceiling. Idempotent per (provider, operationKey, attempt): a replay
 * returns the existing hold rather than stacking a second one — same
 * discipline as reserveSpend in workflow-budget.ts.
 */
export async function reserveAccountProviderSpend(input: {
  operationKey: string;
  attempt: number;
  worstCaseMicros: bigint;
  provider?: string;
  now?: Date;
}): Promise<AccountSpendGrant | AccountSpendRefusal> {
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const now = input.now ?? new Date();
  const periodKey = dailyPeriodKey(now);

  return prisma.$transaction(async (tx) => {
    /**
     * Serialised per (provider, period), not per operation: the whole point
     * is that two DIFFERENT operations racing for the last of the same
     * day's ceiling must not both pass. The lock is transaction-scoped and
     * releases on commit or rollback with no cleanup path of its own.
     */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`acct-spend:${provider}:${periodKey}`}))`;

    const existing = await tx.accountProviderSpendHold.findUnique({
      where: {
        provider_operationKey_attempt: {
          provider,
          operationKey: input.operationKey,
          attempt: input.attempt,
        },
      },
      select: { id: true, amountMicros: true, status: true, periodKey: true },
    });
    if (existing && existing.status === "held") {
      return {
        ok: true as const,
        holdId: existing.id,
        grantedMicros: existing.amountMicros,
        periodKey: existing.periodKey,
        created: false,
      };
    }

    const ceiling = resolveAccountSpendCeilingMicros(provider);
    if (ceiling === null && isProductionEnvironment()) {
      return {
        ok: false as const,
        reason: "ceiling_not_configured" as const,
        provider,
        periodKey,
        ceilingMicros: null,
        committedMicros: 0n,
        requestedMicros: input.worstCaseMicros,
      };
    }

    /**
     * Committed = already-settled spend this period PLUS every attempt still
     * held (outcome unknown or in flight). An uncertain attempt keeps
     * occupying its full worst case — identical rule to workflow-budget.ts.
     * For a settled row, `amountMicros` still holds the ORIGINAL reservation;
     * `settledMicros` is what actually happened, and that is the figure that
     * counts once known.
     *
     * Skipped entirely when `ceiling` is null (non-production, unconfigured):
     * there is nothing to compare against, and querying it would cost a scan
     * for a number the next branch cannot use anyway.
     */
    if (ceiling !== null) {
      const [heldAgg, settledAgg] = await Promise.all([
        tx.accountProviderSpendHold.aggregate({
          where: { provider, periodKey, status: "held" },
          _sum: { amountMicros: true },
        }),
        tx.accountProviderSpendHold.aggregate({
          where: { provider, periodKey, status: "settled" },
          _sum: { settledMicros: true },
        }),
      ]);
      const committed = (settledAgg._sum.settledMicros ?? 0n) + (heldAgg._sum.amountMicros ?? 0n);

      if (committed + input.worstCaseMicros > ceiling) {
        return {
          ok: false as const,
          reason: "would_exceed_account_ceiling" as const,
          provider,
          periodKey,
          ceilingMicros: ceiling,
          committedMicros: committed,
          requestedMicros: input.worstCaseMicros,
        };
      }
    }

    const hold = await tx.accountProviderSpendHold.create({
      data: {
        provider,
        periodKey,
        operationKey: input.operationKey,
        attempt: input.attempt,
        amountMicros: input.worstCaseMicros,
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      holdId: hold.id,
      grantedMicros: input.worstCaseMicros,
      periodKey,
      created: true,
    };
  });
}

/**
 * R5.1 — THE BLOCK, RECORDED AS A DURABLE STRUCTURED FACT.
 *
 * workflow-runs.ts already writes this TaskEvent inline at its own refusal.
 * Phase 1A did not: it only threw, and failAiOperation stored a truncated
 * free-text `lastError`, which `accountSpendHealthForAdmin`'s blocked count
 * cannot query. Since Phase 1A is the FIRST provider contact for every new
 * task, that made the one screen built to show the breaker firing structurally
 * blind to the most common place it fires — an operator could not tell "never
 * fired" from "firing on every task", and the natural reaction to the former
 * is to raise the ceiling.
 *
 * Never throws: a failure to record the reason must not become a second,
 * louder failure on top of the refusal that is already being handled.
 */
export async function recordAccountSpendBlocked(input: {
  taskId: string;
  stage: string;
  operationKey: string;
  attempt: number;
  refusal: AccountSpendRefusal;
}): Promise<void> {
  const { refusal } = input;
  try {
    await prisma.taskEvent.create({
      data: {
        taskId: input.taskId,
        action: ACCOUNT_SPEND_BLOCKED_EVENT_ACTION,
        meta: {
          reasonKey:
            refusal.reason === "ceiling_not_configured"
              ? ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY
              : ACCOUNT_SPEND_CEILING_REASON_KEY,
          stage: input.stage,
          operationKey: input.operationKey,
          attempt: input.attempt,
          provider: refusal.provider,
          periodKey: refusal.periodKey,
          ceilingMicros: refusal.ceilingMicros?.toString() ?? null,
          committedMicros: refusal.committedMicros.toString(),
          requestedMicros: refusal.requestedMicros.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[account-spend] failed to record a block event", { stage: input.stage, error });
  }
}

/**
 * Convert a hold into the cost that actually happened. Pass the caller's own
 * transaction so the account-level hold, the per-run hold, and the
 * TaskToolInvocation row all settle atomically together — same discipline as
 * settleHold in workflow-budget.ts.
 */
export async function settleAccountSpendHold(
  tx: Prisma.TransactionClient,
  holdId: string,
  actualMicros: bigint
): Promise<void> {
  await tx.accountProviderSpendHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "settled", settledMicros: actualMicros < 0n ? 0n : actualMicros },
  });
}

/**
 * Same conversion, for callers with no surrounding transaction of their own
 * to join — classify/plan/critique write no other row atomically alongside
 * this settlement, so there is nothing to compose with.
 */
export async function settleAccountSpendHoldDirect(
  holdId: string,
  actualMicros: bigint
): Promise<void> {
  await prisma.accountProviderSpendHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "settled", settledMicros: actualMicros < 0n ? 0n : actualMicros },
  });
}

/**
 * Give the room back. ONLY legal when nothing was dispatched — the exact
 * rule releaseHold already enforces for the per-run hold. An uncertain
 * attempt (dispatched_then_cancelled, unaccounted) keeps its hold.
 */
export async function releaseAccountSpendHold(holdId: string): Promise<void> {
  await prisma.accountProviderSpendHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "released", settledMicros: 0n },
  });
}

/**
 * The minimum admin-readable diagnostic this lot requires: today's ceiling,
 * committed exposure (held + settled), and remaining headroom. No FinOps
 * dashboard — a single row of facts for the operator watching the brake.
 */
export async function accountSpendHealthForAdmin(input?: {
  provider?: string;
  now?: Date;
}): Promise<{
  provider: string;
  periodKey: string;
  ceilingMicros: bigint | null;
  heldMicros: bigint;
  settledMicros: bigint;
  committedMicros: bigint;
  remainingMicros: bigint | null;
  blockedEventCount: number;
}> {
  const provider = input?.provider ?? DEFAULT_PROVIDER;
  const now = input?.now ?? new Date();
  const periodKey = dailyPeriodKey(now);
  const ceiling = resolveAccountSpendCeilingMicros(provider);

  const [heldAgg, settledAgg, blockedEventCount] = await Promise.all([
    prisma.accountProviderSpendHold.aggregate({
      where: { provider, periodKey, status: "held" },
      _sum: { amountMicros: true },
    }),
    prisma.accountProviderSpendHold.aggregate({
      where: { provider, periodKey, status: "settled" },
      _sum: { settledMicros: true },
    }),
    prisma.taskEvent.count({
      where: {
        action: ACCOUNT_SPEND_BLOCKED_EVENT_ACTION,
        createdAt: {
          gte: new Date(`${periodKey}T00:00:00.000Z`),
          lt: new Date(new Date(`${periodKey}T00:00:00.000Z`).getTime() + 24 * 3600 * 1000),
        },
      },
    }),
  ]);

  const heldMicros = heldAgg._sum.amountMicros ?? 0n;
  const settledMicros = settledAgg._sum.settledMicros ?? 0n;
  const committedMicros = heldMicros + settledMicros;

  return {
    provider,
    periodKey,
    ceilingMicros: ceiling,
    heldMicros,
    settledMicros,
    committedMicros,
    remainingMicros: ceiling === null ? null : ceiling - committedMicros,
    blockedEventCount,
  };
}
