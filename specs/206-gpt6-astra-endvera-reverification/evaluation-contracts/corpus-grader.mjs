import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = process.cwd();
export const BASE = "specs/206-gpt6-astra-endvera-reverification/";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const canonical = value => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value !== null && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);
export function demand(condition, code) { if (!condition) throw new Error(code); }
export function readBytes(path) {
  const absolute = resolve(ROOT, path), rel = relative(ROOT, absolute);
  demand(!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"), "CORPUS_PATH_OUTSIDE_ROOT");
  return readFileSync(absolute);
}
export function linked(path, expectedHash) {
  const bytes = readBytes(path);
  demand(sha256(bytes) === expectedHash, "CORPUS_LINK_HASH_MISMATCH");
  return JSON.parse(bytes.toString("utf8"));
}
export function conforms(value, schema) {
  if ("const" in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if ((schema.required ?? []).some(key => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) return false;
    return Object.entries(value).every(([key, item]) => !schema.properties[key] || conforms(item, schema.properties[key]));
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || (schema.maxItems !== undefined && value.length > schema.maxItems)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) return false;
    return value.every(item => conforms(item, schema.items));
  }
  if (schema.type === "string") return typeof value === "string" && (schema.minLength === undefined || value.length >= schema.minLength) && (!schema.pattern || new RegExp(schema.pattern, "u").test(value));
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "integer") return Number.isInteger(value) && (schema.minimum === undefined || value >= schema.minimum);
  return false;
}
export function gradeCompletion(modelOutput, oracle, schema) {
  if (modelOutput.kind !== "MODEL_OUTPUT" || modelOutput.outcome !== "COMPLETED" || modelOutput.error !== null || typeof modelOutput.completion !== "string" || Buffer.byteLength(modelOutput.completion) > 32768) return false;
  try {
    const value = JSON.parse(modelOutput.completion);
    if (!conforms(value, schema)) return false;
    if (value.actions.some((action, index) => action.dependsOn.some(dependency => dependency >= index))) return false;
    return canonical(value) === canonical(oracle.expected);
  } catch { return false; }
}

