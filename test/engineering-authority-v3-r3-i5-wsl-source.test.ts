import { describe, expect, it } from "vitest";

import {
  buildAuthorityV3R3WslControllerPlan,
  validateAuthorityV3R3WslControllerReadback,
} from "@/lib/engineering-factory/authority-v3-r3-i5-wsl-source";

const hash = (digit: string) => digit.repeat(64);

const producer = {
  role: "wsl-enforcement-controller" as const,
  identityId: "wsl-controller-source",
  operatingSystemIdentity: "uid:1401",
  binarySha256: hash("1"),
  configurationSha256: hash("2"),
  keyId: "wsl-controller-key",
  publicKeySpkiSha256: hash("3"),
};

const acceptor = {
  role: "evidence-resolver" as const,
  identityId: "evidence-resolver-source",
  operatingSystemIdentity: "S-1-5-80-1402",
  binarySha256: hash("4"),
  configurationSha256: hash("5"),
  keyId: "evidence-resolver-key",
  publicKeySpkiSha256: hash("6"),
};

const contract = {
  enforcementNamespace: { name: "ef-enforcement", inode: 41001 },
  workloadNamespace: { name: "ef-candidate", inode: 41002 },
  interfaces: [
    { namespace: "ef-enforcement", name: "veth-enf", peerName: "veth-work" },
    { namespace: "ef-candidate", name: "veth-work", peerName: "veth-enf" },
  ],
  allowedTuples: [
    { tupleId: "candidate-to-relay", source: "candidate", destination: "relay", protocol: "tcp" as const, port: 47001 },
    { tupleId: "relay-to-fake-dns", source: "relay", destination: "fake-dns", protocol: "udp+tcp" as const, port: 5300 },
    { tupleId: "relay-to-fake-provider", source: "relay", destination: "fake-provider", protocol: "tcp" as const, port: 47002 },
  ],
};

function exactReadback() {
  const plan = buildAuthorityV3R3WslControllerPlan({
    contract,
    producerBinding: producer,
    acceptingBinding: acceptor,
  });
  return {
    namespaceInodes: {
      enforcement: contract.enforcementNamespace.inode,
      workload: contract.workloadNamespace.inode,
    },
    baseChains: plan.baseChains.map((chain) => ({ ...chain })),
    interfaces: plan.interfaces.map((iface, index) => ({
      ...iface,
      ifindex: 51 + index,
      state: "DOWN" as const,
      addresses: [] as string[],
      observerAttached: false,
    })),
    acceptedTuples: plan.allowedTuples.map((tuple) => ({ ...tuple })),
    defaultRouteCount: 0,
    uplinkInterfaceCount: 0,
    hostGatewayRouteCount: 0,
    dnsOutsideFakeDnsRuleCount: 0,
    ipv6RouteCount: 0,
    inheritedSocketCount: 0,
    inheritedFdCount: 0,
    unexpectedHelperCount: 0,
    normalizedTopologySha256: hash("a"),
  };
}

describe("Authority V3 R3 I5 WSL controller source", () => {
  it("builds a no-uplink, default-drop prebind plan with only three fake tuples", () => {
    const plan = buildAuthorityV3R3WslControllerPlan({
      contract,
      producerBinding: producer,
      acceptingBinding: acceptor,
    });

    expect(plan).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_WSL_SOURCE_PLANNED",
      sourceOnly: true,
      executionAuthorized: false,
      providerCalls: 0,
      realCandidateInvocations: 0,
      workloadNetworkMode: "none",
    });
    expect(plan.baseChains).toEqual([
      { namespaceClass: "enforcement", family: "inet", hook: "input", priority: -300, policy: "drop" },
      { namespaceClass: "enforcement", family: "inet", hook: "forward", priority: -300, policy: "drop" },
      { namespaceClass: "enforcement", family: "inet", hook: "output", priority: -300, policy: "drop" },
      { namespaceClass: "workload", family: "inet", hook: "input", priority: -300, policy: "drop" },
      { namespaceClass: "workload", family: "inet", hook: "output", priority: -300, policy: "drop" },
    ]);
    expect(plan.allowedTuples.map((tuple) => tuple.tupleId)).toEqual([
      "candidate-to-relay",
      "relay-to-fake-dns",
      "relay-to-fake-provider",
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("accepts only the exact prebind and inner-firewall readback", () => {
    expect(validateAuthorityV3R3WslControllerReadback({
      contract,
      readback: exactReadback(),
      producerBinding: producer,
      acceptingBinding: acceptor,
    })).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_WSL_SOURCE_READBACK_VALID",
      gates: [
        "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
        "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
        "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
      ],
      executionAuthorized: false,
    });
  });

  it.each([
    ["an accept-policy base chain", (value: ReturnType<typeof exactReadback>) => {
      value.baseChains[0] = { ...value.baseChains[0]!, policy: "accept" as never };
    }, "FIREWALL_BASE_CHAIN_CANONICAL_MISMATCH"],
    ["a link brought up before observer attachment", (value: ReturnType<typeof exactReadback>) => {
      value.interfaces[0] = { ...value.interfaces[0]!, state: "UP" as never };
    }, "ROOTLESS_RUNTIME_EDIT_SUCCEEDED"],
    ["an unexpected accepted tuple", (value: ReturnType<typeof exactReadback>) => {
      value.acceptedTuples.push({
        ...value.acceptedTuples[0]!,
        tupleId: "candidate-to-internet",
      });
    }, "DNS_IPV6_BYPASS_PRESENT"],
    ["an unexpected helper", (value: ReturnType<typeof exactReadback>) => {
      value.unexpectedHelperCount = 1;
    }, "INHERITED_SOCKET_OR_FD"],
  ] as const)("refuses %s", (_label, mutate, errorId) => {
    const readback = exactReadback();
    mutate(readback);
    expect(() => validateAuthorityV3R3WslControllerReadback({
      contract,
      readback,
      producerBinding: producer,
      acceptingBinding: acceptor,
    })).toThrow(errorId);
  });

  it("rejects a controller that is also its own acceptor", () => {
    expect(() => buildAuthorityV3R3WslControllerPlan({
      contract,
      producerBinding: producer,
      acceptingBinding: {
        ...acceptor,
        binarySha256: producer.binarySha256,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
