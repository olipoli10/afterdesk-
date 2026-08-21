import { describe, expect, it } from "vitest";

import {
  authorityV3R3I5SubjectBindingSha256,
} from "@/lib/engineering-factory/authority-v3-r3-i5-common";
import {
  assembleAuthorityV3R3I5SourceBoundary,
} from "@/lib/engineering-factory/authority-v3-r3-i5-integration";

const hash = (digit: string) => digit.repeat(64);

const subjectBinding = {
  runId: "run-r3-i5-source",
  authorityGeneration: 5,
  nonceSha256: hash("e"),
  machineIdSha256: hash("f"),
  windowsBootId: "windows-boot-i5",
  wslBootId: "wsl-boot-i5",
};

const subjectBindingSha256 = authorityV3R3I5SubjectBindingSha256(subjectBinding);

function component(
  componentId: string,
  status: string,
  producerRole: string,
  acceptingRole: string,
  gateIds: string[]
) {
  return {
    componentId,
    status,
    producerRole,
    acceptingRole,
    gateIds,
    subjectBindingSha256,
    sourceOnly: true,
    executionAuthorized: false,
    providerCalls: 0,
    realCandidateInvocations: 0,
  };
}

function exactComponents() {
  return [
    component(
      "windows-outer-deny",
      "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_READBACK_VALID",
      "windows-outer-deny-controller",
      "evidence-resolver",
      ["GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE"]
    ),
    component(
      "wsl-controller",
      "AUTHORITY_V3_R3_I5_WSL_SOURCE_READBACK_VALID",
      "wsl-enforcement-controller",
      "evidence-resolver",
      [
        "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
        "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
        "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
      ]
    ),
    component(
      "observer-service",
      "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_READY",
      "observer-service",
      "observer-signer",
      ["GATE_V3_R3_OBSERVER_SERVICE_READY", "GATE_V3_R3_OBSERVER_CAPTURE_READY"]
    ),
    component(
      "observer-signer",
      "AUTHORITY_V3_R3_I5_SIGNER_SOURCE_VALIDATED",
      "observer-signer",
      "evidence-resolver",
      ["GATE_V3_R3_OBSERVER_COMPLETE"]
    ),
    component(
      "evidence-broker",
      "AUTHORITY_V3_R3_I5_EVIDENCE_BROKER_SOURCE_VALID",
      "evidence-broker",
      "evidence-resolver",
      ["GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED"]
    ),
    component(
      "cleanup-verifier",
      "AUTHORITY_V3_R3_I5_CLEANUP_SOURCE_VERIFIED",
      "external-cleanup-verifier",
      "evidence-resolver",
      ["GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED"]
    ),
  ];
}

describe("Authority V3 R3 I5 source-only integration", () => {
  it("assembles all six exact same-subject source envelopes without execution authority", () => {
    const result = assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components: exactComponents(),
    });

    expect(result).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_SOURCE_BOUNDARY_COMPLETE",
      componentCount: 6,
      sourceOnly: true,
      executionAuthorized: false,
      providerCalls: 0,
      realCandidateInvocations: 0,
      nextAuthorityClass: "I6_SEPARATELY_GATED",
    });
    expect(result.componentEnvelopeSha256).toHaveLength(6);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("refuses a missing or duplicate component", () => {
    const missing = exactComponents();
    missing.pop();
    expect(() => assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components: missing,
    })).toThrow("E_GATE_VERDICT_INCONSISTENT");

    const duplicate = exactComponents();
    duplicate[5] = { ...duplicate[0]! };
    expect(() => assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components: duplicate,
    })).toThrow("E_GATE_VERDICT_INCONSISTENT");
  });

  it("refuses stale evidence from another subject binding", () => {
    const components = exactComponents();
    components[2] = { ...components[2]!, subjectBindingSha256: hash("0") };
    expect(() => assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components,
    })).toThrow("E_GATE_VERDICT_INCONSISTENT");
  });

  it.each([
    ["execution authorization", (value: ReturnType<typeof exactComponents>) => {
      value[0] = { ...value[0]!, executionAuthorized: true };
    }],
    ["a provider call", (value: ReturnType<typeof exactComponents>) => {
      value[1] = { ...value[1]!, providerCalls: 1 };
    }],
    ["a real candidate invocation", (value: ReturnType<typeof exactComponents>) => {
      value[2] = { ...value[2]!, realCandidateInvocations: 1 };
    }],
  ] as const)("refuses %s in an I5 envelope", (_label, mutate) => {
    const components = exactComponents();
    mutate(components);
    expect(() => assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components,
    })).toThrow("E_GATE_VERDICT_INCONSISTENT");
  });

  it("refuses producer/acceptor mapping drift", () => {
    const components = exactComponents();
    components[3] = {
      ...components[3]!,
      acceptingRole: "observer-signer",
    };
    expect(() => assembleAuthorityV3R3I5SourceBoundary({
      subjectBinding,
      components,
    })).toThrow("E_GATE_ROLE_MAPPING_INVALID");
  });
});
