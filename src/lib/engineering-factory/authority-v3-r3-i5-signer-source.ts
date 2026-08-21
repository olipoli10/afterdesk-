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

type ObserverService = AuthorityV3R3I5Binding<"observer-service">;
type ObserverSigner = AuthorityV3R3I5Binding<"observer-signer">;
type EvidenceResolver = AuthorityV3R3I5Binding<"evidence-resolver">;

export type AuthorityV3R3ObserverSignerContract = {
  prePinnedServiceIdentityId: string;
  prePinnedSignerKeyId: string;
  eventChainProfile: "sha256-length-framed-v1";
  packetStatisticsRequired: true;
  expectedCaptureIds: string[];
};

export type AuthorityV3R3ObserverCompletenessObservation = {
  runId: string;
  readinessReceiptSha256: string;
  firstEventSequence: number;
  lastEventSequence: number;
  eventCount: number;
  eventChainRootSha256: string;
  gapCount: number;
  unclassifiedPacketCount: number;
  packetStatisticsAvailable: boolean;
  packetStatistics: Array<{
    captureId: string;
    packets: number;
    kernelDrops: number;
    freezeCount: number;
  }>;
  shutdownCompleted: boolean;
  normalizedObservationSha256: string;
};

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function validateBindings(
  service: ObserverService,
  signer: ObserverSigner,
  resolver: EvidenceResolver
): void {
  validateAuthorityV3R3I5Binding(service, "observer-service");
  validateAuthorityV3R3I5Binding(signer, "observer-signer");
  validateAuthorityV3R3I5Binding(resolver, "evidence-resolver");
  validateAuthorityV3R3I5Independence(service, signer);
  validateAuthorityV3R3I5Independence(service, resolver);
  validateAuthorityV3R3I5Independence(signer, resolver);
}

function validateContract(contract: AuthorityV3R3ObserverSignerContract): void {
  if (
    !contract.prePinnedServiceIdentityId ||
    !contract.prePinnedSignerKeyId ||
    contract.eventChainProfile !== "sha256-length-framed-v1" ||
    contract.packetStatisticsRequired !== true ||
    contract.expectedCaptureIds.length === 0 ||
    new Set(contract.expectedCaptureIds).size !== contract.expectedCaptureIds.length ||
    contract.expectedCaptureIds.some((captureId) => !/^[A-Za-z0-9._:-]{1,128}$/.test(captureId))
  ) {
    refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
  }
}

export function validateAuthorityV3R3ObserverCompletenessForSigning({
  contract,
  subjectBinding,
  observation,
  serviceBinding,
  signerBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3ObserverSignerContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  observation: AuthorityV3R3ObserverCompletenessObservation;
  serviceBinding: ObserverService;
  signerBinding: ObserverSigner;
  acceptingBinding: EvidenceResolver;
}) {
  validateContract(contract);
  validateBindings(serviceBinding, signerBinding, acceptingBinding);
  if (serviceBinding.identityId !== contract.prePinnedServiceIdentityId) {
    refuseAuthorityV3R3I5("OBSERVER_SERVICE_NOT_READY");
  }
  if (signerBinding.keyId !== contract.prePinnedSignerKeyId) {
    refuseAuthorityV3R3I5("OBSERVER_SIGNER_SUBSTITUTED");
  }

  if (!observation.packetStatisticsAvailable) {
    refuseAuthorityV3R3I5("PACKET_STATISTICS_UNAVAILABLE");
  }
  if (observation.packetStatistics.some((statistic) => statistic.kernelDrops !== 0)) {
    refuseAuthorityV3R3I5("OBSERVER_KERNEL_DROPS_NONZERO");
  }
  if (observation.unclassifiedPacketCount !== 0) {
    refuseAuthorityV3R3I5("UNCLASSIFIED_PACKET_EXACTLY_ONE");
  }

  const observedCaptureIds = observation.packetStatistics.map((statistic) => statistic.captureId);
  if (
    JSON.stringify(observedCaptureIds) !== JSON.stringify(contract.expectedCaptureIds) ||
    new Set(observedCaptureIds).size !== observation.packetStatistics.length ||
    observation.packetStatistics.some((statistic) =>
      !nonNegativeInteger(statistic.packets) ||
      !nonNegativeInteger(statistic.kernelDrops) ||
      !nonNegativeInteger(statistic.freezeCount)
    )
  ) {
    refuseAuthorityV3R3I5("PACKET_STATISTICS_UNAVAILABLE");
  }

  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(observation.runId) ||
    !isSha256(observation.readinessReceiptSha256) ||
    !isSha256(observation.eventChainRootSha256) ||
    !isSha256(observation.normalizedObservationSha256) ||
    !Number.isSafeInteger(observation.firstEventSequence) ||
    observation.firstEventSequence <= 0 ||
    !Number.isSafeInteger(observation.lastEventSequence) ||
    observation.lastEventSequence < observation.firstEventSequence ||
    !Number.isSafeInteger(observation.eventCount) ||
    observation.eventCount !== observation.lastEventSequence - observation.firstEventSequence + 1 ||
    observation.gapCount !== 0 ||
    observation.packetStatistics.some((statistic) => statistic.freezeCount !== 0) ||
    !observation.shutdownCompleted
  ) {
    refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_SIGNER_SOURCE_VALIDATED" as const,
    componentId: "observer-signer" as const,
    gateId: "GATE_V3_R3_OBSERVER_COMPLETE" as const,
    gateIds: ["GATE_V3_R3_OBSERVER_COMPLETE"] as const,
    producerRole: "observer-signer" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    signingPerformed: false as const,
    signatureRequiredAtRuntime: true as const,
    signatureAlgorithm: "ECDSA_P256_SHA256" as const,
    signerKeyId: signerBinding.keyId,
    eventChainRootSha256: observation.eventChainRootSha256,
    observationEnvelopeSha256: authorityV3R3I5Sha256({
      contract,
      observation,
      observerIdentityId: serviceBinding.identityId,
      signerIdentityId: signerBinding.identityId,
    }),
  });
}
