import { describe, expect, it } from "vitest";

import {
  validateAuthorityV3R3EvidenceBrokerTransactionSource,
} from "@/lib/engineering-factory/authority-v3-r3-i5-evidence-broker-source";

const hash = (digit: string) => digit.repeat(64);

const subjectBinding = {
  runId: "run-r3-i5-source",
  authorityGeneration: 5,
  nonceSha256: hash("e"),
  machineIdSha256: hash("f"),
  windowsBootId: "windows-boot-i5",
  wslBootId: "wsl-boot-i5",
};

const broker = {
  role: "evidence-broker" as const,
  identityId: "evidence-broker-source",
  operatingSystemIdentity: "S-1-5-80-1601",
  binarySha256: hash("1"),
  configurationSha256: hash("2"),
  keyId: "evidence-broker-key",
  publicKeySpkiSha256: hash("3"),
};

const resolver = {
  role: "evidence-resolver" as const,
  identityId: "evidence-resolver-source",
  operatingSystemIdentity: "S-1-5-80-1602",
  binarySha256: hash("4"),
  configurationSha256: hash("5"),
  keyId: "evidence-resolver-key",
  publicKeySpkiSha256: hash("6"),
};

const contract = {
  ntfsVolumeGuid: "\\\\?\\Volume{11111111-1111-4111-8111-111111111111}\\",
  rootDirectoryFileId: "00112233445566778899aabbccddeeff",
  normalizedRootPath: "\\\\?\\Volume{11111111-1111-4111-8111-111111111111}\\ef-evidence\\",
  brokerServiceSid: broker.operatingSystemIdentity,
  resolverSid: resolver.operatingSystemIdentity,
  ownerDescriptorSha256: hash("7"),
  protectedDaclSha256: hash("8"),
  saclSha256: hash("9"),
  requiredPrivileges: ["SeSecurityPrivilege", "SeRestorePrivilege"],
};

const states = [
  "REQUEST_ACCEPTED",
  "PENDING_CREATED",
  "BYTES_WRITTEN",
  "FILE_FLUSHED",
  "SAME_HANDLE_READBACK",
  "ACL_SEALED",
  "FINAL_NAME_COMMITTED",
  "INDEX_PREPARED",
  "INDEX_FLUSHED",
  "FINAL_HANDLE_READBACK",
  "RECEIPT_SIGNED",
] as const;

function identitySnapshot() {
  return {
    volumeGuid: contract.ntfsVolumeGuid,
    volumeSerial: "aabbccddeeff0011",
    fileId: "ffeeddccbbaa99887766554433221100",
    normalizedPath: `${contract.normalizedRootPath}artifact-001.json`,
    linkCount: 1,
    reparseTag: null as string | null,
    streams: ["::$DATA"],
    ownerDescriptorSha256: contract.ownerDescriptorSha256,
    protectedDaclSha256: contract.protectedDaclSha256,
    saclSha256: contract.saclSha256,
  };
}

function exactTrace() {
  return {
    submissionId: "submission-001",
    objectId: "artifact-001",
    rootHandle: {
      volumeGuid: contract.ntfsVolumeGuid,
      fileId: contract.rootDirectoryFileId,
      normalizedPath: contract.normalizedRootPath,
    },
    enabledPrivileges: [...contract.requiredPrivileges],
    declaredByteLength: 128,
    declaredSha256: hash("a"),
    stateTransitions: [...states],
    pendingHandle: {
      desiredAccess: [
        "GENERIC_READ",
        "GENERIC_WRITE",
        "READ_CONTROL",
        "WRITE_DAC",
        "ACCESS_SYSTEM_SECURITY",
      ],
      shareMode: [] as string[],
      createDisposition: "CREATE_NEW" as const,
      flags: ["FILE_FLAG_WRITE_THROUGH", "FILE_FLAG_OPEN_REPARSE_POINT"],
      inheritable: false,
    },
    beforeWriteIdentity: identitySnapshot(),
    sameHandleReadbackIdentity: identitySnapshot(),
    finalHandleReadbackIdentity: identitySnapshot(),
    sameHandleReadbackSha256: hash("a"),
    sameHandleReadbackByteLength: 128,
    finalNameWasAbsent: true,
    moveFlags: ["MOVEFILE_WRITE_THROUGH"],
    replaceExisting: false,
    indexPreparedRecordSha256: hash("b"),
    indexPreparedFlushed: true,
    indexCommittedRecordSha256: hash("c"),
    indexCommittedFlushed: true,
    resolverHandle: {
      desiredAccess: ["GENERIC_READ", "READ_CONTROL"],
      shareMode: ["FILE_SHARE_READ"],
      createDisposition: "OPEN_EXISTING" as const,
      flags: ["FILE_FLAG_OPEN_REPARSE_POINT"],
      inheritable: false,
    },
    normalizedTransactionSha256: hash("d"),
  };
}

