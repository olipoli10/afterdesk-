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

const WINDOWS_LAYERS = [
  "ALE_RESOURCE_ASSIGNMENT_V4",
  "ALE_RESOURCE_ASSIGNMENT_V6",
  "ALE_AUTH_CONNECT_V4",
  "ALE_AUTH_CONNECT_V6",
  "OUTBOUND_TRANSPORT_V4",
  "OUTBOUND_TRANSPORT_V6",
] as const;

type WindowsLayer = (typeof WINDOWS_LAYERS)[number];

export type AuthorityV3R3WindowsOuterDenyContract = {
  providerGuid: string;
  sublayerGuid: string;
  vmCreatorId: string;
  vnicGuid: string;
  compartmentId: number;
};

export type AuthorityV3R3WindowsOuterDenyFilter = {
  layer: WindowsLayer;
  addressFamily: "IPV4" | "IPV6";
  action: "BLOCK";
  bootTime: boolean;
  persistent: boolean;
  providerGuid: string;
  sublayerGuid: string;
  vmCreatorId: string;
  vnicGuid: string;
  compartmentId: number;
};

type WindowsProducer = AuthorityV3R3I5Binding<"windows-outer-deny-controller">;
type EvidenceResolver = AuthorityV3R3I5Binding<"evidence-resolver">;

type WindowsPlanInput = {
  contract: AuthorityV3R3WindowsOuterDenyContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  wslDistributionState: "STOPPED" | "RUNNING" | "UNKNOWN";
  producerBinding: WindowsProducer;
  acceptingBinding: EvidenceResolver;
};

export type AuthorityV3R3WindowsOuterDenyReadback = {
  bfeState: "RUNNING" | "STOPPED";
  providerGuid: string;
  sublayerGuid: string;
  vmCreatorId: string;
  vnicGuid: string;
  compartmentId: number;
  hyperV: {
    inboundDefault: "BLOCK" | "ALLOW";
    outboundDefault: "BLOCK" | "ALLOW";
    loopbackEnabled: boolean;
    allowRuleCount: number;
  };
  filters: Array<AuthorityV3R3WindowsOuterDenyFilter & { filterId: string }>;
  normalizedWindowsInventorySha256: string;
};

const GUID = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/i;

function validateContract(contract: AuthorityV3R3WindowsOuterDenyContract): void {
  if (
    !GUID.test(contract.providerGuid) ||
    !GUID.test(contract.sublayerGuid) ||
    !GUID.test(contract.vnicGuid) ||
    !contract.vmCreatorId ||
    !Number.isSafeInteger(contract.compartmentId) ||
    contract.compartmentId <= 0
  ) {
    refuseAuthorityV3R3I5("WINDOWS_OUTER_DENY_INCOMPLETE");
  }
}

function validateBindings(producer: WindowsProducer, acceptor: EvidenceResolver): void {
  validateAuthorityV3R3I5Binding(producer, "windows-outer-deny-controller");
  validateAuthorityV3R3I5Binding(acceptor, "evidence-resolver");
  validateAuthorityV3R3I5Independence(producer, acceptor);
}

export function buildAuthorityV3R3WindowsOuterDenyPlan(input: WindowsPlanInput) {
  validateContract(input.contract);
  validateBindings(input.producerBinding, input.acceptingBinding);
  if (input.wslDistributionState !== "STOPPED") {
    refuseAuthorityV3R3I5("WINDOWS_OUTER_DENY_INCOMPLETE");
  }

  const filters: AuthorityV3R3WindowsOuterDenyFilter[] = WINDOWS_LAYERS.map((layer) => ({
    layer,
    addressFamily: layer.endsWith("V4") ? "IPV4" : "IPV6",
    action: "BLOCK",
    bootTime: true,
    persistent: true,
    providerGuid: input.contract.providerGuid,
    sublayerGuid: input.contract.sublayerGuid,
    vmCreatorId: input.contract.vmCreatorId,
    vnicGuid: input.contract.vnicGuid,
    compartmentId: input.contract.compartmentId,
  }));

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_PLANNED" as const,
    componentId: "windows-outer-deny" as const,
    gateId: "GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE" as const,
    gateIds: ["GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE"] as const,
    producerRole: "windows-outer-deny-controller" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(input.subjectBinding),
    filters,
    hyperV: {
      inboundDefault: "BLOCK" as const,
      outboundDefault: "BLOCK" as const,
      loopbackEnabled: false,
      allowRuleCount: 0,
    },
  });
}

export function validateAuthorityV3R3WindowsOuterDenyReadback({
  contract,
  subjectBinding,
  readback,
  producerBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3WindowsOuterDenyContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  readback: AuthorityV3R3WindowsOuterDenyReadback;
  producerBinding: WindowsProducer;
  acceptingBinding: EvidenceResolver;
}) {
  validateContract(contract);
  validateBindings(producerBinding, acceptingBinding);
  const exactPlan = buildAuthorityV3R3WindowsOuterDenyPlan({
    contract,
    subjectBinding,
    wslDistributionState: "STOPPED",
    producerBinding,
    acceptingBinding,
  });

  const readbackFilters = readback.filters.map(({ filterId, ...filter }) => {
    void filterId;
    return filter;
  });
  const hasExactFilters =
    readback.filters.length === WINDOWS_LAYERS.length &&
    new Set(readback.filters.map((filter) => filter.filterId)).size === WINDOWS_LAYERS.length &&
    JSON.stringify(readbackFilters) === JSON.stringify(exactPlan.filters);
  if (
    readback.bfeState !== "RUNNING" ||
    readback.providerGuid !== contract.providerGuid ||
    readback.sublayerGuid !== contract.sublayerGuid ||
    readback.vmCreatorId !== contract.vmCreatorId ||
    readback.vnicGuid !== contract.vnicGuid ||
    readback.compartmentId !== contract.compartmentId ||
    readback.hyperV.inboundDefault !== "BLOCK" ||
    readback.hyperV.outboundDefault !== "BLOCK" ||
    readback.hyperV.loopbackEnabled ||
    readback.hyperV.allowRuleCount !== 0 ||
    !/^[0-9a-f]{64}$/.test(readback.normalizedWindowsInventorySha256) ||
    !hasExactFilters
  ) {
    refuseAuthorityV3R3I5("WINDOWS_OUTER_DENY_INCOMPLETE");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_READBACK_VALID" as const,
    componentId: "windows-outer-deny" as const,
    gateId: "GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE" as const,
    gateIds: ["GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE"] as const,
    producerRole: "windows-outer-deny-controller" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    normalizedReadbackSha256: authorityV3R3I5Sha256(readback),
  });
}
