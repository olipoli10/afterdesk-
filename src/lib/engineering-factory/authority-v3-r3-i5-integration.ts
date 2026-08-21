import {
  AUTHORITY_V3_R3_I5_SOURCE_CEILING,
  type AuthorityV3R3I5SubjectBinding,
  authorityV3R3I5Sha256,
  authorityV3R3I5SubjectBindingSha256,
  deepFreezeAuthorityV3R3I5,
  refuseAuthorityV3R3I5,
} from "./authority-v3-r3-i5-common";

const EXPECTED_COMPONENTS = [
  {
    componentId: "windows-outer-deny",
    status: "AUTHORITY_V3_R3_I5_WINDOWS_SOURCE_READBACK_VALID",
    producerRole: "windows-outer-deny-controller",
    acceptingRole: "evidence-resolver",
    gateIds: ["GATE_V3_R3_WINDOWS_OUTER_DENY_ACTIVE"],
  },
  {
    componentId: "wsl-controller",
    status: "AUTHORITY_V3_R3_I5_WSL_SOURCE_READBACK_VALID",
    producerRole: "wsl-enforcement-controller",
    acceptingRole: "evidence-resolver",
    gateIds: [
      "GATE_V3_R3_NAMESPACE_PREBIND_VALID",
      "GATE_V3_R3_INNER_FIREWALL_INSTALLED",
      "GATE_V3_R3_INNER_FIREWALL_READBACK_EXACT",
    ],
  },
  {
    componentId: "observer-service",
    status: "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_READY",
    producerRole: "observer-service",
    acceptingRole: "observer-signer",
    gateIds: ["GATE_V3_R3_OBSERVER_SERVICE_READY", "GATE_V3_R3_OBSERVER_CAPTURE_READY"],
  },
  {
    componentId: "observer-signer",
    status: "AUTHORITY_V3_R3_I5_SIGNER_SOURCE_VALIDATED",
    producerRole: "observer-signer",
    acceptingRole: "evidence-resolver",
    gateIds: ["GATE_V3_R3_OBSERVER_COMPLETE"],
  },
  {
    componentId: "evidence-broker",
    status: "AUTHORITY_V3_R3_I5_EVIDENCE_BROKER_SOURCE_VALID",
    producerRole: "evidence-broker",
    acceptingRole: "evidence-resolver",
    gateIds: ["GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED"],
  },
  {
    componentId: "cleanup-verifier",
    status: "AUTHORITY_V3_R3_I5_CLEANUP_SOURCE_VERIFIED",
    producerRole: "external-cleanup-verifier",
    acceptingRole: "evidence-resolver",
    gateIds: ["GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED"],
  },
] as const;

export type AuthorityV3R3I5SourceComponentEnvelope = {
  componentId: string;
  status: string;
  producerRole: string;
  acceptingRole: string;
  gateIds: readonly string[];
  subjectBindingSha256: string;
  sourceOnly: boolean;
  executionAuthorized: boolean;
  providerCalls: number;
  realCandidateInvocations: number;
};

export function assembleAuthorityV3R3I5SourceBoundary({
  subjectBinding,
  components,
}: {
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  components: readonly AuthorityV3R3I5SourceComponentEnvelope[];
}) {
  const expectedSubjectBindingSha256 = authorityV3R3I5SubjectBindingSha256(subjectBinding);
  if (
    components.length !== EXPECTED_COMPONENTS.length ||
    new Set(components.map((component) => component.componentId)).size !== EXPECTED_COMPONENTS.length ||
    components.some((component) =>
      component.subjectBindingSha256 !== expectedSubjectBindingSha256 ||
      component.sourceOnly !== true ||
      component.executionAuthorized !== false ||
      component.providerCalls !== 0 ||
      component.realCandidateInvocations !== 0
    )
  ) {
    refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
  }

  for (const [index, expected] of EXPECTED_COMPONENTS.entries()) {
    const component = components[index];
    if (!component || component.componentId !== expected.componentId || component.status !== expected.status) {
      refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
    }
    if (
      component.producerRole !== expected.producerRole ||
      component.acceptingRole !== expected.acceptingRole
    ) {
      refuseAuthorityV3R3I5("E_GATE_ROLE_MAPPING_INVALID");
    }
    if (JSON.stringify(component.gateIds) !== JSON.stringify(expected.gateIds)) {
      refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
    }
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_SOURCE_BOUNDARY_COMPLETE" as const,
    subjectBindingSha256: expectedSubjectBindingSha256,
    componentCount: EXPECTED_COMPONENTS.length,
    componentEnvelopeSha256: components.map((component) => ({
      componentId: component.componentId,
      sha256: authorityV3R3I5Sha256(component),
    })),
    integrationEnvelopeSha256: authorityV3R3I5Sha256({ subjectBinding, components }),
    nextAuthorityClass: "I6_SEPARATELY_GATED" as const,
  });
}
