type JsonRecord = Record<string, unknown>;

const ROLES = [
  "design-authority",
  "trust-registry-maintainer",
  "policy-authority",
  "replay-ledger-anchor",
  "windows-outer-deny-controller",
  "wsl-enforcement-controller",
  "observer-service",
  "observer-signer",
  "barrier-authority",
  "runtime-supervisor",
  "evidence-broker",
  "evidence-resolver",
  "semantic-validator",
  "evidence-assembler",
  "external-cleanup-verifier",
  "independent-reviewer",
  "final-approver",
  "pass-publisher",
] as const;

const GATE_BINDINGS = [
  ["GATE_V3_R3_DESIGN_SCHEMA_VALID", "design-authority", "semantic-validator"],
  ["GATE_V3_R3_TRUST_ROOTS_PREANCHORED", "trust-registry-maintainer", "semantic-validator"],
  ["GATE_V3_R3_ISSUED_AUTHORITY_VALID", "policy-authority", "semantic-validator"],
  ["GATE_V3_R3_OBSERVER_SERVICE_READY", "observer-service", "observer-signer"],
  ["GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE", "windows-outer-deny-controller", "evidence-resolver"],
  ["GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "replay-ledger-anchor", "barrier-authority"],
  ["GATE_V3_R3_SOURCE_AND_CONTRACT_BOUND", "design-authority", "evidence-resolver"],
  ["GATE_V3_R3_RUNTIME_CHAIN_BOUND", "runtime-supervisor", "evidence-resolver"],
  ["GATE_V3_R3_NAMESPACE_PREBIND_VALID", "wsl-enforcement-controller", "evidence-resolver"],
  ["GATE_V3_R3_INNER_FIREWALL_INSTALLED", "wsl-enforcement-controller", "evidence-resolver"],
  ["GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT", "wsl-enforcement-controller", "evidence-resolver"],
  ["GATE_V3_R3_OBSERVER_CAPTURE_READY", "observer-service", "observer-signer"],
  ["GATE_V3_R3_FINAL_REBIND_STABLE", "wsl-enforcement-controller", "barrier-authority"],
  ["GATE_V3_R3_BARRIER_RELEASE_AUTHORIZED", "barrier-authority", "runtime-supervisor"],
  ["GATE_V3_R3_CONTINUOUS_CONTAINMENT_CLEAR", "observer-service", "semantic-validator"],
  ["GATE_V3_R3_OBSERVER_COMPLETE", "observer-signer", "evidence-resolver"],
  ["GATE_V3_R3_BLOCK_BEFORE_KILL_VERIFIED", "wsl-enforcement-controller", "runtime-supervisor"],
  ["GATE_V3_R3_PROCESS_CGROUP_TEARDOWN", "runtime-supervisor", "external-cleanup-verifier"],
  ["GATE_V3_R3_PRIVILEGED_CLEANUP_ACKNOWLEDGED", "wsl-enforcement-controller", "external-cleanup-verifier"],
  ["GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "external-cleanup-verifier", "evidence-resolver"],
  ["GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED", "evidence-broker", "evidence-resolver"],
  ["GATE_V3_R3_SIGNER_CHAIN_AND_LEDGER_VALID", "replay-ledger-anchor", "semantic-validator"],
  ["GATE_V3_R3_INDEPENDENT_REVIEW_APPROVED", "independent-reviewer", "final-approver"],
  ["GATE_V3_R3_PASS_PUBLICATION", "pass-publisher", "evidence-broker"],
] as const;

const PHASES = [
  ["P0", null, "design-authority", "design-authority", "semantic-validator", "DESIGN_ONLY", "DESIGN_ONLY", "P1"],
  ["P1", "P0", "policy-authority", "policy-authority", "semantic-validator", "DESIGN_ONLY", "ISSUED", "P2"],
  ["P2", "P1", "evidence-assembler", "evidence-assembler", "semantic-validator", "ISSUED", "RESERVED", "P3"],
  ["P3", "P2", "evidence-assembler", "evidence-assembler", "evidence-resolver", "RESERVED", "SEALED_PENDING_REVIEW", "P4"],
  ["P4", "P3", "independent-reviewer", "independent-reviewer", "final-approver", "SEALED_PENDING_REVIEW", "APPROVED_SYNTHETIC_PASS", "P5"],
  ["P5", "P4", "pass-publisher", "pass-publisher", "evidence-broker", "CONSUMED_PASS", "PUBLISHED_PASS", "TERMINAL"],
] as const;

const MUTATION_EXPECTATIONS = [
  ["M01_REAL_BINARY_PRESENT", "GATE_V3_R3_SOURCE_AND_CONTRACT_BOUND", "REAL_BINARY_SENTINEL_PRESENT"],
  ["M02_PROVIDER_ROUTE_PRESENT", "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT", "PROVIDER_ROUTE_PRESENT"],
  ["M03_CONTRACT_ARTIFACT_BYTES_MISMATCH", "GATE_V3_R3_SOURCE_AND_CONTRACT_BOUND", "CONTRACT_BUNDLE_BYTES_MISMATCH"],
  ["M04_FIREWALL_TABLE_MISSING", "GATE_V3_R3_INNER_FIREWALL_INSTALLED", "FIREWALL_TABLE_MISSING"],
  ["M05_FIREWALL_POLICY_HOOK_PRIORITY_WRONG", "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT", "FIREWALL_BASE_CHAIN_CANONICAL_MISMATCH"],
  ["M06_ROOTLESS_RUNTIME_CAN_EDIT", "GATE_V3_R3_NAMESPACE_PREBIND_VALID", "ROOTLESS_RUNTIME_EDIT_SUCCEEDED"],
  ["M07_NAMESPACE_REPLACED", "GATE_V3_R3_FINAL_REBIND_STABLE", "NETWORK_NAMESPACE_REPLACED"],
  ["M08_EXTRA_INTERFACE_OR_ROUTE", "GATE_V3_R3_FINAL_REBIND_STABLE", "EXTRA_INTERFACE_OR_ROUTE"],
  ["M09_DNS_IPV6_BYPASS", "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT", "DNS_IPV6_BYPASS_PRESENT"],
  ["M10_RELAY_EXTERNAL_EGRESS", "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT", "RELAY_EXTERNAL_EGRESS_PRESENT"],
  ["M11_INHERITED_SOCKET_OR_FD", "GATE_V3_R3_NAMESPACE_PREBIND_VALID", "INHERITED_SOCKET_OR_FD"],
  ["M12_OBSERVER_SIGNER_SUBSTITUTED", "GATE_V3_R3_OBSERVER_SERVICE_READY", "OBSERVER_SIGNER_SUBSTITUTED"],
  ["M13_REPLAY_AFTER_RESTART", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "NONCE_ALREADY_RESERVED_OR_CONSUMED"],
  ["M14_OBSERVER_SERVICE_NOT_READY", "GATE_V3_R3_OBSERVER_SERVICE_READY", "OBSERVER_SERVICE_NOT_READY"],
  ["M15_OBSERVER_CAPTURE_NOT_READY", "GATE_V3_R3_OBSERVER_CAPTURE_READY", "OBSERVER_CAPTURE_SET_INCOMPLETE"],
  ["M16_OBSERVER_PACKET_LOSS", "GATE_V3_R3_OBSERVER_COMPLETE", "OBSERVER_KERNEL_DROPS_NONZERO"],
  ["M17_UNCLASSIFIED_PACKET", "GATE_V3_R3_OBSERVER_COMPLETE", "UNCLASSIFIED_PACKET_EXACTLY_ONE"],
  ["M18_KILL_SWITCH_ORDER_BROKEN", "GATE_V3_R3_BLOCK_BEFORE_KILL_VERIFIED", "KILL_BEFORE_BLOCK"],
  ["M19_RULE_DELETE_FAILURE", "GATE_V3_R3_PRIVILEGED_CLEANUP_ACKNOWLEDGED", "PRIVILEGED_DELETE_NOT_ACKNOWLEDGED"],
  ["M20_PROCESS_CGROUP_LEAK", "GATE_V3_R3_PROCESS_CGROUP_TEARDOWN", "PROCESS_CGROUP_LEAK"],
  ["M21_TEMP_ROOT_OR_SECRET_LEAK", "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "TEMP_ROOT_OR_FAKE_SECRET_LEAK"],
  ["M22_CONCURRENT_RUN", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "CONCURRENT_RUN_LEASE_CONFLICT"],
  ["M23_POST_CLEANUP_DRIFT", "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "POST_CLEANUP_DRIFT"],
  ["M24_PASS_WRITTEN_BEFORE_CLEANUP", "GATE_V3_R3_PASS_PUBLICATION", "PASS_PREREQUISITE_ORDER_INVALID"],
  ["M25_SIGNER_KEY_OR_ROTATION_INVALID", "GATE_V3_R3_SIGNER_CHAIN_AND_LEDGER_VALID", "SIGNER_ROTATION_INVALID"],
  ["M26_SEALED_EVIDENCE_OBJECT_REPLACED", "GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED", "EVIDENCE_FILE_ID_OR_BYTES_MISMATCH"],
  ["M27_PACKET_STATISTICS_UNAVAILABLE", "GATE_V3_R3_OBSERVER_COMPLETE", "PACKET_STATISTICS_UNAVAILABLE"],
  ["M28_RUNTIME_HELPER_CHAIN_DRIFT", "GATE_V3_R3_RUNTIME_CHAIN_BOUND", "RUNTIME_HELPER_CHAIN_DRIFT"],
  ["M29_MONOTONIC_CLOCK_PRE_RESERVATION", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "MONOTONIC_CLOCK_INVALID_PRE_RESERVATION"],
  ["M30_MONOTONIC_CLOCK_RUNTIME", "GATE_V3_R3_CONTINUOUS_CONTAINMENT_CLEAR", "MONOTONIC_CLOCK_INVALID_RUNTIME"],
  ["M31_LEDGER_UNAVAILABLE", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "REPLAY_LEDGER_UNAVAILABLE"],
  ["M32_LEDGER_CORRUPT_AT_RESERVATION", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "LEDGER_CORRUPT_AT_RESERVATION"],
  ["M33_LEDGER_CORRUPT_AFTER_EVIDENCE", "GATE_V3_R3_SIGNER_CHAIN_AND_LEDGER_VALID", "LEDGER_CORRUPT_PRE_REVIEW"],
  ["M34_CLEANUP_VERIFIER_IDENTITY_SUBSTITUTED", "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "CLEANUP_VERIFIER_IDENTITY_INVALID"],
  ["M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE", "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "CLEANUP_EQUIVALENCE_FALSE"],
  ["M36_WINDOWS_OUTER_DENY_PREBARRIER_DRIFT", "GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE", "WINDOWS_OUTER_DENY_INCOMPLETE"],
  ["M37_WINDOWS_NETWORK_POSTCLEANUP_DRIFT", "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED", "WINDOWS_NETWORK_POSTCLEANUP_DRIFT"],
  ["M38_LEDGER_VALID_BACKUP_RESTORE", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "LEDGER_BACKUP_RESTORE_REJECTED"],
  ["M39_LEDGER_CROSS_MACHINE_COPY", "GATE_V3_R3_REPLAY_AND_LEASE_RESERVED", "LEDGER_CROSS_MACHINE_COPY_REJECTED"],
] as const;

export type AuthorityV3R3StaticReport = {
  status: "AUTHORITY_V3_R3_STATIC_DESIGN_VALID";
  schemaVersion: "3.3.0";
  roles: 18;
  gates: 24;
  phases: 6;
  tpmProfiles: 4;
  crashRules: 11;
  mutations: 39;
  semanticErrors: 52;
  executionAuthorized: false;
  providerCalls: 0;
  realCandidateInvocations: 0;
};

export class AuthorityV3R3StaticRefusal extends Error {
  constructor(errorId: string) {
    super(errorId);
    this.name = "AuthorityV3R3StaticRefusal";
  }
}

function refuse(errorId: string): never {
  throw new AuthorityV3R3StaticRefusal(errorId);
}

function record(value: unknown, errorId = "E_SCHEMA_INVALID"): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) refuse(errorId);
  return value as JsonRecord;
}

function array(value: unknown, errorId = "E_SCHEMA_INVALID"): unknown[] {
  if (!Array.isArray(value)) refuse(errorId);
  return value;
}

function exactArray(value: unknown, expected: readonly unknown[], errorId: string): void {
  const observed = array(value, errorId);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) refuse(errorId);
}

function uniqueStrings(value: unknown, count: number, errorId: string): string[] {
  const observed = array(value, errorId);
  if (
    observed.length !== count ||
    observed.some((item) => typeof item !== "string") ||
    new Set(observed).size !== count
  ) {
    refuse(errorId);
  }
  return observed as string[];
}

function assertExactKeys(value: JsonRecord, keys: readonly string[], errorId: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) refuse(errorId);
}

/** A non-evaluating JSON grammar pass used solely to reject duplicate object keys. */
function rejectDuplicateJsonKeys(raw: string): void {
  if (raw.startsWith("\uFEFF")) refuse("E_PARSE_UTF8_OR_BOM");
  let offset = 0;
  const whitespace = () => {
    while (/\s/.test(raw[offset] ?? "")) offset += 1;
  };
  const jsonString = (): string => {
    const start = offset;
    if (raw[offset] !== '"') refuse("E_SCHEMA_INVALID");
    offset += 1;
    while (offset < raw.length) {
      const char = raw[offset++];
      if (char === '"') {
        try {
          return JSON.parse(raw.slice(start, offset)) as string;
        } catch {
          refuse("E_SCHEMA_INVALID");
        }
      }
      if (char === "\\") {
        if (raw[offset] === "u") offset += 5;
        else offset += 1;
      } else if ((char?.charCodeAt(0) ?? 0) < 0x20) {
        refuse("E_SCHEMA_INVALID");
      }
    }
    refuse("E_SCHEMA_INVALID");
  };
  const literal = () => {
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(offset));
    if (!match) refuse("E_SCHEMA_INVALID");
    offset += match[0].length;
  };
  const value = (): void => {
    whitespace();
    if (raw[offset] === '"') {
      jsonString();
      return;
    }
    if (raw[offset] === "[") {
      offset += 1;
      whitespace();
      if (raw[offset] === "]") {
        offset += 1;
        return;
      }
      while (true) {
        value();
        whitespace();
        if (raw[offset] === "]") {
          offset += 1;
          return;
        }
        if (raw[offset++] !== ",") refuse("E_SCHEMA_INVALID");
      }
    }
    if (raw[offset] === "{") {
      offset += 1;
      const keys = new Set<string>();
      whitespace();
      if (raw[offset] === "}") {
        offset += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = jsonString();
        if (keys.has(key)) refuse("E_PARSE_DUPLICATE_KEY");
        keys.add(key);
        whitespace();
        if (raw[offset++] !== ":") refuse("E_SCHEMA_INVALID");
        value();
        whitespace();
        if (raw[offset] === "}") {
          offset += 1;
          return;
        }
        if (raw[offset++] !== ",") refuse("E_SCHEMA_INVALID");
      }
    }
    literal();
  };
  value();
  whitespace();
  if (offset !== raw.length) refuse("E_SCHEMA_INVALID");
}

function resolveLocalReferences(bundle: JsonRecord): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const object = value as JsonRecord;
    if (object.type === "object" && object.additionalProperties !== false) refuse("E_SCHEMA_INVALID");
    if (object.type === "array" && object.items === undefined) refuse("E_SCHEMA_INVALID");
    if (typeof object.$ref === "string") {
      if (!object.$ref.startsWith("#/")) refuse("E_SCHEMA_INVALID");
      let target: unknown = bundle;
      for (const encoded of object.$ref.slice(2).split("/")) {
        const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
        const targetRecord = record(target);
        if (!(token in targetRecord)) refuse("E_SCHEMA_INVALID");
        target = targetRecord[token];
      }
    }
    Object.values(object).forEach(visit);
  };
  visit(bundle);
}