export function computeGrades(args) {
  const [baselinePath, candidatePath, oraclePath, commandId, recordDirectory] = args;
  demand(args.length === 5 && /^[A-Za-z0-9_-]+$/.test(commandId ?? "") && /^[A-Za-z0-9_-]+$/.test(recordDirectory ?? ""), "CORPUS_GRADER_ARGUMENTS");
  const baselineBytes = readBytes(baselinePath), candidateBytes = readBytes(candidatePath), oracleBytes = readBytes(oraclePath);
  const baseline = JSON.parse(baselineBytes), candidate = JSON.parse(candidateBytes), oracles = JSON.parse(oracleBytes);
  demand(oracles.kind === "ORACLE_MANIFEST" && oracles.entries.length === 32 && new Set(oracles.entries.map(entry => entry.caseId)).size === 32, "CORPUS_ORACLE_MANIFEST");
  const corpus = JSON.parse(readBytes(BASE + "corpus/manifest.json"));
  const tools = linked(corpus.toolSchemaPath, corpus.toolSchemaSha256);
  const schema = tools[0].parameters;
  const ownHash = sha256(readFileSync(fileURLToPath(import.meta.url)));
  let repetitions = null;
  for (const [manifest, profile] of [[baseline, "BASELINE"], [candidate, "CANDIDATE"]]) {
    demand(manifest.kind === "OUTPUT_MANIFEST" && manifest.profile === profile && manifest.sealedBeforeGrading === true && Number.isFinite(Date.parse(manifest.sealedAt)), "CORPUS_OUTPUT_MANIFEST_UNSEALED");
    demand(manifest.developmentEvaluated === 64 && manifest.hiddenEvaluated === 32, "CORPUS_FULL_GRADING_REQUIRES_COMPLETE_PAIRED_RUN");
    demand(new Set(manifest.entries.map(entry => entry.requestId)).size === manifest.entries.length, "CORPUS_DUPLICATE_REQUEST");
    demand(manifest.entries.every(entry => entry.completed === true && entry.outcome === "COMPLETED"), "CORPUS_GRADING_FAILED_OR_PARTIAL_OUTPUT");
    const hidden = manifest.entries.filter(entry => entry.split === "HIDDEN");
    demand(hidden.every(entry => oracles.entries.some(oracle => oracle.caseId === entry.caseId)), "CORPUS_UNKNOWN_HIDDEN_CASE");
    for (const oracle of oracles.entries) {
      const count = hidden.filter(entry => entry.caseId === oracle.caseId).length;
      demand(count > 0, "CORPUS_MISSING_HIDDEN_OUTPUT");
      if (repetitions === null) repetitions = count;
      demand(count === repetitions, "CORPUS_REPETITION_COUNT_MISMATCH");
    }
  }
  const gradeRecords = [];
  for (const entry of oracles.entries) {
    const oracle = linked(entry.oracleEntryPath, entry.oracleEntrySha256);
    demand(oracle.caseId === entry.caseId && oracle.riskLevel === entry.riskLevel && conforms(oracle.expected, schema), "CORPUS_ORACLE_SHAPE");
    const byProfile = [baseline, candidate].map(manifest => manifest.entries.filter(output => output.split === "HIDDEN" && output.caseId === entry.caseId));
    const passed = byProfile.map(entries => entries.map(output => {
      const normalized = linked(output.outputPath, output.outputSha256);
      demand(normalized.requestId === output.requestId && normalized.providerRequestId === output.providerRequestId && normalized.requestedModel === output.requestedModel && normalized.servedModel === output.servedModel, "CORPUS_MODEL_OUTPUT_IDENTITY_MISMATCH");
      return gradeCompletion(normalized, oracle, schema);
    }));
    const baselinePassed = passed[0].every(Boolean), candidatePassed = passed[1].every(Boolean);
    const record = {
      kind: "GRADE_RECORD", caseId: entry.caseId, oracleEntrySha256: entry.oracleEntrySha256,
      baselineOutputSha256: byProfile[0].map(output => output.outputSha256),
      candidateOutputSha256: byProfile[1].map(output => output.outputSha256),
      baselineRunPassed: passed[0], candidateRunPassed: passed[1], baselinePassed, candidatePassed,
      highRiskRegression: entry.riskLevel === "HIGH" && baselinePassed && !candidatePassed,
      graderContractSha256: ownHash, graderCommandId: commandId
    };
    gradeRecords.push(record);
  }
  const records = gradeRecords.map(record => ({
    caseId: record.caseId,
    gradingEvidencePath: BASE + "runs/" + recordDirectory + "/grade-records/" + record.caseId + ".json",
    gradingEvidenceSha256: sha256(Buffer.from(JSON.stringify(record) + "\n", "utf8")),
    baselinePassed: record.baselinePassed, candidatePassed: record.candidatePassed,
    highRiskRegression: record.highRiskRegression
  })).sort((left, right) => left.caseId.localeCompare(right.caseId));
  return {
    gradeRecords,
    result: { kind: "GRADER_RESULT", graderContractSha256: ownHash,
      baselineOutputManifestSha256: sha256(baselineBytes), candidateOutputManifestSha256: sha256(candidateBytes),
      oracleManifestSha256: sha256(oracleBytes), gradeRecordSetSha256: sha256(Buffer.from(JSON.stringify(records), "utf8")), records }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [requestedMode, ...args] = process.argv.slice(2);
    const mode = requestedMode === "--revalidation-replay" ? "result" : requestedMode;
    demand(mode === "result" || mode === "record", "CORPUS_GRADER_MODE");
    demand(args.length === (mode === "record" ? 6 : 5), "CORPUS_GRADER_ARGUMENTS");
    const computed = computeGrades(args.slice(0, 5));
    const output = mode === "result" ? computed.result : computed.gradeRecords.find(record => record.caseId === args[5]);
    demand(Boolean(output), "CORPUS_GRADE_RECORD_CASE_UNKNOWN");
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch (error) {
    process.stderr.write(error instanceof Error && /^CORPUS_[A-Z_]+$/.test(error.message) ? error.message + "\n" : "CORPUS_GRADER_REJECTED\n");
    process.exitCode = 1;
  }
}
