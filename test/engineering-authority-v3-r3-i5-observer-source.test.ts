import { describe, expect, it } from "vitest";

import {
  buildAuthorityV3R3ObserverServicePlan,
  validateAuthorityV3R3ObserverServiceReadiness,
} from "@/lib/engineering-factory/authority-v3-r3-i5-observer-source";

const hash = (digit: string) => digit.repeat(64);

const subjectBinding = {
  runId: "run-r3-i5-source",
  authorityGeneration: 5,
  nonceSha256: hash("e"),
  machineIdSha256: hash("f"),
  windowsBootId: "windows-boot-i5",
  wslBootId: "wsl-boot-i5",
};

const service = {
  role: "observer-service" as const,
  identityId: "observer-service-source",
  operatingSystemIdentity: "uid:1501",
  binarySha256: hash("1"),
  configurationSha256: hash("2"),
  keyId: "observer-service-key",
  publicKeySpkiSha256: hash("3"),
};

const signer = {
  role: "observer-signer" as const,
  identityId: "observer-signer-source",
  operatingSystemIdentity: "uid:1502",
  binarySha256: hash("4"),
  configurationSha256: hash("5"),
  keyId: "observer-signer-key",
  publicKeySpkiSha256: hash("6"),
};

const contract = {
  prePinnedSignerKeyId: signer.keyId,
  serviceReadyDeadlineSequence: 10,
  reservationSequence: 11,
  netlinkSubscriptionSequence: 20,
  firstLinkCreationSequence: 21,
  captureReadyDeadlineSequence: 30,
  barrierReleaseSequence: 31,
  afPacketVersion: "TPACKET_V3" as const,
  fanoutMode: "HASH" as const,
  requestedBufferBytes: 4_194_304,
  packetStatisticsRequired: true as const,
  interfaces: [
    {
      namespaceInode: 41001,
      interfaceName: "veth-enf",
      ifindex: 51,
      peerIfindex: 52,
      linkType: "veth" as const,
      expectedPurpose: "enforcement-workload-boundary",
    },
    {
      namespaceInode: 41002,
      interfaceName: "veth-work",
      ifindex: 52,
      peerIfindex: 51,
      linkType: "veth" as const,
      expectedPurpose: "candidate-boundary",
    },
  ],
};

function exactReadback() {
  const plan = buildAuthorityV3R3ObserverServicePlan({
    contract,
    subjectBinding,
    serviceBinding: service,
    signerBinding: signer,
  });
  return {
    serviceReadySequence: 9,
    netlinkSubscribedSequence: 19,
    firstObservedLinkCreationSequence: 21,
    captureReadySequence: 29,
    observerPid: 9001,
    observerStartMonotonicNs: "5000000000",
    signerKeyId: signer.keyId,
    afPacketVersion: "TPACKET_V3" as const,
    fanoutMode: "HASH" as const,
    requestedBufferBytes: contract.requestedBufferBytes,
    packetStatisticsAvailable: true,
    captures: plan.expectedCaptures.map((capture, index) => ({
      ...capture,
      socketId: `capture-${index + 1}`,
      fanoutId: 701,
      attachSequence: 24 + index,
      linkUpSequence: 40 + index,
    })),
    normalizedReadinessSha256: hash("a"),
  };
}

describe("Authority V3 R3 I5 observer service source", () => {
  it("plans service readiness and every interface-direction capture before link-up", () => {
    const plan = buildAuthorityV3R3ObserverServicePlan({
      contract,
      subjectBinding,
      serviceBinding: service,
      signerBinding: signer,
    });

    expect(plan).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_PLANNED",
      sourceOnly: true,
      executionAuthorized: false,
      producerRole: "observer-service",
      acceptingRole: "observer-signer",
      packetStatisticsRequired: true,
    });
    expect(plan.expectedCaptures).toHaveLength(4);
    expect(plan.expectedCaptures.map((capture) => capture.direction)).toEqual([
      "ingress",
      "egress",
      "ingress",
      "egress",
    ]);
    expect(Object.isFrozen(plan.expectedCaptures)).toBe(true);
  });

  it("accepts only exact independently accepted readiness", () => {
    expect(validateAuthorityV3R3ObserverServiceReadiness({
      contract,
      subjectBinding,
      readback: exactReadback(),
      serviceBinding: service,
      signerBinding: signer,
    })).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_OBSERVER_SOURCE_READY",
      gates: [
        "GATE_V3_R3_OBSERVER_SERVICE_READY",
        "GATE_V3_R3_OBSERVER_CAPTURE_READY",
      ],
      executionAuthorized: false,
    });
  });

  it.each([
    ["late service readiness", (value: ReturnType<typeof exactReadback>) => {
      value.serviceReadySequence = contract.reservationSequence;
    }, "OBSERVER_SERVICE_NOT_READY"],
    ["netlink subscription after first link creation", (value: ReturnType<typeof exactReadback>) => {
      value.netlinkSubscribedSequence = value.firstObservedLinkCreationSequence;
    }, "OBSERVER_SERVICE_NOT_READY"],
    ["one missing direction", (value: ReturnType<typeof exactReadback>) => {
      value.captures.pop();
    }, "OBSERVER_CAPTURE_SET_INCOMPLETE"],
    ["capture attached after link-up", (value: ReturnType<typeof exactReadback>) => {
      value.captures[0] = {
        ...value.captures[0]!,
        attachSequence: value.captures[0]!.linkUpSequence,
      };
    }, "OBSERVER_CAPTURE_SET_INCOMPLETE"],
    ["missing packet statistics", (value: ReturnType<typeof exactReadback>) => {
      value.packetStatisticsAvailable = false;
    }, "PACKET_STATISTICS_UNAVAILABLE"],
  ] as const)("refuses %s", (_label, mutate, errorId) => {
    const readback = exactReadback();
    mutate(readback);
    expect(() => validateAuthorityV3R3ObserverServiceReadiness({
      contract,
      subjectBinding,
      readback,
      serviceBinding: service,
      signerBinding: signer,
    })).toThrow(errorId);
  });

  it("rejects signer substitution and role collapse", () => {
    expect(() => buildAuthorityV3R3ObserverServicePlan({
      contract,
      subjectBinding,
      serviceBinding: service,
      signerBinding: {
        ...signer,
        keyId: "substituted-key",
      },
    })).toThrow("OBSERVER_SIGNER_SUBSTITUTED");

    expect(() => buildAuthorityV3R3ObserverServicePlan({
      contract,
      subjectBinding,
      serviceBinding: service,
      signerBinding: {
        ...signer,
        operatingSystemIdentity: service.operatingSystemIdentity,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