function validateGates(payload: JsonRecord, defs: JsonRecord): void {
  const gates = GATE_BINDINGS.map(([gate]) => gate);
  exactArray(record(defs.gateRegistry).const, gates, "E_GATE_ROLE_MAPPING_INVALID");
  exactArray(payload.gateRegistry, gates, "E_GATE_ROLE_MAPPING_INVALID");
  exactArray(record(defs.componentRole).enum, ROLES, "E_GATE_ROLE_MAPPING_INVALID");
  const bindings = array(payload.gateDecisionBindings, "E_GATE_ROLE_MAPPING_INVALID");
  if (bindings.length !== GATE_BINDINGS.length) refuse("E_GATE_ROLE_MAPPING_INVALID");
  bindings.forEach((entry, index) => {
    const binding = record(entry, "E_GATE_ROLE_MAPPING_INVALID");
    const [gateId, producerRole, acceptingRole] = GATE_BINDINGS[index];
    if (
      binding.gateId !== gateId ||
      binding.producerRole !== producerRole ||
      binding.acceptingRole !== acceptingRole ||
      binding.producerBindingRef !== `/roleBindings/${producerRole}` ||
      binding.acceptingBindingRef !== `/roleBindings/${acceptingRole}` ||
      binding.independentAcceptance !== true
    ) {
      refuse(producerRole === acceptingRole || binding.producerRole === binding.acceptingRole
        ? "E_GATE_ACCEPTOR_NOT_INDEPENDENT"
        : "E_GATE_ROLE_MAPPING_INVALID");
    }
  });
}

