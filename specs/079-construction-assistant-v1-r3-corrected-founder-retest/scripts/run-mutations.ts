import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateRetestContract } from "./retest-contract";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const mutations: Array<{ id: string; mutate(value: Record<string, unknown>): void }> = [
  { id: "founder-observation-is-replaced-by-fixture", mutate: (v) => { v.founderObservationSource = "FIXTURE"; } },
  { id: "console-requires-provider-id-copy", mutate: (v) => { v.consoleRequiresProviderIdCopy = true; } },
  { id: "duplicate-uses-a-different-provider-id", mutate: (v) => { v.duplicateReusesSameProviderId = false; } },
  { id: "timer-starts-before-first-founder-action", mutate: (v) => { v.timerStartsAt = "PAGE_LOAD"; } },
  { id: "step-can-be-manually-marked-success", mutate: (v) => { v.manualTechnicalSuccessAllowed = true; } },
  { id: "clear-appointment-creates-zero-or-two-items", mutate: (v) => { v.clearAppointmentExpectedCount = 2; } },
  { id: "ambiguity-creates-consequential-write", mutate: (v) => { v.ambiguityConsequentialWriteCount = 1; } },
  { id: "tomorrow-answer-uses-static-copy", mutate: (v) => { v.tomorrowAnswerSource = "STATIC_COPY"; } },
  { id: "inbound-result-is-not-postgres-backed", mutate: (v) => { v.inboundResultSource = "UI_STATE"; } },
  { id: "duplicate-creates-second-canonical-effect", mutate: (v) => { v.duplicateCanonicalEffectCount = 1; } },
  { id: "approval-hides-recipient-channel-or-body", mutate: (v) => { (v.approvalPreview as Record<string, unknown>).recipientVisible = false; } },
  { id: "first-approval-creates-zero-or-two-local-deliveries", mutate: (v) => { v.firstApprovalSimulatedDeliveryCount = 2; } },
  { id: "second-approval-is-not-attempted", mutate: (v) => { v.secondApprovalAttempted = false; } },
  { id: "second-approval-creates-delivery", mutate: (v) => { v.secondApprovalSimulatedDeliveryCount = 1; } },
  { id: "projects-calendar-inbox-projections-disagree", mutate: (v) => { v.projectsCalendarInboxProjectionsAgree = false; } },
  { id: "unknown-observation-field-is-accepted", mutate: (v) => { v.unknownObservationFieldsAccepted = true; } },
  { id: "external-transport-becomes-possible", mutate: (v) => { v.externalTransportCount = 1; } },
];

async function main() {
  const root = process.cwd();
  const feature = path.join(root, "specs/079-construction-assistant-v1-r3-corrected-founder-retest");
  const fixturePath = path.join(feature, "fixtures/retest-contract.json");
  const resultsPath = path.join(feature, "evidence/mutation-results.json");
  const original = await readFile(fixturePath);
  const pristine = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
  const beforeSha256 = sha256(original);
  const results = [];
  try {
    for (const mutation of mutations) {
      const candidate = structuredClone(pristine);
      mutation.mutate(candidate);
      const mutated = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      await writeFile(fixturePath, mutated);
      let killedBy = "";
      try {
        validateRetestContract(JSON.parse((await readFile(fixturePath)).toString("utf8")));
      } catch (error) {
        killedBy = error instanceof Error ? error.message : String(error);
      }
      if (!killedBy.includes(mutation.id)) throw new Error(`MUTATION_NOT_KILLED:${mutation.id}:${killedBy}`);
      await writeFile(fixturePath, original);
      const restored = await readFile(fixturePath);
      const afterSha256 = sha256(restored);
      if (afterSha256 !== beforeSha256) throw new Error(`MUTATION_NOT_RESTORED:${mutation.id}`);
      validateRetestContract(JSON.parse(restored.toString("utf8")));
      results.push({ id: mutation.id, status: "KILLED_AND_RESTORED", killedBy: mutation.id, beforeSha256, mutatedSha256: sha256(mutated), afterSha256, pristineRerun: "PASS" });
    }
  } finally {
    await writeFile(fixturePath, original);
  }
  await writeFile(resultsPath, `${JSON.stringify({ schemaVersion: 1, mutationCount: results.length, allKilled: true, allByteRestored: true, externalCallCount: 0, results }, null, 2)}\n`, "utf8");
  process.stdout.write(`MUTATIONS=${results.length} KILLED=${results.length} RESTORED=${results.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
