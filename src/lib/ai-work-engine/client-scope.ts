/**
 * The ONLY paths from engine data to anything a paying client reads: the
 * quote page's scope block, and the acceptance snapshot's scope fields.
 * Allowlist projections in the exact mold of formatMetricsForClient
 * (src/lib/delivery-metrics.ts): named fields only, every string sanitized,
 * anything unknown dropped. The plan's internal costs, step estimates,
 * critique and confidence have NO representation here and must never gain
 * one — internal costing is not client copy.
 *
 * (No "server-only": pure functions, unit-tested directly.)
 */

/**
 * House copy rule: no em-dash in user-facing strings. Model output does not
 * get an exemption, so the sanitizer rewrites rather than trusts. Also
 * collapses whitespace and hard-caps length so a runaway generation cannot
 * blow up a quote card. The cap sits ABOVE every zod generation cap
 * (1500/2000 in schemas.ts) on purpose: zod is the real bound, this is the
 * emergency brake — found live at 300, where it truncated a contract
 * assumption mid-word on the quote page and in the snapshot.
 */
export function sanitizeClientText(raw: string, maxLength = 2000): string {
  return raw
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export type ClientScope = {
  deliverable: string;
  assumptions: string[];
  exclusions: string[];
};

/**
 * Projects a quoted plan version's client-safe fields. Takes unknown on
 * purpose (the same defensive posture as formatMetricsForClient): a shape
 * that does not match renders nothing, never a crash and never a raw dump.
 */
export function clientScopeFromPlanVersion(raw: unknown): ClientScope | null {
  if (raw === null || typeof raw !== "object") return null;
  const v = raw as {
    deliverableDescription?: unknown;
    assumptions?: unknown;
    exclusions?: unknown;
  };
  if (typeof v.deliverableDescription !== "string" || v.deliverableDescription.length === 0) {
    return null;
  }

  const strings = (value: unknown, max: number): string[] =>
    Array.isArray(value)
      ? value
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, max)
          .map((s) => sanitizeClientText(s))
      : [];

  return {
    deliverable: sanitizeClientText(v.deliverableDescription),
    assumptions: strings(v.assumptions, 10),
    exclusions: strings(v.exclusions, 10),
  };
}

export type AcceptanceSnapshotInput = {
  taskId: string;
  acceptedByUserId: string;
  task: {
    title: string;
    description: string;
    quantity: string | null;
    clientPriceCents: number;
    currency: string;
    clientDeadlineUtc: Date | null;
    quotedPlanVersionId: string | null;
    category: { disputeCriteria: string | null } | null;
  };
  quotedPlanVersion: {
    deliverableDescription: string;
    assumptions: string[];
    exclusions: string[];
    /**
     * The frozen automation economics of the version being accepted. Copied
     * onto the contract VERBATIM, in the same transaction: the compiler reads
     * the ceiling from the snapshot and never recomputes it, which is what
     * stops a later deploy from changing what an already-signed mandate may
     * spend. Null on a plan written before this correction.
     */
    expectedAutomationCostMicros: bigint | null;
    conservativeAutomationCostMicros: bigint | null;
    automationSpendCeilingMicros: bigint | null;
    automationCostPolicyVersion: string | null;
    /** 1E-alpha: the execution data class, frozen with the economics. */
    dataClass: string | null;
  } | null;
  settings: {
    revisionWindowHours: number;
    maxRevisionRounds: number;
    disputeWindowHours: number;
  };
};

/**
 * Builds the immutable contract record — exactly what the client saw at the
 * moment they clicked Accept. Pure, so the test can assert every one of the
 * founder-required elements (price, deadline, scope, quantity, deliverable,
 * assumptions, exclusions, correction policy, plan version) is present
 * without a database. Scope strings pass through the same sanitizer as the
 * quote page, so the snapshot records what was RENDERED, not the raw model
 * output.
 */
export function buildAcceptanceSnapshot(input: AcceptanceSnapshotInput) {
  const scope = input.quotedPlanVersion
    ? clientScopeFromPlanVersion(input.quotedPlanVersion)
    : null;

  return {
    taskId: input.taskId,
    planVersionId: input.task.quotedPlanVersionId,
    clientPriceCents: input.task.clientPriceCents,
    currency: input.task.currency,
    title: input.task.title,
    description: input.task.description,
    quantity: input.task.quantity,
    clientDeadlineUtc: input.task.clientDeadlineUtc,
    deliverableDescription: scope?.deliverable ?? null,
    assumptions: scope?.assumptions ?? [],
    exclusions: scope?.exclusions ?? [],
    disputeCriteria: input.task.category?.disputeCriteria ?? null,
    revisionWindowHours: input.settings.revisionWindowHours,
    maxRevisionRounds: input.settings.maxRevisionRounds,
    disputeWindowHours: input.settings.disputeWindowHours,
    /**
     * Verbatim, never recomputed. An inequality between these and the plan
     * version's own aggregates would mean the contract and the plan disagree
     * about what the machine may spend, so a test asserts they match exactly.
     */
    expectedAutomationCostMicros: input.quotedPlanVersion?.expectedAutomationCostMicros ?? null,
    conservativeAutomationCostMicros:
      input.quotedPlanVersion?.conservativeAutomationCostMicros ?? null,
    automationSpendCeilingMicros: input.quotedPlanVersion?.automationSpendCeilingMicros ?? null,
    automationCostPolicyVersion: input.quotedPlanVersion?.automationCostPolicyVersion ?? null,
    dataClass: input.quotedPlanVersion?.dataClass ?? null,
    acceptedByUserId: input.acceptedByUserId,
  };
}