function validatePhases(payload: JsonRecord): void {
  const phases = array(payload.phaseContracts, "E_PHASE_PREDECESSOR_INVALID");
  if (phases.length !== PHASES.length) refuse("E_PHASE_PREDECESSOR_INVALID");
  phases.forEach((entry, index) => {
    const phase = record(entry, "E_PHASE_PREDECESSOR_INVALID");
    const [id, predecessor, producer, signer, acceptor, prior, result, next] = PHASES[index];
    if (phase.phase !== id || phase.predecessorPhase !== predecessor || phase.nextPhase !== next) {
      refuse("E_PHASE_PREDECESSOR_INVALID");
    }
    if (phase.producerRole !== producer || phase.signerRole !== signer || phase.acceptorRole !== acceptor) {
      refuse("E_PHASE_ROLE_INVALID");
    }
    if (phase.requiredPriorState !== prior || phase.resultingState !== result) refuse("E_PHASE_PREDECESSOR_INVALID");
    if (!Array.isArray(phase.requiredInputArtifactKinds) || !Array.isArray(phase.requiredPriorAttestationKinds)) {
      refuse("E_PHASE_PREDECESSOR_INVALID");
    }
    if (phase.outputSchemaId !== "urn:endvera:ef:authority-v3:phase-manifest:3.3.0") {
      refuse("E_PHASE_PREDECESSOR_INVALID");
    }
  });
}

