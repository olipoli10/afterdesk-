import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [mode, contractPath, observationPath] = process.argv.slice(2);
if (mode !== "--revalidation-replay") throw new Error("PHASE_CHECK_REPLAY_MODE_REQUIRED");
if (!contractPath || !observationPath) throw new Error("PHASE_CHECK_DEPENDENCY_MISSING");

const parseJson = (path, code) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(code);
  }
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const matchesAll = (text, patterns) => patterns.every((pattern) => new RegExp(pattern, "u").test(text));
const matchesNone = (text, patterns) => patterns.every((pattern) => !new RegExp(pattern, "u").test(text));

const contracts = parseJson(contractPath, "PHASE_CHECK_CONTRACT_INVALID");
const observation = parseJson(observationPath, "PHASE_CHECK_OBSERVATION_INVALID");
if (contracts.kind !== "PHASE_CHECK_CONTRACTS" || contracts.schemaVersion !== "1.0" || !Array.isArray(contracts.checks)) {
  throw new Error("PHASE_CHECK_CONTRACT_INVALID");
}
if (observation.kind !== "PHASE_CHECK_OBSERVATION" || !["G1", "G7"].includes(observation.phase)) {
  throw new Error("PHASE_CHECK_OBSERVATION_INVALID");
}

const contract = contracts.checks.find((entry) => entry.phase === observation.phase && entry.checkId === observation.checkId);
if (!contract) throw new Error("PHASE_CHECK_CONTRACT_NOT_FOUND");
if (contract.observedClassification !== observation.classification) throw new Error("PHASE_CHECK_CLASSIFICATION_MISMATCH");
if (sha256(Buffer.from(observation.command, "utf8")) !== contract.commandSha256.toLowerCase()) {
  throw new Error("PHASE_CHECK_COMMAND_NOT_FROZEN");
}

const stdout = readFileSync(observation.stdoutPath);
const stderr = readFileSync(observation.stderrPath);
if (sha256(stdout) !== observation.stdoutSha256.toLowerCase()) throw new Error("PHASE_CHECK_STDOUT_HASH_MISMATCH");
if (sha256(stderr) !== observation.stderrSha256.toLowerCase()) throw new Error("PHASE_CHECK_STDERR_HASH_MISMATCH");

const stdoutText = stdout.toString("utf8");
const stderrText = stderr.toString("utf8");
const commandSucceeded = observation.exitCode === contract.successExitCode && observation.expectedExitCode === contract.successExitCode;
const normalPass = commandSucceeded && matchesAll(stdoutText, contract.stdoutAll) && matchesNone(stderrText, contract.stderrNone);
const notApplicable = contract.allowNotApplicable === true && commandSucceeded &&
  matchesAll(stdoutText, contract.notApplicableStdoutAll) && matchesNone(stderrText, contract.stderrNone);

if (notApplicable && contract.notApplicableReason === null) throw new Error("PHASE_CHECK_NOT_APPLICABLE_REASON_MISSING");
if (!notApplicable && contract.notApplicableReason !== null && contract.allowNotApplicable !== true) {
  throw new Error("PHASE_CHECK_NOT_APPLICABLE_CONTRACT_INVALID");
}

process.stdout.write(`${JSON.stringify({
  kind: "PHASE_CHECK_RESULT",
  phase: observation.phase,
  checkId: observation.checkId,
  observedCommandId: observation.observedCommandId,
  contractPath,
  contractSha256: sha256(readFileSync(contractPath)),
  observationPath,
  observationSha256: sha256(readFileSync(observationPath)),
  result: notApplicable ? "NOT_APPLICABLE" : normalPass ? "PASS" : "FAIL",
  reason: notApplicable ? contract.notApplicableReason : null,
})}\n`);
