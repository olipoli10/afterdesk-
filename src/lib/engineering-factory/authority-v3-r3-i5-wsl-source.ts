import {
  AUTHORITY_V3_R3_I5_SOURCE_CEILING,
  type AuthorityV3R3I5Binding,
  type AuthorityV3R3I5SubjectBinding,
  authorityV3R3I5SubjectBindingSha256,
  authorityV3R3I5Sha256,
  deepFreezeAuthorityV3R3I5,
  refuseAuthorityV3R3I5,
  validateAuthorityV3R3I5Binding,
  validateAuthorityV3R3I5Independence,
} from "./authority-v3-r3-i5-common";

const BASE_CHAINS = [
  { namespaceClass: "enforcement", family: "inet", hook: "input", priority: -300, policy: "drop" },
  { namespaceClass: "enforcement", family: "inet", hook: "forward", priority: -300, policy: "drop" },
  { namespaceClass: "enforcement", family: "inet", hook: "output", priority: -300, policy: "drop" },
  { namespaceClass: "workload", family: "inet", hook: "input", priority: -300, policy: "drop" },
  { namespaceClass: "workload", family: "inet", hook: "output", priority: -300, policy: "drop" },
] as const;

const REQUIRED_TUPLES = [
  { tupleId: "candidate-to-relay", source: "candidate", destination: "relay", protocol: "tcp", port: 47001 },
  { tupleId: "relay-to-fake-dns", source: "relay", destination: "fake-dns", protocol: "udp+tcp", port: 5300 },
  { tupleId: "relay-to-fake-provider", source: "relay", destination: "fake-provider", protocol: "tcp", port: 47002 },
] as const;

type WslProducer = AuthorityV3R3I5Binding<"wsl-enforcement-controller">;
type EvidenceResolver = AuthorityV3R3I5Binding<"evidence-resolver">;

type NamespaceContract = { name: string; inode: number };
type InterfaceContract = { namespace: string; name: string; peerName: string };
type AllowedTuple = {
  tupleId: string;
  source: string;
  destination: string;
  protocol: "tcp" | "udp" | "udp+tcp";
  port: number;
};

export type AuthorityV3R3WslControllerContract = {
  enforcementNamespace: NamespaceContract;
  workloadNamespace: NamespaceContract;
  interfaces: InterfaceContract[];
  allowedTuples: AllowedTuple[];
};

type BaseChain = {
  namespaceClass: "enforcement" | "workload";
  family: "inet";
  hook: "input" | "forward" | "output";
  priority: number;
  policy: "drop" | "accept";
};

export type AuthorityV3R3WslControllerReadback = {
  namespaceInodes: { enforcement: number; workload: number };
  baseChains: BaseChain[];
  interfaces: Array<InterfaceContract & {
    ifindex: number;
    state: "DOWN" | "UP";
    addresses: string[];
    observerAttached: boolean;
  }>;
  acceptedTuples: AllowedTuple[];
  defaultRouteCount: number;
  uplinkInterfaceCount: number;
  hostGatewayRouteCount: number;
  dnsOutsideFakeDnsRuleCount: number;
  ipv6RouteCount: number;
  inheritedSocketCount: number;
  inheritedFdCount: number;
  unexpectedHelperCount: number;
  normalizedTopologySha256: string;
};

function validIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,62}$/i.test(value);
}

function validateBindings(producer: WslProducer, acceptor: EvidenceResolver): void {
  validateAuthorityV3R3I5Binding(producer, "wsl-enforcement-controller");
  validateAuthorityV3R3I5Binding(acceptor, "evidence-resolver");
  validateAuthorityV3R3I5Independence(producer, acceptor);
}

function validateContract(contract: AuthorityV3R3WslControllerContract): void {
  const namespaces = [contract.enforcementNamespace, contract.workloadNamespace];
  if (
    namespaces.some((namespace) =>
      !validIdentifier(namespace.name) || !Number.isSafeInteger(namespace.inode) || namespace.inode <= 0
    ) ||
    contract.enforcementNamespace.name === contract.workloadNamespace.name ||
    contract.enforcementNamespace.inode === contract.workloadNamespace.inode ||
    contract.interfaces.length !== 2 ||
    contract.interfaces.some((iface) =>
      !namespaces.some((namespace) => namespace.name === iface.namespace) ||
      !validIdentifier(iface.name) ||
      !validIdentifier(iface.peerName)
    ) ||
    contract.interfaces[0]?.name !== contract.interfaces[1]?.peerName ||
    contract.interfaces[1]?.name !== contract.interfaces[0]?.peerName ||
    contract.allowedTuples.length !== REQUIRED_TUPLES.length ||
    contract.allowedTuples.some((tuple, index) => {
      const required = REQUIRED_TUPLES[index];
      return !required ||
        tuple.tupleId !== required.tupleId ||
        tuple.source !== required.source ||
        tuple.destination !== required.destination ||
        tuple.protocol !== required.protocol ||
        tuple.port !== required.port;
    })
  ) {
    refuseAuthorityV3R3I5("FIREWALL_TABLE_MISSING");
  }
}