function validateTpm(payload: JsonRecord): void {
  const profiles = array(payload.tpmNvPublicProfiles, "E_TPM_NV_PUBLIC_MISMATCH");
  const expected = [
    ["MONOTONIC_COUNTER", 22020100, 8, ["OWNERREAD", "POLICYREAD", "POLICYWRITE", "COUNTER", "NO_DA", "WRITE_STCLEAR"]],
    ["HEAD_SLOT_A", 22020101, 256, ["OWNERREAD", "POLICYREAD", "POLICYWRITE", "NO_DA", "WRITEDEFINE"]],
    ["HEAD_SLOT_B", 22020102, 256, ["OWNERREAD", "POLICYREAD", "POLICYWRITE", "NO_DA", "WRITEDEFINE"]],
    ["TRUST_REGISTRY_ANCHOR", 22020103, 64, ["OWNERREAD", "POLICYREAD", "POLICYWRITE", "NO_DA", "WRITEDEFINE", "WRITELOCKED"]],
  ] as const;
  if (profiles.length !== expected.length) refuse("E_TPM_NV_PUBLIC_MISMATCH");
  const hash = /^[0-9a-f]{64}$/;
  profiles.forEach((entry, index) => {
    const profile = record(entry, "E_TPM_NV_PUBLIC_MISMATCH");
    const [purpose, nvIndex, dataSize, attributes] = expected[index];
    if (
      profile.purpose !== purpose ||
      profile.nvIndex !== nvIndex ||
      profile.dataSize !== dataSize ||
      profile.hierarchy !== "OWNER" ||
      profile.nameAlg !== "SHA256" ||
      JSON.stringify(profile.attributes) !== JSON.stringify(attributes) ||
      profile.provisionerRole !== "replay-ledger-anchor" ||
      profile.verifierRole !== "semantic-validator" ||
      typeof profile.authPolicySha256 !== "string" ||
      !hash.test(profile.authPolicySha256) ||
      typeof profile.expectedPublicNameSha256 !== "string" ||
      !hash.test(profile.expectedPublicNameSha256)
    ) {
      refuse("E_TPM_NV_PUBLIC_MISMATCH");
    }
  });
}

