import type { ManagedFollowUpPolicy } from "./contracts";

export type FollowUpOutcomeDecision = {
  status: "SCHEDULED" | "ESCALATED" | "DECISION_REQUIRED";
  useEscalationOwner: boolean;
  nextDueAt: string | null;
};

export function decideNoResponse(input: {
  policy: ManagedFollowUpPolicy;
  attempt: number;
  escalationLevel: number;
  occurredAt: string;
}): FollowUpOutcomeDecision {
  if (input.attempt >= input.policy.maxAttempts) {
    return { status: "DECISION_REQUIRED", useEscalationOwner: false, nextDueAt: null };
  }
  const nextDueAt = new Date(
    new Date(input.occurredAt).getTime() + input.policy.retryIntervalMinutes * 60_000,
  ).toISOString();
  if (
    input.escalationLevel === 0 &&
    input.attempt >= input.policy.escalateAfterAttempts
  ) {
    if (!input.policy.escalationOwner) {
      return { status: "DECISION_REQUIRED", useEscalationOwner: false, nextDueAt: null };
    }
    return { status: "ESCALATED", useEscalationOwner: true, nextDueAt };
  }
  return { status: "SCHEDULED", useEscalationOwner: false, nextDueAt };
}

const FORBIDDEN_FIELD_KEYS = new Set([
  "body",
  "policy",
  "receivableId",
  "invoiceReference",
  "amountMinor",
  "outstandingAmountMinor",
  "payment",
  "sourceRef",
  "commandHash",
  "beforeState",
  "afterState",
  "result",
]);

export function rejectFieldFollowUpLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldFollowUpLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) {
      throw new Error("FOLLOW_UP_FIELD_LEAK_REFUSED");
    }
    rejectFieldFollowUpLeaks(child);
  }
}
