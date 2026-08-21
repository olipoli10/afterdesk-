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

const INVENTORY_KINDS = [
  "windowsFilters",
  "windowsRoutes",
  "windowsDns",
  "wslNamespaces",
  "nftObjects",
  "links",
  "addresses",
  "routes",
  "processes",
  "cgroups",
  "mounts",
  "files",
  "runtimeObjects",
  "observerHandles",
  "signerHandles",
  "tempRoots",
] as const;

type InventoryKind = (typeof INVENTORY_KINDS)[number];
type CleanupInventory = Record<InventoryKind, string[]>;
type CleanupVerifier = AuthorityV3R3I5Binding<"external-cleanup-verifier">;
type EvidenceResolver = AuthorityV3R3I5Binding<"evidence-resolver">;

export type AuthorityV3R3ExternalCleanupContract = {
  expectedVerifierIdentityId: string;
  expectedBeforeInventorySha256: string;
};

type CreatedObject = { objectKind: InventoryKind; objectId: string };

export type AuthorityV3R3ExternalCleanupSummary = {
  beforeInventory: CleanupInventory;
  afterInventory: CleanupInventory;
  createdObjects: CreatedObject[];
  deletionAcknowledgments: Array<CreatedObject & {
    volumeOrNamespaceIdentity: string;
    requestSequence: number;
    completionSequence: number;
    apiOrBinarySha256: string;
    returnCode: number;
    stderrClass: "EMPTY" | "NONEMPTY";
    absentAfter: boolean;
    independentReadbackSha256: string;
  }>;
  claimedResidualCount: number;
  claimedExactEquivalence: boolean;
  claimedPassAbsent: boolean;
  normalizedCleanupSummarySha256: string;
};

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function normalizedInventory(inventory: CleanupInventory): CleanupInventory {
  return Object.fromEntries(INVENTORY_KINDS.map((kind) => [
    kind,
    [...inventory[kind]].sort((left, right) => left.localeCompare(right)),
  ])) as CleanupInventory;
}

function inventoryKindMatches(
  before: CleanupInventory,
  after: CleanupInventory,
  kind: InventoryKind
): boolean {
  return JSON.stringify([...before[kind]].sort()) === JSON.stringify([...after[kind]].sort());
}

function validateInventoryShape(inventory: CleanupInventory): void {
  if (
    Object.keys(inventory).sort().join("|") !== [...INVENTORY_KINDS].sort().join("|") ||
    INVENTORY_KINDS.some((kind) =>
      !Array.isArray(inventory[kind]) ||
      new Set(inventory[kind]).size !== inventory[kind].length ||
      inventory[kind].some((item) => !/^[A-Za-z0-9._:\\/-]{1,512}$/.test(item))
    )
  ) {
    refuseAuthorityV3R3I5("E_SCHEMA_INVALID");
  }
}

function validateBindings(verifier: CleanupVerifier, resolver: EvidenceResolver): void {
  validateAuthorityV3R3I5Binding(verifier, "external-cleanup-verifier");
  validateAuthorityV3R3I5Binding(resolver, "evidence-resolver");
  validateAuthorityV3R3I5Independence(verifier, resolver);
}

function validateDeletionAcknowledgments(summary: AuthorityV3R3ExternalCleanupSummary): void {
  const createdKeys = summary.createdObjects.map(({ objectKind, objectId }) => `${objectKind}:${objectId}`);
  const acknowledgmentKeys = summary.deletionAcknowledgments.map(
    ({ objectKind, objectId }) => `${objectKind}:${objectId}`
  );
  if (
    new Set(createdKeys).size !== createdKeys.length ||
    new Set(acknowledgmentKeys).size !== acknowledgmentKeys.length ||
    JSON.stringify([...createdKeys].sort()) !== JSON.stringify([...acknowledgmentKeys].sort()) ||
    summary.deletionAcknowledgments.some((acknowledgment) =>
      !acknowledgment.volumeOrNamespaceIdentity ||
      !Number.isSafeInteger(acknowledgment.requestSequence) ||
      !Number.isSafeInteger(acknowledgment.completionSequence) ||
      acknowledgment.completionSequence <= acknowledgment.requestSequence ||
      !isSha256(acknowledgment.apiOrBinarySha256) ||
      acknowledgment.returnCode !== 0 ||
      acknowledgment.stderrClass !== "EMPTY" ||
      !acknowledgment.absentAfter ||
      !isSha256(acknowledgment.independentReadbackSha256) ||
      summary.afterInventory[acknowledgment.objectKind].includes(acknowledgment.objectId)
    )
  ) {
    refuseAuthorityV3R3I5("PRIVILEGED_DELETE_NOT_ACKNOWLEDGED");
  }
}