function validateLedger(payload: JsonRecord): void {
  const protocol = record(payload.ledgerDurabilityProtocol, "E_LEDGER_PREPARE_NOT_DURABLE");
  for (const flag of [
    "prepareTransactionCommitsBeforeTpm",
    "databaseFileFsync",
    "databaseDirectoryFsync",
    "postCommitReadbackRequired",
    "noSqliteTransactionAcrossTpmIo",
    "finalizeTransactionStartsAfterVerifiedQuote",
    "terminalTransitionUnique",
    "publicationIdempotencyUnique",
  ]) {
    if (protocol[flag] !== true) refuse("E_LEDGER_PREPARE_NOT_DURABLE");
  }
  if (
    protocol.sqliteJournalMode !== "WAL" ||
    protocol.sqliteSynchronous !== "FULL" ||
    protocol.checkpointMode !== "FULL" ||
    protocol.checkpointBusyFramesMaximum !== 0
  ) {
    refuse("E_LEDGER_PREPARE_NOT_DURABLE");
  }
  const rules = array(protocol.crashRules, "E_LEDGER_FINALIZATION_INVALID");
  if (rules.length !== 11 || new Set(rules.map((item) => record(item).boundary)).size !== 11) {
    refuse("E_LEDGER_FINALIZATION_INVALID");
  }
  const orphan = record(rules.find((item) => record(item).boundary === "PROVEN_BEFORE_TPM"), "E_LEDGER_ORPHAN_PREPARED");
  if (
    orphan.allowedRecovery !== "COMPLETE_PREPARED_THEN_CONSUME_FAIL" ||
    orphan.retryClass !== "SAME_TRANSACTION_ONLY"
  ) {
    refuse("E_LEDGER_ORPHAN_PREPARED");
  }
  for (const boundary of ["CONSUMED_PASS_D4_ABSENT", "D4_SEALED_P5_ABSENT", "P5_COMMITTED_NO_RECEIPT"]) {
    const rule = record(rules.find((item) => record(item).boundary === boundary), "E_LEDGER_FINALIZATION_INVALID");
    if (rule.semanticErrorId !== "E_LEDGER_FINALIZATION_INVALID") refuse("E_LEDGER_FINALIZATION_INVALID");
  }
}

