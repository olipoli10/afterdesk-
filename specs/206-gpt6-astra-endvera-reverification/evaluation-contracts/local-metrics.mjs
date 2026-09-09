import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const baselinePath = "specs/206-gpt6-astra-endvera-reverification/evaluation-contracts/local-roadmap-baseline.md";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const section = (text, heading) => {
  const marker = `## ${heading}\n`;
  const start = text.indexOf(marker);
  requireCondition(start >= 0 && text.indexOf(marker, start + 1) === -1, "LOCAL_METRIC_SECTION_MISSING_OR_DUPLICATE");
  const tail = text.slice(start + marker.length);
  const end = tail.indexOf("\n## ");
  return end < 0 ? tail : tail.slice(0, end);
};
const rows = (text) => text.split("\n").filter((line) => /^\| (?:0A|\d)/u.test(line)).map((line) => line.split("|").slice(1,-1).map((cell) => cell.trim()));
const number = (text) => {
  requireCondition(/^\d+(?:\.\d+)?$/u.test(text), "LOCAL_METRIC_NON_NUMERIC_CELL");
  return Number(text);
};
const total = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;

// Recalculates the accepted canonical ledger, not product-test completion.
// A prose headline is never the arithmetic authority for roadmap/build.
export function calculateCanonicalMetrics(rawText) {
  const text = rawText.replaceAll("\r\n", "\n");
  const strict = rows(section(text, "Strict canonical phase-exit score"));
  const expectedPhases = ["0A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  requireCondition(JSON.stringify(strict.map((row) => row[0].split(" ")[0])) === JSON.stringify(expectedPhases), "LOCAL_METRIC_STRICT_PHASE_SET_CHANGED");
  requireCondition(total(strict.map((row) => number(row[1]))) === 100, "LOCAL_METRIC_STRICT_DENOMINATOR_INVALID");
  for (const row of strict) requireCondition(number(row[2]) <= number(row[1]), "LOCAL_METRIC_STRICT_CREDIT_EXCEEDS_WEIGHT");
  const build = rows(section(text, "Local AI engine build readiness"));
  requireCondition(JSON.stringify(build.map((row) => row[0].split(" ")[0])) === JSON.stringify(["0A", "1", "2", "3", "4", "5", "6", "7", "8-12"]), "LOCAL_METRIC_BUILD_PHASE_SET_CHANGED");
  requireCondition(total(build.map((row) => number(row[1]))) === 100, "LOCAL_METRIC_BUILD_DENOMINATOR_INVALID");
  for (const [index, row] of build.entries()) {
    const credit = number(row[3]);
    if (index < 4) requireCondition(credit === number(strict[index][2]), "LOCAL_METRIC_BUILD_STRICT_CREDIT_MISMATCH");
    else {
      const maturity = number(row[2]);
      requireCondition([0, 0.25, 0.5, 0.75, 1].includes(maturity), "LOCAL_METRIC_MATURITY_NOT_FROZEN");
      requireCondition(credit === number(row[1]) * maturity, "LOCAL_METRIC_BUILD_CREDIT_NOT_DERIVED");
    }
  }
  const c2 = section(text, "Controlled public READ / C2 activation preparation");
  const gates = [...c2.matchAll(/^(\d+)\. .+$/gmu)].map((match) => Number(match[1]));
  requireCondition(JSON.stringify(gates) === JSON.stringify(Array.from({length:18}, (_,i) => i+1)), "LOCAL_METRIC_C2_GATE_SET_CHANGED");
  requireCondition(c2.includes("All eighteen immutable C2 preparation gates are complete:"), "LOCAL_METRIC_C2_REOPENED_REQUIRES_CANONICAL_REVIEW");
  const e2e = [...text.matchAll(/^\| Verified-E2E observed coverage \| \*\*(\d+(?:\.\d+)?)%\*\* \|/gmu)];
  requireCondition(e2e.length === 1, "LOCAL_METRIC_E2E_CANONICAL_VALUE_MISSING_OR_DUPLICATE");
  requireCondition(Number(e2e[0][1]) === 0 && text.includes("no current-HEAD real quote-to-delivery corpus run"), "LOCAL_METRIC_E2E_NEW_OBSERVATION_REQUIRES_DENOMINATOR_REVIEW");
  requireCondition(/real provider\/customer readiness label\s+remains NO-GO\./u.test(text), "LOCAL_METRIC_PROVIDER_AUTHORITY_CHANGED_REQUIRES_REVIEW");
  return {roadmap:total(strict.map((row) => number(row[2]))), localBuildReadiness:total(build.map((row) => number(row[3]))), c2:`${gates.length}/18`, realProviderCustomerReadiness:"NO-GO", verifiedE2E:Number(e2e[0][1])};
}

export function runMetric(args) {
  const [mode, metric, commandId, finalSnapshotPath] = args;
  requireCondition(args.length === 4 && mode === "--revalidation-replay", "LOCAL_METRIC_REPLAY_ARGUMENTS_INVALID");
  requireCondition(typeof commandId === "string" && /^[A-Za-z0-9_-]+$/u.test(commandId), "LOCAL_METRIC_COMMAND_ID_INVALID");
  requireCondition(finalSnapshotPath !== baselinePath, "LOCAL_METRIC_FRESH_FINAL_BRAIN_SNAPSHOT_REQUIRED");
  const evidencePaths = [baselinePath, finalSnapshotPath];
  const evidenceBytes = evidencePaths.map((path) => readFileSync(path));
  const start = calculateCanonicalMetrics(evidenceBytes[0].toString("utf8"));
  const final = calculateCanonicalMetrics(evidenceBytes[1].toString("utf8"));
  requireCondition(Object.hasOwn(start, metric), "LOCAL_METRIC_NAME_INVALID");
  // This local no-provider campaign has no accepted transition package.
  // Do not award promotion from a changed narrative or test count alone.
  requireCondition(JSON.stringify(start) === JSON.stringify(final), "LOCAL_METRIC_CANONICAL_CHANGE_REQUIRES_ACCEPTED_TRANSITION_REVIEW");
  return {kind:"METRIC_CALCULATION", metric, startValue:start[metric], finalValue:final[metric], rubricCrossed:start[metric] !== final[metric], rubricContractSha256:hash(readFileSync(fileURLToPath(import.meta.url))), calculationCommandId:commandId, evidencePaths, evidenceSha256:evidenceBytes.map(hash)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runMetric(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error.message.startsWith("LOCAL_METRIC_") ? error.message : "LOCAL_METRIC_DEPENDENCY_UNAVAILABLE"}\n`); process.exitCode = 1; }
}
