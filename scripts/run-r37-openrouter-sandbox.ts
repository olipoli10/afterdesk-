import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "../src/lib/db";
import {
  R37_AUTHORITY,
  R37_EXCHANGE_EVIDENCE,
  R37_MODELS,
  assertExchangeCeiling,
} from "../src/lib/construction-operating-assistant-r37/contracts";
import { hasLocalOpenRouterCredential } from "../src/lib/construction-operating-assistant-r37/transport";
import { runR37OpenRouterCampaign } from "../src/server/construction-operating-assistant-r37/campaign";
import { initializeConstructionWorkspace } from "../src/server/construction-assistant-v1/workspace";

const featureRoot = resolve(process.cwd(), "specs/192-openrouter-provider-sandbox");
const evidenceRoot = resolve(featureRoot, "evidence");
const scratchRoot = resolve(process.cwd(), ".scratch/r37-openrouter-provider-sandbox");
const observedReportPath = resolve(evidenceRoot, "observed-provider-report.json");

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2) + "\n";
}

async function writeAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, json(value), { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function preflight() {
  const credentialPresent = hasLocalOpenRouterCredential();
  let exchangeCadMicros = "";
  let exchangeValid = false;
  try {
    exchangeCadMicros = assertExchangeCeiling(new Date()).toString();
    exchangeValid = true;
  } catch {
    exchangeValid = false;
  }
  return {
    schemaVersion: 1,
    release: "R37-PROVIDER-SANDBOX",
    provider: "OPENROUTER",
    syntheticOnly: true,
    credentialPresent,
    credentialValueInspected: false,
    modelIds: R37_MODELS,
    expectedCallCount: 6,
    founderCeilingCadMicros: R37_AUTHORITY.founderCeilingCadMicros.toString(),
    applicationCeilingUsdMicros: R37_AUTHORITY.applicationCeilingUsdMicros.toString(),
    exchangeEvidenceObservedAt: R37_EXCHANGE_EVIDENCE.observedAt,
    exchangeCadMicros,
    exchangeValid,
    providerLaneEnabled: false,
    externalCommunicationAuthorized: false,
    deploymentAuthorized: false,
    state: credentialPresent && exchangeValid ? "READY_FOR_OBSERVED_OPENROUTER_RUN" : credentialPresent ? "EXCHANGE_EVIDENCE_REQUIRED" : "CREDENTIAL_REQUIRED",
  };
}

async function main() {
  const allowed = new Set(["--preflight"]);
  const unknown = process.argv.slice(2).filter((argument) => !allowed.has(argument));
  if (unknown.length > 0) throw new Error("R37_CLI_ARGUMENT_REFUSED");
  if (process.argv.includes("--preflight")) {
    process.stdout.write(json(preflight()));
    return;
  }
  const gate = preflight();
  if (gate.state !== "READY_FOR_OBSERVED_OPENROUTER_RUN") {
    process.stdout.write(json(gate));
    process.exitCode = 2;
    return;
  }

  await mkdir(scratchRoot, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  const runId = crypto.randomUUID();
  const owner = await prisma.user.create({
    data: { name: "R37 Synthetic Owner", email: `r37-owner-${runId}@example.invalid`, role: "CLIENT", emailVerified: true },
  });
  const admin = await prisma.user.create({
    data: { name: "R37 Synthetic Admin", email: `r37-admin-${runId}@example.invalid`, role: "ADMIN", emailVerified: true },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: "ENDVERA R37 Synthetic OpenRouter Sandbox",
  });
  const report = await runR37OpenRouterCampaign({
    campaignId: `r37-openrouter-${runId}`,
    ownerId: owner.id,
    adminId: admin.id,
    workspaceId: workspace.workspaceId,
    now: () => new Date(),
    writeAttemptEvidence: async (evidence) => {
      const model = String(evidence.modelId).replaceAll(/[^a-zA-Z0-9.-]/gu, "_");
      const caseId = String(evidence.caseId).replaceAll(/[^a-zA-Z0-9.-]/gu, "_");
      await writeAtomic(resolve(scratchRoot, `${model}-${caseId}.json`), evidence);
    },
  });
  await writeAtomic(observedReportPath, report);
  process.stdout.write(json({
    release: "R37-PROVIDER-SANDBOX",
    verdict: report.verdict,
    dispatchedCallCount: report.dispatchedCallCount,
    settledSpendMicros: report.settledSpendMicros,
    grantsRevoked: report.grantsRevoked,
    providerLaneDisabled: report.providerLaneDisabled,
  }));
  if (report.verdict !== "OPENROUTER_SANDBOX_OBSERVED_PASS") process.exitCode = 3;
}

void main()
  .catch(() => {
    process.stderr.write("R37_RUNNER_FAILED\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