function validateMutations(payload: JsonRecord, defs: JsonRecord): void {
  const ids = MUTATION_EXPECTATIONS.map(([id]) => id);
  exactArray(record(defs.mutationRegistry).const, ids, "E_GATE_VERDICT_INCONSISTENT");
  exactArray(payload.mutationRegistry, ids, "E_GATE_VERDICT_INCONSISTENT");
  const expectations = array(payload.mutationExpectations, "E_GATE_VERDICT_INCONSISTENT");
  if (expectations.length !== MUTATION_EXPECTATIONS.length) refuse("E_GATE_VERDICT_INCONSISTENT");
  expectations.forEach((entry, index) => {
    const expectation = record(entry, "E_GATE_VERDICT_INCONSISTENT");
    const [mutationId, expectedGateId, expectedErrorId] = MUTATION_EXPECTATIONS[index];
    if (
      expectation.mutationId !== mutationId ||
      expectation.expectedGateId !== expectedGateId ||
      expectation.expectedErrorId !== expectedErrorId
    ) {
      refuse("E_GATE_VERDICT_INCONSISTENT");
    }
  });
}

function assertUniqueBindingField(bindings: JsonRecord[], field: string, errorId: string): void {
  const values = bindings.map((binding) => binding[field]);
  if (values.some((value) => typeof value !== "string" || !value)) refuse(errorId);
  if (new Set(values).size !== values.length) refuse(errorId);
}

/**
 * I2 semantic check for a future D1. It inspects declarations only and grants
 * no execution authority; cryptographic and OS provenance remain later gates.
 */
