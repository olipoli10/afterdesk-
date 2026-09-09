import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowedKeys = new Set("schemaVersion caseId synthetic locale timezone now workspaceId user context approval contacts id state recipientIds role financialPermission webhook signatureVerified sources text documentIsUntrusted connectorPermission approvalWorkspace noteIsUntrusted events day title start end durationMinutes label site trade phone groups email attendance active requestedWorkspaceId secretsAvailable minimizeData actorId tasks assigneeId exportPermission attachmentIsUntrusted destination publicDisclosurePermission crossUserReadPermission sourceIsUntrusted visibleTaskCount operationId outcome duplicate postgresState costSettlement retryPolicy maxRetries providerMessageId alreadyRecorded aiNote asOf networkAvailable".split(" "));

// Deliberately bounded synthetic-input policy, not a general-purpose PII classifier.
export function conformsToSyntheticPolicy(input) {
  if (!input || input.schemaVersion !== "1.0" || input.synthetic !== true || !/^syn-[a-z_]+-\d{2}$/u.test(input.caseId) || input.workspaceId !== "synthetic-workspace") return false;
  let passed = true;
  const visit = (value, key = "") => {
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry,key)); return; }
    if (value && typeof value === "object") {
      for (const [name, child] of Object.entries(value)) { if (!allowedKeys.has(name)) passed = false; visit(child,name); }
      return;
    }
    if (key === "phone" && value !== null) passed = false;
    if (typeof value !== "string") return;
    if (["id","actorId","assigneeId","operationId","providerMessageId","recipientIds"].includes(key) && !/^syn-[a-z0-9-]+$/u.test(value)) passed = false;
    if (key === "label" && !value.includes("Simulation")) passed = false;
    if (["workspaceId","requestedWorkspaceId","approvalWorkspace"].includes(key) && !/^synthetic-[a-z-]+$/u.test(value)) passed = false;
    const emails = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu) ?? [];
    if (emails.some((email) => !/^syn-[a-z0-9-]+@example\.invalid$/u.test(email))) passed = false;
    if (key === "email" && !/^syn-[a-z0-9-]+@example\.invalid$/u.test(value)) passed = false;
    if (/https?:\/\//iu.test(value)) passed = false;
    const withoutDates = value.replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))?\b/gu, "DATE");
    if (/(?:\+?\d[\s().-]*){7,}/u.test(withoutDates) || /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/iu.test(withoutDates)) passed = false;
  };
  visit(input);
  return passed;
}

export function runNoPii(args) {
  const [mode, commandId, corpusPath] = args;
  if (args.length !== 3 || mode !== "--revalidation-replay" || !/^[A-Za-z0-9_-]+$/u.test(commandId)) throw new Error("LOCAL_CORPUS_ARGUMENT_INVALID");
  const manifestBytes = readFileSync(corpusPath);
  const corpus = JSON.parse(manifestBytes.toString("utf8"));
  if (corpus.kind !== "CORPUS_MANIFEST" || !Array.isArray(corpus.cases)) throw new Error("LOCAL_CORPUS_MANIFEST_INVALID");
  const evidencePaths = [corpusPath];
  const evidenceSha256 = [hash(manifestBytes)];
  let passed = corpus.cases.length === 96 && new Set(corpus.cases.map((entry) => entry.caseId)).size === 96;
  const counts = new Map();
  for (const entry of corpus.cases) {
    if (!/^specs\/206-gpt6-astra-endvera-reverification\/corpus\/candidate-inputs\/syn-[a-z_]+-\d{2}\.json$/u.test(entry.inputPath)) throw new Error("LOCAL_CORPUS_INPUT_PATH_INVALID");
    const bytes = readFileSync(entry.inputPath);
    const actualHash = hash(bytes);
    evidencePaths.push(entry.inputPath); evidenceSha256.push(actualHash);
    if (actualHash !== entry.inputSha256) passed = false;
    const input = JSON.parse(bytes.toString("utf8"));
    if (input.caseId !== entry.caseId || !conformsToSyntheticPolicy(input)) passed = false;
    const count = counts.get(entry.family) ?? {DEVELOPMENT:0,HIDDEN:0};
    if (!Object.hasOwn(count,entry.split)) passed = false;
    else count[entry.split]++;
    counts.set(entry.family,count);
  }
  if (counts.size !== 8 || [...counts.values()].some((count) => count.DEVELOPMENT !== 8 || count.HIDDEN !== 4)) passed = false;
  if (new Set(evidencePaths).size !== evidencePaths.length) passed = false;
  return {kind:"INVARIANT_RESULT", invariantId:"SYNTHETIC_CORPUS_NO_PII", method:"AUTOMATED", commandId, deviceEvidencePath:null, deviceEvidenceSha256:null, result:passed ? "PASS" : "FAIL", evidencePaths, evidenceSha256};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = runNoPii(process.argv.slice(2)); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.result === "PASS" ? 0 : 1; }
  catch { process.stderr.write("LOCAL_CORPUS_DEPENDENCY_OR_ARGUMENT_INVALID\n"); process.exitCode = 1; }
}
