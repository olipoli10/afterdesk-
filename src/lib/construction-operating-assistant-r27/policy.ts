import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  normalizedAccountingObservationSchema,
  type NormalizedAccountingObservation,
} from "./contracts";

export function opaqueAccountingRef(input: unknown) {
  return `accounting_${sha256Canonical({schemaVersion:1,scope:"accounting-r27",input})}`;
}

export function accountingObservationHash(input: NormalizedAccountingObservation | unknown) {
  return sha256Canonical({
    schemaVersion: 1,
    scope: "accounting-observation-r27",
    observation: normalizedAccountingObservationSchema.parse(input),
  });
}

export function accountingDraftPayloadHash(input: {
  workspaceId: string;
  accountId: string;
  kind: "INVOICE" | "RECONCILIATION";
  receivableId: string;
  observationId: string | null;
  expectedReceivableVersion: number;
  payload: Record<string, unknown>;
  version: number;
}) {
  return sha256Canonical({schemaVersion:1,scope:"accounting-draft-r27",...input});
}

export function classifyAccountingMatch(input: {
  kind: "INVOICE" | "PAYMENT";
  observationCurrency: string;
  receivableCurrency: string;
  amountMinor: number;
  originalAmountMinor: number;
  outstandingAmountMinor: number;
  projectMatches: boolean;
  contactMatches: boolean;
  receivableStatus: string;
}) {
  if (!input.projectMatches || !input.contactMatches) return {status:"AMBIGUOUS" as const,reason:"PROJECT_OR_CONTACT_MISMATCH"};
  if (input.observationCurrency !== input.receivableCurrency) return {status:"CONFLICT_REQUIRES_REVIEW" as const,reason:"CURRENCY_MISMATCH"};
  if (["paid","void","disputed"].includes(input.receivableStatus)) return {status:"CONFLICT_REQUIRES_REVIEW" as const,reason:"RECEIVABLE_NOT_OPEN"};
  if (input.kind === "INVOICE") {
    return input.amountMinor === input.originalAmountMinor
      ? {status:"EXACT" as const,reason:"INVOICE_AMOUNT_AND_BINDING_EXACT"}
      : {status:"CONFLICT_REQUIRES_REVIEW" as const,reason:"INVOICE_AMOUNT_MISMATCH"};
  }
  if (input.amountMinor > input.outstandingAmountMinor) return {status:"OVERPAYMENT" as const,reason:"PAYMENT_EXCEEDS_OUTSTANDING"};
  if (input.amountMinor === input.outstandingAmountMinor) return {status:"EXACT" as const,reason:"PAYMENT_EQUALS_OUTSTANDING"};
  return {status:"PARTIAL" as const,reason:"PAYMENT_IS_PARTIAL"};
}
