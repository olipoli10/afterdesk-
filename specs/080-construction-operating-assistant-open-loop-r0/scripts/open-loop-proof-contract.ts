type ProofContract = Record<string, unknown>;

const expectedKeys = [
  "schemaVersion",
  "scenarioId",
  "syntheticOnly",
  "customerDataCount",
  "billingBasis",
  "projectCode",
  "projectAssociationRequired",
  "workDescriptionRequired",
  "positiveCadAmountRequired",
  "unknownAmountPolicy",
  "completionAssertionRequired",
  "writtenApprovalRequired",
  "supportingEvidenceRequired",
  "modelMayVerifyCanonicalFact",
  "unresolvedContradictionBlocksReadiness",
  "contradictionClaimsPreserved",
  "revokedEvidenceBlocksReadiness",
  "duplicateCanonicalEffectCount",
  "equivalentEnvelopeCanonicalLoopCount",
  "conflictingReplayAccepted",
  "staleTransitionAccepted",
  "concurrentSecondCanonicalEffectCount",
  "snapshotHashRecomputable",
  "restartProjectionIdentical",
  "atomicInboxLoopSnapshotAudit",
  "fieldWorkerFinancialFieldCount",
  "ownerFinancialProjectionEnabled",
  "crossWorkspaceAccessAccepted",
  "preparedActionDisposition",
  "preparedActionTransportAuthorized",
  "preparedActionExactRecipient",
  "preparedActionExactChannel",
  "preparedActionExactBody",
  "preparedActionExactProject",
  "preparedActionExactVersion",
  "preparedActionPayloadHashBound",
  "externalTransportCount",
  "providerInvocationCount",
  "packageLockChanged",
  "unknownFieldsAccepted"
] as const;

function exact(value: ProofContract, key: string, expected: unknown, guard: string) {
  if (value[key] !== expected) throw new Error(guard);
}

export function validateOpenLoopProofContract(value: ProofContract) {
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expectedKeys].sort())) {
    throw new Error("unknown-proof-field-is-accepted");
  }
  exact(value, "schemaVersion", 1, "schema-version-drifts");
  exact(value, "scenarioId", "WORK_FINISHED_TO_INVOICE_READY_LOCAL_R0", "scenario-id-drifts");
  exact(value, "syntheticOnly", true, "customer-material-becomes-admissible");
  exact(value, "customerDataCount", 0, "customer-data-enters-proof");
  exact(value, "billingBasis", "CHANGE_ORDER", "billing-basis-drifts");
  exact(value, "projectCode", "LAVAL-001", "project-identity-drifts");
  exact(value, "projectAssociationRequired", true, "project-association-becomes-optional");
  exact(value, "workDescriptionRequired", true, "work-description-becomes-optional");
  exact(value, "positiveCadAmountRequired", true, "positive-cad-amount-becomes-optional");
  exact(value, "unknownAmountPolicy", "KEEP_UNKNOWN", "unknown-amount-becomes-zero");
  exact(value, "completionAssertionRequired", true, "completion-assertion-becomes-optional");
  exact(value, "writtenApprovalRequired", true, "written-approval-becomes-optional");
  exact(value, "supportingEvidenceRequired", true, "supporting-evidence-becomes-optional");
  exact(value, "modelMayVerifyCanonicalFact", false, "model-proposal-verifies-canonical-fact");
  exact(value, "unresolvedContradictionBlocksReadiness", true, "contradiction-no-longer-blocks-readiness");
  exact(value, "contradictionClaimsPreserved", true, "contradiction-overwrites-original-claims");
  exact(value, "revokedEvidenceBlocksReadiness", true, "revoked-evidence-remains-ready");
  exact(value, "duplicateCanonicalEffectCount", 0, "duplicate-creates-second-canonical-effect");
  exact(value, "equivalentEnvelopeCanonicalLoopCount", 1, "equivalent-envelopes-create-two-loops");
  exact(value, "conflictingReplayAccepted", false, "conflicting-replay-is-accepted");
  exact(value, "staleTransitionAccepted", false, "stale-transition-is-accepted");
  exact(value, "concurrentSecondCanonicalEffectCount", 0, "concurrency-creates-second-canonical-effect");
  exact(value, "snapshotHashRecomputable", true, "canonical-snapshot-hash-is-omitted");
  exact(value, "restartProjectionIdentical", true, "restart-projection-drifts");
  exact(value, "atomicInboxLoopSnapshotAudit", true, "atomic-persistence-is-broken");
  exact(value, "fieldWorkerFinancialFieldCount", 0, "field-worker-sees-financial-data");
  exact(value, "ownerFinancialProjectionEnabled", true, "owner-loses-financial-projection");
  exact(value, "crossWorkspaceAccessAccepted", false, "cross-workspace-access-is-accepted");
  exact(value, "preparedActionDisposition", "PREPARED_UNSENT", "prepared-action-becomes-sendable");
  exact(value, "preparedActionTransportAuthorized", false, "prepared-action-authorizes-transport");
  exact(value, "preparedActionExactRecipient", true, "prepared-action-recipient-is-unbound");
  exact(value, "preparedActionExactChannel", true, "prepared-action-channel-is-unbound");
  exact(value, "preparedActionExactBody", true, "prepared-action-body-is-unbound");
  exact(value, "preparedActionExactProject", true, "prepared-action-project-is-unbound");
  exact(value, "preparedActionExactVersion", true, "prepared-action-version-is-unbound");
  exact(value, "preparedActionPayloadHashBound", true, "prepared-action-hash-is-unbound");
  exact(value, "externalTransportCount", 0, "external-transport-occurs");
  exact(value, "providerInvocationCount", 0, "provider-is-invoked");
  exact(value, "packageLockChanged", false, "package-lock-changes");
  exact(value, "unknownFieldsAccepted", false, "unknown-field-policy-drifts");
  return value;
}
