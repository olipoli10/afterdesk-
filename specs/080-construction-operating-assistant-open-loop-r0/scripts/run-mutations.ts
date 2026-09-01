import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateOpenLoopProofContract } from "./open-loop-proof-contract";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const mutations: Array<{ id: string; mutate(value: Record<string, unknown>): void }> = [
  { id: "customer-material-becomes-admissible", mutate: (v) => { v.syntheticOnly = false; } },
  { id: "customer-data-enters-proof", mutate: (v) => { v.customerDataCount = 1; } },
  { id: "billing-basis-drifts", mutate: (v) => { v.billingBasis = "CONTRACT"; } },
  { id: "project-identity-drifts", mutate: (v) => { v.projectCode = "OTHER-001"; } },
  { id: "project-association-becomes-optional", mutate: (v) => { v.projectAssociationRequired = false; } },
  { id: "work-description-becomes-optional", mutate: (v) => { v.workDescriptionRequired = false; } },
  { id: "positive-cad-amount-becomes-optional", mutate: (v) => { v.positiveCadAmountRequired = false; } },
  { id: "unknown-amount-becomes-zero", mutate: (v) => { v.unknownAmountPolicy = "COERCE_ZERO"; } },
  { id: "completion-assertion-becomes-optional", mutate: (v) => { v.completionAssertionRequired = false; } },
  { id: "written-approval-becomes-optional", mutate: (v) => { v.writtenApprovalRequired = false; } },
  { id: "supporting-evidence-becomes-optional", mutate: (v) => { v.supportingEvidenceRequired = false; } },
  { id: "model-proposal-verifies-canonical-fact", mutate: (v) => { v.modelMayVerifyCanonicalFact = true; } },
  { id: "contradiction-no-longer-blocks-readiness", mutate: (v) => { v.unresolvedContradictionBlocksReadiness = false; } },
  { id: "contradiction-overwrites-original-claims", mutate: (v) => { v.contradictionClaimsPreserved = false; } },
  { id: "revoked-evidence-remains-ready", mutate: (v) => { v.revokedEvidenceBlocksReadiness = false; } },
  { id: "duplicate-creates-second-canonical-effect", mutate: (v) => { v.duplicateCanonicalEffectCount = 1; } },
  { id: "equivalent-envelopes-create-two-loops", mutate: (v) => { v.equivalentEnvelopeCanonicalLoopCount = 2; } },
  { id: "conflicting-replay-is-accepted", mutate: (v) => { v.conflictingReplayAccepted = true; } },
  { id: "stale-transition-is-accepted", mutate: (v) => { v.staleTransitionAccepted = true; } },
  { id: "concurrency-creates-second-canonical-effect", mutate: (v) => { v.concurrentSecondCanonicalEffectCount = 1; } },
  { id: "canonical-snapshot-hash-is-omitted", mutate: (v) => { v.snapshotHashRecomputable = false; } },
  { id: "restart-projection-drifts", mutate: (v) => { v.restartProjectionIdentical = false; } },
  { id: "atomic-persistence-is-broken", mutate: (v) => { v.atomicInboxLoopSnapshotAudit = false; } },
  { id: "field-worker-sees-financial-data", mutate: (v) => { v.fieldWorkerFinancialFieldCount = 1; } },
  { id: "cross-workspace-access-is-accepted", mutate: (v) => { v.crossWorkspaceAccessAccepted = true; } },
  { id: "prepared-action-becomes-sendable", mutate: (v) => { v.preparedActionDisposition = "SEND"; } },
  { id: "prepared-action-authorizes-transport", mutate: (v) => { v.preparedActionTransportAuthorized = true; } },
  { id: "prepared-action-recipient-is-unbound", mutate: (v) => { v.preparedActionExactRecipient = false; } },
  { id: "prepared-action-channel-is-unbound", mutate: (v) => { v.preparedActionExactChannel = false; } },
  { id: "prepared-action-body-is-unbound", mutate: (v) => { v.preparedActionExactBody = false; } },
  { id: "prepared-action-project-is-unbound", mutate: (v) => { v.preparedActionExactProject = false; } },
  { id: "prepared-action-version-is-unbound", mutate: (v) => { v.preparedActionExactVersion = false; } },
  { id: "prepared-action-hash-is-unbound", mutate: (v) => { v.preparedActionPayloadHashBound = false; } },
  { id: "external-transport-occurs", mutate: (v) => { v.externalTransportCount = 1; } },
  { id: "provider-is-invoked", mutate: (v) => { v.providerInvocationCount = 1; } },
  { id: "package-lock-changes", mutate: (v) => { v.packageLockChanged = true; } },
  { id: "unknown-proof-field-is-accepted", mutate: (v) => { v.unexpected = true; } }
];

async function main() {
  const feature = path.join(process.cwd(), "specs/080-construction-operating-assistant-open-loop-r0");
  const fixturePath = path.join(feature, "fixtures/open-loop-proof-contract.json");
  const resultsPath = path.join(feature, "evidence/mutation-results.json");
  const original = await readFile(fixturePath);
  const pristine = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
  const beforeSha256 = sha256(original);
  const results = [];
  validateOpenLoopProofContract(pristine);
  try {
    for (const mutation of mutations) {
      const candidate = structuredClone(pristine);
      mutation.mutate(candidate);
      const mutated = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      await writeFile(fixturePath, mutated);
      let killedBy = "";
      try {
        validateOpenLoopProofContract(JSON.parse((await readFile(fixturePath)).toString("utf8")));
      } catch (error) {
        killedBy = error instanceof Error ? error.message : String(error);
      }
      if (!killedBy.includes(mutation.id)) {
        throw new Error(`MUTATION_NOT_KILLED:${mutation.id}:${killedBy}`);
      }
      await writeFile(fixturePath, original);
      const restored = await readFile(fixturePath);
      const afterSha256 = sha256(restored);
      if (afterSha256 !== beforeSha256) throw new Error(`MUTATION_NOT_RESTORED:${mutation.id}`);
      validateOpenLoopProofContract(JSON.parse(restored.toString("utf8")));
      results.push({
        id: mutation.id,
        status: "KILLED_AND_RESTORED",
        killedBy: mutation.id,
        beforeSha256,
        mutatedSha256: sha256(mutated),
        afterSha256,
        pristineRerun: "PASS"
      });
    }
  } finally {
    await writeFile(fixturePath, original);
  }
  await writeFile(resultsPath, `${JSON.stringify({
    schemaVersion: 1,
    mutationCount: results.length,
    allKilled: true,
    allByteRestored: true,
    externalCallCount: 0,
    beforeSha256,
    afterSha256: sha256(await readFile(fixturePath)),
    results
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`MUTATIONS=${results.length} KILLED=${results.length} RESTORED=${results.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