export function validateAuthorityV3R3RoleSeparation({
  roleBindings,
  gateDecisionBindings,
}: {
  roleBindings: unknown;
  gateDecisionBindings: unknown;
}): { status: "AUTHORITY_V3_R3_ROLE_SEPARATION_VALID"; roles: 18; gates: 24 } {
  const bindings = array(roleBindings, "E_GATE_ROLE_MAPPING_INVALID").map((item) =>
    record(item, "E_GATE_ROLE_MAPPING_INVALID")
  );
  if (bindings.length !== ROLES.length) refuse("E_GATE_ROLE_MAPPING_INVALID");
  const byRole = new Map<string, JsonRecord>();
  for (const binding of bindings) {
    if (typeof binding.role !== "string" || byRole.has(binding.role)) refuse("E_GATE_ROLE_MAPPING_INVALID");
    byRole.set(binding.role, binding);
  }
  exactArray([...byRole.keys()].sort(), [...ROLES].sort(), "E_GATE_ROLE_MAPPING_INVALID");
  assertUniqueBindingField(bindings, "operatingSystemIdentity", "E_ROLE_OS_REUSE");
  assertUniqueBindingField(bindings, "identityId", "E_ROLE_OS_REUSE");
  assertUniqueBindingField(bindings, "keyId", "E_ROLE_KEY_REUSE");
  assertUniqueBindingField(bindings, "publicKeySpkiSha256", "E_ROLE_KEY_REUSE");
  assertUniqueBindingField(bindings, "binarySha256", "E_ROLE_BINARY_REUSE");
  assertUniqueBindingField(bindings, "configurationSha256", "E_ROLE_BINARY_REUSE");
  assertUniqueBindingField(bindings, "serviceLauncherSha256", "E_ROLE_BINARY_REUSE");

  const gates = array(gateDecisionBindings, "E_GATE_ROLE_MAPPING_INVALID");
  if (gates.length !== GATE_BINDINGS.length) refuse("E_GATE_ROLE_MAPPING_INVALID");
  gates.forEach((item, index) => {
    const gate = record(item, "E_GATE_ROLE_MAPPING_INVALID");
    const [gateId, producerRole, acceptingRole] = GATE_BINDINGS[index];
    if (gate.gateId !== gateId || gate.producerRole !== producerRole || gate.acceptingRole !== acceptingRole) {
      refuse("E_GATE_ROLE_MAPPING_INVALID");
    }
    const producer = byRole.get(producerRole);
    const acceptor = byRole.get(acceptingRole);
    if (!producer || !acceptor) refuse("E_GATE_ROLE_MAPPING_INVALID");
    for (const field of [
      "operatingSystemIdentity",
      "identityId",
      "keyId",
      "publicKeySpkiSha256",
      "binarySha256",
      "configurationSha256",
    ]) {
      if (producer[field] === acceptor[field]) refuse("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
    }
  });
  return { status: "AUTHORITY_V3_R3_ROLE_SEPARATION_VALID", roles: 18, gates: 24 };
}

/** Validates the D2 mutation tuple against the immutable D0 registry. */
export function validateAuthorityV3R3MutationEvidence(
  evidence: unknown,
  mutationExpectations: unknown
): { status: "AUTHORITY_V3_R3_MUTATION_EVIDENCE_VALID"; mutationCaseId: string | null } {
  const observed = record(evidence, "E_GATE_VERDICT_INCONSISTENT");
  const expectations = array(mutationExpectations, "E_GATE_VERDICT_INCONSISTENT").map((item) =>
    record(item, "E_GATE_VERDICT_INCONSISTENT")
  );
  if (observed.verdict === "EVIDENCE_READY_FOR_REVIEW") {
    if (
      observed.mutationCaseId !== null ||
      observed.expectedFailedGateName !== null ||
      observed.observedErrorId !== null ||
      array(observed.failedGateNames, "E_GATE_VERDICT_INCONSISTENT").length !== 0
    ) {
      refuse("E_GATE_VERDICT_INCONSISTENT");
    }
    return { status: "AUTHORITY_V3_R3_MUTATION_EVIDENCE_VALID", mutationCaseId: null };
  }
  if (observed.verdict !== "SYNTHETIC_FAIL" && observed.verdict !== "QUARANTINED") {
    refuse("E_GATE_VERDICT_INCONSISTENT");
  }
  const expectation = expectations.find((item) => item.mutationId === observed.mutationCaseId);
  if (!expectation) refuse("E_GATE_VERDICT_INCONSISTENT");
  const failed = array(observed.failedGateNames, "E_GATE_VERDICT_INCONSISTENT");
  if (
    observed.expectedFailedGateName !== expectation.expectedGateId ||
    observed.observedErrorId !== expectation.expectedErrorId ||
    failed.length !== 1 ||
    failed[0] !== expectation.expectedGateId
  ) {
    refuse("E_GATE_VERDICT_INCONSISTENT");
  }
  return {
    status: "AUTHORITY_V3_R3_MUTATION_EVIDENCE_VALID",
    mutationCaseId: observed.mutationCaseId as string,
  };
}

type LedgerRecoveryObservation = {
  boundary: string;
  durableDiskState: string;
  tpmState: string;
  publicationState: string;
};

/**
 * Classifies a restart from the complete durable-state tuple. Matching the
 * boundary name alone is deliberately insufficient: any mixed or novel tuple
 * is refused and requires independent semantic review.
 */
export function classifyAuthorityV3R3LedgerRecovery(
  observation: LedgerRecoveryObservation,
  crashRules: unknown
): {
  status: "AUTHORITY_V3_R3_RECOVERY_CLASSIFIED";
  allowedRecovery: string;
  acceptingRole: string;
  semanticErrorId: string;
  retryClass: string;
} {
  const fields = ["boundary", "durableDiskState", "tpmState", "publicationState"] as const;
  if (fields.some((field) => typeof observation[field] !== "string" || !observation[field])) {
    refuse("E_LEDGER_RECOVERY_TUPLE_UNKNOWN");
  }
  const matches = array(crashRules, "E_LEDGER_RECOVERY_TUPLE_UNKNOWN")
    .map((item) => record(item, "E_LEDGER_RECOVERY_TUPLE_UNKNOWN"))
    .filter((rule) => fields.every((field) => rule[field] === observation[field]));
  if (matches.length !== 1) refuse("E_LEDGER_RECOVERY_TUPLE_UNKNOWN");
  const match = matches[0];
  for (const field of ["allowedRecovery", "acceptingRole", "semanticErrorId", "retryClass"] as const) {
    if (typeof match[field] !== "string" || !match[field]) refuse("E_LEDGER_RECOVERY_TUPLE_UNKNOWN");
  }
  return {
    status: "AUTHORITY_V3_R3_RECOVERY_CLASSIFIED",
    allowedRecovery: match.allowedRecovery as string,
    acceptingRole: match.acceptingRole as string,
    semanticErrorId: match.semanticErrorId as string,
    retryClass: match.retryClass as string,
  };
}

type TerminalPublicationObservation = {
  publicationKey: string;
  terminalTransitionCount: number;
  d4Count: number;
  p5Count: number;
  d4PublicationKey: string | null;
  p5PublicationKey: string | null;
};

/** Pure semantic guard for the D4/P5 terminal-publication sequence. */
export function validateAuthorityV3R3TerminalPublication(
  observation: TerminalPublicationObservation
): {
  status: "AUTHORITY_V3_R3_TERMINAL_PUBLICATION_VALID";
  nextAction: "PUBLISH_INTENDED_D4_ONCE" | "RESOLVE_D4_CREATE_P5" | "RETURN_EXISTING_P5";
} {
  if (!observation.publicationKey) refuse("E_LEDGER_FINALIZATION_INVALID");
  if (observation.terminalTransitionCount !== 1) {
    refuse(observation.terminalTransitionCount > 1
      ? "E_LEDGER_TERMINAL_TRANSITION_DUPLICATE"
      : "E_LEDGER_FINALIZATION_INVALID");
  }
  if (
    !Number.isInteger(observation.d4Count) ||
    !Number.isInteger(observation.p5Count) ||
    observation.d4Count < 0 ||
    observation.p5Count < 0
  ) {
    refuse("E_LEDGER_FINALIZATION_INVALID");
  }
  if (observation.d4Count > 1 || observation.p5Count > 1) {
    refuse("E_LEDGER_PUBLICATION_DUPLICATE");
  }
  if (observation.d4Count === 0 && observation.p5Count === 0) {
    if (observation.d4PublicationKey !== null || observation.p5PublicationKey !== null) {
      refuse("E_LEDGER_FINALIZATION_INVALID");
    }
    return {
      status: "AUTHORITY_V3_R3_TERMINAL_PUBLICATION_VALID",
      nextAction: "PUBLISH_INTENDED_D4_ONCE",
    };
  }
  if (
    observation.d4Count !== 1 ||
    observation.d4PublicationKey !== observation.publicationKey ||
    (observation.p5Count === 1 && observation.p5PublicationKey !== observation.publicationKey) ||
    (observation.p5Count === 0 && observation.p5PublicationKey !== null)
  ) {
    refuse("E_LEDGER_PUBLICATION_KEY_MISMATCH");
  }
  return {
    status: "AUTHORITY_V3_R3_TERMINAL_PUBLICATION_VALID",
    nextAction: observation.p5Count === 0 ? "RESOLVE_D4_CREATE_P5" : "RETURN_EXISTING_P5",
  };
}

export function validateAuthorityV3R3DesignBundle(raw: string): AuthorityV3R3StaticReport {
  rejectDuplicateJsonKeys(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    refuse("E_SCHEMA_INVALID");
  }
  const bundle = record(parsed);
  assertExactKeys(bundle, ["$schema", "$id", "title", "$comment", "$defs", "oneOf", "examples"], "E_SCHEMA_INVALID");
  if (
    bundle.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    bundle.$id !== "urn:endvera:ef:authority-v3:schema-bundle:3.3.0"
  ) {
    refuse("E_SCHEMA_CONFUSION_OR_DOWNGRADE");
  }
  resolveLocalReferences(bundle);
  const defs = record(bundle.$defs);
  const examples = array(bundle.examples);
  if (examples.length !== 1) refuse("E_SCHEMA_INVALID");
  const payload = record(record(examples[0]).payload);
  if (payload.schemaVersion !== "3.3.0" || payload.kind !== "authority-v3-static-design") {
    refuse("E_SCHEMA_CONFUSION_OR_DOWNGRADE");
  }
  if (payload.executionAuthorized !== false) refuse("E_DESIGN_AUTHORITY_TRUE");
  for (const field of [
    "syntheticFixtureExecutionAuthorized",
    "realCandidateExecutionAuthorized",
    "modelExecutionAuthorized",
    "providerExecutionAuthorized",
    "credentialsAuthorized",
  ]) {
    if (payload[field] !== false) refuse("E_FORBIDDEN_EXECUTION_AUTHORITY");
  }
  if (payload.realCandidateInvocations !== 0 || payload.providerCalls !== 0) {
    refuse("E_FORBIDDEN_EXECUTION_AUTHORITY");
  }
  validateGates(payload, defs);
  validatePhases(payload);
  validateTpm(payload);
  validateLedger(payload);
  validateMutations(payload, defs);
  const semanticErrors = uniqueStrings(record(payload.semanticValidator).errorIds, 52, "E_SCHEMA_INVALID");
  exactArray(record(defs.semanticErrorRegistry).const, semanticErrors, "E_SCHEMA_INVALID");
  return {
    status: "AUTHORITY_V3_R3_STATIC_DESIGN_VALID",
    schemaVersion: "3.3.0",
    roles: 18,
    gates: 24,
    phases: 6,
    tpmProfiles: 4,
    crashRules: 11,
    mutations: 39,
    semanticErrors: 52,
    executionAuthorized: false,
    providerCalls: 0,
    realCandidateInvocations: 0,
  };
}
