export type PromiseStatus = "ACTIVE" | "KEPT" | "BROKEN" | "REVOKED";

export function nextCollectionDecision(input: {
  receivableStatus: "OPEN" | "PARTIAL" | "PAID" | "DISPUTED" | "VOID";
  outstandingAmountMinor: number;
  dueAt: string;
  activePromise: { status: PromiseStatus; promisedFor: string } | null;
  latestBrokenPromise: boolean;
  now: string;
}) {
  if (input.outstandingAmountMinor === 0 || input.receivableStatus === "PAID" || input.receivableStatus === "VOID") {
    return "NO_ACTION" as const;
  }
  if (input.latestBrokenPromise) return "COLLECT_BROKEN_PROMISE" as const;
  if (input.activePromise) {
    return new Date(input.activePromise.promisedFor).getTime() <= new Date(input.now).getTime()
      ? "REVIEW_PAYMENT_PROMISE" as const
      : "WAIT_FOR_PROMISE" as const;
  }
  return new Date(input.dueAt).getTime() <= new Date(input.now).getTime()
    ? "COLLECT_OVERDUE_INVOICE" as const
    : "WAIT_UNTIL_DUE" as const;
}

export function assertPaymentPromiseResolution(input: {
  outcome: "KEPT" | "BROKEN" | "REVOKED";
  occurredAt: string;
  promisedFor: string;
  promisedAmountMinor: number;
  receivedSincePromiseMinor: number;
  outstandingAmountMinor: number;
}) {
  if (input.outcome === "KEPT" && input.receivedSincePromiseMinor < input.promisedAmountMinor) {
    throw new Error("PAYMENT_PROMISE_NOT_PROVEN_KEPT");
  }
  if (
    input.outcome === "BROKEN" &&
    (new Date(input.occurredAt).getTime() < new Date(input.promisedFor).getTime() || input.outstandingAmountMinor === 0)
  ) {
    throw new Error("PAYMENT_PROMISE_NOT_DUE_OR_ALREADY_PAID");
  }
}

export function assertFieldEconomicProjection(value: unknown) {
  const serialized = JSON.stringify(value);
  if (/(?:amount|currency|invoice|payment|promise|balance|receivable|\$|\bCAD\b)/i.test(serialized)) {
    throw new Error("FIELD_ECONOMIC_DATA_LEAK");
  }
}
