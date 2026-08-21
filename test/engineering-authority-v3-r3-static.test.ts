import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  AuthorityV3R3StaticRefusal,
  classifyAuthorityV3R3LedgerRecovery,
  validateAuthorityV3R3DesignBundle,
  validateAuthorityV3R3MutationEvidence,
  validateAuthorityV3R3RoleSeparation,
  validateAuthorityV3R3TerminalPublication,
} from "@/lib/engineering-factory/authority-v3-r3-static";

const BUNDLE = join(
  process.cwd(),
  "docs",
  "engineering-factory",
  "AUTHORITY_V3_CANDIDATE_COMPATIBILITY_SCHEMA_EXAMPLE.json"
);

let raw = "";

beforeAll(async () => {
  raw = await readFile(BUNDLE, "utf8");
});

function mutate(from: string, to: string): string {
  expect(raw).toContain(from);
  return raw.replace(from, to);
}

describe("Authority V3 R3 static design admission", () => {
  it("admits the closed R3 design without granting execution", () => {
    expect(validateAuthorityV3R3DesignBundle(raw)).toEqual({
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
    });
  });

  it("rejects duplicate JSON keys before parse", () => {
    const duplicate = mutate(
      '"executionAuthorized": false,',
      '"executionAuthorized": false, "executionAuthorized": false,'
    );
    expect(() => validateAuthorityV3R3DesignBundle(duplicate)).toThrowError(
      new AuthorityV3R3StaticRefusal("E_PARSE_DUPLICATE_KEY")
    );
  });

  it("rejects any design-time execution or provider authority", () => {
    const authority = mutate('"executionAuthorized": false,', '"executionAuthorized": true,');
    expect(() => validateAuthorityV3R3DesignBundle(authority)).toThrow("E_DESIGN_AUTHORITY_TRUE");
  });

  it("rejects a gate whose acceptor collapses into its producer", () => {
    const collapsed = mutate(
      '"gateId":"GATE_V3_R3_PASS_PUBLICATION","producerRole":"pass-publisher","acceptingRole":"evidence-broker"',
      '"gateId":"GATE_V3_R3_PASS_PUBLICATION","producerRole":"pass-publisher","acceptingRole":"pass-publisher"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(collapsed)).toThrow(
      "E_GATE_ACCEPTOR_NOT_INDEPENDENT"
    );
  });

  it("rejects a schema-valid wrong-phase contract", () => {
    const wrongPhase = mutate(
      '"phase":"P4","predecessorPhase":"P3","producerRole":"independent-reviewer"',
      '"phase":"P4","predecessorPhase":"P3","producerRole":"evidence-assembler"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(wrongPhase)).toThrow("E_PHASE_ROLE_INVALID");
  });

  it("rejects unsafe orphan recovery that avoids TPM anchoring", () => {
    const unsafe = mutate(
      '"allowedRecovery":"COMPLETE_PREPARED_THEN_CONSUME_FAIL"',
      '"allowedRecovery":"ORPHAN_CONSUME_FAIL"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(unsafe)).toThrow(
      "E_LEDGER_ORPHAN_PREPARED"
    );
  });

  it("rejects TPM public-area and mutation expectation drift", () => {
    const tpm = mutate('"purpose":"MONOTONIC_COUNTER","nvIndex":22020100', '"purpose":"MONOTONIC_COUNTER","nvIndex":22020101');
    expect(() => validateAuthorityV3R3DesignBundle(tpm)).toThrow("E_TPM_NV_PUBLIC_MISMATCH");

    const mutation = mutate(
      '"mutationId":"M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE","expectedGateId":"GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED"',
      '"mutationId":"M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE","expectedGateId":"GATE_V3_R3_OBSERVER_COMPLETE"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(mutation)).toThrow(
      "E_GATE_VERDICT_INCONSISTENT"
    );
  });

  it("rejects open schema objects and unresolved local references", () => {
    const open = mutate(
      '"additionalProperties": false,\n      "required": ["gateId"',
      '"additionalProperties": true,\n      "required": ["gateId"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(open)).toThrow("E_SCHEMA_INVALID");

    const missingRef = mutate(
      '"$ref": "#/$defs/gateDecisionBinding"',
      '"$ref": "#/$defs/gateDecisionBindingMissing"'
    );
    expect(() => validateAuthorityV3R3DesignBundle(missingRef)).toThrow("E_SCHEMA_INVALID");
  });

  it("requires distinct OS, identity, binary and key custody for all gate roles", () => {
    const payload = JSON.parse(raw).examples[0].payload;
    const roleBindings = [
      "design-authority", "trust-registry-maintainer", "policy-authority", "replay-ledger-anchor",
      "windows-outer-deny-controller", "wsl-enforcement-controller", "observer-service", "observer-signer",
      "barrier-authority", "runtime-supervisor", "evidence-broker", "evidence-resolver",
      "semantic-validator", "evidence-assembler", "external-cleanup-verifier", "independent-reviewer",
      "final-approver", "pass-publisher",
    ].map((role, index) => ({
      role,
      identityId: `identity-${index}`,
      operatingSystemIdentity: `uid:${10000 + index}`,
      binarySha256: index.toString(16).padStart(64, "0"),
      configurationSha256: (index + 30).toString(16).padStart(64, "0"),
      keyId: `key-${index}`,
      publicKeySpkiSha256: (index + 60).toString(16).padStart(64, "0"),
      keyEpoch: 1,
      machineIdSha256: "f".repeat(64),
      serviceLauncherSha256: (index + 90).toString(16).padStart(64, "0"),
      registryGeneration: 1,
    }));
    expect(validateAuthorityV3R3RoleSeparation({
      roleBindings,
      gateDecisionBindings: payload.gateDecisionBindings,
    })).toEqual({ status: "AUTHORITY_V3_R3_ROLE_SEPARATION_VALID", roles: 18, gates: 24 });

    const collapsed = roleBindings.map((entry) => ({ ...entry }));
    collapsed[17].publicKeySpkiSha256 = collapsed[10].publicKeySpkiSha256;
    expect(() => validateAuthorityV3R3RoleSeparation({
      roleBindings: collapsed,
      gateDecisionBindings: payload.gateDecisionBindings,
    })).toThrow("E_ROLE_KEY_REUSE");
  });

  it("binds mutation evidence to the exact D0 mutation, gate and error tuple", () => {
    const payload = JSON.parse(raw).examples[0].payload;
    expect(validateAuthorityV3R3MutationEvidence({
      mutationCaseId: "M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE",
      expectedFailedGateName: "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED",
      observedErrorId: "CLEANUP_EQUIVALENCE_FALSE",
      failedGateNames: ["GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED"],
      verdict: "SYNTHETIC_FAIL",
    }, payload.mutationExpectations)).toEqual({
      status: "AUTHORITY_V3_R3_MUTATION_EVIDENCE_VALID",
      mutationCaseId: "M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE",
    });
    expect(() => validateAuthorityV3R3MutationEvidence({
      mutationCaseId: "M35_CLEANUP_VERIFIER_FALSE_EQUIVALENCE",
      expectedFailedGateName: "GATE_V3_R3_OBSERVER_COMPLETE",
      observedErrorId: "CLEANUP_EQUIVALENCE_FALSE",
      failedGateNames: ["GATE_V3_R3_OBSERVER_COMPLETE"],
      verdict: "SYNTHETIC_FAIL",
    }, payload.mutationExpectations)).toThrow("E_GATE_VERDICT_INCONSISTENT");
  });

  it("classifies ledger recovery only from an exact declared crash tuple", () => {
    const rules = JSON.parse(raw).examples[0].payload.ledgerDurabilityProtocol.crashRules;
    expect(classifyAuthorityV3R3LedgerRecovery({
      boundary: "PROVEN_BEFORE_TPM",
      durableDiskState: "PREPARED_N_PLUS_1",
      tpmState: "GEN_N_SLOT_N",
      publicationState: "PRIOR",
    }, rules)).toEqual({
      status: "AUTHORITY_V3_R3_RECOVERY_CLASSIFIED",
      allowedRecovery: "COMPLETE_PREPARED_THEN_CONSUME_FAIL",
      acceptingRole: "semantic-validator",
      semanticErrorId: "E_LEDGER_ORPHAN_PREPARED",
      retryClass: "SAME_TRANSACTION_ONLY",
    });

    expect(() => classifyAuthorityV3R3LedgerRecovery({
      boundary: "PROVEN_BEFORE_TPM",
      durableDiskState: "PREPARED_N_PLUS_1",
      tpmState: "GEN_N_PLUS_1_SLOT_N",
      publicationState: "PRIOR",
    }, rules)).toThrow("E_LEDGER_RECOVERY_TUPLE_UNKNOWN");
  });

  it("makes terminal publication single-key and idempotent", () => {
    expect(validateAuthorityV3R3TerminalPublication({
      publicationKey: "run-7:terminal",
      terminalTransitionCount: 1,
      d4Count: 1,
      p5Count: 0,
      d4PublicationKey: "run-7:terminal",
      p5PublicationKey: null,
    })).toEqual({
      status: "AUTHORITY_V3_R3_TERMINAL_PUBLICATION_VALID",
      nextAction: "RESOLVE_D4_CREATE_P5",
    });

    expect(() => validateAuthorityV3R3TerminalPublication({
      publicationKey: "run-7:terminal",
      terminalTransitionCount: 2,
      d4Count: 1,
      p5Count: 1,
      d4PublicationKey: "run-7:terminal",
      p5PublicationKey: "run-7:terminal",
    })).toThrow("E_LEDGER_TERMINAL_TRANSITION_DUPLICATE");
  });
});