export function buildAuthorityV3R3WslControllerPlan({
  contract,
  subjectBinding,
  producerBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3WslControllerContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  producerBinding: WslProducer;
  acceptingBinding: EvidenceResolver;
}) {
  validateContract(contract);
  validateBindings(producerBinding, acceptingBinding);

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_WSL_SOURCE_PLANNED" as const,
    componentId: "wsl-controller" as const,
    producerRole: "wsl-enforcement-controller" as const,
    acceptingRole: "evidence-resolver" as const,
    gateIds: [
      "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
      "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
      "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
    ] as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    workloadNetworkMode: "none" as const,
    namespaceCreationOrder: ["enforcement", "workload"] as const,
    interfaces: contract.interfaces.map((iface) => ({ ...iface })),
    baseChains: BASE_CHAINS.map((chain) => ({ ...chain })),
    allowedTuples: contract.allowedTuples.map((tuple) => ({ ...tuple })),
    forbiddenPaths: [
      "default-route",
      "wsl-uplink",
      "windows-host-gateway",
      "dns-outside-fake-dns",
      "ipv6",
      "ipv4-mapped-ipv6",
      "nat64",
      "metadata",
      "link-local",
      "multicast-broadcast",
      "cross-namespace-loopback",
      "unmatched-traffic",
    ] as const,
  });
}

export function validateAuthorityV3R3WslControllerReadback({
  contract,
  subjectBinding,
  readback,
  producerBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3WslControllerContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  readback: AuthorityV3R3WslControllerReadback;
  producerBinding: WslProducer;
  acceptingBinding: EvidenceResolver;
}) {
  const plan = buildAuthorityV3R3WslControllerPlan({
    contract,
    subjectBinding,
    producerBinding,
    acceptingBinding,
  });

  if (
    JSON.stringify(readback.baseChains) !== JSON.stringify(plan.baseChains)
  ) {
    refuseAuthorityV3R3I5("FIREWALL_BASE_CHAIN_CANONICAL_MISMATCH");
  }

  if (
    readback.namespaceInodes.enforcement !== contract.enforcementNamespace.inode ||
    readback.namespaceInodes.workload !== contract.workloadNamespace.inode ||
    readback.interfaces.length !== contract.interfaces.length ||
    readback.interfaces.some((iface, index) =>
      iface.namespace !== contract.interfaces[index]?.namespace ||
      iface.name !== contract.interfaces[index]?.name ||
      iface.peerName !== contract.interfaces[index]?.peerName ||
      !Number.isSafeInteger(iface.ifindex) ||
      iface.ifindex <= 0 ||
      iface.state !== "DOWN" ||
      iface.addresses.length !== 0 ||
      iface.observerAttached
    )
  ) {
    refuseAuthorityV3R3I5("ROOTLESS_RUNTIME_EDIT_SUCCEEDED");
  }

  if (
    JSON.stringify(readback.acceptedTuples) !== JSON.stringify(plan.allowedTuples) ||
    readback.defaultRouteCount !== 0 ||
    readback.uplinkInterfaceCount !== 0 ||
    readback.hostGatewayRouteCount !== 0 ||
    readback.dnsOutsideFakeDnsRuleCount !== 0 ||
    readback.ipv6RouteCount !== 0
  ) {
    refuseAuthorityV3R3I5("DNS_IPV6_BYPASS_PRESENT");
  }

  if (
    readback.inheritedSocketCount !== 0 ||
    readback.inheritedFdCount !== 0 ||
    readback.unexpectedHelperCount !== 0
  ) {
    refuseAuthorityV3R3I5("INHERITED_SOCKET_OR_FD");
  }

  if (!/^[0-9a-f]{64}$/.test(readback.normalizedTopologySha256)) {
    refuseAuthorityV3R3I5("FIREWALL_TABLE_MISSING");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_WSL_SOURCE_READBACK_VALID" as const,
    componentId: "wsl-controller" as const,
    producerRole: "wsl-enforcement-controller" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    gates: [
      "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
      "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
      "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
    ] as const,
    gateIds: [
      "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
      "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
      "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
    ] as const,
    normalizedReadbackSha256: authorityV3R3I5Sha256(readback),
  });
}
