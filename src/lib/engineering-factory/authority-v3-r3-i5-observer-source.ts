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

type ObserverInterface = {
  namespaceInode: number;
  interfaceName: string;
  ifindex: number;
  peerIfindex: number;
  linkType: "veth";
  expectedPurpose: string;
};

export type AuthorityV3R3ObserverServiceContract = {
  prePinnedSignerKeyId: string;
  serviceReadyDeadlineSequence: number;
  reservationSequence: number;
  netlinkSubscriptionSequence: number;
  firstLinkCreationSequence: number;
  captureReadyDeadlineSequence: number;
  barrierReleaseSequence: number;
  afPacketVersion: "TPACKET_V3";
  fanoutMode: "HASH";
  requestedBufferBytes: number;
  packetStatisticsRequired: true;
  interfaces: ObserverInterface[];
};

type ExpectedCapture = ObserverInterface & { direction: "ingress" | "egress" };

export type AuthorityV3R3ObserverServiceReadiness = {
  serviceReadySequence: number;
  netlinkSubscribedSequence: number;
  firstObservedLinkCreationSequence: number;
  captureReadySequence: number;
  observerPid: number;
  observerStartMonotonicNs: string;
  signerKeyId: string;
  afPacketVersion: "TPACKET_V3";
  fanoutMode: "HASH";
  requestedBufferBytes: number;
  packetStatisticsAvailable: boolean;
  captures: Array<ExpectedCapture & {
    socketId: string;
    fanoutId: number;
    attachSequence: number;
    linkUpSequence: number;
  }>;
  normalizedReadinessSha256: string;
};

function validSequence(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateBindings(service: ObserverService, signer: ObserverSigner): void {
  validateAuthorityV3R3I5Binding(service, "observer-service");
  validateAuthorityV3R3I5Binding(signer, "observer-signer");
  validateAuthorityV3R3I5Independence(service, signer);
}

function validateContract(contract: AuthorityV3R3ObserverServiceContract): void {
  const sequences = [
    contract.serviceReadyDeadlineSequence,
    contract.reservationSequence,
    contract.netlinkSubscriptionSequence,
    contract.firstLinkCreationSequence,
    contract.captureReadyDeadlineSequence,
    contract.barrierReleaseSequence,
  ];
  const interfaceKeys = contract.interfaces.map((iface) =>
    `${iface.namespaceInode}:${iface.ifindex}:${iface.interfaceName}`
  );
  if (
    !contract.prePinnedSignerKeyId ||
    sequences.some((sequence) => !validSequence(sequence)) ||
    contract.serviceReadyDeadlineSequence >= contract.reservationSequence ||
    contract.netlinkSubscriptionSequence >= contract.firstLinkCreationSequence ||
    contract.captureReadyDeadlineSequence >= contract.barrierReleaseSequence ||
    contract.afPacketVersion !== "TPACKET_V3" ||
    contract.fanoutMode !== "HASH" ||
    contract.packetStatisticsRequired !== true ||
    !Number.isSafeInteger(contract.requestedBufferBytes) ||
    contract.requestedBufferBytes <= 0 ||
    contract.interfaces.length === 0 ||
    new Set(interfaceKeys).size !== contract.interfaces.length ||
    contract.interfaces.some((iface) =>
      !Number.isSafeInteger(iface.namespaceInode) || iface.namespaceInode <= 0 ||
      !Number.isSafeInteger(iface.ifindex) || iface.ifindex <= 0 ||
      !Number.isSafeInteger(iface.peerIfindex) || iface.peerIfindex <= 0 ||
      iface.ifindex === iface.peerIfindex ||
      iface.linkType !== "veth" ||
      !/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(iface.interfaceName) ||
      !iface.expectedPurpose
    )
  ) {
    refuseAuthorityV3R3I5("OBSERVER_SERVICE_NOT_READY");
  }
}

function expectedCaptures(contract: AuthorityV3R3ObserverServiceContract): ExpectedCapture[] {
  return contract.interfaces.flatMap((iface) => [
    { ...iface, direction: "ingress" as const },
    { ...iface, direction: "egress" as const },
  ]);
}

export function buildAuthorityV3R3ObserverServicePlan({
  contract,
  subjectBinding,
  serviceBinding,
  signerBinding,
}: {
  contract: AuthorityV3R3ObserverServiceContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  serviceBinding: ObserverService;
  signerBinding: ObserverSigner;
}) {
  validateContract(contract);
  validateBindings(serviceBinding, signerBinding);
  if (signerBinding.keyId !== contract.prePinnedSignerKeyId) {
    refuseAuthorityV3R3I5("OBSERVER_SIGNER_SUBSTITUTED");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_PLANNED" as const,
    componentId: "observer-service" as const,
    producerRole: "observer-service" as const,
    acceptingRole: "observer-signer" as const,
    gateIds: [
      "GATE_V3_R3_OBSERVER_SERVICE_READY",
      "GATE_V3_R3_OBSERVER_CAPTURE_READY",
    ] as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    prePinnedSignerKeyId: contract.prePinnedSignerKeyId,
    packetStatisticsRequired: true as const,
    afPacketVersion: contract.afPacketVersion,
    fanoutMode: contract.fanoutMode,
    requestedBufferBytes: contract.requestedBufferBytes,
    expectedCaptures: expectedCaptures(contract),
  });
}

