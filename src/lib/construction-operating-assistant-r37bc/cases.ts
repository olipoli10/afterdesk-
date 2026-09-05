import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import {
  r37Fingerprint,
  r37ObservedCaseSchema,
  type R37ObservedCase,
} from "@/lib/construction-operating-assistant-r37/contracts";

function alignInvoiceReadinessCase(source: R37ObservedCase): R37ObservedCase {
  const versioned = {
    ...source,
    caseVersion: 2 as const,
    allowedCapabilities: ["ANSWER_FROM_STATE", "CLARIFY"] as const,
  };
  const fingerprintInput = Object.fromEntries(
    Object.entries(versioned).filter(([key]) => key !== "caseFingerprint"),
  );
  return r37ObservedCaseSchema.parse({
    ...fingerprintInput,
    caseFingerprint: r37Fingerprint(fingerprintInput),
  });
}

export const R37BC_CASES = Object.freeze([
  alignInvoiceReadinessCase(R37_CASES[0]),
  R37_CASES[1],
  R37_CASES[2],
] as const);
