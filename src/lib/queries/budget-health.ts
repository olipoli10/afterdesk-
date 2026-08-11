import "server-only";
import { prisma } from "@/lib/db";

/**
 * THE SETTLE-OVER-HOLD TRIPWIRE, WIRED AT LAST — plus the unresolved-money
 * report the budget module has promised since 1D.
 *
 * Two questions, both answered from WorkflowBudgetHold and from nowhere else:
 *
 * 1. UNRESOLVED HOLDS — money reserved for calls whose spend we are not sure
 *    about (`held` past its moment: dispatched_then_cancelled and unaccounted
 *    attempts keep their hold on purpose). Not losses; admissions of
 *    ignorance, expressed as money, that an operator should see.
 *
 * 2. SETTLE OVER HOLD — attempts whose measured spend EXCEEDED their own
 *    reservation. Under budget_v2 this is the one forbidden direction
 *    ("reserving high and settling low is safe; the reverse silently
 *    overspends"), and 1E-beta1 gives it a concrete face: the provider's
 *    content bound exempts binary content, so a disguised binary on a fetch
 *    attempt is priced above its hold. web.fetch funds ONE attempt and its
 *    cap carries headroom precisely so this stays rare; THIS COUNT is the
 *    evidence either way. A non-zero row here is a real event to read, never
 *    a display artifact.
 *
 * Raw SQL because the comparison is column-to-column (settledMicros >
 * amountMicros), which the Prisma filter API cannot express. Aggregates only:
 * no client data, no field names, safe for the admin reliability page.
 */

export type BudgetHealth = {
  unresolvedHolds: number;
  unresolvedHeldMicros: bigint;
  settleOverHolds: number;
  /** Total excess of settled spend above the holds that were breached. */
  settleOverExcessMicros: bigint;
};

export async function budgetHealthForAdmin(): Promise<BudgetHealth> {
  const [unresolved] = await prisma.$queryRaw<
    { holds: bigint; micros: bigint | null }[]
  >`SELECT COUNT(*)::bigint AS holds, COALESCE(SUM("amountMicros"), 0)::bigint AS micros
    FROM "WorkflowBudgetHold" WHERE status = 'held'`;
  const [over] = await prisma.$queryRaw<
    { holds: bigint; micros: bigint | null }[]
  >`SELECT COUNT(*)::bigint AS holds,
           COALESCE(SUM("settledMicros" - "amountMicros"), 0)::bigint AS micros
    FROM "WorkflowBudgetHold"
    WHERE status = 'settled' AND "settledMicros" > "amountMicros"`;
  return {
    unresolvedHolds: Number(unresolved?.holds ?? 0n),
    unresolvedHeldMicros: unresolved?.micros ?? 0n,
    settleOverHolds: Number(over?.holds ?? 0n),
    settleOverExcessMicros: over?.micros ?? 0n,
  };
}
