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

const BROKER_STATES = [
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

const PENDING_ACCESS = [
  "GENERIC_READ",
  "GENERIC_WRITE",
  "READ_CONTROL",
  "WRITE_DAC",
  "ACCESS_SYSTEM_SECURITY",
] as const;
const PENDING_FLAGS = ["FILE_FLAG_WRITE_THROUGH", "FILE_FLAG_OPEN_REPARSE_POINT"] as const;
const RESOLVER_ACCESS = ["GENERIC_READ", "READ_CONTROL"] as const;
const RESOLVER_SHARE = ["FILE_SHARE_READ"] as const;
const RESOLVER_FLAGS = ["FILE_FLAG_OPEN_REPARSE_POINT"] as const;

type EvidenceBroker = AuthorityV3R3I5Binding<"evidence-broker">;
type EvidenceResolver = AuthorityV3R3I5Binding<"evidence-resolver">;

export type AuthorityV3R3EvidenceBrokerContract = {
  ntfsVolumeGuid: string;
  rootDirectoryFileId: string;
  normalizedRootPath: string;
  brokerServiceSid: string;
  resolverSid: string;
  ownerDescriptorSha256: string;
  protectedDaclSha256: string;
  saclSha256: string;
  requiredPrivileges: string[];
};

type IdentitySnapshot = {
  volumeGuid: string;
  volumeSerial: string;
  fileId: string;
  normalizedPath: string;
  linkCount: number;
  reparseTag: string | null;
  streams: string[];
  ownerDescriptorSha256: string;
  protectedDaclSha256: string;
  saclSha256: string;
};

type HandleContract = {
  desiredAccess: string[];
  shareMode: string[];
  createDisposition: "CREATE_NEW" | "OPEN_EXISTING";
  flags: string[];
  inheritable: boolean;
};

export type AuthorityV3R3EvidenceBrokerTrace = {
  submissionId: string;
  objectId: string;
  rootHandle: { volumeGuid: string; fileId: string; normalizedPath: string };
  enabledPrivileges: string[];
  declaredByteLength: number;
  declaredSha256: string;
  stateTransitions: string[];
  pendingHandle: HandleContract;
  beforeWriteIdentity: IdentitySnapshot;
  sameHandleReadbackIdentity: IdentitySnapshot;
  finalHandleReadbackIdentity: IdentitySnapshot;
  sameHandleReadbackSha256: string;
  sameHandleReadbackByteLength: number;
  finalNameWasAbsent: boolean;
  moveFlags: string[];
  replaceExisting: boolean;
  indexPreparedRecordSha256: string;
  indexPreparedFlushed: boolean;
  indexCommittedRecordSha256: string;
  indexCommittedFlushed: boolean;
  resolverHandle: HandleContract;
  normalizedTransactionSha256: string;
};

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function exactArray(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedNtfsPath(value: string): string {
  return value.replaceAll("/", "\\").toLocaleLowerCase("en-US");
}

function validateBindings(broker: EvidenceBroker, resolver: EvidenceResolver): void {
  validateAuthorityV3R3I5Binding(broker, "evidence-broker");
  validateAuthorityV3R3I5Binding(resolver, "evidence-resolver");
  validateAuthorityV3R3I5Independence(broker, resolver);
}

function validateContract(
  contract: AuthorityV3R3EvidenceBrokerContract,
  broker: EvidenceBroker,
  resolver: EvidenceResolver
): void {
  if (
    !/^\\\\\?\\Volume\{[0-9a-f-]{36}\}\\$/i.test(contract.ntfsVolumeGuid) ||
    !/^[0-9a-f]{32}$/i.test(contract.rootDirectoryFileId) ||
    !normalizedNtfsPath(contract.normalizedRootPath).startsWith(normalizedNtfsPath(contract.ntfsVolumeGuid)) ||
    !contract.normalizedRootPath.endsWith("\\") ||
    contract.brokerServiceSid !== broker.operatingSystemIdentity ||
    contract.resolverSid !== resolver.operatingSystemIdentity ||
    !isSha256(contract.ownerDescriptorSha256) ||
    !isSha256(contract.protectedDaclSha256) ||
    !isSha256(contract.saclSha256) ||
    contract.requiredPrivileges.length === 0 ||
    new Set(contract.requiredPrivileges).size !== contract.requiredPrivileges.length
  ) {
    refuseAuthorityV3R3I5("E_SCHEMA_INVALID");
  }
}

function validateIdentitySnapshot(
  snapshot: IdentitySnapshot,
  contract: AuthorityV3R3EvidenceBrokerContract
): void {
  if (
    snapshot.volumeGuid !== contract.ntfsVolumeGuid ||
    !/^[0-9a-f]{16}$/i.test(snapshot.volumeSerial) ||
    !/^[0-9a-f]{32}$/i.test(snapshot.fileId) ||
    !normalizedNtfsPath(snapshot.normalizedPath).startsWith(normalizedNtfsPath(contract.normalizedRootPath)) ||
    snapshot.linkCount !== 1 ||
    snapshot.reparseTag !== null ||
    !exactArray(snapshot.streams, ["::$DATA"]) ||
    snapshot.ownerDescriptorSha256 !== contract.ownerDescriptorSha256 ||
    snapshot.protectedDaclSha256 !== contract.protectedDaclSha256 ||
    snapshot.saclSha256 !== contract.saclSha256
  ) {
    refuseAuthorityV3R3I5("EVIDENCE_FILE_ID_OR_BYTES_MISMATCH");
  }
}

export function validateAuthorityV3R3EvidenceBrokerTransactionSource({
  contract,
  subjectBinding,
  trace,
  brokerBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3EvidenceBrokerContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  trace: AuthorityV3R3EvidenceBrokerTrace;
  brokerBinding: EvidenceBroker;
  acceptingBinding: EvidenceResolver;
}) {
  validateBindings(brokerBinding, acceptingBinding);
  validateContract(contract, brokerBinding, acceptingBinding);

  if (
    trace.rootHandle.volumeGuid !== contract.ntfsVolumeGuid ||
    trace.rootHandle.fileId !== contract.rootDirectoryFileId ||
    normalizedNtfsPath(trace.rootHandle.normalizedPath) !== normalizedNtfsPath(contract.normalizedRootPath) ||
    !exactArray(trace.enabledPrivileges, contract.requiredPrivileges)
  ) {
    refuseAuthorityV3R3I5("EVIDENCE_FILE_ID_OR_BYTES_MISMATCH");
  }

  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(trace.submissionId) ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(trace.objectId) ||
    !Number.isSafeInteger(trace.declaredByteLength) || trace.declaredByteLength < 0 ||
    !isSha256(trace.declaredSha256) ||
    !exactArray(trace.stateTransitions, BROKER_STATES) ||
    !exactArray(trace.pendingHandle.desiredAccess, PENDING_ACCESS) ||
    trace.pendingHandle.shareMode.length !== 0 ||
    trace.pendingHandle.createDisposition !== "CREATE_NEW" ||
    !exactArray(trace.pendingHandle.flags, PENDING_FLAGS) ||
    trace.pendingHandle.inheritable ||
    !trace.indexPreparedFlushed ||
    !trace.indexCommittedFlushed ||
    !isSha256(trace.indexPreparedRecordSha256) ||
    !isSha256(trace.indexCommittedRecordSha256) ||
    !isSha256(trace.normalizedTransactionSha256)
  ) {
    refuseAuthorityV3R3I5("E_EVIDENCE_STORE_DURABILITY");
  }

  validateIdentitySnapshot(trace.beforeWriteIdentity, contract);
  validateIdentitySnapshot(trace.sameHandleReadbackIdentity, contract);
  validateIdentitySnapshot(trace.finalHandleReadbackIdentity, contract);
  const identities = [
    trace.beforeWriteIdentity,
    trace.sameHandleReadbackIdentity,
    trace.finalHandleReadbackIdentity,
  ];
  if (
    new Set(identities.map((snapshot) => snapshot.fileId)).size !== 1 ||
    new Set(identities.map((snapshot) => snapshot.volumeSerial)).size !== 1 ||
    trace.sameHandleReadbackSha256 !== trace.declaredSha256 ||
    trace.sameHandleReadbackByteLength !== trace.declaredByteLength
  ) {
    refuseAuthorityV3R3I5("EVIDENCE_FILE_ID_OR_BYTES_MISMATCH");
  }

  if (
    !trace.finalNameWasAbsent ||
    trace.replaceExisting ||
    !exactArray(trace.moveFlags, ["MOVEFILE_WRITE_THROUGH"])
  ) {
    refuseAuthorityV3R3I5("E_EVIDENCE_STORE_DURABILITY");
  }

  if (
    !exactArray(trace.resolverHandle.desiredAccess, RESOLVER_ACCESS) ||
    !exactArray(trace.resolverHandle.shareMode, RESOLVER_SHARE) ||
    trace.resolverHandle.createDisposition !== "OPEN_EXISTING" ||
    !exactArray(trace.resolverHandle.flags, RESOLVER_FLAGS) ||
    trace.resolverHandle.inheritable
  ) {
    refuseAuthorityV3R3I5("E_GATE_VERDICT_INCONSISTENT");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_EVIDENCE_BROKER_SOURCE_VALID" as const,
    componentId: "evidence-broker" as const,
    gateId: "GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED" as const,
    gateIds: ["GATE_V3_R3_EVIDENCE_SEALED_AND_RESOLVED"] as const,
    producerRole: "evidence-broker" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    receiptSignedStateValidated: true as const,
    signingPerformed: false as const,
    objectId: trace.objectId,
    finalFileId: trace.finalHandleReadbackIdentity.fileId,
    transactionEnvelopeSha256: authorityV3R3I5Sha256({ contract, trace }),
  });
}