export function validateAuthorityV3R3ExternalCleanupSource({
  contract,
  subjectBinding,
  summary,
  verifierBinding,
  acceptingBinding,
}: {
  contract: AuthorityV3R3ExternalCleanupContract;
  subjectBinding: AuthorityV3R3I5SubjectBinding;
  summary: AuthorityV3R3ExternalCleanupSummary;
  verifierBinding: CleanupVerifier;
  acceptingBinding: EvidenceResolver;
}) {
  validateBindings(verifierBinding, acceptingBinding);
  if (verifierBinding.identityId !== contract.expectedVerifierIdentityId) {
    refuseAuthorityV3R3I5("CLEANUP_VERIFIER_IDENTITY_INVALID");
  }
  if (!isSha256(contract.expectedBeforeInventorySha256)) {
    refuseAuthorityV3R3I5("E_SCHEMA_INVALID");
  }
  validateInventoryShape(summary.beforeInventory);
  validateInventoryShape(summary.afterInventory);
  if (authorityV3R3I5Sha256(summary.beforeInventory) !== contract.expectedBeforeInventorySha256) {
    refuseAuthorityV3R3I5("POST_CLEANUP_DRIFT");
  }

  const windowsKinds: InventoryKind[] = ["windowsFilters", "windowsRoutes", "windowsDns"];
  if (windowsKinds.some((kind) => !inventoryKindMatches(summary.beforeInventory, summary.afterInventory, kind))) {
    refuseAuthorityV3R3I5("WINDOWS_NETWORK_POSTCLEANUP_DRIFT");
  }
  if (
    !inventoryKindMatches(summary.beforeInventory, summary.afterInventory, "processes") ||
    !inventoryKindMatches(summary.beforeInventory, summary.afterInventory, "cgroups")
  ) {
    refuseAuthorityV3R3I5("PROCESS_CGROUP_LEAK");
  }
  if (!inventoryKindMatches(summary.beforeInventory, summary.afterInventory, "tempRoots")) {
    refuseAuthorityV3R3I5("TEMP_ROOT_OR_FAKE_SECRET_LEAK");
  }

  const recomputedExactEquivalence = INVENTORY_KINDS.every((kind) =>
    inventoryKindMatches(summary.beforeInventory, summary.afterInventory, kind)
  );
  const recomputedResidualCount = INVENTORY_KINDS.reduce((count, kind) => {
    const before = new Set(summary.beforeInventory[kind]);
    const after = new Set(summary.afterInventory[kind]);
    return count +
      [...before].filter((item) => !after.has(item)).length +
      [...after].filter((item) => !before.has(item)).length;
  }, 0);
  if (
    !recomputedExactEquivalence ||
    recomputedResidualCount !== 0 ||
    !summary.claimedExactEquivalence ||
    summary.claimedResidualCount !== 0
  ) {
    refuseAuthorityV3R3I5("CLEANUP_EQUIVALENCE_FALSE");
  }
  if (!summary.claimedPassAbsent) {
    refuseAuthorityV3R3I5("PASS_PREREQUISITE_ORDER_INVALID");
  }
  validateDeletionAcknowledgments(summary);
  if (!isSha256(summary.normalizedCleanupSummarySha256)) {
    refuseAuthorityV3R3I5("E_SCHEMA_INVALID");
  }

  return deepFreezeAuthorityV3R3I5({
    ...AUTHORITY_V3_R3_I5_SOURCE_CEILING,
    status: "AUTHORITY_V3_R3_I5_CLEANUP_SOURCE_VERIFIED" as const,
    componentId: "cleanup-verifier" as const,
    gateId: "GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED" as const,
    gateIds: ["GATE_V3_R3_EXTERNAL_CLEANUP_VERIFIED"] as const,
    producerRole: "external-cleanup-verifier" as const,
    acceptingRole: "evidence-resolver" as const,
    subjectBindingSha256: authorityV3R3I5SubjectBindingSha256(subjectBinding),
    recomputedResidualCount,
    recomputedExactEquivalence,
    beforeInventorySha256: authorityV3R3I5Sha256(normalizedInventory(summary.beforeInventory)),
    afterInventorySha256: authorityV3R3I5Sha256(normalizedInventory(summary.afterInventory)),
    cleanupEnvelopeSha256: authorityV3R3I5Sha256({ contract, summary }),
  });
}