export function validateAuthorityV3R3ObserverServiceReadiness({
  contract,
  subjectBinding,
  readback,
  serviceBinding,
  signerBinding,
}: {
  contract: AuthorityV3R3ObserverServiceContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  readback: AuthorityV3R3ObserverServiceReadiness;
  serviceBinding: ObserverService;
  signerBinding: ObserverSigner;
}) {
  const plan = buildAuthorityV3R3ObserverServicePlan({
    contract,
    subjectBinding,
    serviceBinding,
    signerBinding,
  });

  if (
    !validSequence(readback.serviceReadySequence) ||
    readback.serviceReadySequence > contract.serviceReadyDeadlineSequence ||
    readback.serviceReadySequence >= contract.reservationSequence ||
    !validSequence(readback.netlinkSubscribedSequence) ||
    readback.netlinkSubscribedSequence > contract.netlinkSubscriptionSequence ||
    readback.netlinkSubscribedSequence >= readback.firstObservedLinkCreationSequence ||
    readback.firstObservedLinkCreationSequence !== contract.firstLinkCreationSequence ||
    !Number.isSafeInteger(readback.observerPid) || readback.observerPid <= 0 ||
    !/^[1-9][0-9]*$/.test(readback.observerStartMonotonicNs) ||
    readback.signerKeyId !== contract.prePinnedSignerKeyId ||
    readback.afPacketVersion !== contract.afPacketVersion ||
    readback.fanoutMode !== contract.fanoutMode ||
    readback.requestedBufferBytes !== contract.requestedBufferBytes
  ) {
    refuseAuthorityV3R3I5("OBSERVER_SERVICE_NOT_READY");
  }

  if (!readback.packetStatisticsAvailable) {
    refuseAuthorityV3R3I5("PACKET_STATISTICS_UNAVAILABLE");
  }

  const observedCaptureDescriptors = readback.captures.map((capture) => ({
    namespaceInode: capture.namespaceInode,
    interfaceName: capture.interfaceName,
    ifindex: capture.ifindex,
    peerIfindex: capture.peerIfindex,
    linkType: capture.linkType,
    expectedPurpose: capture.expectedPurpose,
    direction: capture.direction,
  }));
  const captureKeys = readback.captures.map((capture) =>
    `${capture.namespaceInode}:${capture.ifindex}:${capture.direction}:${capture.socketId}`
  );
  if (
    JSON.stringify(observedCaptureDescriptors) !== JSON.stringify(plan.expectedCaptures) ||
    new Set(captureKeys).size !== readback.captures.length ||
    !validSequence(readback.captureReadySequence) ||
    readback.captureReadySequence > contract.captureReadyDeadlineSequence ||
    readback.captureReadySequence >= contract.barrierReleaseSequence ||
    readback.captures.some((capture) =>
      !capture.socketId ||
      !Number.isSafeInteger(capture.fanoutId) || capture.fanoutId <= 0 ||
      !validSequence(capture.attachSequence) ||
      !validSequence(capture.linkUpSequence) ||
      capture.attachSequence > readback.captureReadySequence ||
      capture.attachSequence >= capture.linkUpSequence
    )
  ) {
    refuseAuthorityV3R3I5("OBSERVER_CAPTURE_SET_INCOMPLETE");
  }

  if (!/^[0-9a-f]{64}$/.test(readback.normalizedReadinessSha256)) {
    refuseAuthorityV3R3I5("OBSERVER_SERVICE_NOT_READY");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_READY" as const,
    componentId: "observer-service" as const,
    producerRole: "observer-service" as const,
    acceptingRole: "observer-signer" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    gates: [
      "GATE_V3_R3_OBSERVER_SERVICE_READY",
      "GATE_V3_R3_OBSERVER_CAPTURE_READY",
    ] as const,
    gateIds: [
      "GATE_V3_R3_OBSERVER_SERVICE_READY",
      "GATE_V3_R3_OBSERVER_CAPTURE_READY",
    ] as const,
    normalizedReadinessSha256: authorityV3R3I5Sha256(readback),
  });
}
