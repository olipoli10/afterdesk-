import { describe, expect, it } from "vitest";

import {
  buildAuthorityV3R3WindowsOuterDenyPlan,
  validateAuthorityV3R3WindowsOuterDenyReadback,
} from "@/lib/engineering-factory/authority-v3-r3-i5-windows-source";

const hash = (digit: string) => digit.repeat(64);

const subjectBinding = {
  runId: "run-r3-i5-source",
  authorityGeneration: 5,
  nonceSha256: hash("e"),
  machineIdSha256: hash("f"),
  windowsBootId: "windows-boot-i5",
  wslBootId: "wsl-boot-i5",
};

const producer = {
  role: "windows-outer-deny-controller" as const,
  identityId: "windows-outer-deny-source",
  operatingSystemIdentity: "S-1-5-80-1001",
  binarySha256: hash("1"),
  configurationSha256: hash("2"),
  keyId: "windows-outer-deny-key",
  publicKeySpkiSha256: hash("3"),
};

const acceptor = {
  role: "evidence-resolver" as const,
  identityId: "evidence-resolver-source",
  operatingSystemIdentity: "S-1-5-80-1002",
  binarySha256: hash("4"),
  configurationSha256: hash("5"),
  keyId: "evidence-resolver-key",
  publicKeySpkiSha256: hash("6"),
};

const contract = {
  providerGuid: "{11111111-1111-4111-8111-111111111111}",
  sublayerGuid: "{22222222-2222-4222-8222-222222222222}",
  vmCreatorId: "ef-authority-v3-r3",
  vnicGuid: "{33333333-3333-4333-8333-333333333333}",
  compartmentId: 42,
};

function exactReadback() {
  const plan = buildAuthorityV3R3WindowsOuterDenyPlan({
    contract,
    subjectBinding,
    wslDistributionState: "STOPPED",
    producerBinding: producer,
    acceptingBinding: acceptor,
  });
  return {
    bfeState: "RUNNING" as const,
    providerGuid: contract.providerGuid,
    sublayerGuid: contract.sublayerGuid,
    vmCreatorId: contract.vmCreatorId,
    vnicGuid: contract.vnicGuid,
    compartmentId: contract.compartmentId,
    hyperV: {
      inboundDefault: "BLOCK" as const,
      outboundDefault: "BLOCK" as const,
      loopbackEnabled: false,
      allowRuleCount: 0,
    },
    filters: plan.filters.map((filter, index) => ({
      ...filter,
      filterId: `filter-${index + 1}`,
    })),
    normalizedWindowsInventorySha256: hash("a"),
  };
}

describe("Authority V3 R3 I5 Windows outer-deny source", () => {
  it("builds only the exact persistent six-layer block plan before WSL starts", () => {
    const plan = buildAuthorityV3R3WindowsOuterDenyPlan({
      contract,
      subjectBinding,
      wslDistributionState: "STOPPED",
      producerBinding: producer,
      acceptingBinding: acceptor,
    });

    expect(plan).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_PLANNED",
      gateId: "GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE",
      sourceOnly: true,
      executionAuthorized: false,
      providerCalls: 0,
      realCandidateInvocations: 0,
    });
    expect(plan.filters).toHaveLength(6);
    expect(plan.filters.map((filter) => filter.layer)).toEqual([
      "ALE_RESOURCE_ASSIGNMENT_V4",
      "ALE_RESOURCE_ASSIGNMENT_V6",
      "ALE_AUTH_CONNECT_V4",
      "ALE_AUTH_CONNECT_V6",
      "OUTBOUND_TRANSPORT_V4",
      "OUTBOUND_TRANSPORT_V6",
    ]);
    expect(plan.filters.every((filter) =>
      filter.action === "BLOCK" && filter.bootTime && filter.persistent
    )).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.filters)).toBe(true);
  });

  it("fails closed unless WSL is stopped before source planning", () => {
    expect(() => buildAuthorityV3R3WindowsOuterDenyPlan({
      contract,
      subjectBinding,
      wslDistributionState: "RUNNING",
      producerBinding: producer,
      acceptingBinding: acceptor,
    })).toThrow("WINDOWS_OUTER_DENY_INCOMPLETE");
  });

  it("accepts only an independently resolvable exact readback", () => {
    expect(validateAuthorityV3R3WindowsOuterDenyReadback({
      contract,
      subjectBinding,
      readback: exactReadback(),
      producerBinding: producer,
      acceptingBinding: acceptor,
    })).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_READBACK_VALID",
      gateId: "GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE",
      producerRole: "windows-outer-deny-controller",
      acceptingRole: "evidence-resolver",
      executionAuthorized: false,
    });
  });

  it.each([
    ["missing IPv6 transport deny", (value: ReturnType<typeof exactReadback>) => {
      value.filters = value.filters.filter((filter) => filter.layer !== "OUTBOUND_TRANSPORT_V6");
    }],
    ["an allow rule", (value: ReturnType<typeof exactReadback>) => {
      value.hyperV.allowRuleCount = 1;
    }],
    ["a non-persistent filter", (value: ReturnType<typeof exactReadback>) => {
      value.filters[0] = { ...value.filters[0]!, persistent: false };
    }],
  ] as const)("refuses %s", (_label, mutate) => {
    const readback = exactReadback();
    mutate(readback);
    expect(() => validateAuthorityV3R3WindowsOuterDenyReadback({
      contract,
      subjectBinding,
      readback,
      producerBinding: producer,
      acceptingBinding: acceptor,
    })).toThrow("WINDOWS_OUTER_DENY_INCOMPLETE");
  });

  it("rejects producer and acceptor identity collapse", () => {
    expect(() => buildAuthorityV3R3WindowsOuterDenyPlan({
      contract,
      subjectBinding,
      wslDistributionState: "STOPPED",
      producerBinding: producer,
      acceptingBinding: {
        ...acceptor,
        operatingSystemIdentity: producer.operatingSystemIdentity,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
