import { sha256Canonical } from "../construction-assistant-v1/canonical";
import {
  invoiceReadinessInputSchema,
  readinessDecisionSchema,
  type InvoiceReadinessInput,
  type ReadinessDecision,
} from "./contracts";

type Requirement = ReadinessDecision["missing"][number];
type Reason = ReadinessDecision["reasons"][number];

const unusableFactStates = new Set(["UNKNOWN", "DISPUTED", "REVOKED"]);

function sorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function evaluateInvoiceReadiness(rawInput: InvoiceReadinessInput): ReadinessDecision {
  const input = invoiceReadinessInputSchema.parse(rawInput);
  const missing = new Set<Requirement>();
  const verificationRequired = new Set<Requirement>();
  const reasons = new Set<Reason>();

  const projectAssociation = input.facts.projectAssociation;
  if (projectAssociation.value !== true || projectAssociation.state === "UNKNOWN") {
    missing.add("PROJECT_ASSOCIATION");
    reasons.add("PROJECT_ASSOCIATION_MISSING");
  } else if (projectAssociation.state !== "VERIFIED") {
    verificationRequired.add("PROJECT_ASSOCIATION");
    reasons.add("PROJECT_ASSOCIATION_UNVERIFIED");
  }

  const workDescription = input.facts.workDescription;
  if (!workDescription.value?.trim() || workDescription.state === "UNKNOWN") {
    missing.add("WORK_DESCRIPTION");
    reasons.add("WORK_DESCRIPTION_MISSING");
  } else if (workDescription.state === "DISPUTED" || workDescription.state === "REVOKED") {
    verificationRequired.add("WORK_DESCRIPTION");
    reasons.add("WORK_DESCRIPTION_DISPUTED");
  }

  const amount = input.facts.amount;
  if (amount.value === null || amount.state === "UNKNOWN") {
    missing.add("AMOUNT");
    reasons.add("AMOUNT_UNKNOWN");
  } else if (amount.value.amountMinor <= 0) {
    missing.add("AMOUNT");
    reasons.add("AMOUNT_INVALID");
  } else if (amount.state === "DISPUTED" || amount.state === "REVOKED") {
    verificationRequired.add("AMOUNT");
    reasons.add("AMOUNT_DISPUTED");
  }

  const completion = input.facts.completion;
  if (completion.value !== true || completion.state === "UNKNOWN") {
    missing.add("COMPLETION_ASSERTION");
    reasons.add("COMPLETION_UNCONFIRMED");
  } else if (completion.state === "DISPUTED" || completion.state === "REVOKED") {
    verificationRequired.add("COMPLETION_ASSERTION");
    reasons.add("COMPLETION_DISPUTED");
  }

  const approval = input.facts.approval;
  if (approval.value === null || approval.value === "UNKNOWN" || approval.state === "UNKNOWN") {
    missing.add("APPROVAL_STATE");
    reasons.add("APPROVAL_UNKNOWN");
  } else if (
    approval.value !== "APPROVED" ||
    approval.state === "DISPUTED" ||
    approval.state === "REVOKED"
  ) {
    verificationRequired.add("APPROVAL_STATE");
    reasons.add("APPROVAL_NOT_ACCEPTED");
  }

  const sameProjectEvidence = input.evidence.filter(
    (item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId,
  );
  const writtenApprovals = sameProjectEvidence.filter(
    (item) => item.kind === "WRITTEN_APPROVAL" && item.state !== "REJECTED" && item.state !== "REVOKED",
  );
  if (writtenApprovals.length === 0) {
    missing.add("WRITTEN_APPROVAL");
    reasons.add("WRITTEN_APPROVAL_MISSING");
  } else if (!writtenApprovals.some((item) => item.state === "VERIFIED")) {
    verificationRequired.add("WRITTEN_APPROVAL");
    reasons.add("WRITTEN_APPROVAL_UNVERIFIED");
  }

  const supportingEvidence = sameProjectEvidence.filter(
    (item) =>
      (item.kind === "PHOTO" || item.kind === "DOCUMENT") &&
      item.state !== "REJECTED" &&
      item.state !== "REVOKED",
  );
  if (supportingEvidence.length === 0) {
    missing.add("SUPPORTING_EVIDENCE");
    reasons.add("SUPPORTING_EVIDENCE_MISSING");
  } else if (!supportingEvidence.some((item) => item.state === "VERIFIED")) {
    verificationRequired.add("SUPPORTING_EVIDENCE");
    reasons.add("SUPPORTING_EVIDENCE_UNVERIFIED");
  }

  const contradictions = sorted(
    input.contradictions.filter((item) => item.status === "OPEN").map((item) => item.id),
  );
  if (contradictions.length > 0) reasons.add("MATERIAL_CONTRADICTION_OPEN");

  const missingList = sorted(missing);
  const verificationList = sorted(verificationRequired);
  const ready = missingList.length === 0 && verificationList.length === 0 && contradictions.length === 0;

  let status: ReadinessDecision["status"];
  if (missingList.length > 0) status = "WAITING_FOR_EVIDENCE";
  else if (verificationList.length > 0 || contradictions.length > 0) {
    status = "WAITING_FOR_VERIFICATION";
  } else status = "READY_TO_INVOICE";

  let nextResponsible: ReadinessDecision["nextResponsible"];
  let nextAction: ReadinessDecision["nextAction"];
  if (missing.has("WRITTEN_APPROVAL")) {
    nextResponsible = { kind: "USER", role: "OWNER_OR_OFFICE" };
    nextAction = "OBTAIN_WRITTEN_APPROVAL";
  } else if (missing.has("SUPPORTING_EVIDENCE") || missing.has("WORK_DESCRIPTION") || missing.has("COMPLETION_ASSERTION")) {
    nextResponsible = { kind: "USER", role: "ASSIGNED_FIELD_ROLE" };
    nextAction = "SUPPLY_FIELD_EVIDENCE";
  } else if (missing.size > 0) {
    nextResponsible = { kind: "USER", role: "OWNER_OR_OFFICE" };
    nextAction = "CLARIFY_PROJECT_OR_FINANCIALS";
  } else if (verificationRequired.size > 0 || contradictions.length > 0) {
    nextResponsible = { kind: "USER", role: "AUTHORIZED_VERIFIER" };
    nextAction = "VERIFY_OR_RESOLVE";
  } else {
    nextResponsible = { kind: "USER", role: "OFFICE_OR_ACCOUNTING" };
    nextAction = "PREPARE_INVOICE";
  }

  if (ready) reasons.add("READY_REQUIREMENTS_SATISFIED");

  const unsignedDecision = {
    schemaVersion: 1 as const,
    loopId: input.loopId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    stateVersion: input.stateVersion,
    status,
    ready,
    missing: missingList,
    verificationRequired: verificationList,
    contradictions,
    reasons: sorted(reasons),
    nextResponsible,
    nextAction,
  };

  return readinessDecisionSchema.parse({
    ...unsignedDecision,
    decisionHash: sha256Canonical(unsignedDecision),
  });
}

export function isUnusableFactState(state: string): boolean {
  return unusableFactStates.has(state);
}

