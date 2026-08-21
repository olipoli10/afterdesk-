import { describe, expect, it } from "vitest";

import { authorityV3R3I5Sha256 } from "@/lib/engineering-factory/authority-v3-r3-i5-common";
import {
  validateAuthorityV3R3ExternalCleanupSource,
} from "@/lib/engineering-factory/authority-v3-r3-i5-cleanup-verifier-source";

const hash = (digit: string) => digit.repeat(64);

const subjectBinding = {
  runId: "run-r3-i5-source",
  authorityGeneration: 5,
  nonceSha256: hash("e"),
  machineIdSha256: hash("f"),
  windowsBootId: "windows-boot-i5",
  wslBootId: "wsl-boot-i5",
};

const verifier = {
  role: "external-cleanup-verifier" as const,
  identityId: "cleanup-verifier-source",
  operatingSystemIdentity: "S-1-5-80-1701",
  binarySha256: hash("1"),
  configurationSha256: hash("2"),
  keyId: "cleanup-verifier-key",
  publicKeySpkiSha256: hash("3"),
};

const resolver = {
  role: "evidence-resolver" as const,
  identityId: "evidence-resolver-source",
  operatingSystemIdentity: "S-1-5-80-1702",
  binarySha256: hash("4"),
  configurationSha256: hash("5"),
  keyId: "evidence-resolver-key",
  publicKeySpkiSha256: hash("6"),
};

const baseline = {
  windowsFilters: ["baseline-filter"],
  windowsRoutes: ["baseline-route"],
  windowsDns: ["baseline-dns"],
  wslNamespaces: [] as string[],
  nftObjects: [] as string[],
  links: [] as string[],
  addresses: [] as string[],
  routes: [] as string[],
  processes: ["baseline-process"],
  cgroups: ["baseline-cgroup"],
  mounts: [] as string[],
  files: ["baseline-file"],
  runtimeObjects: [] as string[],
  observerHandles: [] as string[],
  signerHandles: [] as string[],
  tempRoots: [] as string[],
};

const contract = {
  expectedVerifierIdentityId: verifier.identityId,
  expectedBeforeInventorySha256: authorityV3R3I5Sha256(baseline),
};

function exactSummary() {
  const createdObjects = [
    { objectKind: "nftObjects" as const, objectId: "run-nft-table" },
    { objectKind: "processes" as const, objectId: "run-process" },
    { objectKind: "tempRoots" as const, objectId: "run-temp-root" },
  ];
  return {
    beforeInventory: structuredClone(baseline),
    afterInventory: structuredClone(baseline),
    createdObjects,
    deletionAcknowledgments: createdObjects.map((created, index) => ({
      ...created,
      volumeOrNamespaceIdentity: `scope-${index + 1}`,
      requestSequence: 100 + index * 2,
      completionSequence: 101 + index * 2,
      apiOrBinarySha256: hash(String(index + 7)),
      returnCode: 0,
      stderrClass: "EMPTY" as const,
      absentAfter: true,
      independentReadbackSha256: hash(String.fromCharCode(97 + index)),
    })),
    claimedResidualCount: 0,
    claimedExactEquivalence: true,
    claimedPassAbsent: true,
    normalizedCleanupSummarySha256: hash("d"),
  };
}

describe("Authority V3 R3 I5 external cleanup verifier source", () => {
  it("recomputes raw before/after equivalence and exact deletion acknowledgments", () => {
    const result = validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: exactSummary(),
      verifierBinding: verifier,
      acceptingBinding: resolver,
    });

    expect(result).toMatchObject({
      status: "AUTHORITY_V3_R3_I5_CLEANUP_SOURCE_VERIFIED",
      gateId: "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED",
      producerRole: "external-cleanup-verifier",
      acceptingRole: "evidence-resolver",
      recomputedResidualCount: 0,
      recomputedExactEquivalence: true,
      sourceOnly: true,
      executionAuthorized: false,
      providerCalls: 0,
      realCandidateInvocations: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("refuses Windows network drift even when the summary claims success", () => {
    const summary = exactSummary();
    summary.afterInventory.windowsRoutes.push("unexpected-route");
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("WINDOWS_NETWORK_POSTCLEANUP_DRIFT");
  });

  it("refuses process/cgroup and temporary-root leaks", () => {
    const processLeak = exactSummary();
    processLeak.afterInventory.processes.push("run-process");
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: processLeak,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("PROCESS_CGROUP_LEAK");

    const tempLeak = exactSummary();
    tempLeak.afterInventory.tempRoots.push("run-temp-root");
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: tempLeak,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("TEMP_ROOT_OR_FAKE_SECRET_LEAK");
  });

  it("refuses false equivalence and a missing deletion acknowledgment", () => {
    const falseEquivalence = exactSummary();
    falseEquivalence.afterInventory.nftObjects.push("run-nft-table");
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: falseEquivalence,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("CLEANUP_EQUIVALENCE_FALSE");

    const missingAcknowledgment = exactSummary();
    missingAcknowledgment.deletionAcknowledgments.pop();
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: missingAcknowledgment,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("PRIVILEGED_DELETE_NOT_ACKNOWLEDGED");
  });

  it("never upgrades a claimed failure into success", () => {
    const summary = exactSummary();
    summary.claimedExactEquivalence = false;
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary,
      verifierBinding: verifier,
      acceptingBinding: resolver,
    })).toThrow("CLEANUP_EQUIVALENCE_FALSE");
  });

  it("rejects verifier substitution and verifier/resolver identity collapse", () => {
    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: exactSummary(),
      verifierBinding: { ...verifier, identityId: "substituted-verifier" },
      acceptingBinding: resolver,
    })).toThrow("CLEANUP_VERIFIER_IDENTITY_INVALID");

    expect(() => validateAuthorityV3R3ExternalCleanupSource({
      contract,
      subjectBinding,
      summary: exactSummary(),
      verifierBinding: verifier,
      acceptingBinding: {
        ...resolver,
        binarySha256: verifier.binarySha256,
      },
    })).toThrow("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  });
});
