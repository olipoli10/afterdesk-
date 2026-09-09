import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "endvera-phase-check-"));
const entrypoint = resolve(import.meta.dirname, "..", "evaluation-contracts", "phase-check.mjs");

try {
  const command = "node --test frozen-root-suite.test.mjs";
  const stdoutPath = resolve(fixtureRoot, "observed.stdout");
  const stderrPath = resolve(fixtureRoot, "observed.stderr");
  const observationPath = resolve(fixtureRoot, "observation.json");
  const contractPath = resolve(fixtureRoot, "contracts.json");
  writeFileSync(stdoutPath, "tests 2431\nfail 0\n", "utf8");
  writeFileSync(stderrPath, "", "utf8");
  writeFileSync(contractPath, JSON.stringify({
    schemaVersion: "1.0",
    kind: "PHASE_CHECK_CONTRACTS",
    checks: [{
      phase: "G1",
      checkId: "ROOT_TESTS",
      observedClassification: "DETERMINISTIC_TEST",
      commandSha256: sha256(Buffer.from(command, "utf8")),
      successExitCode: 0,
      stdoutAll: ["tests 2431", "fail 0"],
      stderrNone: ["fatal"],
      allowNotApplicable: false,
      notApplicableStdoutAll: [],
      notApplicableReason: null,
    }],
  }), "utf8");
  const observation = {
    kind: "PHASE_CHECK_OBSERVATION",
    campaignId: "12345678-1234-4123-8123-123456789abc",
    phase: "G1",
    checkId: "ROOT_TESTS",
    observedCommandId: "G1-ROOT-TESTS",
    observedHead: "1111111111111111111111111111111111111111",
    observedTree: "2222222222222222222222222222222222222222",
    classification: "DETERMINISTIC_TEST",
    command,
    expectedExitCode: 0,
    exitCode: 0,
    stdoutPath,
    stdoutSha256: sha256(readFileSync(stdoutPath)),
    stderrPath,
    stderrSha256: sha256(readFileSync(stderrPath)),
  };
  writeFileSync(observationPath, JSON.stringify(observation), "utf8");

  const pass = spawnSync(process.execPath, [entrypoint, "--revalidation-replay", contractPath, observationPath], { encoding: "utf8" });
  if (pass.status !== 0 || JSON.parse(pass.stdout).result !== "PASS") throw new Error("PHASE_CHECK_DERIVATION_TEST_FAILED");

  writeFileSync(stdoutPath, "tests 2431\nfail 1\n", "utf8");
  observation.stdoutSha256 = sha256(readFileSync(stdoutPath));
  writeFileSync(observationPath, JSON.stringify(observation), "utf8");
  const honestFailure = spawnSync(process.execPath, [entrypoint, "--revalidation-replay", contractPath, observationPath], { encoding: "utf8" });
  if (honestFailure.status !== 0 || JSON.parse(honestFailure.stdout).result !== "FAIL") {
    throw new Error("PHASE_CHECK_HONEST_FAILURE_REJECTED");
  }

  observation.command = "node -e console.log('tests 2431 fail 0')";
  writeFileSync(observationPath, JSON.stringify(observation), "utf8");
  const forged = spawnSync(process.execPath, [entrypoint, "--revalidation-replay", contractPath, observationPath], { encoding: "utf8" });
  if (forged.status === 0 || !forged.stderr.includes("PHASE_CHECK_COMMAND_NOT_FROZEN")) {
    throw new Error("PHASE_CHECK_FORGED_COMMAND_ACCEPTED");
  }

  process.stdout.write("PHASE_CHECK_CONTRACT_TEST_PASS\n");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
