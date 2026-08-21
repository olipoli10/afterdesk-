import { describe, expect, it } from "vitest";

import {
  validateAuthorityV3R3ObserverCompletenessForSigning,
} from "@/lib/engineering-factory/authority-v3-r3-i5-signer-source";

const hash = (digit: string) => digit.repeat(64);

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

const resolver = {
  role: "evidence-resolver" as const,
  identityId: "evidence-resolver-source",
  operatingSystemIdentity: "S-1-5-80-1503",
  binarySha256: hash("7"),
  configurationSha256: hash("8"),
  keyId: "evidence-resolver-key",
  publicKeySpkiSha256: hash("9"),
};

const contract = {
  prePinnedServiceIdentityId: service.identityId,
  prePinnedSignerKeyId: signer.keyId,
  eventChainProfile: "sha256-length-framed-v1" as const,
  packetStatisticsRequired: true as const,
  expectedCaptureIds: ["capture-1", "capture-2", "capture-3", "capture-4"],
};

function exactObservation() {
  return {
    runId: "run-r3-i5-source",
    readinessReceiptSha256: hash("a"),
    firstEventSequence: 1,
    lastEventSequence: 40,
    eventCount: 40,
    eventChainRootSha256: hash("b"),
    gapCount: 0,
    unclassifiedPacketCount: 0,
    packetStatisticsAvailable: true,
    packetStatistics: contract.expectedCaptureIds.map((captureId) => ({
      captureId,
      packets: 10,
      kernelDrops: 0,
      freezeCount: 0,
    })),
    shutdownCompleted: true,
    normalizedObservationSha256: hash("c"),
  };
}

describe("Authority V3 R3 I5 observer signer source", () => {
  it("prepares a source-only completeness envelope without performing a signature", () => {
    const result = validateAuthorityV3R3ObserverCompletenessForSigning({
      contract,
      observation: exactObservation(),
      serviceBinding: service,
      signerBinding: signer,
      acceptingBinding: resolver,
    });

    expect(result).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_SIGNER_SOURCE_VALIDATED",
      gateId: "GATE_V3_R3_OBSERVER_COMPLETE",
      producerRole: "observer-signer",
      acceptingRole: "evidence-resolver",
      sourceOnly: true,
      executionAuthorized: false,
      signingPerformed: false,
      signatureRequiredAtRuntime: true,
      providerCalls: 0,
      realCandidateInvocations: 0,
    });
    expect(result).not.toHaveProperty("signature");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["one kernel drop", (value: ReturnType<typeof exactObservation>) => {
      value.packetStatistics[0]!.kernelDrops = 1;
    }, "OBSERVER_KERNEL_DROPS_NONZERO"],
    ["one unclassified packet", (value: ReturnType<typeof exactObservation>) => {
      value.unclassifiedPacketCount = 1;
    }, "UNCLASSIFIED_PACKET_EXACTLY_ONE"],
    ["missing packet statistics", (value: ReturnType<typeof exactObservation>) => {
      value.packetStatisticsAvailable = false;
    }, "PACKET_STATISTICS_UNAVAILABLE"],
    ["a missing capture statistic", (value: ReturnType<typeof exactObservation>) => {
      value.packetStatistics.pop();
    }, "PACKET_STATISTICS_UNAVAILABLE"],
    ["an event chain gap", (value: ReturnType<typeof exactObservation>) => {
      value.gapCount = 1;
    }, "E_GATE_VERDICT_INCONSISTENT"],
    ["an inconsistent event count", (value: ReturnType<typeof exactObservation>) => {
      value.eventCount = 39;
    }, "E_GATE_VERDICT_INCONSISTENT"],
  ] as const)("refuses %s", (_label, mutate, errorId) => {
    const observation = exactObservation();
    mutate(observation);
    expect(() => validateAuthorityV3R3ObserverCompletenessForSigning({
      contract,
      observation,
      serviceBinding: service,
      signerBinding: signer,
      acceptingBinding: resolver,
    })).toThrow(errorId);
  });

  it("rejects service or signer substitution", () => {
    expect(() => validateAuthorityV3R3ObserverCompletenessForSigning({
      contract,
      observation: exactObservation(),
      serviceBinding: { ...service, identityId: "substituted-observer" },
      signerBinding: signer,
      acceptingBinding: resolver,
    })).toThrow("OBSERVER_SERVICE_NOT_READY");

    expect(() => validateAuthorityV3R3ObserverCompletenessForSigning({
      contract,
      observation: exactObservation(),
      serviceBinding: service,
      signerBinding: { ...signer, keyId: "substituted-key" },
      acceptingBinding: resolver,
    })).toThrow("OBSERVER_SIGNER_SUBSTITUTED");
  });

  it("rejects a signer that shares an authority identity with the resolver", () => {
    expect(() => validateAuthorityV3R3ObserverCompletenessForSigning({
      contract,
      observation: exactObservation(),
      serviceBinding: service,
      signerBinding: signer,
      acceptingBinding: {
        ...resolver,
        publicKeySpkiSha256: signer.publicKeySpkiSha256,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
