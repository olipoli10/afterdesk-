import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "../src/lib/db";
import {
  R37_AUTHORITY,
  R37_EXCHANGE_EVIDENCE,
  R37_MODELS,
  assertExchangeCeiling,
} from "../src/lib/construction-operating-assistant-r37/contracts";
import {
  dispatchOpenRouterRequest,
  hasLocalOpenRouterCredential,
} from "../src/lib/construction-operating-assistant-r37/transport";
import { runR37OpenRouterCampaign } from "../src/server/construction-operating-assistant-r37/campaign";
import { initializeConstructionWorkspace } from "../src/server/construction-assistant-v1/workspace";

const RELEASE = "R37-CORRECTED-OPENROUTER-RETEST" as const;
const ORIGINAL_REPORT_SHA256 = "bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3";
const featureRoot = resolve(process.cwd(), "specs/194-corrected-openrouter-retest");
const evidenceRoot = resolve(featureRoot, "evidence");
const scratchRoot = resolve(process.cwd(), ".scratch/r37-corrected-openrouter-retest");
const observedReportPath = resolve(evidenceRoot, "observed-provider-report.json");
const campaignLockPath = resolve(evidenceRoot, "campaign-lock.json");
const originalReportPath = resolve(
  process.cwd(),
  "specs/192-openrouter-provider-sandbox/evidence/observed-provider-report.json",
);

function json(value: unknown) {
  return `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function assertOriginalReportImmutable() {
  if (await sha256(originalReportPath) !== ORIGINAL_REPORT_SHA256) {
    throw new Error("R37_ORIGINAL_REPORT_HASH_DRIFT");
  }
}

async function writeAtomicNew(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await access(path).then(
    () => { throw new Error("R37_CORRECTED_REPORT_ALREADY_EXISTS"); },
    () => undefined,
  );
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, json(value), { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

async function preflight() {
  const credentialPresent = hasLocalOpenRouterCredential();
  let exchangeCadMicros = "";
  let exchangeValid = false;
  try {
    exchangeCadMicros = assertExchangeCeiling(new Date()).toString();
    exchangeValid = true;
  } catch {
    exchangeValid = false;
  }
  const originalReportSha256 = await sha256(originalReportPath);
  const originalReportImmutable = originalReportSha256 === ORIGINAL_REPORT_SHA256;
  const reportAlreadyExists = await access(observedReportPath).then(() => true, () => false);
  const campaignAlreadyClaimed = await access(campaignLockPath).then(() => true, () => false);
  const ready = credentialPresent && exchangeValid && originalReportImmutable && !reportAlreadyExists && !campaignAlreadyClaimed;
  return {
    schemaVersion: 1,
    release: RELEASE,
    provider: "OPENROUTER",
    requestVersion: "R37BB_CORRECTED",
    syntheticOnly: true,
    credentialPresent,
    credentialValueInspected: false,
    modelIds: R37_MODELS,
    expectedCallCount: 6,
    maxRetryCount: 0,
    founderCeilingCadMicros: R37_AUTHORITY.founderCeilingCadMicros.toString(),
    applicationCeilingUsdMicros: R37_AUTHORITY.applicationCeilingUsdMicros.toString(),
    exchangeEvidenceObservedAt: R37_EXCHANGE_EVIDENCE.observedAt,
    exchangeCadMicros,
    exchangeValid,
    originalReportSha256,
    originalReportImmutable,
    reportAlreadyExists,
    campaignAlreadyClaimed,
    providerLaneEnabled: false,
    externalCommunicationAuthorized: false,
    externalToolWriteAuthorized: false,
    deploymentAuthorized: false,
    state: ready
      ? "READY_FOR_ONE_CORRECTED_OPENROUTER_RETEST"
      : reportAlreadyExists || campaignAlreadyClaimed
        ? "CORRECTED_RETEST_ALREADY_CONSUMED"
        : !credentialPresent
          ? "CREDENTIAL_REQUIRED"
          : !exchangeValid
            ? "EXCHANGE_EVIDENCE_REQUIRED"
            : "ORIGINAL_REPORT_INTEGRITY_REQUIRED",
  };
}

async function main() {
  const allowed = new Set(["--preflight"]);
  if (process.argv.slice(2).some((argument) => !allowed.has(argument))) {
    throw new Error("R37_CORRECTED_CLI_ARGUMENT_REFUSED");
  }
  const gate = await preflight();
  if (process.argv.includes("--preflight")) {
    process.stdout.write(json(gate));
    return;
  }
  if (gate.state !== "READY_FOR_ONE_CORRECTED_OPENROUTER_RETEST") {
    process.stdout.write(json(gate));
    process.exitCode = 2;
    return;
  }

  await assertOriginalReportImmutable();
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(scratchRoot, { recursive: true });
  const runId = crypto.randomUUID();
  await writeFile(campaignLockPath, json({
    schemaVersion: 1,
    release: RELEASE,
    campaignId: `r37-corrected-openrouter-${runId}`,
    claimedAtUtc: new Date().toISOString(),
    maxRetryCount: 0,
    credentialValueInspected: false,
  }), { encoding: "utf8", flag: "wx" });

  const owner = await prisma.user.create({
    data: { name: "R37 Corrected Synthetic Owner", email: `r37-corrected-owner-${runId}@example.invalid`, role: "CLIENT", emailVerified: true },
  });
  const admin = await prisma.user.create({
    data: { name: "R37 Corrected Synthetic Admin", email: `r37-corrected-admin-${runId}@example.invalid`, role: "ADMIN", emailVerified: true },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: "ENDVERA R37 Corrected Synthetic OpenRouter Retest",
  });
  const report = await runR37OpenRouterCampaign({
    campaignId: `r37-corrected-openrouter-${runId}`,
    ownerId: owner.id,
    adminId: admin.id,
    workspaceId: workspace.workspaceId,
    now: () => new Date(),
    transport: ({ modelId, observedCase }) => dispatchOpenRouterRequest({
      modelId,
      observedCase,
      requestVersion: "R37BB_CORRECTED",
    }),
    writeAttemptEvidence: async (evidence) => {
      const model = String(evidence.modelId).replaceAll(/[^a-zA-Z0-9.-]/gu, "_");
      const caseId = String(evidence.caseId).replaceAll(/[^a-zA-Z0-9.-]/gu, "_");
      await writeAtomicNew(resolve(scratchRoot, `${model}-${caseId}.json`), evidence);
    },
  });
  await assertOriginalReportImmutable();
  await writeAtomicNew(observedReportPath, report);
  process.stdout.write(json({
    release: RELEASE,
    verdict: report.verdict,
    dispatchedCallCount: report.dispatchedCallCount,
    canonicalObservationCount: report.canonicalObservationCount,
    settledSpendMicros: report.settledSpendMicros,
    grantsRevoked: report.grantsRevoked,
    providerLaneDisabled: report.providerLaneDisabled,
    originalReportImmutable: true,
  }));
  if (report.verdict !== "OPENROUTER_SANDBOX_OBSERVED_PASS") process.exitCode = 3;
}

void main()
  .catch((cause: unknown) => {
    const code = cause instanceof Error && /^R37[A-Z0-9_:-]+$/u.test(cause.message)
      ? cause.message
      : "R37_CORRECTED_RUNNER_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