describe("Authority V3 R3 I5 evidence broker source", () => {
  it("accepts only a handle-bound create-only transaction through RECEIPT_SIGNED", () => {
    const result = validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace: exactTrace(),
      brokerBinding: broker,
      acceptingBinding: resolver,
    });

    expect(result).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_EVIDENCE_BROKER_SOURCE_VALID",
      gateId: "GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED",
      producerRole: "evidence-broker",
      acceptingRole: "evidence-resolver",
      sourceOnly: true,
      executionAuthorized: false,
      receiptSignedStateValidated: true,
      signingPerformed: false,
      providerCalls: 0,
      realCandidateInvocations: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["a file ID replacement", (value: ReturnType<typeof exactTrace>) => {
      value.finalHandleReadbackIdentity.fileId = "00000000000000000000000000000000";
    }],
    ["a normalized path escape", (value: ReturnType<typeof exactTrace>) => {
      value.finalHandleReadbackIdentity.normalizedPath = `${contract.ntfsVolumeGuid}outside\\artifact-001.json`;
    }],
    ["a hard link", (value: ReturnType<typeof exactTrace>) => {
      value.sameHandleReadbackIdentity.linkCount = 2;
    }],
    ["an alternate data stream", (value: ReturnType<typeof exactTrace>) => {
      value.sameHandleReadbackIdentity.streams.push(":hidden:$DATA");
    }],
    ["a reparse point", (value: ReturnType<typeof exactTrace>) => {
      value.beforeWriteIdentity.reparseTag = "IO_REPARSE_TAG_SYMLINK";
    }],
  ] as const)("refuses %s", (_label, mutate) => {
    const trace = exactTrace();
    mutate(trace);
    expect(() => validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace,
      brokerBinding: broker,
      acceptingBinding: resolver,
    })).toThrow("EVIDENCE_FILE_ID_OR_BYTES_MISMATCH");
  });

  it("refuses state skipping and any replacement of an existing final name", () => {
    const skipped = exactTrace();
    skipped.stateTransitions.splice(3, 1);
    expect(() => validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace: skipped,
      brokerBinding: broker,
      acceptingBinding: resolver,
    })).toThrow("E_EVIDENCE_STORE_DURABILITY");

    const replaced = exactTrace();
    replaced.finalNameWasAbsent = false;
    replaced.replaceExisting = true;
    expect(() => validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace: replaced,
      brokerBinding: broker,
      acceptingBinding: resolver,
    })).toThrow("E_EVIDENCE_STORE_DURABILITY");
  });

  it("refuses resolver write or delete sharing", () => {
    const trace = exactTrace();
    trace.resolverHandle.shareMode.push("FILE_SHARE_WRITE");
    expect(() => validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace,
      brokerBinding: broker,
      acceptingBinding: resolver,
    })).toThrow("E_GATE_VERDICT_INCONSISTENT");
  });

  it("rejects broker and resolver identity collapse", () => {
    expect(() => validateAuthorityV3R3EvidenceBrokerTransactionSource({
      contract,
      subjectBinding,
      trace: exactTrace(),
      brokerBinding: broker,
      acceptingBinding: {
        ...resolver,
        keyId: broker.keyId,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
