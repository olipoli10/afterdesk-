import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fail = (code) => {
  throw new Error(code);
};

const assert = (condition, code) => {
  if (!condition) fail(code);
};

const reportArg = process.argv[2];
const brainRootArg = process.argv[3];
assert(Boolean(reportArg), "REVALIDATION_SEAL_PATH_REQUIRED");
assert(Boolean(brainRootArg), "REVALIDATION_BRAIN_ROOT_REQUIRED");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const specDir = resolve(scriptDir, "..");
const repositoryRoot = resolve(specDir, "..", "..");
const brainRoot = resolve(process.cwd(), brainRootArg);
const reportPath = resolve(process.cwd(), reportArg);
const schemaPath = resolve(specDir, "audit-contracts", "revalidation-seal.schema.json");
const findingSchemaPath = resolve(specDir, "audit-contracts", "finding-report.schema.json");
const evidenceSchemaPath = resolve(specDir, "audit-contracts", "evidence-record.schema.json");
const phaseCheckContractsSchemaPath = resolve(specDir, "audit-contracts", "phase-check-contracts.schema.json");
const campaignIdentitySchemaPath = resolve(specDir, "audit-contracts", "campaign-identity.schema.json");
const schemaValidatorPath = resolve(scriptDir, "validate-json-schema.py");

assert(existsSync(reportPath), "REVALIDATION_SEAL_NOT_FOUND");
assert(existsSync(brainRoot) && statSync(brainRoot).isDirectory(), "REVALIDATION_BRAIN_ROOT_NOT_FOUND");
assert(existsSync(schemaPath), "REVALIDATION_SEAL_SCHEMA_NOT_FOUND");
assert(existsSync(findingSchemaPath), "REVALIDATION_FINDING_SCHEMA_NOT_FOUND");
assert(existsSync(evidenceSchemaPath), "REVALIDATION_EVIDENCE_SCHEMA_NOT_FOUND");
assert(existsSync(phaseCheckContractsSchemaPath), "REVALIDATION_PHASE_CHECK_CONTRACTS_SCHEMA_NOT_FOUND");
assert(existsSync(campaignIdentitySchemaPath), "REVALIDATION_CAMPAIGN_IDENTITY_SCHEMA_NOT_FOUND");
assert(existsSync(schemaValidatorPath), "REVALIDATION_SCHEMA_VALIDATOR_NOT_FOUND");

const validateAgainstSchema = (instancePath, contractPath, errorCode) => {
  const candidates = [
    { command: "python", args: [schemaValidatorPath, contractPath, instancePath] },
    { command: "py", args: ["-3", schemaValidatorPath, contractPath, instancePath] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error?.code === "ENOENT") continue;
    assert(!result.error, `REVALIDATION_SCHEMA_VALIDATOR_ERROR:${result.error?.message ?? "UNKNOWN"}`);
    if (result.status !== 0) {
      fail(errorCode);
    }
    return;
  }

  fail("PYTHON_JSONSCHEMA_REQUIRED");
};

const runGit = (cwd, args, { binary = false, allowFailure = false } = {}) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: binary ? null : "utf8",
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (allowFailure) return result;
  assert(!result.error && result.status === 0, `REVALIDATION_GIT_PROOF_FAILED:${args.join(":")}`);
  return binary ? result.stdout : result.stdout.trim();
};

const git = (...args) => runGit(repositoryRoot, args);
const brainGit = (...args) => runGit(brainRoot, args);
const gitBlob = (commit, path) => runGit(repositoryRoot, ["show", `${commit}:${path}`], { binary: true });
const commitContainsPath = (commit, path) => {
  const result = runGit(repositoryRoot, ["cat-file", "-e", `${commit}:${path}`], { allowFailure: true });
  return !result.error && result.status === 0;
};

const resolveArtifactPath = (path) => {
  assert(
    typeof path === "string" && path.length > 0 && !isAbsolute(path) && !path.includes("\\"),
    "REVALIDATION_SEAL_ARTIFACT_PATH_INVALID",
  );
  assert(
    !path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
    "REVALIDATION_SEAL_ARTIFACT_PATH_NOT_NORMALIZED",
  );
  const artifactPath = resolve(repositoryRoot, path);
  const relativePath = relative(repositoryRoot, artifactPath);
  assert(
    relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath),
    "REVALIDATION_SEAL_ARTIFACT_ESCAPE",
  );
  return artifactPath;
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const secretPatterns = [
  /sk-or-v1-[A-Za-z0-9_-]{20,}/gu,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/gu,
  /gh[pousr]_[A-Za-z0-9]{20,}/gu,
  /AKIA[0-9A-Z]{16}/gu,
  /AIza[0-9A-Za-z_-]{20,}/gu,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu,
  /(?:OPENAI_API_KEY|OPENROUTER_API_KEY|TWILIO_AUTH_TOKEN)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>)[^\s"',}]{16,}/giu,
  /(?:api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|password|secret)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>|null\b|false\b)[A-Za-z0-9_./+=:@-]{16,}/giu,
  /Bearer\s+[A-Za-z0-9_./+=-]{20,}/giu,
  /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/giu,
  /AC[0-9a-f]{32}/giu,
  /SK[0-9a-f]{32}/giu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
];
const assertNoSecretMaterial = (bytes, label) => {
  const text = bytes.toString("utf8");
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    assert(!pattern.test(text), `REVALIDATION_SECRET_PATTERN_DETECTED:${label}`);
  }
};
const readJson = (path, code) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${code}:${error instanceof Error ? error.message : "UNKNOWN"}`);
  }
};

const verifyOpenRouterGeneration = async (providerRequestId, call, outputEntry, apiKey) => {
  const url = new URL("https://openrouter.ai/api/v1/generation");
  url.searchParams.set("id", providerRequestId);
  let payload = null;
  let lastStatus = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      lastStatus = response.status;
      if (response.ok) {
        try {
          payload = await response.json();
        } catch {
          fail(`REVALIDATION_OPENROUTER_RECONCILIATION_JSON_INVALID:${call.requestId}`);
        }
        break;
      }
      if (![404, 429, 500, 502, 503, 504, 524, 529].includes(response.status)) break;
    } catch {
      lastStatus = null;
    }
    if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  assert(payload !== null, lastStatus === null
    ? `REVALIDATION_OPENROUTER_RECONCILIATION_TRANSPORT_FAILED:${call.requestId}`
    : `REVALIDATION_OPENROUTER_RECONCILIATION_HTTP_FAILED:${call.requestId}:${lastStatus}`);
  const generation = payload?.data;
  assert(generation?.id === providerRequestId, `REVALIDATION_OPENROUTER_RECONCILIATION_ID_MISMATCH:${call.requestId}`);
  assert(generation.model === outputEntry.servedModel, `REVALIDATION_OPENROUTER_RECONCILIATION_MODEL_MISMATCH:${call.requestId}`);
  const inputTokens = generation.native_tokens_prompt ?? generation.tokens_prompt;
  const outputTokens = generation.native_tokens_completion ?? generation.tokens_completion;
  assert(inputTokens === call.inputTokens, `REVALIDATION_OPENROUTER_RECONCILIATION_INPUT_MISMATCH:${call.requestId}`);
  assert(outputTokens === call.outputTokens, `REVALIDATION_OPENROUTER_RECONCILIATION_OUTPUT_MISMATCH:${call.requestId}`);
  assert(numbersEqual(generation.total_cost, call.settledCostUsd), `REVALIDATION_OPENROUTER_RECONCILIATION_COST_MISMATCH:${call.requestId}`);
  const generationAt = Date.parse(generation.created_at);
  assert(Number.isFinite(generationAt), `REVALIDATION_OPENROUTER_RECONCILIATION_TIME_MISSING:${call.requestId}`);
  assert(
    generationAt >= Date.parse(outputEntry.startedAt) - 120_000 &&
      generationAt <= Date.parse(outputEntry.finishedAt) + 120_000,
    `REVALIDATION_OPENROUTER_RECONCILIATION_TIME_MISMATCH:${call.requestId}`,
  );

  const requestPayload = readJson(resolveArtifactPath(outputEntry.requestPath), `REVALIDATION_RECONCILIATION_REQUEST_INVALID:${call.requestId}`);
  const normalizedOutput = readJson(resolveArtifactPath(outputEntry.outputPath), `REVALIDATION_RECONCILIATION_OUTPUT_INVALID:${call.requestId}`);
  assert(normalizedOutput.outcome === "COMPLETED", `REVALIDATION_OPENROUTER_CONTENT_OUTPUT_NOT_COMPLETED:${call.requestId}`);
  const contentUrl = new URL("https://openrouter.ai/api/v1/generation/content");
  contentUrl.searchParams.set("id", providerRequestId);
  let contentPayload = null;
  let contentStatus = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(contentUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      contentStatus = response.status;
      if (response.ok) {
        try {
          contentPayload = await response.json();
        } catch {
          fail(`REVALIDATION_OPENROUTER_CONTENT_JSON_INVALID:${call.requestId}`);
        }
        break;
      }
      if (![404, 429, 500, 502, 503, 504, 524, 529].includes(response.status)) break;
    } catch {
      contentStatus = null;
    }
    if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  assert(contentPayload !== null, contentStatus === null
    ? `REVALIDATION_OPENROUTER_CONTENT_TRANSPORT_FAILED:${call.requestId}`
    : `REVALIDATION_OPENROUTER_CONTENT_HTTP_FAILED:${call.requestId}:${contentStatus}`);
  const stored = contentPayload?.data;
  assert(JSON.stringify(stored?.input) === JSON.stringify(requestPayload.body.input), `REVALIDATION_OPENROUTER_CONTENT_INPUT_MISMATCH:${call.requestId}`);
  assert(JSON.stringify(stored?.input).includes(requestPayload.requestNonce), `REVALIDATION_OPENROUTER_CONTENT_NONCE_MISMATCH:${call.requestId}`);
  assert(stored?.output?.completion === normalizedOutput.completion, `REVALIDATION_OPENROUTER_CONTENT_COMPLETION_MISMATCH:${call.requestId}`);
};

const rawBytes = readFileSync(reportPath);
assert(!(rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf), "REVALIDATION_SEAL_UTF8_BOM_FORBIDDEN");
assertNoSecretMaterial(rawBytes, "SEAL");
validateAgainstSchema(reportPath, schemaPath, "REVALIDATION_SEAL_JSON_SCHEMA_INVALID");
const report = JSON.parse(rawBytes.toString("utf8"));
const hashPattern = /^[0-9a-f]{64}$/iu;

assert(report.schemaVersion === "1.3", "REVALIDATION_SEAL_SCHEMA_INVALID");
assert(report.serialization === "RAW_UTF8_SHA256", "REVALIDATION_SEAL_SERIALIZATION_INVALID");
const sealTime = Date.parse(report.sealedAt);
assert(Number.isFinite(sealTime), "REVALIDATION_SEAL_TIME_INVALID");

const productTree = git("rev-parse", `${report.source.productHead}^{tree}`);
const specTree = git("rev-parse", `${report.source.specHead}^{tree}`);
const campaignTree = git("rev-parse", `${report.source.campaignHead}^{tree}`);
const finalTree = git("rev-parse", `${report.source.finalHead}^{tree}`);
const brainStartTree = brainGit("rev-parse", `${report.source.brainStartHead}^{tree}`);
const brainFinalTree = brainGit("rev-parse", `${report.source.brainFinalHead}^{tree}`);

assert(productTree === report.source.productTree, "REVALIDATION_PRODUCT_TREE_MISMATCH");
assert(specTree === report.source.specTree, "REVALIDATION_SPEC_TREE_MISMATCH");
assert(campaignTree === report.source.campaignTree, "REVALIDATION_CAMPAIGN_TREE_MISMATCH");
assert(finalTree === report.source.finalTree, "REVALIDATION_FINAL_TREE_MISMATCH");
assert(brainStartTree === report.source.brainStartTree, "REVALIDATION_BRAIN_START_TREE_MISMATCH");
assert(brainFinalTree === report.source.brainFinalTree, "REVALIDATION_BRAIN_FINAL_TREE_MISMATCH");
git("merge-base", "--is-ancestor", report.source.productHead, report.source.specHead);
git("merge-base", "--is-ancestor", report.source.specHead, report.source.campaignHead);
git("merge-base", "--is-ancestor", report.source.campaignHead, report.source.finalHead);
brainGit("merge-base", "--is-ancestor", report.source.brainStartHead, report.source.brainFinalHead);
assert(git("rev-parse", "HEAD") === report.source.finalHead, "REVALIDATION_CURRENT_PRODUCT_HEAD_MISMATCH");
assert(brainGit("rev-parse", "HEAD") === report.source.brainFinalHead, "REVALIDATION_CURRENT_BRAIN_HEAD_MISMATCH");
assert(git("status", "--porcelain", "--untracked-files=no") === "", "REVALIDATION_PRODUCT_TRACKED_WORKTREE_DIRTY");

const brainStatus = brainGit("status", "--porcelain");
if (brainStatus !== "") {
  assert(report.source.brainFinalHead === report.source.brainStartHead, "REVALIDATION_DIRTY_BRAIN_MUTATED");
}

const campaignKit = [
  "specs/206-gpt6-astra-endvera-reverification/research.md",
  "specs/206-gpt6-astra-endvera-reverification/plan.md",
  "specs/206-gpt6-astra-endvera-reverification/goal.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-contracts/finding-report.schema.json",
  "specs/206-gpt6-astra-endvera-reverification/audit-contracts/revalidation-seal.schema.json",
  "specs/206-gpt6-astra-endvera-reverification/audit-contracts/evidence-record.schema.json",
  "specs/206-gpt6-astra-endvera-reverification/audit-contracts/phase-check-contracts.schema.json",
  "specs/206-gpt6-astra-endvera-reverification/audit-contracts/campaign-identity.schema.json",
  "specs/206-gpt6-astra-endvera-reverification/scripts/validate-revalidation-seal.mjs",
  "specs/206-gpt6-astra-endvera-reverification/scripts/validate-json-schema.py",
  "specs/206-gpt6-astra-endvera-reverification/scripts/requirements.txt",
  "specs/206-gpt6-astra-endvera-reverification/scripts/test-phase-check-contract.mjs",
  "specs/206-gpt6-astra-endvera-reverification/evaluation-contracts/phase-check.mjs",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/canon-provenance.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/architecture-security.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/mobile-ux.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/product-coverage.md",
];
for (const path of campaignKit) {
  assert(commitContainsPath(report.source.specHead, path), `REVALIDATION_SPEC_KIT_MISSING:${path}`);
  assert(commitContainsPath(report.source.campaignHead, path), `REVALIDATION_CAMPAIGN_KIT_MISSING:${path}`);
  assert(commitContainsPath(report.source.finalHead, path), `REVALIDATION_FINAL_KIT_MISSING:${path}`);
  assert(
    Buffer.compare(gitBlob(report.source.specHead, path), gitBlob(report.source.campaignHead, path)) === 0 &&
      Buffer.compare(gitBlob(report.source.campaignHead, path), gitBlob(report.source.finalHead, path)) === 0,
    `REVALIDATION_CAMPAIGN_KIT_MUTATED:${path}`,
  );
}

const artifactPaths = new Set();
const artifactsByPath = new Map();
const artifactsByRole = new Map();
const textEvidenceRoles = new Set([
  "PHASE_EVIDENCE",
  "PHASE_CHECK_RESULT",
  "AUDIT_PROMPT",
  "RAW_OUTPUT",
  "COMMAND_LOG",
  "MODEL_STDOUT",
  "MODEL_STDERR",
  "BUDGET_AUTHORITY",
  "PRICING_EVIDENCE",
  "COST_RECEIPT",
  "CORPUS_MANIFEST",
  "ORACLE_PROTECTION",
  "ORACLE_MANIFEST",
  "OUTPUT_MANIFEST",
  "GRADING_MANIFEST",
  "GRADER_RESULT",
  "GRADE_RECORD",
  "DEVICE_OBSERVATION",
  "INCIDENT_EVIDENCE",
  "BRAIN_CHECKPOINT",
  "BRAIN_PACKET",
  "INVARIANT_MANIFEST",
  "INVARIANT_RESULT",
  "METRIC_CALCULATION",
  "CORPUS_INPUT",
  "EVALUATION_CONTRACT",
  "REQUEST_RECORD",
  "MODEL_OUTPUT",
  "TRANSPORT_FAILURE",
  "SUPPORTING_EVIDENCE",
  "FINDING_REPORT",
  "CORRECTION_REVIEW",
  "METRIC_REPORT",
  "OTHER",
]);
for (const artifact of report.artifacts) {
  assert(!artifactPaths.has(artifact.path), `REVALIDATION_SEAL_ARTIFACT_DUPLICATE:${artifact.path}`);
  artifactPaths.add(artifact.path);
  artifactsByPath.set(artifact.path, artifact);
  if (!artifactsByRole.has(artifact.role)) artifactsByRole.set(artifact.role, []);
  artifactsByRole.get(artifact.role).push(artifact);

  const artifactPath = resolveArtifactPath(artifact.path);
  assert(existsSync(artifactPath), `REVALIDATION_SEAL_ARTIFACT_NOT_FOUND:${artifact.path}`);
  const artifactStat = statSync(artifactPath);
  assert(artifactStat.isFile(), `REVALIDATION_SEAL_ARTIFACT_NOT_FILE:${artifact.path}`);
  const workingBytes = readFileSync(artifactPath);
  if (textEvidenceRoles.has(artifact.role)) assertNoSecretMaterial(workingBytes, artifact.path);
  assert(artifactStat.size === artifact.bytes, `REVALIDATION_SEAL_ARTIFACT_BYTES_MISMATCH:${artifact.path}`);
  assert(
    hashPattern.test(artifact.sha256) && sha256(workingBytes) === artifact.sha256.toLowerCase(),
    `REVALIDATION_SEAL_ARTIFACT_HASH_MISMATCH:${artifact.path}`,
  );

  if (artifact.origin === "CAMPAIGN_HEAD_BLOB") {
    assert(artifact.sourceCommit === report.source.campaignHead, `REVALIDATION_CAMPAIGN_ARTIFACT_COMMIT_MISMATCH:${artifact.path}`);
    const committedBytes = gitBlob(report.source.campaignHead, artifact.path);
    assert(Buffer.compare(workingBytes, committedBytes) === 0, `REVALIDATION_CAMPAIGN_ARTIFACT_BLOB_MISMATCH:${artifact.path}`);
  } else if (artifact.origin === "FINAL_HEAD_BLOB") {
    assert(artifact.sourceCommit === report.source.finalHead, `REVALIDATION_FINAL_ARTIFACT_COMMIT_MISMATCH:${artifact.path}`);
    const committedBytes = gitBlob(report.source.finalHead, artifact.path);
    assert(Buffer.compare(workingBytes, committedBytes) === 0, `REVALIDATION_FINAL_ARTIFACT_BLOB_MISMATCH:${artifact.path}`);
  } else {
    assert(artifact.origin === "RUN_GENERATED", `REVALIDATION_ARTIFACT_ORIGIN_INVALID:${artifact.path}`);
    assert(artifact.sourceCommit === null, `REVALIDATION_RUN_ARTIFACT_COMMIT_UNEXPECTED:${artifact.path}`);
    assert(!commitContainsPath(report.source.finalHead, artifact.path), `REVALIDATION_RUN_ARTIFACT_ALREADY_COMMITTED:${artifact.path}`);
  }
}
for (const role of ["EVALUATION_CONTRACT", "CORPUS_INPUT"]) {
  for (const artifact of artifactsByRole.get(role) ?? []) {
    assert(artifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_CAMPAIGN_INPUT_NOT_FROZEN:${role}:${artifact.path}`);
  }
}
const evaluationContractsDirectory = "specs/206-gpt6-astra-endvera-reverification/evaluation-contracts";
const phaseCheckEntrypointPath = `${evaluationContractsDirectory}/phase-check.mjs`;
const frozenEvaluationFilesRaw = git("ls-tree", "-r", "--name-only", report.source.campaignHead, "--", evaluationContractsDirectory);
const frozenEvaluationFiles = frozenEvaluationFilesRaw === "" ? [] : frozenEvaluationFilesRaw.split(/\r?\n/u);
for (const path of frozenEvaluationFiles) {
  const artifact = artifactsByPath.get(path);
  assert(Boolean(artifact) && artifact.role === "EVALUATION_CONTRACT" && artifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_EVALUATION_DEPENDENCY_NOT_MANIFESTED:${path}`);
}

const requireArtifact = (path, role, code) => {
  assert(typeof path === "string" && path.length > 0, `${code}:PATH_MISSING`);
  const artifact = artifactsByPath.get(path);
  assert(Boolean(artifact), `${code}:ARTIFACT_MISSING:${path}`);
  assert(artifact.role === role, `${code}:ROLE_INVALID:${path}:${artifact.role}`);
  return artifact;
};

const requireLinkedArtifact = (path, expectedSha256, code, expectedRole = null) => {
  const artifact = artifactsByPath.get(path);
  assert(Boolean(artifact), `${code}:ARTIFACT_MISSING:${path}`);
  if (expectedRole !== null) assert(artifact.role === expectedRole, `${code}:ROLE_INVALID:${path}:${artifact.role}`);
  assert(artifact.sha256.toLowerCase() === expectedSha256.toLowerCase(), `${code}:HASH_MISMATCH:${path}`);
  return artifact;
};

const evidenceKindByRole = new Map([
  ["PHASE_EVIDENCE", "PHASE_EVIDENCE"],
  ["PHASE_CHECK_RESULT", "PHASE_CHECK_RESULT"],
  ["COMMAND_LOG", "COMMAND_LOG"],
  ["CORRECTION_REVIEW", "CORRECTION_REVIEW"],
  ["METRIC_REPORT", "METRIC_REPORT"],
  ["CORPUS_MANIFEST", "CORPUS_MANIFEST"],
  ["ORACLE_PROTECTION", "ORACLE_PROTECTION"],
  ["ORACLE_MANIFEST", "ORACLE_MANIFEST"],
  ["OUTPUT_MANIFEST", "OUTPUT_MANIFEST"],
  ["GRADING_MANIFEST", "GRADING_MANIFEST"],
  ["GRADER_RESULT", "GRADER_RESULT"],
  ["GRADE_RECORD", "GRADE_RECORD"],
  ["BUDGET_AUTHORITY", "BUDGET_AUTHORITY"],
  ["PRICING_EVIDENCE", "PRICING_EVIDENCE"],
  ["COST_RECEIPT", "COST_RECEIPT"],
  ["INCIDENT_EVIDENCE", "INCIDENT_EVIDENCE"],
  ["BRAIN_CHECKPOINT", "BRAIN_CHECKPOINT"],
  ["BRAIN_PACKET", "BRAIN_PACKET"],
  ["INVARIANT_MANIFEST", "INVARIANT_MANIFEST"],
  ["INVARIANT_RESULT", "INVARIANT_RESULT"],
  ["METRIC_CALCULATION", "METRIC_CALCULATION"],
  ["REQUEST_RECORD", "REQUEST_RECORD"],
  ["MODEL_OUTPUT", "MODEL_OUTPUT"],
  ["TRANSPORT_FAILURE", "TRANSPORT_FAILURE"],
]);

const readArtifactJson = (path, role, code) => {
  requireArtifact(path, role, code);
  const artifactPath = resolveArtifactPath(path);
  validateAgainstSchema(artifactPath, evidenceSchemaPath, `${code}:SCHEMA_INVALID`);
  const record = readJson(artifactPath, `${code}:JSON_INVALID`);
  assert(record.kind === evidenceKindByRole.get(role), `${code}:KIND_INVALID`);
  return record;
};

const campaignIdentityArtifact = requireLinkedArtifact(
  report.source.campaignIdentityPath,
  report.source.campaignIdentitySha256,
  "REVALIDATION_CAMPAIGN_IDENTITY",
  "EVALUATION_CONTRACT",
);
assert(campaignIdentityArtifact.origin === "CAMPAIGN_HEAD_BLOB", "REVALIDATION_CAMPAIGN_IDENTITY_NOT_FROZEN");
const campaignIdentityPath = resolveArtifactPath(report.source.campaignIdentityPath);
validateAgainstSchema(campaignIdentityPath, campaignIdentitySchemaPath, "REVALIDATION_CAMPAIGN_IDENTITY_SCHEMA_INVALID");
const campaignIdentity = readJson(campaignIdentityPath, "REVALIDATION_CAMPAIGN_IDENTITY_JSON_INVALID");
assert(campaignIdentity.sourceProductHead === report.source.productHead, "REVALIDATION_CAMPAIGN_IDENTITY_PRODUCT_HEAD_MISMATCH");
assert(campaignIdentity.specHead === report.source.specHead, "REVALIDATION_CAMPAIGN_IDENTITY_SPEC_HEAD_MISMATCH");
const campaignCreatedAt = Date.parse(campaignIdentity.createdAt);
const campaignCommittedAt = Date.parse(git("show", "-s", "--format=%cI", report.source.campaignHead));
assert(Number.isFinite(campaignCreatedAt) && Number.isFinite(campaignCommittedAt), "REVALIDATION_CAMPAIGN_TIME_INVALID");
assert(Math.floor(campaignCreatedAt / 1000) <= Math.floor(campaignCommittedAt / 1000), "REVALIDATION_CAMPAIGN_IDENTITY_CREATED_AFTER_COMMIT");
assert(campaignCommittedAt <= sealTime, "REVALIDATION_CAMPAIGN_COMMITTED_AFTER_SEAL");

const evaluationArtifactRoles = new Map([
  ["deviceObservationEvidencePath", "DEVICE_OBSERVATION"],
  ["corpusManifestPath", "CORPUS_MANIFEST"],
  ["oracleProtectionEvidencePath", "ORACLE_PROTECTION"],
  ["baselineOutputManifestPath", "OUTPUT_MANIFEST"],
  ["candidateOutputManifestPath", "OUTPUT_MANIFEST"],
  ["gradingManifestPath", "GRADING_MANIFEST"],
  ["budgetAuthorityEvidencePath", "BUDGET_AUTHORITY"],
  ["pricingEvidencePath", "PRICING_EVIDENCE"],
  ["costReceiptEvidencePath", "COST_RECEIPT"],
  ["incidentEvidencePath", "INCIDENT_EVIDENCE"],
  ["brainClosureEvidencePath", report.evaluation.brainClosureMode === "CHECKPOINT" ? "BRAIN_CHECKPOINT" : "BRAIN_PACKET"],
  ["invariantManifestPath", "INVARIANT_MANIFEST"],
]);
for (const [field, role] of evaluationArtifactRoles) {
  const path = report.evaluation[field];
  if (path !== null) requireArtifact(path, role, `REVALIDATION_EVALUATION_ARTIFACT:${field}`);
}

const expectedPromptPaths = [
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/canon-provenance.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/architecture-security.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/mobile-ux.md",
  "specs/206-gpt6-astra-endvera-reverification/audit-prompts/product-coverage.md",
];
for (const promptPath of expectedPromptPaths) {
  const promptArtifact = requireArtifact(promptPath, "AUDIT_PROMPT", "REVALIDATION_AUDIT_PROMPT");
  assert(promptArtifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_AUDIT_PROMPT_ORIGIN_INVALID:${promptPath}`);
}

const expectedPhaseOrder = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];
assert(report.phases.every((phase, index) => phase.id === expectedPhaseOrder[index]), "REVALIDATION_SEAL_PHASE_ORDER_INVALID");
const phases = new Map(report.phases.map((phase) => [phase.id, phase]));
assert(phases.size === 8, "REVALIDATION_SEAL_PHASE_IDS_NOT_UNIQUE");

let upstreamBlocked = false;
const phaseEvidenceById = new Map();
for (const id of expectedPhaseOrder) {
  const phase = phases.get(id);
  const requiresEvidence = ["PASS", "REWORK", "BLOCKED"].includes(phase.status);
  if (requiresEvidence) {
    const phaseEvidence = readArtifactJson(phase.evidencePath, "PHASE_EVIDENCE", `REVALIDATION_PHASE_EVIDENCE:${id}`);
    assert(phaseEvidence.phase === id && phaseEvidence.status === phase.status, `REVALIDATION_PHASE_EVIDENCE_STATE_MISMATCH:${id}`);
    phaseEvidenceById.set(id, phaseEvidence);
    if (phase.status === "BLOCKED") {
      assert(typeof phase.reasonCode === "string" && phase.reasonCode.length > 0, `REVALIDATION_BLOCKED_PHASE_REASON_MISSING:${id}`);
    } else {
      assert(phase.reasonCode === null, `REVALIDATION_PHASE_REASON_UNEXPECTED:${id}`);
    }
  } else {
    assert(phase.evidencePath === null, `REVALIDATION_PHASE_EVIDENCE_UNEXPECTED:${id}`);
    assert(typeof phase.reasonCode === "string" && phase.reasonCode.length > 0, `REVALIDATION_PHASE_REASON_MISSING:${id}`);
  }
  if (id !== "G6") assert(phase.status !== "NOT_APPLICABLE", `REVALIDATION_PHASE_NOT_APPLICABLE_INVALID:${id}`);
  if (["G0", "G1", "G2", "G3", "G4", "G5"].includes(id)) {
    if (upstreamBlocked) assert(phase.status === "NOT_RUN", `REVALIDATION_PHASE_RAN_AFTER_BLOCK:${id}`);
    if (phase.status === "NOT_RUN") assert(upstreamBlocked, `REVALIDATION_NOT_RUN_WITHOUT_UPSTREAM_BLOCK:${id}`);
    if (phase.status === "BLOCKED") upstreamBlocked = true;
  }
}
assert(["PASS", "REWORK", "BLOCKED"].includes(phases.get("G7").status), "REVALIDATION_G7_SEAL_NOT_COMPLETED");

const findingArtifacts = artifactsByRole.get("FINDING_REPORT") ?? [];
const stdoutArtifacts = artifactsByRole.get("MODEL_STDOUT") ?? [];
const stderrArtifacts = artifactsByRole.get("MODEL_STDERR") ?? [];
const g2Status = phases.get("G2").status;
if (g2Status === "NOT_RUN") {
  assert(findingArtifacts.length === 0, "REVALIDATION_FINDING_REPORTS_UNEXPECTED");
  assert(stdoutArtifacts.length === 0 && stderrArtifacts.length === 0, "REVALIDATION_MODEL_STREAMS_UNEXPECTED");
} else if (["PASS", "REWORK"].includes(g2Status)) {
  assert(findingArtifacts.length === 4, "REVALIDATION_FOUR_FINDING_REPORTS_REQUIRED");
  assert(stdoutArtifacts.length === 0, "REVALIDATION_DUPLICATE_MODEL_STDOUT_FORBIDDEN");
  assert(stderrArtifacts.length === 4, "REVALIDATION_FOUR_MODEL_STDERR_REQUIRED");
} else if (g2Status === "BLOCKED") {
  assert(findingArtifacts.length <= 4, "REVALIDATION_TOO_MANY_BLOCKED_FINDING_REPORTS");
  assert(stdoutArtifacts.length <= 4 && stderrArtifacts.length <= 4, "REVALIDATION_TOO_MANY_BLOCKED_MODEL_STREAMS");
}

const expectedLanes = new Set(["CANON_PROVENANCE", "ARCHITECTURE_SECURITY", "MOBILE_UX", "PRODUCT_COVERAGE"]);
const findingReports = [];
const findingArtifactByLane = new Map();
const findingsById = new Map();
for (const artifact of findingArtifacts) {
  const findingPath = resolveArtifactPath(artifact.path);
  validateAgainstSchema(findingPath, findingSchemaPath, `REVALIDATION_FINDING_REPORT_SCHEMA_INVALID:${artifact.path}`);
  const findingReport = readJson(findingPath, `REVALIDATION_FINDING_REPORT_JSON_INVALID:${artifact.path}`);
  assert(expectedLanes.delete(findingReport.auditLane), `REVALIDATION_FINDING_LANE_DUPLICATE_OR_INVALID:${findingReport.auditLane}`);
  findingArtifactByLane.set(findingReport.auditLane, artifact);
  assert(findingReport.sourceProductHead === report.source.productHead, `REVALIDATION_FINDING_SOURCE_MISMATCH:${findingReport.auditLane}`);
  assert(
    findingReport.auditor.requestedModel === report.models.codexAudit.requestedModel,
    `REVALIDATION_FINDING_MODEL_REQUEST_MISMATCH:${findingReport.auditLane}`,
  );
  findingReports.push(findingReport);
  for (const finding of findingReport.findings) {
    assert(!findingsById.has(finding.id), `REVALIDATION_FINDING_ID_DUPLICATE:${finding.id}`);
    findingsById.set(finding.id, finding);
  }
}
if (["PASS", "REWORK"].includes(g2Status)) assert(expectedLanes.size === 0, "REVALIDATION_FINDING_LANE_MISSING");

const commandLog = readArtifactJson(report.commandsSummary.evidencePath, "COMMAND_LOG", "REVALIDATION_COMMAND_SUMMARY");
const commandIds = new Set();
const commandsById = new Map();
const providerCommandsByRequestId = new Map();
for (const command of commandLog.commands) {
  assert(!commandIds.has(command.id), `REVALIDATION_COMMAND_ID_DUPLICATE:${command.id}`);
  commandIds.add(command.id);
  commandsById.set(command.id, command);
  assert(command.campaignId === campaignIdentity.campaignId, `REVALIDATION_COMMAND_CAMPAIGN_ID_MISMATCH:${command.id}`);
  assert(git("rev-parse", `${command.observedHead}^{tree}`) === command.observedTree, `REVALIDATION_COMMAND_OBSERVED_TREE_MISMATCH:${command.id}`);
  if (command.phase === "G0") {
    git("merge-base", "--is-ancestor", report.source.specHead, command.observedHead);
    git("merge-base", "--is-ancestor", command.observedHead, report.source.campaignHead);
    assert(Date.parse(command.startedAt) >= campaignCreatedAt, `REVALIDATION_G0_COMMAND_BEFORE_CAMPAIGN_IDENTITY:${command.id}`);
  } else {
    git("merge-base", "--is-ancestor", report.source.campaignHead, command.observedHead);
    git("merge-base", "--is-ancestor", command.observedHead, report.source.finalHead);
    assert(Date.parse(command.startedAt) >= campaignCommittedAt, `REVALIDATION_COMMAND_BEFORE_CAMPAIGN_FREEZE:${command.id}`);
  }
  if (["G1", "G2"].includes(command.phase)) {
    assert(command.observedHead === report.source.campaignHead && command.observedTree === report.source.campaignTree, `REVALIDATION_BASELINE_COMMAND_SNAPSHOT_MISMATCH:${command.id}`);
  }
  if (command.phase === "G7") {
    assert(command.observedHead === report.source.finalHead && command.observedTree === report.source.finalTree, `REVALIDATION_FINAL_COMMAND_SNAPSHOT_MISMATCH:${command.id}`);
  }
  assert(Date.parse(command.finishedAt) <= sealTime, `REVALIDATION_COMMAND_AFTER_SEAL:${command.id}`);
  const stdoutRole = command.phase === "G2" && command.classification === "MODEL_AUDIT"
    ? "FINDING_REPORT"
    : command.classification === "PHASE_CHECK"
      ? "PHASE_CHECK_RESULT"
    : command.phase === "G6" && command.classification === "GRADING"
      ? "GRADER_RESULT"
      : command.classification === "METRIC_CALCULATION"
        ? "METRIC_CALCULATION"
        : command.classification === "INVARIANT_CHECK"
          ? "INVARIANT_RESULT"
          : "RAW_OUTPUT";
  const stderrRole = command.phase === "G2" ? "MODEL_STDERR" : "RAW_OUTPUT";
  const stdoutArtifact = requireArtifact(command.stdoutPath, stdoutRole, `REVALIDATION_COMMAND_STDOUT:${command.id}`);
  const stderrArtifact = requireArtifact(command.stderrPath, stderrRole, `REVALIDATION_COMMAND_STDERR:${command.id}`);
  assert(stdoutArtifact.sha256.toLowerCase() === command.stdoutSha256.toLowerCase(), `REVALIDATION_COMMAND_STDOUT_HASH_MISMATCH:${command.id}`);
  assert(stderrArtifact.sha256.toLowerCase() === command.stderrSha256.toLowerCase(), `REVALIDATION_COMMAND_STDERR_HASH_MISMATCH:${command.id}`);
  assert(Date.parse(command.startedAt) <= Date.parse(command.finishedAt), `REVALIDATION_COMMAND_TIME_ORDER_INVALID:${command.id}`);
  if (["DETERMINISTIC_TEST", "PHASE_CHECK", "INVARIANT_CHECK", "METRIC_CALCULATION", "GRADING", "VALIDATION"].includes(command.classification)) {
    assert(command.expectedExitCode === 0, `REVALIDATION_COMMAND_EXPECTED_EXIT_NOT_CANONICAL:${command.id}`);
  }
  if (command.classification === "PROVIDER_CALL") {
    assert(command.phase === "G6", `REVALIDATION_PROVIDER_COMMAND_PHASE_INVALID:${command.id}`);
    assert(typeof command.providerAttemptRequestId === "string", `REVALIDATION_PROVIDER_COMMAND_REQUEST_ID_MISSING:${command.id}`);
    assert(!providerCommandsByRequestId.has(command.providerAttemptRequestId), `REVALIDATION_PROVIDER_COMMAND_REQUEST_ID_DUPLICATE:${command.providerAttemptRequestId}`);
    providerCommandsByRequestId.set(command.providerAttemptRequestId, command);
    assert(command.replay === null, `REVALIDATION_PROVIDER_COMMAND_REPLAY_FORBIDDEN:${command.id}`);
  } else {
    assert(command.providerAttemptRequestId === null, `REVALIDATION_NONPROVIDER_COMMAND_REQUEST_ID_PRESENT:${command.id}`);
  }
}
assert(report.commandsSummary.total === commandLog.commands.length, "REVALIDATION_COMMAND_TOTAL_NOT_DERIVED");
assert(
  report.commandsSummary.failed === commandLog.commands.filter((command) => command.exitCode !== command.expectedExitCode).length,
  "REVALIDATION_COMMAND_FAILURES_NOT_DERIVED",
);
assert(
  report.evaluation.deterministicFailures === commandLog.commands.filter(
    (command) => ["DETERMINISTIC_TEST", "PHASE_CHECK", "INVARIANT_CHECK"].includes(command.classification) && command.exitCode !== command.expectedExitCode,
  ).length,
  "REVALIDATION_DETERMINISTIC_FAILURES_NOT_DERIVED",
);

const validateRequiredPhaseChecks = (phaseId, requiredCheckIds) => {
  const phaseStatus = phases.get(phaseId).status;
  if (phaseStatus !== "PASS" && !(phaseId === "G7" && phaseStatus === "REWORK")) return;
  const phaseEvidence = phaseEvidenceById.get(phaseId);
  assert(Boolean(phaseEvidence), `REVALIDATION_REQUIRED_PHASE_EVIDENCE_MISSING:${phaseId}`);
  const checksById = new Map();
  const phaseCommandIds = new Set();
  const observedCommandIds = new Set();
  for (const check of phaseEvidence.checks) {
    assert(!checksById.has(check.checkId), `REVALIDATION_PHASE_CHECK_DUPLICATE:${phaseId}:${check.checkId}`);
    checksById.set(check.checkId, check);
    requireLinkedArtifact(check.evidencePath, check.evidenceSha256, `REVALIDATION_PHASE_CHECK_EVIDENCE:${phaseId}:${check.checkId}`);
  }
  assert(checksById.size === requiredCheckIds.length, `REVALIDATION_PHASE_CHECK_SET_SIZE_INVALID:${phaseId}`);
  for (const checkId of requiredCheckIds) {
    const check = checksById.get(checkId);
    assert(Boolean(check), `REVALIDATION_REQUIRED_PHASE_CHECK_MISSING:${phaseId}:${checkId}`);
    assert(typeof check.commandId === "string", `REVALIDATION_REQUIRED_PHASE_CHECK_COMMAND_MISSING:${phaseId}:${checkId}`);
    const command = commandsById.get(check.commandId);
    assert(Boolean(command), `REVALIDATION_PHASE_CHECK_COMMAND_UNKNOWN:${phaseId}:${checkId}`);
    assert(!phaseCommandIds.has(command.id), `REVALIDATION_PHASE_CHECK_COMMAND_REUSED:${phaseId}:${command.id}`);
    phaseCommandIds.add(command.id);
    assert(command.phase === phaseId, `REVALIDATION_PHASE_CHECK_COMMAND_PHASE_MISMATCH:${phaseId}:${checkId}`);
    assert(command.classification === "PHASE_CHECK", `REVALIDATION_PHASE_CHECK_COMMAND_CLASS_INVALID:${phaseId}:${checkId}`);
    assert(command.replay && typeof command.replay === "object", `REVALIDATION_PHASE_CHECK_REPLAY_MISSING:${phaseId}:${checkId}`);
    assert(command.replay.entrypointPath === phaseCheckEntrypointPath, `REVALIDATION_PHASE_CHECK_ENTRYPOINT_NOT_CANONICAL:${phaseId}:${checkId}`);
    const commandPassed = command.exitCode === command.expectedExitCode && command.exitCode === 0;
    assert(commandPassed, `REVALIDATION_PHASE_CHECK_WRAPPER_FAILED:${phaseId}:${checkId}`);
    assert(command.stdoutPath === check.evidencePath && command.stdoutSha256.toLowerCase() === check.evidenceSha256.toLowerCase(), `REVALIDATION_PHASE_CHECK_NOT_COMMAND_STDOUT:${phaseId}:${checkId}`);
    const checkResult = readArtifactJson(check.evidencePath, "PHASE_CHECK_RESULT", `REVALIDATION_PHASE_CHECK_RESULT:${phaseId}:${checkId}`);
    assert(checkResult.phase === phaseId && checkResult.checkId === checkId, `REVALIDATION_PHASE_CHECK_RESULT_ID_MISMATCH:${phaseId}:${checkId}`);
    assert(check.result === checkResult.result, `REVALIDATION_PHASE_CHECK_RESULT_NOT_DERIVED:${phaseId}:${checkId}`);
    const observedCommand = commandsById.get(checkResult.observedCommandId);
    assert(Boolean(observedCommand), `REVALIDATION_PHASE_CHECK_OBSERVED_COMMAND_UNKNOWN:${phaseId}:${checkId}`);
    assert(observedCommand.id !== command.id, `REVALIDATION_PHASE_CHECK_SELF_OBSERVATION_FORBIDDEN:${phaseId}:${checkId}`);
    assert(!observedCommandIds.has(observedCommand.id), `REVALIDATION_PHASE_CHECK_OBSERVED_COMMAND_REUSED:${phaseId}:${observedCommand.id}`);
    observedCommandIds.add(observedCommand.id);
    assert(observedCommand.phase === phaseId, `REVALIDATION_PHASE_CHECK_OBSERVED_COMMAND_PHASE_MISMATCH:${phaseId}:${checkId}`);
    assert(["DETERMINISTIC_TEST", "VALIDATION"].includes(observedCommand.classification), `REVALIDATION_PHASE_CHECK_OBSERVED_COMMAND_CLASS_INVALID:${phaseId}:${checkId}`);
    const contractArtifact = requireLinkedArtifact(checkResult.contractPath, checkResult.contractSha256, `REVALIDATION_PHASE_CHECK_CONTRACT:${phaseId}:${checkId}`, "EVALUATION_CONTRACT");
    assert(contractArtifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_PHASE_CHECK_CONTRACT_NOT_FROZEN:${phaseId}:${checkId}`);
    validateAgainstSchema(resolveArtifactPath(checkResult.contractPath), phaseCheckContractsSchemaPath, `REVALIDATION_PHASE_CHECK_CONTRACT_SCHEMA_INVALID:${phaseId}:${checkId}`);
    const contractManifest = readJson(resolveArtifactPath(checkResult.contractPath), `REVALIDATION_PHASE_CHECK_CONTRACT_JSON_INVALID:${phaseId}:${checkId}`);
    const matchingContracts = contractManifest.checks.filter((entry) => entry.phase === phaseId && entry.checkId === checkId);
    assert(matchingContracts.length === 1, `REVALIDATION_PHASE_CHECK_CONTRACT_CARDINALITY_INVALID:${phaseId}:${checkId}`);
    const phaseContract = matchingContracts[0];
    assert(phaseContract.observedClassification === observedCommand.classification, `REVALIDATION_PHASE_CHECK_CONTRACT_CLASS_MISMATCH:${phaseId}:${checkId}`);
    assert(phaseContract.commandSha256.toLowerCase() === sha256(Buffer.from(observedCommand.command, "utf8")), `REVALIDATION_PHASE_CHECK_COMMAND_NOT_FROZEN:${phaseId}:${checkId}`);
    const observationArtifact = requireLinkedArtifact(checkResult.observationPath, checkResult.observationSha256, `REVALIDATION_PHASE_CHECK_OBSERVATION:${phaseId}:${checkId}`, "SUPPORTING_EVIDENCE");
    assert(observationArtifact.origin === "RUN_GENERATED", `REVALIDATION_PHASE_CHECK_OBSERVATION_ORIGIN_INVALID:${phaseId}:${checkId}`);
    const observationPath = resolveArtifactPath(checkResult.observationPath);
    validateAgainstSchema(observationPath, evidenceSchemaPath, `REVALIDATION_PHASE_CHECK_OBSERVATION_SCHEMA_INVALID:${phaseId}:${checkId}`);
    const observation = readJson(observationPath, `REVALIDATION_PHASE_CHECK_OBSERVATION_JSON_INVALID:${phaseId}:${checkId}`);
    assert(observation.kind === "PHASE_CHECK_OBSERVATION", `REVALIDATION_PHASE_CHECK_OBSERVATION_KIND_INVALID:${phaseId}:${checkId}`);
    assert(observation.phase === phaseId && observation.checkId === checkId && observation.observedCommandId === observedCommand.id, `REVALIDATION_PHASE_CHECK_OBSERVATION_ID_MISMATCH:${phaseId}:${checkId}`);
    assert(observation.campaignId === campaignIdentity.campaignId, `REVALIDATION_PHASE_CHECK_OBSERVATION_CAMPAIGN_MISMATCH:${phaseId}:${checkId}`);
    for (const field of ["observedHead", "observedTree", "classification", "command", "expectedExitCode", "exitCode", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256"]) {
      assert(observation[field] === observedCommand[field], `REVALIDATION_PHASE_CHECK_OBSERVATION_FIELD_MISMATCH:${phaseId}:${checkId}:${field}`);
    }
    assert(
      JSON.stringify(command.replay.arguments) === JSON.stringify(["--revalidation-replay", checkResult.contractPath, checkResult.observationPath]),
      `REVALIDATION_PHASE_CHECK_REPLAY_ARGUMENTS_INVALID:${phaseId}:${checkId}`,
    );
    for (const dependencyPath of [checkResult.contractPath, checkResult.observationPath, observedCommand.stdoutPath, observedCommand.stderrPath]) {
      assert(command.replay.readPaths.includes(dependencyPath), `REVALIDATION_PHASE_CHECK_REPLAY_DEPENDENCY_MISSING:${phaseId}:${checkId}:${dependencyPath}`);
    }
    const observedStdout = readFileSync(resolveArtifactPath(observedCommand.stdoutPath), "utf8");
    const observedStderr = readFileSync(resolveArtifactPath(observedCommand.stderrPath), "utf8");
    const matchesAll = (text, patterns, stream) => patterns.every((pattern) => {
      try {
        return new RegExp(pattern, "u").test(text);
      } catch {
        fail(`REVALIDATION_PHASE_CHECK_REGEX_INVALID:${phaseId}:${checkId}:${stream}`);
      }
    });
    const matchesNone = (text, patterns, stream) => patterns.every((pattern) => {
      try {
        return !new RegExp(pattern, "u").test(text);
      } catch {
        fail(`REVALIDATION_PHASE_CHECK_REGEX_INVALID:${phaseId}:${checkId}:${stream}`);
      }
    });
    const observedPassed = observedCommand.exitCode === phaseContract.successExitCode &&
      observedCommand.expectedExitCode === phaseContract.successExitCode;
    const parsedPass = observedPassed && matchesAll(observedStdout, phaseContract.stdoutAll, "STDOUT") &&
      matchesNone(observedStderr, phaseContract.stderrNone, "STDERR");
    const parsedNotApplicable = phaseContract.allowNotApplicable === true && observedPassed &&
      matchesAll(observedStdout, phaseContract.notApplicableStdoutAll, "NOT_APPLICABLE_STDOUT") &&
      matchesNone(observedStderr, phaseContract.stderrNone, "STDERR");
    const derivedResult = parsedNotApplicable ? "NOT_APPLICABLE" : parsedPass ? "PASS" : "FAIL";
    assert(checkResult.result === derivedResult, `REVALIDATION_PHASE_CHECK_RESULT_PARSER_MISMATCH:${phaseId}:${checkId}`);
    if (checkResult.result === "NOT_APPLICABLE") {
      assert(phaseId === "G7" && checkId === "NATIVE_CRASH_REPRODUCTION", `REVALIDATION_PHASE_CHECK_NOT_APPLICABLE_FORBIDDEN:${phaseId}:${checkId}`);
      assert(observedCommand.classification === "VALIDATION" && observedPassed && phaseContract.allowNotApplicable === true && typeof checkResult.reason === "string", `REVALIDATION_NATIVE_CRASH_NOT_APPLICABLE_UNVERIFIED:${phaseId}:${checkId}`);
    } else {
      assert(checkResult.reason === null, `REVALIDATION_PHASE_CHECK_REASON_UNEXPECTED:${phaseId}:${checkId}`);
      if (phaseStatus === "PASS") assert(checkResult.result === "PASS", `REVALIDATION_PHASE_CHECK_NOT_PASSED:${phaseId}:${checkId}`);
    }
    replayCommand(command, `REVALIDATION_PHASE_CHECK:${phaseId}:${checkId}`);
  }
};

if (["PASS", "REWORK"].includes(g2Status)) {
  const promptPathByLane = new Map([
    ["CANON_PROVENANCE", expectedPromptPaths[0]],
    ["ARCHITECTURE_SECURITY", expectedPromptPaths[1]],
    ["MOBILE_UX", expectedPromptPaths[2]],
    ["PRODUCT_COVERAGE", expectedPromptPaths[3]],
  ]);
  const auditCommandIds = new Set();
  for (const findingReport of findingReports) {
    if (g2Status === "PASS") assert(findingReport.status !== "INCOMPLETE", `REVALIDATION_G2_PASS_WITH_INCOMPLETE_REPORT:${findingReport.auditLane}`);
    const promptPath = promptPathByLane.get(findingReport.auditLane);
    const promptArtifact = requireLinkedArtifact(promptPath, findingReport.auditor.promptSha256, `REVALIDATION_AUDIT_REPORT_PROMPT:${findingReport.auditLane}`, "AUDIT_PROMPT");
    assert(findingReport.auditor.promptPath === promptPath, `REVALIDATION_AUDIT_REPORT_PROMPT_PATH_MISMATCH:${findingReport.auditLane}`);
    assert(promptArtifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_AUDIT_REPORT_PROMPT_NOT_FROZEN:${findingReport.auditLane}`);
    const command = commandsById.get(findingReport.auditor.commandId);
    assert(Boolean(command), `REVALIDATION_AUDIT_COMMAND_MISSING:${findingReport.auditLane}`);
    assert(!auditCommandIds.has(command.id), `REVALIDATION_AUDIT_COMMAND_REUSED:${command.id}`);
    auditCommandIds.add(command.id);
    assert(command.phase === "G2" && command.classification === "MODEL_AUDIT", `REVALIDATION_AUDIT_COMMAND_INVALID:${findingReport.auditLane}`);
    assert(command.exitCode === command.expectedExitCode && command.exitCode === 0, `REVALIDATION_AUDIT_COMMAND_FAILED:${findingReport.auditLane}`);
    assert(findingReport.auditor.clientVersion === report.models.codexAudit.clientVersion, `REVALIDATION_AUDIT_CLIENT_VERSION_MISMATCH:${findingReport.auditLane}`);
    assert(findingReport.auditor.campaignId === campaignIdentity.campaignId, `REVALIDATION_AUDIT_CAMPAIGN_ID_MISMATCH:${findingReport.auditLane}`);
    assert(findingReport.auditor.observedHead === command.observedHead && findingReport.auditor.observedTree === command.observedTree, `REVALIDATION_AUDIT_SNAPSHOT_MISMATCH:${findingReport.auditLane}`);
    assert(Date.parse(findingReport.auditor.runAt) >= Date.parse(command.startedAt) && Date.parse(findingReport.auditor.runAt) <= Date.parse(command.finishedAt), `REVALIDATION_AUDIT_RUN_TIME_OUTSIDE_COMMAND:${findingReport.auditLane}`);
    requireLinkedArtifact(command.stdoutPath, command.stdoutSha256, `REVALIDATION_AUDIT_STDOUT:${findingReport.auditLane}`, "FINDING_REPORT");
    requireLinkedArtifact(command.stderrPath, command.stderrSha256, `REVALIDATION_AUDIT_STDERR:${findingReport.auditLane}`, "MODEL_STDERR");
    assert(findingArtifactByLane.get(findingReport.auditLane).sha256.toLowerCase() === command.stdoutSha256.toLowerCase(), `REVALIDATION_FINDING_REPORT_NOT_EXACT_COMMAND_STDOUT:${findingReport.auditLane}`);
  }
  assert(auditCommandIds.size === 4, "REVALIDATION_FOUR_DISTINCT_AUDIT_COMMANDS_REQUIRED");
}

const replayResults = new Map();
const replayCommand = (command, code) => {
  if (replayResults.has(command.id)) return replayResults.get(command.id);
  assert(command.replay && typeof command.replay === "object", `${code}:REPLAY_REQUIRED`);
  assert(command.replay.runtime === "NODE", `${code}:REPLAY_RUNTIME_INVALID`);
  assert(command.replay.environment === "SANITIZED_NO_SECRETS", `${code}:REPLAY_ENVIRONMENT_INVALID`);
  assert(command.replay.arguments[0] === "--revalidation-replay", `${code}:REPLAY_MODE_ARGUMENT_MISSING`);
  const replayEntrypoint = requireLinkedArtifact(
    command.replay.entrypointPath,
    command.replay.entrypointSha256,
    `${code}:REPLAY_ENTRYPOINT`,
    "EVALUATION_CONTRACT",
  );
  assert(replayEntrypoint.origin === "CAMPAIGN_HEAD_BLOB", `${code}:REPLAY_ENTRYPOINT_NOT_FROZEN_AT_CAMPAIGN_HEAD`);
  assert(
    command.replay.entrypointPath.startsWith(`${evaluationContractsDirectory}/`) &&
      /\.(?:mjs|js)$/u.test(command.replay.entrypointPath),
    `${code}:REPLAY_ENTRYPOINT_OUTSIDE_ALLOWED_DIRECTORY`,
  );
  for (const argument of command.replay.arguments) {
    assert(!/[\u0000\r\n]/u.test(argument), `${code}:REPLAY_ARGUMENT_INVALID`);
    assertNoSecretMaterial(Buffer.from(argument, "utf8"), `${code}:REPLAY_ARGUMENT`);
  }
  const permittedReadPaths = new Set([resolveArtifactPath(command.replay.entrypointPath)]);
  for (const artifact of artifactsByRole.get("EVALUATION_CONTRACT") ?? []) {
    permittedReadPaths.add(resolveArtifactPath(artifact.path));
  }
  const declaredReadPaths = new Set();
  for (const path of command.replay.readPaths) {
    assert(!declaredReadPaths.has(path), `${code}:REPLAY_READ_PATH_DUPLICATE:${path}`);
    declaredReadPaths.add(path);
    const artifact = artifactsByPath.get(path);
    assert(Boolean(artifact), `${code}:REPLAY_READ_PATH_NOT_MANIFESTED:${path}`);
    assert(path !== command.stdoutPath && path !== command.stderrPath, `${code}:REPLAY_EXPECTED_RESULT_READ_FORBIDDEN:${path}`);
    permittedReadPaths.add(resolveArtifactPath(path));
  }
  for (const argument of command.replay.arguments.slice(1)) {
    const artifact = artifactsByPath.get(argument);
    if (artifact) {
      assert(declaredReadPaths.has(argument), `${code}:REPLAY_PATH_ARGUMENT_NOT_DECLARED:${argument}`);
    } else {
      assert(!argument.includes("/") && !argument.includes("\\") && !isAbsolute(argument), `${code}:REPLAY_PATH_ARGUMENT_NOT_MANIFESTED`);
    }
  }
  const sanitizedEnvironment = {
    NODE_ENV: "test",
    ENDVERA_REVALIDATION_REPLAY: "1",
  };
  for (const environmentKey of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (typeof process.env[environmentKey] === "string") {
      sanitizedEnvironment[environmentKey] = process.env[environmentKey];
    }
  }
  const replay = spawnSync(
    process.execPath,
    [
      "--permission",
      ...[...permittedReadPaths].map((path) => `--allow-fs-read=${path}`),
      resolveArtifactPath(command.replay.entrypointPath),
      ...command.replay.arguments,
    ],
    {
      cwd: repositoryRoot,
      encoding: null,
      env: sanitizedEnvironment,
      windowsHide: true,
      timeout: command.replay.timeoutMs,
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  assert(!replay.error, `${code}:REPLAY_EXECUTION_ERROR:${replay.error?.code ?? "UNKNOWN"}`);
  assert(replay.signal === null, `${code}:REPLAY_SIGNAL:${replay.signal}`);
  assert(replay.status === command.exitCode, `${code}:REPLAY_EXIT_MISMATCH`);
  assert(sha256(replay.stdout ?? Buffer.alloc(0)) === command.stdoutSha256.toLowerCase(), `${code}:REPLAY_STDOUT_MISMATCH`);
  assert(sha256(replay.stderr ?? Buffer.alloc(0)) === command.stderrSha256.toLowerCase(), `${code}:REPLAY_STDERR_MISMATCH`);
  replayResults.set(command.id, replay);
  return replay;
};

validateRequiredPhaseChecks("G1", [
  "ROOT_TESTS", "MOBILE_TESTS", "ROOT_BUILD", "MOBILE_BUILD", "MIGRATION_CLEAN", "MIGRATION_UPGRADE",
  "SYNTHETIC_SEED", "CRITICAL_ROUTE_SMOKE", "POSTGRES_RESTART_READBACK", "BACKLOG_VALIDATION", "QUEUE_VALIDATION",
]);
validateRequiredPhaseChecks("G7", [
  "WEBHOOK_FORGERY", "DUPLICATE_PROVIDER_MESSAGE", "DOUBLE_APPROVAL", "STALE_APPROVAL", "PREVIEW_MUTATION",
  "RECIPIENT_CAP", "CONTACT_HOMONYM", "DST_BOUNDARY", "OUTCOME_UNKNOWN", "PERMISSION_REVOKED",
  "NATIVE_CRASH_REPRODUCTION", "FIELD_WORKER_FINANCIAL_ISOLATION", "CROSS_WORKSPACE_ISOLATION", "SECRET_SCAN",
  "MALFORMED_JSON", "PROMPT_INJECTION", "POSTGRES_RESTART_READBACK", "CONTRACT_STATIC_VALIDATION",
]);

const correctionReview = readArtifactJson(
  report.correctionsSummary.evidencePath,
  "CORRECTION_REVIEW",
  "REVALIDATION_CORRECTION_SUMMARY",
);
const correctionIds = new Set();
const correctedFindingIds = new Set();
const resolvedFindingIds = new Set();
for (const correction of correctionReview.corrections) {
  assert(!correctionIds.has(correction.id), `REVALIDATION_CORRECTION_ID_DUPLICATE:${correction.id}`);
  assert(!correctedFindingIds.has(correction.findingId), `REVALIDATION_FINDING_CORRECTED_TWICE:${correction.findingId}`);
  assert(findingsById.has(correction.findingId), `REVALIDATION_CORRECTION_FINDING_UNKNOWN:${correction.findingId}`);
  correctionIds.add(correction.id);
  correctedFindingIds.add(correction.findingId);
  if (correction.applied) {
    const patchArtifact = artifactsByPath.get(correction.patchPath);
    assert(Boolean(patchArtifact), `REVALIDATION_CORRECTION_PATCH_MISSING:${correction.id}`);
    assert(patchArtifact.sha256.toLowerCase() === correction.patchSha256.toLowerCase(), `REVALIDATION_CORRECTION_PATCH_HASH_MISMATCH:${correction.id}`);
  } else {
    assert(correction.patchPath === null && correction.patchSha256 === null, `REVALIDATION_CORRECTION_PATCH_UNEXPECTED:${correction.id}`);
  }
  if (correction.reviewCompleted) {
    assert(correction.reviewVerdict !== null, `REVALIDATION_CORRECTION_REVIEW_VERDICT_MISSING:${correction.id}`);
    assert(correction.reviewerType !== null && typeof correction.reviewerIdentity === "string", `REVALIDATION_CORRECTION_REVIEWER_MISSING:${correction.id}`);
    const reviewArtifact = artifactsByPath.get(correction.reviewEvidencePath);
    assert(Boolean(reviewArtifact), `REVALIDATION_CORRECTION_REVIEW_EVIDENCE_MISSING:${correction.id}`);
    assert(reviewArtifact.sha256.toLowerCase() === correction.reviewEvidenceSha256.toLowerCase(), `REVALIDATION_CORRECTION_REVIEW_HASH_MISMATCH:${correction.id}`);
  } else {
    assert(
      correction.reviewVerdict === null && correction.reviewerType === null && correction.reviewerIdentity === null && correction.reviewEvidencePath === null && correction.reviewEvidenceSha256 === null,
      `REVALIDATION_CORRECTION_REVIEW_UNEXPECTED:${correction.id}`,
    );
  }
  if (correction.resolved) {
    assert(correction.reviewCompleted && correction.reviewVerdict === "PASS", `REVALIDATION_RESOLVED_FINDING_NOT_REVIEWED:${correction.findingId}`);
    const finding = findingsById.get(correction.findingId);
    if (["P0", "P1"].includes(finding.severity)) {
      assert(["DISTINCT_MODEL", "HUMAN"].includes(correction.reviewerType), `REVALIDATION_CRITICAL_FINDING_SELF_REVIEWED:${correction.findingId}`);
      if (correction.reviewerType === "DISTINCT_MODEL") {
        assert(correction.reviewerIdentity !== report.models.codexAudit.requestedModel, `REVALIDATION_CRITICAL_FINDING_REVIEWER_NOT_DISTINCT:${correction.findingId}`);
      }
    }
    resolvedFindingIds.add(correction.findingId);
  }
}
assert(report.correctionsSummary.applied === correctionReview.corrections.filter((item) => item.applied).length, "REVALIDATION_CORRECTIONS_APPLIED_NOT_DERIVED");
assert(
  report.correctionsSummary.reviewsCompleted === correctionReview.corrections.filter((item) => item.reviewCompleted).length,
  "REVALIDATION_CORRECTION_REVIEWS_NOT_DERIVED",
);

const allFindings = [...findingsById.values()];
const countSeverity = (severity) => allFindings.filter((finding) => finding.severity === severity).length;
const openFindings = allFindings.filter((finding) => !resolvedFindingIds.has(finding.id));
assert(report.findingsSummary.total === allFindings.length, "REVALIDATION_FINDING_TOTAL_NOT_DERIVED");
assert(report.findingsSummary.p0 === countSeverity("P0"), "REVALIDATION_FINDING_P0_NOT_DERIVED");
assert(report.findingsSummary.p1 === countSeverity("P1"), "REVALIDATION_FINDING_P1_NOT_DERIVED");
assert(report.findingsSummary.p2 === countSeverity("P2"), "REVALIDATION_FINDING_P2_NOT_DERIVED");
assert(report.findingsSummary.p3 === countSeverity("P3"), "REVALIDATION_FINDING_P3_NOT_DERIVED");
assert(report.findingsSummary.open === openFindings.length, "REVALIDATION_FINDING_OPEN_NOT_DERIVED");
assert(report.findingsSummary.resolved === resolvedFindingIds.size, "REVALIDATION_FINDING_RESOLVED_NOT_DERIVED");
assert(report.findingsSummary.openP0 === openFindings.filter((finding) => finding.severity === "P0").length, "REVALIDATION_OPEN_P0_NOT_DERIVED");
assert(report.findingsSummary.openP1 === openFindings.filter((finding) => finding.severity === "P1").length, "REVALIDATION_OPEN_P1_NOT_DERIVED");

const metricEvidence = readArtifactJson(report.metrics.evidencePath, "METRIC_REPORT", "REVALIDATION_METRIC_REPORT");
const metricKeys = [
  "startRoadmapPercent",
  "startLocalBuildReadinessPercent",
  "startC2Completed",
  "startC2Total",
  "startRealProviderCustomerReadiness",
  "startVerifiedE2EPercent",
  "roadmapPercent",
  "localBuildReadinessPercent",
  "c2Completed",
  "c2Total",
  "realProviderCustomerReadiness",
  "verifiedE2EPercent",
];
for (const key of metricKeys) {
  assert(Object.hasOwn(metricEvidence, key), `REVALIDATION_METRIC_EVIDENCE_FIELD_MISSING:${key}`);
  assert(metricEvidence[key] === report.metrics[key], `REVALIDATION_METRIC_EVIDENCE_MISMATCH:${key}`);
}
const metricRubricKeys = [
  "roadmap",
  "localBuildReadiness",
  "c2",
  "realProviderCustomerReadiness",
  "verifiedE2E",
];
const rubricValues = {
  roadmap: [report.metrics.startRoadmapPercent, report.metrics.roadmapPercent],
  localBuildReadiness: [report.metrics.startLocalBuildReadinessPercent, report.metrics.localBuildReadinessPercent],
  c2: [
    `${report.metrics.startC2Completed}/${report.metrics.startC2Total}`,
    `${report.metrics.c2Completed}/${report.metrics.c2Total}`,
  ],
  realProviderCustomerReadiness: [
    report.metrics.startRealProviderCustomerReadiness,
    report.metrics.realProviderCustomerReadiness,
  ],
  verifiedE2E: [report.metrics.startVerifiedE2EPercent, report.metrics.verifiedE2EPercent],
};
assert(metricEvidence.rubrics && typeof metricEvidence.rubrics === "object", "REVALIDATION_METRIC_RUBRICS_MISSING");
for (const key of metricRubricKeys) {
  const rubric = metricEvidence.rubrics[key];
  assert(rubric && typeof rubric === "object", `REVALIDATION_METRIC_RUBRIC_MISSING:${key}`);
  assert(typeof rubric.changedFromStart === "boolean", `REVALIDATION_METRIC_CHANGED_FLAG_MISSING:${key}`);
  assert(typeof rubric.rubricCrossed === "boolean", `REVALIDATION_METRIC_CROSSED_FLAG_MISSING:${key}`);
  assert(Array.isArray(rubric.evidencePaths) && rubric.evidencePaths.length > 0, `REVALIDATION_METRIC_RUBRIC_EVIDENCE_MISSING:${key}`);
  assert(rubric.evidencePaths.length === rubric.evidenceSha256.length, `REVALIDATION_METRIC_RUBRIC_HASH_COUNT_INVALID:${key}`);
  const [startValue, finalValue] = rubricValues[key];
  assert(rubric.startValue === startValue, `REVALIDATION_METRIC_RUBRIC_START_MISMATCH:${key}`);
  assert(rubric.finalValue === finalValue, `REVALIDATION_METRIC_RUBRIC_FINAL_MISMATCH:${key}`);
  const changedFromStart = startValue !== finalValue;
  assert(rubric.changedFromStart === changedFromStart, `REVALIDATION_METRIC_CHANGED_FLAG_INCORRECT:${key}`);
  assert(rubric.rubricCrossed === changedFromStart, `REVALIDATION_METRIC_RUBRIC_CROSSING_MISMATCH:${key}`);
  const rubricContract = requireLinkedArtifact(
    rubric.rubricContractPath,
    rubric.rubricContractSha256,
    `REVALIDATION_METRIC_RUBRIC_CONTRACT:${key}`,
    "EVALUATION_CONTRACT",
  );
  assert(rubricContract.origin !== "RUN_GENERATED", `REVALIDATION_METRIC_RUBRIC_CONTRACT_NOT_VERSIONED:${key}`);
  requireLinkedArtifact(
    rubric.calculationEvidencePath,
    rubric.calculationEvidenceSha256,
    `REVALIDATION_METRIC_CALCULATION:${key}`,
    "METRIC_CALCULATION",
  );
  const calculation = readArtifactJson(
    rubric.calculationEvidencePath,
    "METRIC_CALCULATION",
    `REVALIDATION_METRIC_CALCULATION:${key}`,
  );
  assert(calculation.metric === key, `REVALIDATION_METRIC_CALCULATION_NAME_MISMATCH:${key}`);
  assert(calculation.startValue === startValue, `REVALIDATION_METRIC_CALCULATION_START_MISMATCH:${key}`);
  assert(calculation.finalValue === finalValue, `REVALIDATION_METRIC_CALCULATION_FINAL_MISMATCH:${key}`);
  assert(calculation.rubricCrossed === changedFromStart, `REVALIDATION_METRIC_CALCULATION_CROSSING_MISMATCH:${key}`);
  assert(calculation.rubricContractSha256.toLowerCase() === rubric.rubricContractSha256.toLowerCase(), `REVALIDATION_METRIC_CALCULATION_CONTRACT_MISMATCH:${key}`);
  assert(calculation.calculationCommandId === rubric.calculationCommandId, `REVALIDATION_METRIC_CALCULATION_COMMAND_MISMATCH:${key}`);
  const calculationCommand = commandsById.get(rubric.calculationCommandId);
  assert(Boolean(calculationCommand), `REVALIDATION_METRIC_CALCULATION_COMMAND_UNKNOWN:${key}`);
  assert(
    calculationCommand.phase === "G7" &&
      calculationCommand.classification === "METRIC_CALCULATION" &&
      calculationCommand.exitCode === calculationCommand.expectedExitCode &&
      calculationCommand.exitCode === 0,
    `REVALIDATION_METRIC_CALCULATION_COMMAND_FAILED:${key}`,
  );
  assert(calculationCommand.stdoutPath === rubric.calculationEvidencePath, `REVALIDATION_METRIC_CALCULATION_NOT_COMMAND_STDOUT:${key}`);
  assert(calculationCommand.stdoutSha256.toLowerCase() === rubric.calculationEvidenceSha256.toLowerCase(), `REVALIDATION_METRIC_CALCULATION_STDOUT_HASH_MISMATCH:${key}`);
  assert(calculationCommand.replay?.entrypointPath === rubric.rubricContractPath, `REVALIDATION_METRIC_REPLAY_CONTRACT_PATH_MISMATCH:${key}`);
  assert(calculationCommand.replay?.entrypointSha256.toLowerCase() === rubric.rubricContractSha256.toLowerCase(), `REVALIDATION_METRIC_REPLAY_CONTRACT_HASH_MISMATCH:${key}`);
  replayCommand(calculationCommand, `REVALIDATION_METRIC_CALCULATION:${key}`);
  assert(calculation.evidencePaths.length === calculation.evidenceSha256.length, `REVALIDATION_METRIC_CALCULATION_HASH_COUNT_INVALID:${key}`);
  assert(
    JSON.stringify(calculation.evidencePaths) === JSON.stringify(rubric.evidencePaths) &&
      JSON.stringify(calculation.evidenceSha256.map((value) => value.toLowerCase())) ===
        JSON.stringify(rubric.evidenceSha256.map((value) => value.toLowerCase())),
    `REVALIDATION_METRIC_CALCULATION_EVIDENCE_MISMATCH:${key}`,
  );
  for (const [index, evidencePath] of rubric.evidencePaths.entries()) {
    const artifact = artifactsByPath.get(evidencePath);
    assert(Boolean(artifact), `REVALIDATION_METRIC_RUBRIC_ARTIFACT_MISSING:${key}:${evidencePath}`);
    assert(artifact.sha256.toLowerCase() === rubric.evidenceSha256[index].toLowerCase(), `REVALIDATION_METRIC_RUBRIC_HASH_MISMATCH:${key}:${evidencePath}`);
  }
}
assert(report.metrics.startC2Completed <= report.metrics.startC2Total, "REVALIDATION_START_C2_COUNTS_INVALID");
assert(report.metrics.c2Completed <= report.metrics.c2Total, "REVALIDATION_C2_COUNTS_INVALID");

let criticalInvariants = [];
if (report.evaluation.invariantManifestPath === null) {
  assert(
    report.evaluation.criticalInvariantsTotal === 0 &&
      report.evaluation.criticalInvariantsObserved === 0 &&
      report.evaluation.criticalInvariantsPassed === 0 &&
      report.evaluation.criticalInvariantsFailed === 0,
    "REVALIDATION_INVARIANT_MANIFEST_MISSING_FOR_COUNTS",
  );
} else {
  const invariantManifest = readArtifactJson(
    report.evaluation.invariantManifestPath,
    "INVARIANT_MANIFEST",
    "REVALIDATION_INVARIANT_MANIFEST",
  );
  const invariantIds = new Set();
  for (const invariant of invariantManifest.invariants) {
    assert(!invariantIds.has(invariant.id), `REVALIDATION_INVARIANT_ID_DUPLICATE:${invariant.id}`);
    invariantIds.add(invariant.id);
    assert(invariant.evidencePaths.length === invariant.evidenceSha256.length, `REVALIDATION_INVARIANT_HASH_COUNT_INVALID:${invariant.id}`);
    if (invariant.observed) {
      assert(typeof invariant.passed === "boolean", `REVALIDATION_INVARIANT_RESULT_MISSING:${invariant.id}`);
      assert(invariant.evidencePaths.length === 1, `REVALIDATION_INVARIANT_RESULT_RECORD_COUNT_INVALID:${invariant.id}`);
      const resultArtifact = requireLinkedArtifact(
        invariant.evidencePaths[0],
        invariant.evidenceSha256[0],
        `REVALIDATION_INVARIANT_RESULT:${invariant.id}`,
        "INVARIANT_RESULT",
      );
      const invariantResult = readArtifactJson(resultArtifact.path, "INVARIANT_RESULT", `REVALIDATION_INVARIANT_RESULT:${invariant.id}`);
      assert(invariantResult.invariantId === invariant.id, `REVALIDATION_INVARIANT_RESULT_ID_MISMATCH:${invariant.id}`);
      assert(invariant.passed === (invariantResult.result === "PASS"), `REVALIDATION_INVARIANT_RESULT_NOT_DERIVED:${invariant.id}`);
      assert(invariantResult.evidencePaths.length === invariantResult.evidenceSha256.length, `REVALIDATION_INVARIANT_SUPPORT_HASH_COUNT_INVALID:${invariant.id}`);
      for (const [index, evidencePath] of invariantResult.evidencePaths.entries()) {
        requireLinkedArtifact(evidencePath, invariantResult.evidenceSha256[index], `REVALIDATION_INVARIANT_SUPPORT:${invariant.id}`);
      }
      if (invariantResult.method === "AUTOMATED") {
        assert(typeof invariantResult.commandId === "string", `REVALIDATION_INVARIANT_COMMAND_MISSING:${invariant.id}`);
        assert(invariantResult.deviceEvidencePath === null && invariantResult.deviceEvidenceSha256 === null, `REVALIDATION_INVARIANT_DEVICE_PROOF_UNEXPECTED:${invariant.id}`);
        const command = commandsById.get(invariantResult.commandId);
        assert(Boolean(command), `REVALIDATION_INVARIANT_COMMAND_UNKNOWN:${invariant.id}`);
        assert(command.phase !== "G6", `REVALIDATION_LOCAL_INVARIANT_DERIVED_FROM_PROVIDER:${invariant.id}`);
        assert(command.classification === "INVARIANT_CHECK", `REVALIDATION_INVARIANT_COMMAND_CLASS_INVALID:${invariant.id}`);
        assert(command.stdoutPath === resultArtifact.path, `REVALIDATION_INVARIANT_RESULT_NOT_COMMAND_STDOUT:${invariant.id}`);
        assert(command.stdoutSha256.toLowerCase() === resultArtifact.sha256.toLowerCase(), `REVALIDATION_INVARIANT_RESULT_STDOUT_HASH_MISMATCH:${invariant.id}`);
        replayCommand(command, `REVALIDATION_INVARIANT:${invariant.id}`);
        assert((command.exitCode === 0) === (invariantResult.result === "PASS"), `REVALIDATION_INVARIANT_COMMAND_RESULT_MISMATCH:${invariant.id}`);
      } else {
        assert(invariantResult.method === "DEVICE", `REVALIDATION_INVARIANT_METHOD_INVALID:${invariant.id}`);
        assert(invariantResult.commandId === null, `REVALIDATION_DEVICE_INVARIANT_COMMAND_UNEXPECTED:${invariant.id}`);
        const deviceArtifact = requireLinkedArtifact(
          invariantResult.deviceEvidencePath,
          invariantResult.deviceEvidenceSha256,
          `REVALIDATION_DEVICE_INVARIANT_EVIDENCE:${invariant.id}`,
          "DEVICE_OBSERVATION",
        );
        assert(report.evaluation.deviceObservationEvidencePath === deviceArtifact.path, `REVALIDATION_DEVICE_INVARIANT_NOT_LINKED_TO_OBSERVATION:${invariant.id}`);
      }
    } else {
      assert(invariant.passed === null, `REVALIDATION_UNOBSERVED_INVARIANT_RESULT_PRESENT:${invariant.id}`);
      assert(invariant.evidencePaths.length === 0, `REVALIDATION_UNOBSERVED_INVARIANT_EVIDENCE_PRESENT:${invariant.id}`);
    }
  }
  criticalInvariants = invariantManifest.invariants.filter((invariant) => invariant.critical);
  const observedCritical = criticalInvariants.filter((invariant) => invariant.observed);
  assert(report.evaluation.criticalInvariantsTotal === criticalInvariants.length, "REVALIDATION_INVARIANT_TOTAL_NOT_DERIVED");
  assert(report.evaluation.criticalInvariantsObserved === observedCritical.length, "REVALIDATION_INVARIANT_OBSERVED_NOT_DERIVED");
  assert(report.evaluation.criticalInvariantsPassed === observedCritical.filter((invariant) => invariant.passed).length, "REVALIDATION_INVARIANT_PASSED_NOT_DERIVED");
  assert(report.evaluation.criticalInvariantsFailed === observedCritical.filter((invariant) => !invariant.passed).length, "REVALIDATION_INVARIANT_FAILED_NOT_DERIVED");
}
if (phases.get("G5").status === "PASS") {
  for (const invariantId of ["HIDDEN_ORACLE_ACCESS_DENIED", "SYNTHETIC_CORPUS_NO_PII"]) {
    const invariant = criticalInvariants.find((candidate) => candidate.id === invariantId);
    assert(Boolean(invariant), `REVALIDATION_REQUIRED_CRITICAL_INVARIANT_MISSING:${invariantId}`);
    assert(invariant.observed === true && invariant.passed === true, `REVALIDATION_REQUIRED_CRITICAL_INVARIANT_NOT_PASSED:${invariantId}`);
  }
}
assert(report.evaluation.secretsSerializedInSeal === false, "REVALIDATION_SECRET_SERIALIZED_IN_SEAL");

const validateModelEvidence = (key, model) => {
  if (["codexAstraProbe", "codexAudit"].includes(key)) {
    assert(typeof model.clientVersion === "string" && model.clientVersion.length > 0, `REVALIDATION_CODEX_CLIENT_VERSION_MISSING:${key}`);
  } else {
    assert(model.clientVersion === null, `REVALIDATION_RUNTIME_CLIENT_VERSION_UNEXPECTED:${key}`);
  }
  const hasObservedTrace = ["REQUESTED_MODEL_OBSERVED", "SERVED_MODEL_CONFIRMED", "SERVED_MODEL_MISMATCH", "UNAVAILABLE"].includes(model.access);
  if (hasObservedTrace) {
    assert(typeof model.requestedModel === "string" && model.requestedModel.length > 0, `REVALIDATION_MODEL_REQUEST_MISSING:${key}`);
    assert(typeof model.observedAt === "string", `REVALIDATION_MODEL_TIME_MISSING:${key}`);
    const expectedRole = key === "codexAudit" ? "FINDING_REPORT" : "RAW_OUTPUT";
    const traceArtifact = requireArtifact(model.tracePath, expectedRole, `REVALIDATION_MODEL_TRACE:${key}`);
    assert(hashPattern.test(model.traceSha256 ?? ""), `REVALIDATION_MODEL_TRACE_HASH_MISSING:${key}`);
    assert(traceArtifact.sha256.toLowerCase() === model.traceSha256.toLowerCase(), `REVALIDATION_MODEL_TRACE_HASH_MISMATCH:${key}`);
  }
  if (model.access === "REQUESTED_MODEL_OBSERVED") {
    assert(model.servedModel === null && model.endpoint === null && model.requestId === null, `REVALIDATION_REQUEST_ONLY_OVERCLAIM:${key}`);
  }
  if (model.access === "SERVED_MODEL_CONFIRMED") {
    for (const field of ["servedModel", "endpoint", "requestId"]) {
      assert(typeof model[field] === "string" && model[field].length > 0, `REVALIDATION_SERVED_MODEL_PROOF_MISSING:${key}:${field}`);
    }
    assert(model.requestedModel === model.servedModel, `REVALIDATION_SILENT_MODEL_FALLBACK:${key}`);
  }
  if (model.access === "SERVED_MODEL_MISMATCH") {
    for (const field of ["servedModel", "endpoint", "requestId"]) {
      assert(typeof model[field] === "string" && model[field].length > 0, `REVALIDATION_MISMATCH_MODEL_PROOF_MISSING:${key}:${field}`);
    }
    assert(model.requestedModel !== model.servedModel, `REVALIDATION_MODEL_MISMATCH_NOT_OBSERVED:${key}`);
  }
  if (model.access === "UNAVAILABLE") {
    assert(model.servedModel === null && model.endpoint === null && model.requestId === null, `REVALIDATION_UNAVAILABLE_MODEL_OVERCLAIM:${key}`);
  }
  if (["UNPROBED", "NOT_APPLICABLE"].includes(model.access)) {
    for (const field of ["servedModel", "endpoint", "requestId", "observedAt", "tracePath", "traceSha256"]) {
      assert(model[field] === null, `REVALIDATION_UNPROBED_MODEL_PROOF_PRESENT:${key}:${field}`);
    }
    if (model.access === "NOT_APPLICABLE") {
      assert(model.requestedModel === null, `REVALIDATION_NOT_APPLICABLE_MODEL_REQUEST_PRESENT:${key}`);
    }
  }
};

for (const [key, model] of Object.entries(report.models)) validateModelEvidence(key, model);

const modelUnavailableStatus = report.orthogonalStatuses.includes("NO_RUN_MODEL_UNAVAILABLE");
assert(
  modelUnavailableStatus === (report.models.codexAstraProbe.access === "UNAVAILABLE"),
  "REVALIDATION_MODEL_UNAVAILABLE_STATUS_MISMATCH",
);
if (["PASS", "REWORK"].includes(g2Status)) {
  assert(report.models.codexAudit.access === "REQUESTED_MODEL_OBSERVED", "REVALIDATION_CODEX_AUDIT_REQUEST_NOT_OBSERVED");
}
if (g2Status === "NOT_RUN") {
  assert(report.models.codexAudit.access === "UNPROBED", "REVALIDATION_CODEX_AUDIT_UNEXPECTED_WITH_G2_NOT_RUN");
}

const deviceNotPerformed = report.orthogonalStatuses.includes("DEVICE_OBSERVATION_NOT_PERFORMED");
if (report.evaluation.deviceObservationStatus === "NOT_PERFORMED") {
  assert(deviceNotPerformed, "REVALIDATION_DEVICE_NOT_PERFORMED_STATUS_MISSING");
  assert(report.evaluation.deviceObservationEvidencePath === null, "REVALIDATION_DEVICE_EVIDENCE_UNEXPECTED");
} else {
  assert(!deviceNotPerformed, "REVALIDATION_DEVICE_NOT_PERFORMED_STATUS_UNEXPECTED");
  requireArtifact(report.evaluation.deviceObservationEvidencePath, "DEVICE_OBSERVATION", "REVALIDATION_DEVICE_OBSERVATION");
}

const numbersEqual = (left, right, tolerance = 1e-8) =>
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
const ceilCad = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const percentile95 = (values) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};
const g5Passed = phases.get("G5").status === "PASS";
let corpus = null;
let oracleProof = null;
let oracleManifest = null;
const corpusCasesById = new Map();
const oracleEntriesByCaseId = new Map();
const modelProfilesByProfile = new Map();
if (report.evaluation.corpusManifestPath !== null) {
  corpus = readArtifactJson(report.evaluation.corpusManifestPath, "CORPUS_MANIFEST", "REVALIDATION_CORPUS_MANIFEST");
  assert(corpus.totalCaseCount === corpus.cases.length, "REVALIDATION_CORPUS_TOTAL_NOT_DERIVED");
  assert(corpus.developmentCaseCount === corpus.cases.filter((item) => item.split === "DEVELOPMENT").length, "REVALIDATION_CORPUS_DEVELOPMENT_NOT_DERIVED");
  assert(corpus.hiddenCaseCount === corpus.cases.filter((item) => item.split === "HIDDEN").length, "REVALIDATION_CORPUS_HIDDEN_NOT_DERIVED");
  assert(corpus.familyCount === new Set(corpus.cases.map((item) => item.family)).size, "REVALIDATION_CORPUS_FAMILY_COUNT_NOT_DERIVED");
  const corpusCountsByFamily = new Map();
  for (const testCase of corpus.cases) {
    if (!corpusCountsByFamily.has(testCase.family)) corpusCountsByFamily.set(testCase.family, { development: 0, hidden: 0 });
    const counts = corpusCountsByFamily.get(testCase.family);
    if (testCase.split === "DEVELOPMENT") counts.development += 1;
    if (testCase.split === "HIDDEN") counts.hidden += 1;
  }
  for (const [family, counts] of corpusCountsByFamily) {
    assert(counts.development === 8 && counts.hidden === 4, `REVALIDATION_CORPUS_FAMILY_STRATIFICATION_INVALID:${family}`);
  }
  assert(report.evaluation.developmentCaseCount === corpus.developmentCaseCount, "REVALIDATION_CORPUS_DEVELOPMENT_COUNT_MISMATCH");
  assert(report.evaluation.hiddenCaseCount === corpus.hiddenCaseCount, "REVALIDATION_CORPUS_HIDDEN_COUNT_MISMATCH");
  requireLinkedArtifact(corpus.promptPath, corpus.promptSha256, "REVALIDATION_CORPUS_PROMPT", "EVALUATION_CONTRACT");
  requireLinkedArtifact(corpus.toolSchemaPath, corpus.toolSchemaSha256, "REVALIDATION_CORPUS_TOOL_SCHEMA", "EVALUATION_CONTRACT");
  const loadModelProfile = (profile, path, expectedSha256) => {
    const artifact = requireLinkedArtifact(path, expectedSha256, `REVALIDATION_MODEL_PROFILE:${profile}`, "EVALUATION_CONTRACT");
    assert(artifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_MODEL_PROFILE_NOT_FROZEN:${profile}`);
    const value = readJson(resolveArtifactPath(path), `REVALIDATION_MODEL_PROFILE_JSON_INVALID:${profile}`);
    assert(value && typeof value === "object" && !Array.isArray(value), `REVALIDATION_MODEL_PROFILE_OBJECT_INVALID:${profile}`);
    const expectedKeys = ["endpoint", "kind", "maxOutputTokens", "model", "profile", "promptPath", "promptSha256", "provider", "reasoning", "schemaVersion", "temperature", "timeoutMs", "toolSchemaPath", "toolSchemaSha256"];
    assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expectedKeys.sort()), `REVALIDATION_MODEL_PROFILE_SHAPE_INVALID:${profile}`);
    assert(value.kind === "MODEL_PROFILE" && value.schemaVersion === "1.0", `REVALIDATION_MODEL_PROFILE_KIND_INVALID:${profile}`);
    assert(value.profile === profile && value.provider === "OPENROUTER", `REVALIDATION_MODEL_PROFILE_IDENTITY_INVALID:${profile}`);
    assert(typeof value.model === "string" && value.model.length > 0, `REVALIDATION_MODEL_PROFILE_MODEL_INVALID:${profile}`);
    assert(typeof value.endpoint === "string" && value.endpoint.length > 0, `REVALIDATION_MODEL_PROFILE_ENDPOINT_INVALID:${profile}`);
    assert(Number.isInteger(value.maxOutputTokens) && value.maxOutputTokens > 0, `REVALIDATION_MODEL_PROFILE_OUTPUT_CAP_INVALID:${profile}`);
    assert(Number.isInteger(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 300000, `REVALIDATION_MODEL_PROFILE_TIMEOUT_INVALID:${profile}`);
    assert(value.reasoning === null || (typeof value.reasoning === "object" && !Array.isArray(value.reasoning)), `REVALIDATION_MODEL_PROFILE_REASONING_INVALID:${profile}`);
    assert(value.temperature === null || Number.isFinite(value.temperature), `REVALIDATION_MODEL_PROFILE_TEMPERATURE_INVALID:${profile}`);
    assert(typeof value.promptPath === "string" && hashPattern.test(value.promptSha256), `REVALIDATION_MODEL_PROFILE_PROMPT_REFERENCE_INVALID:${profile}`);
    assert(typeof value.toolSchemaPath === "string" && hashPattern.test(value.toolSchemaSha256), `REVALIDATION_MODEL_PROFILE_TOOL_REFERENCE_INVALID:${profile}`);
    assert(value.promptPath === corpus.promptPath && value.promptSha256.toLowerCase() === corpus.promptSha256.toLowerCase(), `REVALIDATION_MODEL_PROFILE_PROMPT_MISMATCH:${profile}`);
    assert(value.toolSchemaPath === corpus.toolSchemaPath && value.toolSchemaSha256.toLowerCase() === corpus.toolSchemaSha256.toLowerCase(), `REVALIDATION_MODEL_PROFILE_TOOL_SCHEMA_MISMATCH:${profile}`);
    modelProfilesByProfile.set(profile, value);
  };
  loadModelProfile("BASELINE", corpus.baselineProfilePath, corpus.baselineProfileSha256);
  loadModelProfile("CANDIDATE", corpus.candidateProfilePath, corpus.candidateProfileSha256);
  for (const testCase of corpus.cases) {
    assert(!corpusCasesById.has(testCase.caseId), `REVALIDATION_CORPUS_CASE_DUPLICATE:${testCase.caseId}`);
    corpusCasesById.set(testCase.caseId, testCase);
    requireLinkedArtifact(testCase.inputPath, testCase.inputSha256, `REVALIDATION_CORPUS_INPUT:${testCase.caseId}`, "CORPUS_INPUT");
  }
}
if (report.evaluation.oracleProtectionEvidencePath !== null) {
  oracleProof = readArtifactJson(
    report.evaluation.oracleProtectionEvidencePath,
    "ORACLE_PROTECTION",
    "REVALIDATION_ORACLE_PROTECTION",
  );
  assert(report.evaluation.hiddenOraclesProtected === oracleProof.hiddenOraclesProtected, "REVALIDATION_ORACLE_PROTECTION_MISMATCH");
  const oracleManifestArtifact = requireLinkedArtifact(oracleProof.oracleManifestPath, oracleProof.oracleManifestSha256, "REVALIDATION_ORACLE_MANIFEST", "ORACLE_MANIFEST");
  assert(oracleManifestArtifact.origin === "CAMPAIGN_HEAD_BLOB", "REVALIDATION_ORACLE_MANIFEST_NOT_FROZEN_AT_CAMPAIGN_HEAD");
  oracleManifest = readArtifactJson(oracleProof.oracleManifestPath, "ORACLE_MANIFEST", "REVALIDATION_ORACLE_MANIFEST");
  assert(Boolean(corpus), "REVALIDATION_ORACLE_WITHOUT_CORPUS");
  for (const entry of oracleManifest.entries) {
    assert(!oracleEntriesByCaseId.has(entry.caseId), `REVALIDATION_ORACLE_CASE_DUPLICATE:${entry.caseId}`);
    oracleEntriesByCaseId.set(entry.caseId, entry);
    const testCase = corpusCasesById.get(entry.caseId);
    assert(Boolean(testCase) && testCase.split === "HIDDEN", `REVALIDATION_ORACLE_CASE_NOT_HIDDEN:${entry.caseId}`);
    const oracleEntryArtifact = requireLinkedArtifact(entry.oracleEntryPath, entry.oracleEntrySha256, `REVALIDATION_ORACLE_ENTRY:${entry.caseId}`, "SUPPORTING_EVIDENCE");
    assert(oracleEntryArtifact.origin === "CAMPAIGN_HEAD_BLOB", `REVALIDATION_ORACLE_ENTRY_NOT_FROZEN_AT_CAMPAIGN_HEAD:${entry.caseId}`);
  }
  assert(oracleManifest.entries.length === corpus.hiddenCaseCount, "REVALIDATION_ORACLE_CASE_COUNT_INVALID");
  requireLinkedArtifact(
    oracleProof.protectionEvidencePath,
    oracleProof.protectionEvidenceSha256,
    "REVALIDATION_ORACLE_ACCESS_PROOF",
    "SUPPORTING_EVIDENCE",
  );
}
if (g5Passed) {
  assert(Boolean(corpus), "REVALIDATION_G5_CORPUS_MANIFEST_MISSING");
  assert(Boolean(oracleProof), "REVALIDATION_G5_ORACLE_PROTECTION_MISSING");
  assert(Boolean(oracleManifest), "REVALIDATION_G5_ORACLE_MANIFEST_MISSING");
  assert(corpus.developmentCaseCount === 64, "REVALIDATION_G5_DEVELOPMENT_CASE_COUNT_INVALID");
  assert(corpus.hiddenCaseCount === 32, "REVALIDATION_G5_HIDDEN_CASE_COUNT_INVALID");
  assert(corpus.totalCaseCount === 96, "REVALIDATION_G5_TOTAL_CASE_COUNT_INVALID");
  assert(corpus.familyCount === 8, "REVALIDATION_G5_FAMILY_COUNT_INVALID");
  assert(oracleProof.hiddenOraclesProtected === true, "REVALIDATION_ORACLE_PROTECTION_FALSE");
  assert(oracleProof.candidateAccess === "DENIED", "REVALIDATION_ORACLE_CANDIDATE_ACCESS_INVALID");
}

const brainClosure = readArtifactJson(
  report.evaluation.brainClosureEvidencePath,
  report.evaluation.brainClosureMode === "CHECKPOINT" ? "BRAIN_CHECKPOINT" : "BRAIN_PACKET",
  "REVALIDATION_BRAIN_CLOSURE",
);
for (const [field, expected] of [
  ["startHead", report.source.brainStartHead],
  ["startTree", report.source.brainStartTree],
  ["finalHead", report.source.brainFinalHead],
  ["finalTree", report.source.brainFinalTree],
]) {
  assert(brainClosure[field] === expected, `REVALIDATION_BRAIN_CLOSURE_MISMATCH:${field}`);
}
if (report.evaluation.brainClosureMode === "CHECKPOINT") {
  assert(brainStatus === "", "REVALIDATION_BRAIN_CHECKPOINT_WORKTREE_DIRTY");
  assert(brainClosure.worktreeClean === true, "REVALIDATION_BRAIN_CHECKPOINT_NOT_CLEAN");
  assert(brainClosure.validationExitCode === 0, "REVALIDATION_BRAIN_CHECKPOINT_VALIDATION_FAILED");
  const checkpointCommand = commandsById.get(brainClosure.validationCommandId);
  assert(Boolean(checkpointCommand), "REVALIDATION_BRAIN_CHECKPOINT_COMMAND_MISSING");
  assert(
    checkpointCommand.phase === "G7" &&
      checkpointCommand.classification === "VALIDATION" &&
      checkpointCommand.expectedExitCode === 0 &&
      checkpointCommand.exitCode === 0,
    "REVALIDATION_BRAIN_CHECKPOINT_COMMAND_INVALID",
  );
  requireLinkedArtifact(brainClosure.evidencePath, brainClosure.evidenceSha256, "REVALIDATION_BRAIN_CHECKPOINT_EVIDENCE", "SUPPORTING_EVIDENCE");
} else {
  assert(report.source.brainFinalHead === report.source.brainStartHead, "REVALIDATION_BRAIN_PACKET_HEAD_MUTATED");
  assert(report.source.brainFinalTree === report.source.brainStartTree, "REVALIDATION_BRAIN_PACKET_TREE_MUTATED");
  assert(brainStatus !== "", "REVALIDATION_BRAIN_PACKET_WITH_CLEAN_WORKTREE");
  requireLinkedArtifact(brainClosure.packetPath, brainClosure.packetSha256, "REVALIDATION_BRAIN_PACKET_EVIDENCE", "SUPPORTING_EVIDENCE");
  const packetPaths = new Set();
  for (const item of brainClosure.includedEvidence) {
    assert(!packetPaths.has(item.path), `REVALIDATION_BRAIN_PACKET_EVIDENCE_DUPLICATE:${item.path}`);
    packetPaths.add(item.path);
    requireLinkedArtifact(item.path, item.sha256, "REVALIDATION_BRAIN_PACKET_INCLUDED_EVIDENCE");
  }
}

const baseIncidentObserved =
  report.evaluation.unauthorizedExternalTransportCount > 0 ||
  report.evaluation.customerDataUsed ||
  report.evaluation.secretLeakObserved;
const runtimeModelMismatch = [report.models.runtimeBaseline, report.models.runtimeCandidate].some(
  (model) => model.access === "SERVED_MODEL_MISMATCH",
);
const incidentRequired =
  baseIncidentObserved || runtimeModelMismatch || report.evaluation.providerRunStatus === "PILOT_STOPPED";
let incidentEvidence = null;
if (report.evaluation.incidentEvidencePath !== null) {
  incidentEvidence = readArtifactJson(
    report.evaluation.incidentEvidencePath,
    "INCIDENT_EVIDENCE",
    "REVALIDATION_INCIDENT_EVIDENCE",
  );
  assert(incidentEvidence.providerCallsCompleted === report.evaluation.providerCalls, "REVALIDATION_INCIDENT_CALL_COUNT_MISMATCH");
  assert(incidentEvidence.evidencePaths.length === incidentEvidence.evidenceSha256.length, "REVALIDATION_INCIDENT_HASH_COUNT_INVALID");
  for (const [index, path] of incidentEvidence.evidencePaths.entries()) {
    requireLinkedArtifact(path, incidentEvidence.evidenceSha256[index], "REVALIDATION_INCIDENT_SUPPORT", "SUPPORTING_EVIDENCE");
  }
  if (report.evaluation.unauthorizedExternalTransportCount > 0) {
    assert(incidentEvidence.categories.includes("UNAUTHORIZED_TRANSPORT"), "REVALIDATION_TRANSPORT_INCIDENT_CATEGORY_MISSING");
  }
  if (report.evaluation.customerDataUsed) {
    assert(incidentEvidence.categories.includes("CUSTOMER_DATA"), "REVALIDATION_CUSTOMER_DATA_INCIDENT_CATEGORY_MISSING");
  }
  if (report.evaluation.secretLeakObserved) {
    assert(incidentEvidence.categories.includes("SECRET_LEAK"), "REVALIDATION_SECRET_INCIDENT_CATEGORY_MISSING");
  }
  if (runtimeModelMismatch) {
    assert(incidentEvidence.categories.includes("MODEL_MISMATCH"), "REVALIDATION_MODEL_MISMATCH_INCIDENT_CATEGORY_MISSING");
  }
  if (report.evaluation.providerRunStatus === "PILOT_STOPPED") {
    assert(incidentEvidence.phase === "G6" && incidentEvidence.campaignStopped, "REVALIDATION_PILOT_STOP_INCIDENT_INVALID");
  }
}
assert(!incidentRequired || Boolean(incidentEvidence), "REVALIDATION_REQUIRED_INCIDENT_EVIDENCE_MISSING");
const incidentObserved = baseIncidentObserved || Boolean(incidentEvidence);
const localIncidentObserved = Boolean(incidentEvidence) && incidentEvidence.phase !== "G6";
const budgetBreakerIncidentObserved = Boolean(incidentEvidence?.categories.includes("BUDGET_BREAKER"));

const localPhaseStatuses = ["G0", "G1", "G2", "G3", "G4", "G5"].map((id) => phases.get(id).status);
const localOutcomePhaseStatuses = [...localPhaseStatuses, phases.get("G7").status];
const localQualityIssue =
  report.evaluation.deterministicFailures > 0 ||
  report.evaluation.criticalInvariantsTotal === 0 ||
  report.evaluation.criticalInvariantsObserved !== report.evaluation.criticalInvariantsTotal ||
  report.evaluation.criticalInvariantsFailed > 0 ||
  report.findingsSummary.openP0 > 0 ||
  report.findingsSummary.openP1 > 0 ||
  localIncidentObserved ||
  report.evaluation.brainClosureMode === "PACKET";
let expectedLocalResult;
if (localOutcomePhaseStatuses.includes("BLOCKED")) {
  expectedLocalResult = "LOCAL_REVALIDATION_BLOCKED";
} else if (localOutcomePhaseStatuses.every((status) => status === "PASS")) {
  expectedLocalResult = localQualityIssue
    ? "LOCAL_REVALIDATION_REWORK"
    : "LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED";
} else if (localOutcomePhaseStatuses.includes("REWORK") && localOutcomePhaseStatuses.every((status) => ["PASS", "REWORK"].includes(status))) {
  expectedLocalResult = "LOCAL_REVALIDATION_REWORK";
} else {
  fail("REVALIDATION_LOCAL_PHASE_COMBINATION_INVALID");
}
assert(report.localResult === expectedLocalResult, "REVALIDATION_LOCAL_RESULT_MISMATCH");

if (report.localResult === "LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED") {
  assert(report.evaluation.deterministicFailures === 0, "REVALIDATION_LOCAL_COMPLETE_HAS_FAILURES");
  assert(report.findingsSummary.openP0 === 0 && report.findingsSummary.openP1 === 0, "REVALIDATION_LOCAL_COMPLETE_CRITICAL_FINDINGS");
  assert(report.evaluation.criticalInvariantsTotal > 0, "REVALIDATION_LOCAL_COMPLETE_NO_CRITICAL_INVARIANTS");
  assert(
    report.evaluation.criticalInvariantsObserved === report.evaluation.criticalInvariantsTotal &&
      report.evaluation.criticalInvariantsFailed === 0,
    "REVALIDATION_LOCAL_COMPLETE_INVARIANTS_FAILED",
  );
  assert(!localIncidentObserved, "REVALIDATION_LOCAL_COMPLETE_INCIDENT_OBSERVED");
  assert(report.evaluation.brainClosureMode === "CHECKPOINT", "REVALIDATION_LOCAL_COMPLETE_BRAIN_NOT_CHECKPOINTED");
}

const providerOnlyFields = [
  "baselineDevelopmentEvaluated",
  "candidateDevelopmentEvaluated",
  "baselineHiddenEvaluated",
  "candidateHiddenEvaluated",
  "baselineHiddenPassed",
  "candidateHiddenPassed",
  "highRiskRegressionCount",
  "stabilityRepetitions",
  "authorizedBudgetCad",
  "worstCaseBudgetCad",
  "perCallCapCad",
  "fxUsdCad",
  "reserveMultiplier",
  "baselineCostPerSuccessCad",
  "candidateCostPerSuccessCad",
  "baselineP95DurationMs",
  "candidateP95DurationMs",
  "baselineOutputManifestPath",
  "candidateOutputManifestPath",
  "gradingManifestPath",
  "budgetAuthorityEvidencePath",
  "pricingEvidencePath",
  "costReceiptEvidencePath",
];
const providerStatus = report.evaluation.providerRunStatus;
let baselineOutput = null;
let candidateOutput = null;
let grading = null;
let pricingProof = null;
let costReceipt = null;
let budgetProof = null;
const outputEntriesByRequestId = new Map();
const requestNonces = new Set();

if (providerStatus === "NOT_STARTED") {
  assert(["NOT_APPLICABLE", "BLOCKED"].includes(phases.get("G6").status), "REVALIDATION_PROVIDERLESS_G6_INVALID");
  assert(report.providerVerdict === null, "REVALIDATION_PROVIDERLESS_VERDICT_INVALID");
  assert(report.adoptionDecision === null, "REVALIDATION_PROVIDERLESS_ADOPTION_INVALID");
  assert(report.evaluation.providerCalls === 0, "REVALIDATION_PROVIDERLESS_CALLS_INVALID");
  assert(report.evaluation.providerCostSettlementStatus === "NOT_APPLICABLE", "REVALIDATION_PROVIDERLESS_SETTLEMENT_STATUS_INVALID");
  assert(report.evaluation.unsettledProviderCalls === 0, "REVALIDATION_PROVIDERLESS_UNSETTLED_CALLS_INVALID");
  assert(report.evaluation.providerReconciliationStatus === "NOT_APPLICABLE", "REVALIDATION_PROVIDERLESS_RECONCILIATION_STATUS_INVALID");
  assert(report.evaluation.providerReconciledCalls === 0, "REVALIDATION_PROVIDERLESS_RECONCILED_CALLS_INVALID");
  assert(report.evaluation.settledSpendCad === 0, "REVALIDATION_PROVIDERLESS_SPEND_INVALID");
  for (const field of providerOnlyFields) {
    assert(report.evaluation[field] === null, `REVALIDATION_PROVIDERLESS_FIELD_PRESENT:${field}`);
  }
  assert(report.models.runtimeBaseline.access === "UNPROBED", "REVALIDATION_PROVIDERLESS_BASELINE_PROBED");
  assert(report.models.runtimeCandidate.access === "UNPROBED", "REVALIDATION_PROVIDERLESS_CANDIDATE_PROBED");
  assert(providerCommandsByRequestId.size === 0, "REVALIDATION_PROVIDERLESS_PROVIDER_COMMAND_PRESENT");
  for (const role of ["REQUEST_RECORD", "MODEL_OUTPUT", "TRANSPORT_FAILURE", "OUTPUT_MANIFEST", "COST_RECEIPT"]) {
    assert((artifactsByRole.get(role) ?? []).length === 0, `REVALIDATION_PROVIDERLESS_ARTIFACT_PRESENT:${role}`);
  }
} else {
  assert(g5Passed && localPhaseStatuses.every((status) => status === "PASS"), "REVALIDATION_PROVIDER_STARTED_BEFORE_LOCAL_GATES_PASS");
  assert(report.providerVerdict !== null, "REVALIDATION_PROVIDER_VERDICT_MISSING");
  assert(report.adoptionDecision !== null, "REVALIDATION_PROVIDER_ADOPTION_MISSING");
  assert(report.evaluation.providerCalls > 0, "REVALIDATION_PROVIDER_CALLS_MISSING");
  assert(["SETTLED", "INCOMPLETE"].includes(report.evaluation.providerCostSettlementStatus), "REVALIDATION_PROVIDER_SETTLEMENT_STATUS_INVALID");
  assert(["INCOMPLETE", "VERIFIED"].includes(report.evaluation.providerReconciliationStatus), "REVALIDATION_PROVIDER_RECONCILIATION_STATUS_INVALID");
  assert(Number.isFinite(report.evaluation.settledSpendCad), "REVALIDATION_PROVIDER_SPEND_MISSING");
  const budgetBreachScellable =
    budgetBreakerIncidentObserved &&
    providerStatus === "PILOT_STOPPED" &&
    incidentEvidence?.phase === "G6" &&
    incidentEvidence?.campaignStopped === true &&
    ["REWORK", "REJECT"].includes(report.providerVerdict);
  for (const field of ["authorizedBudgetCad", "worstCaseBudgetCad", "perCallCapCad", "fxUsdCad", "reserveMultiplier"]) {
    assert(Number.isFinite(report.evaluation[field]), `REVALIDATION_PROVIDER_CONTROL_MISSING:${field}`);
  }

  budgetProof = readArtifactJson(
    report.evaluation.budgetAuthorityEvidencePath,
    "BUDGET_AUTHORITY",
    "REVALIDATION_BUDGET_AUTHORITY",
  );
  pricingProof = readArtifactJson(
    report.evaluation.pricingEvidencePath,
    "PRICING_EVIDENCE",
    "REVALIDATION_PRICING_EVIDENCE",
  );
  costReceipt = readArtifactJson(
    report.evaluation.costReceiptEvidencePath,
    "COST_RECEIPT",
    "REVALIDATION_COST_RECEIPT",
  );
  baselineOutput = readArtifactJson(
    report.evaluation.baselineOutputManifestPath,
    "OUTPUT_MANIFEST",
    "REVALIDATION_BASELINE_OUTPUT_MANIFEST",
  );
  candidateOutput = readArtifactJson(
    report.evaluation.candidateOutputManifestPath,
    "OUTPUT_MANIFEST",
    "REVALIDATION_CANDIDATE_OUTPUT_MANIFEST",
  );

  for (const field of ["authorizedBudgetCad", "worstCaseBudgetCad", "perCallCapCad"]) {
    assert(numbersEqual(budgetProof[field], report.evaluation[field]), `REVALIDATION_BUDGET_AUTHORITY_MISMATCH:${field}`);
  }
  assert(budgetProof.authorizedBeforeFirstCall === true, "REVALIDATION_BUDGET_AUTHORIZED_TOO_LATE");
  requireLinkedArtifact(
    budgetProof.authorityEvidencePath,
    budgetProof.authorityEvidenceSha256,
    "REVALIDATION_BUDGET_AUTHORITY_SOURCE",
    "SUPPORTING_EVIDENCE",
  );
  assert(numbersEqual(pricingProof.fxUsdCad, report.evaluation.fxUsdCad), "REVALIDATION_PRICING_FX_MISMATCH");
  assert(numbersEqual(pricingProof.reserveMultiplier, report.evaluation.reserveMultiplier), "REVALIDATION_PRICING_RESERVE_MISMATCH");
  requireLinkedArtifact(pricingProof.sourcePath, pricingProof.sourceSha256, "REVALIDATION_PRICING_SOURCE", "SUPPORTING_EVIDENCE");
  assert(pricingProof.models.length === 2, "REVALIDATION_PRICING_PROFILE_COUNT_INVALID");
  const pricingByProfile = new Map();
  let calculatedWorstCaseUsd = 0;
  let calculatedPerCallCapCad = 0;
  for (const model of pricingProof.models) {
    assert(!pricingByProfile.has(model.profile), `REVALIDATION_PRICING_PROFILE_DUPLICATE:${model.profile}`);
    pricingByProfile.set(model.profile, model);
    const requestedModel = model.profile === "BASELINE"
      ? report.models.runtimeBaseline.requestedModel
      : report.models.runtimeCandidate.requestedModel;
    assert(model.model === requestedModel, `REVALIDATION_PRICING_MODEL_MISMATCH:${model.profile}`);
    const frozenProfile = modelProfilesByProfile.get(model.profile);
    assert(Boolean(frozenProfile), `REVALIDATION_FROZEN_MODEL_PROFILE_MISSING:${model.profile}`);
    assert(frozenProfile.model === requestedModel, `REVALIDATION_FROZEN_MODEL_PROFILE_MODEL_MISMATCH:${model.profile}`);
    assert(frozenProfile.maxOutputTokens === model.maxOutputTokens, `REVALIDATION_FROZEN_MODEL_PROFILE_PRICING_CAP_MISMATCH:${model.profile}`);
    assert(
      model.plannedCalls === 64 + 32 * pricingProof.plannedStabilityRepetitions,
      `REVALIDATION_PRICING_PLANNED_CALLS_INVALID:${model.profile}`,
    );
    const perAttemptUsd =
      (model.maxInputTokens / 1_000_000) * model.inputUsdPerMillionTokens +
      (model.maxOutputTokens / 1_000_000) * model.outputUsdPerMillionTokens;
    calculatedWorstCaseUsd += perAttemptUsd * model.plannedCalls * (1 + model.maxRetries);
    calculatedPerCallCapCad = Math.max(
      calculatedPerCallCapCad,
      ceilCad(perAttemptUsd * pricingProof.fxUsdCad * pricingProof.reserveMultiplier),
    );
  }
  assert(pricingByProfile.size === 2, "REVALIDATION_PRICING_PROFILES_INCOMPLETE");
  const calculatedWorstCaseCad = ceilCad(
    calculatedWorstCaseUsd * pricingProof.fxUsdCad * pricingProof.reserveMultiplier,
  );
  assert(numbersEqual(report.evaluation.worstCaseBudgetCad, calculatedWorstCaseCad), "REVALIDATION_WORST_CASE_NOT_DERIVED");
  assert(report.evaluation.perCallCapCad >= calculatedPerCallCapCad, "REVALIDATION_PER_CALL_CAP_BELOW_CALCULATED_MAX");
  assert(report.evaluation.worstCaseBudgetCad <= report.evaluation.authorizedBudgetCad, "REVALIDATION_WORST_CASE_EXCEEDS_AUTHORIZED_BUDGET");

  const profileConfiguration = [
    ["BASELINE", baselineOutput, report.models.runtimeBaseline, "baselineDevelopmentEvaluated", "baselineHiddenEvaluated"],
    ["CANDIDATE", candidateOutput, report.models.runtimeCandidate, "candidateDevelopmentEvaluated", "candidateHiddenEvaluated"],
  ];
  const outputStats = new Map();
  const hiddenOutputHashesByProfile = new Map([
    ["BASELINE", new Map()],
    ["CANDIDATE", new Map()],
  ]);
  for (const [profile, manifest, modelEvidence, developmentField, hiddenField] of profileConfiguration) {
    const frozenManifestProfile = modelProfilesByProfile.get(profile);
    assert(Boolean(frozenManifestProfile), `REVALIDATION_OUTPUT_MODEL_PROFILE_MISSING:${profile}`);
    assert(manifest.profile === profile, `REVALIDATION_OUTPUT_PROFILE_MISMATCH:${profile}`);
    assert(manifest.provider === "OPENROUTER", `REVALIDATION_OUTPUT_PROVIDER_INVALID:${profile}`);
    assert(manifest.endpoint === "https://openrouter.ai/api/v1/responses" && manifest.endpoint === frozenManifestProfile.endpoint, `REVALIDATION_OUTPUT_ENDPOINT_INVALID:${profile}`);
    assert(manifest.requestedModel === modelEvidence.requestedModel, `REVALIDATION_OUTPUT_REQUESTED_MODEL_MISMATCH:${profile}`);
    assert(manifest.requestedModel === frozenManifestProfile.model, `REVALIDATION_OUTPUT_FROZEN_MODEL_MISMATCH:${profile}`);
    assert(manifest.requestCount === manifest.entries.length, `REVALIDATION_OUTPUT_REQUEST_COUNT_NOT_DERIVED:${profile}`);
    const completedDevelopment = new Set();
    const completedHidden = new Set();
    const completedHiddenDurations = [];
    const derivedServedModels = new Set();
    let completedHiddenEntries = 0;
    for (const entry of manifest.entries) {
      assert(!outputEntriesByRequestId.has(entry.requestId), `REVALIDATION_PROVIDER_REQUEST_DUPLICATE:${entry.requestId}`);
      outputEntriesByRequestId.set(entry.requestId, { ...entry, profile });
      const testCase = corpusCasesById.get(entry.caseId);
      assert(Boolean(testCase), `REVALIDATION_OUTPUT_CASE_UNKNOWN:${profile}:${entry.caseId}`);
      assert(testCase.split === entry.split, `REVALIDATION_OUTPUT_CASE_SPLIT_MISMATCH:${profile}:${entry.caseId}`);
      assert(entry.requestedModel === manifest.requestedModel, `REVALIDATION_ENTRY_REQUESTED_MODEL_MISMATCH:${entry.requestId}`);
      assert(entry.endpoint === manifest.endpoint, `REVALIDATION_ENTRY_ENDPOINT_MISMATCH:${entry.requestId}`);
      assert(entry.fallbackUsed === false, `REVALIDATION_ENTRY_FALLBACK_USED:${entry.requestId}`);
      const startedAtMs = Date.parse(entry.startedAt);
      const finishedAtMs = Date.parse(entry.finishedAt);
      assert(finishedAtMs >= startedAtMs, `REVALIDATION_ENTRY_TIME_ORDER_INVALID:${entry.requestId}`);
      assert(entry.durationMs === finishedAtMs - startedAtMs, `REVALIDATION_ENTRY_DURATION_NOT_DERIVED:${entry.requestId}`);
      requireLinkedArtifact(entry.requestPath, entry.requestSha256, `REVALIDATION_REQUEST_RECORD:${entry.requestId}`, "REQUEST_RECORD");
      const requestPayload = readArtifactJson(entry.requestPath, "REQUEST_RECORD", `REVALIDATION_REQUEST_RECORD:${entry.requestId}`);
      assert(requestPayload.provider === manifest.provider, `REVALIDATION_RAW_REQUEST_PROVIDER_MISMATCH:${entry.requestId}`);
      assert(requestPayload.endpoint === entry.endpoint, `REVALIDATION_RAW_REQUEST_ENDPOINT_MISMATCH:${entry.requestId}`);
      assert(requestPayload.requestId === entry.requestId, `REVALIDATION_RAW_REQUEST_ID_MISMATCH:${entry.requestId}`);
      assert(requestPayload.caseId === entry.caseId && requestPayload.profile === profile, `REVALIDATION_RAW_REQUEST_CASE_PROFILE_MISMATCH:${entry.requestId}`);
      assert(requestPayload.startedAt === entry.startedAt, `REVALIDATION_RAW_REQUEST_TIME_MISMATCH:${entry.requestId}`);
      assert(requestPayload.body.model === entry.requestedModel, `REVALIDATION_RAW_REQUEST_MODEL_MISMATCH:${entry.requestId}`);
      const frozenProfile = modelProfilesByProfile.get(profile);
      assert(Boolean(frozenProfile), `REVALIDATION_REQUEST_MODEL_PROFILE_MISSING:${entry.requestId}`);
      assert(requestPayload.provider === frozenProfile.provider && requestPayload.endpoint === frozenProfile.endpoint, `REVALIDATION_REQUEST_PROFILE_PROVIDER_ENDPOINT_MISMATCH:${entry.requestId}`);
      assert(requestPayload.body.model === frozenProfile.model, `REVALIDATION_REQUEST_PROFILE_MODEL_MISMATCH:${entry.requestId}`);
      assert(requestPayload.timeoutMs === frozenProfile.timeoutMs, `REVALIDATION_REQUEST_PROFILE_TIMEOUT_MISMATCH:${entry.requestId}`);
      assert(!requestNonces.has(requestPayload.requestNonce), `REVALIDATION_REQUEST_NONCE_DUPLICATE:${entry.requestId}`);
      requestNonces.add(requestPayload.requestNonce);
      const caseInput = readJson(resolveArtifactPath(testCase.inputPath), `REVALIDATION_CORPUS_CASE_INPUT_INVALID:${entry.requestId}`);
      const promptText = readFileSync(resolveArtifactPath(corpus.promptPath), "utf8");
      const toolSchema = readJson(resolveArtifactPath(corpus.toolSchemaPath), `REVALIDATION_CORPUS_TOOL_SCHEMA_INVALID:${entry.requestId}`);
      const expectedUserPayload = JSON.stringify({
        requestNonce: requestPayload.requestNonce,
        caseId: entry.caseId,
        profile,
        input: caseInput,
        toolSchema,
      });
      const expectedInput = [
        { role: "system", content: promptText },
        { role: "user", content: expectedUserPayload },
      ];
      assert(JSON.stringify(requestPayload.body.input) === JSON.stringify(expectedInput), `REVALIDATION_REQUEST_INPUT_NOT_CANONICAL:${entry.requestId}`);
      assert(JSON.stringify(requestPayload.body.tools) === JSON.stringify(toolSchema), `REVALIDATION_REQUEST_TOOLS_NOT_CANONICAL:${entry.requestId}`);
      assert(
        requestPayload.body.metadata.endvera_request_nonce === requestPayload.requestNonce &&
          requestPayload.body.metadata.endvera_case_id === entry.caseId &&
          requestPayload.body.metadata.endvera_profile === profile,
        `REVALIDATION_REQUEST_METADATA_NOT_CANONICAL:${entry.requestId}`,
      );
      assert(requestPayload.body.max_output_tokens === frozenProfile.maxOutputTokens, `REVALIDATION_REQUEST_PROFILE_OUTPUT_CAP_MISMATCH:${entry.requestId}`);
      const hasReasoning = Object.prototype.hasOwnProperty.call(requestPayload.body, "reasoning");
      const hasTemperature = Object.prototype.hasOwnProperty.call(requestPayload.body, "temperature");
      assert(hasReasoning === (frozenProfile.reasoning !== null), `REVALIDATION_REQUEST_PROFILE_REASONING_PRESENCE_MISMATCH:${entry.requestId}`);
      assert(hasTemperature === (frozenProfile.temperature !== null), `REVALIDATION_REQUEST_PROFILE_TEMPERATURE_PRESENCE_MISMATCH:${entry.requestId}`);
      if (hasReasoning) assert(JSON.stringify(requestPayload.body.reasoning) === JSON.stringify(frozenProfile.reasoning), `REVALIDATION_REQUEST_PROFILE_REASONING_MISMATCH:${entry.requestId}`);
      if (hasTemperature) assert(numbersEqual(requestPayload.body.temperature, frozenProfile.temperature), `REVALIDATION_REQUEST_PROFILE_TEMPERATURE_MISMATCH:${entry.requestId}`);
      if (entry.outcome === "TRANSPORT_FAILURE") {
        assert(entry.completed === false, `REVALIDATION_TRANSPORT_FAILURE_MARKED_COMPLETED:${entry.requestId}`);
        assert(entry.providerRequestId === null && entry.servedModel === null, `REVALIDATION_TRANSPORT_FAILURE_PROVIDER_ID_FABRICATED:${entry.requestId}`);
        assert(entry.costStatus === "UNSETTLED_UNKNOWN" && entry.settledCostCad === null, `REVALIDATION_TRANSPORT_FAILURE_COST_FABRICATED:${entry.requestId}`);
        assert(entry.rawResponsePath === null && entry.rawResponseSha256 === null, `REVALIDATION_TRANSPORT_FAILURE_RAW_RESPONSE_FABRICATED:${entry.requestId}`);
        requireLinkedArtifact(entry.outputPath, entry.outputSha256, `REVALIDATION_TRANSPORT_FAILURE:${entry.requestId}`, "TRANSPORT_FAILURE");
        const failurePayload = readArtifactJson(entry.outputPath, "TRANSPORT_FAILURE", `REVALIDATION_TRANSPORT_FAILURE:${entry.requestId}`);
        assert(failurePayload.provider === manifest.provider, `REVALIDATION_TRANSPORT_FAILURE_PROVIDER_MISMATCH:${entry.requestId}`);
        assert(failurePayload.endpoint === entry.endpoint, `REVALIDATION_TRANSPORT_FAILURE_ENDPOINT_MISMATCH:${entry.requestId}`);
        assert(failurePayload.requestId === entry.requestId, `REVALIDATION_TRANSPORT_FAILURE_REQUEST_MISMATCH:${entry.requestId}`);
        assert(failurePayload.occurredAt === entry.finishedAt, `REVALIDATION_TRANSPORT_FAILURE_TIME_MISMATCH:${entry.requestId}`);
      } else {
        assert(["COMPLETED", "PROVIDER_ERROR"].includes(entry.outcome), `REVALIDATION_ENTRY_OUTCOME_INVALID:${entry.requestId}`);
        assert(typeof entry.providerRequestId === "string" && entry.providerRequestId.length > 0, `REVALIDATION_PROVIDER_RESPONSE_ID_MISSING:${entry.requestId}`);
        assert(typeof entry.servedModel === "string" && entry.servedModel.length > 0, `REVALIDATION_PROVIDER_RESPONSE_MODEL_MISSING:${entry.requestId}`);
        assert(entry.costStatus === "SETTLED" && Number.isFinite(entry.settledCostCad), `REVALIDATION_PROVIDER_RESPONSE_COST_UNSETTLED:${entry.requestId}`);
        requireLinkedArtifact(entry.rawResponsePath, entry.rawResponseSha256, `REVALIDATION_RAW_MODEL_RESPONSE:${entry.requestId}`, "RAW_OUTPUT");
        requireLinkedArtifact(entry.outputPath, entry.outputSha256, `REVALIDATION_MODEL_OUTPUT:${entry.requestId}`, "MODEL_OUTPUT");
        const responsePayload = readJson(resolveArtifactPath(entry.rawResponsePath), `REVALIDATION_RESPONSE_JSON_INVALID:${entry.requestId}`);
        const normalizedOutput = readArtifactJson(entry.outputPath, "MODEL_OUTPUT", `REVALIDATION_MODEL_OUTPUT:${entry.requestId}`);
        assert(normalizedOutput.requestId === entry.requestId, `REVALIDATION_NORMALIZED_OUTPUT_REQUEST_MISMATCH:${entry.requestId}`);
        assert(normalizedOutput.providerRequestId === entry.providerRequestId, `REVALIDATION_NORMALIZED_OUTPUT_PROVIDER_ID_MISMATCH:${entry.requestId}`);
        assert(normalizedOutput.requestedModel === entry.requestedModel && normalizedOutput.servedModel === entry.servedModel, `REVALIDATION_NORMALIZED_OUTPUT_MODEL_MISMATCH:${entry.requestId}`);
        assert(normalizedOutput.requestNonce === requestPayload.requestNonce, `REVALIDATION_NORMALIZED_OUTPUT_NONCE_MISMATCH:${entry.requestId}`);
        assert(normalizedOutput.outcome === entry.outcome, `REVALIDATION_NORMALIZED_OUTPUT_OUTCOME_MISMATCH:${entry.requestId}`);
        assert(entry.completed === (entry.outcome === "COMPLETED"), `REVALIDATION_ENTRY_COMPLETION_OUTCOME_MISMATCH:${entry.requestId}`);
        if (entry.completed) {
          assert(responsePayload && responsePayload.id === entry.providerRequestId, `REVALIDATION_RAW_RESPONSE_ID_MISMATCH:${entry.requestId}`);
          assert(responsePayload.model === entry.servedModel, `REVALIDATION_RAW_RESPONSE_MODEL_MISMATCH:${entry.requestId}`);
          assert(typeof normalizedOutput.completion === "string" && normalizedOutput.error === null, `REVALIDATION_COMPLETED_NORMALIZED_OUTPUT_INVALID:${entry.requestId}`);
        } else {
          assert(normalizedOutput.completion === null && normalizedOutput.error !== null, `REVALIDATION_FAILED_NORMALIZED_OUTPUT_INVALID:${entry.requestId}`);
          assert(responsePayload && responsePayload.id === entry.providerRequestId, `REVALIDATION_FAILED_RESPONSE_ID_MISMATCH:${entry.requestId}`);
          assert(responsePayload.model === entry.servedModel, `REVALIDATION_FAILED_RESPONSE_MODEL_MISMATCH:${entry.requestId}`);
        }
      }
      if (entry.servedModel !== null) derivedServedModels.add(entry.servedModel);
      if (entry.completed && entry.split === "DEVELOPMENT") completedDevelopment.add(entry.caseId);
      if (entry.completed && entry.split === "HIDDEN") {
        completedHidden.add(entry.caseId);
        completedHiddenEntries += 1;
        completedHiddenDurations.push(entry.durationMs);
        const hashesByCase = hiddenOutputHashesByProfile.get(profile);
        if (!hashesByCase.has(entry.caseId)) hashesByCase.set(entry.caseId, []);
        hashesByCase.get(entry.caseId).push(entry.outputSha256.toLowerCase());
      }
    }
    assert(manifest.developmentEvaluated === completedDevelopment.size, `REVALIDATION_OUTPUT_DEVELOPMENT_NOT_DERIVED:${profile}`);
    assert(manifest.hiddenEvaluated === completedHidden.size, `REVALIDATION_OUTPUT_HIDDEN_NOT_DERIVED:${profile}`);
    assert(
      JSON.stringify([...manifest.servedModels].sort()) === JSON.stringify([...derivedServedModels].sort()),
      `REVALIDATION_OUTPUT_SERVED_MODELS_NOT_DERIVED:${profile}`,
    );
    const mismatchedEntries = manifest.entries.filter(
      (entry) => entry.servedModel !== null && entry.servedModel !== entry.requestedModel,
    );
    if (mismatchedEntries.length > 0) {
      assert(modelEvidence.access === "SERVED_MODEL_MISMATCH", `REVALIDATION_PER_CALL_MODEL_MISMATCH_NOT_ESCALATED:${profile}`);
      assert(
        mismatchedEntries.some((entry) => entry.providerRequestId === modelEvidence.requestId),
        `REVALIDATION_MISMATCH_TRACE_NOT_LINKED:${profile}`,
      );
    } else {
      assert(modelEvidence.access !== "SERVED_MODEL_MISMATCH", `REVALIDATION_MODEL_MISMATCH_WITHOUT_CALL_EVIDENCE:${profile}`);
    }
    if (modelEvidence.access === "SERVED_MODEL_CONFIRMED") {
      assert(derivedServedModels.size === 1 && derivedServedModels.has(manifest.requestedModel), `REVALIDATION_ALL_SERVED_MODELS_NOT_CONFIRMED:${profile}`);
    }
    assert(report.evaluation[developmentField] === manifest.developmentEvaluated, `REVALIDATION_OUTPUT_DEVELOPMENT_MISMATCH:${profile}`);
    assert(report.evaluation[hiddenField] === manifest.hiddenEvaluated, `REVALIDATION_OUTPUT_HIDDEN_MISMATCH:${profile}`);
    if (manifest.requestCount === 0) {
      assert(modelEvidence.access === "UNPROBED", `REVALIDATION_EMPTY_OUTPUT_PROFILE_PROBED:${profile}`);
    } else {
      assert(
        ["SERVED_MODEL_CONFIRMED", "SERVED_MODEL_MISMATCH", "UNAVAILABLE"].includes(modelEvidence.access),
        `REVALIDATION_OUTPUT_MODEL_ACCESS_INVALID:${profile}`,
      );
    }
    if (["SERVED_MODEL_CONFIRMED", "SERVED_MODEL_MISMATCH"].includes(modelEvidence.access)) {
      const tracedEntry = manifest.entries.find((entry) => entry.providerRequestId === modelEvidence.requestId);
      assert(Boolean(tracedEntry), `REVALIDATION_MODEL_TRACE_REQUEST_NOT_IN_OUTPUT:${profile}`);
      assert(tracedEntry.servedModel === modelEvidence.servedModel, `REVALIDATION_MODEL_TRACE_SERVED_MODEL_MISMATCH:${profile}`);
      assert(manifest.endpoint === modelEvidence.endpoint, `REVALIDATION_MODEL_TRACE_ENDPOINT_MISMATCH:${profile}`);
      assert(manifest.entries.every((entry) => entry.endpoint === modelEvidence.endpoint), `REVALIDATION_PROFILE_ENDPOINT_NOT_PINNED:${profile}`);
    }
    outputStats.set(profile, {
      completedDevelopmentEntries: manifest.entries.filter((entry) => entry.completed && entry.split === "DEVELOPMENT").length,
      completedHiddenEntries,
      hiddenP95: percentile95(completedHiddenDurations),
    });
  }
  assert(providerCommandsByRequestId.size === outputEntriesByRequestId.size, "REVALIDATION_PROVIDER_COMMAND_OUTPUT_SET_SIZE_MISMATCH");
  for (const [requestId, entry] of outputEntriesByRequestId) {
    const command = providerCommandsByRequestId.get(requestId);
    assert(Boolean(command), `REVALIDATION_PROVIDER_OUTPUT_WITHOUT_COMMAND:${requestId}`);
    assert(command.startedAt === entry.startedAt && command.finishedAt === entry.finishedAt, `REVALIDATION_PROVIDER_COMMAND_TIME_MISMATCH:${requestId}`);
    if (entry.outcome === "TRANSPORT_FAILURE") {
      const failurePayload = readArtifactJson(entry.outputPath, "TRANSPORT_FAILURE", `REVALIDATION_TRANSPORT_FAILURE_COMMAND_LINK:${requestId}`);
      assert(failurePayload.commandId === command.id, `REVALIDATION_TRANSPORT_FAILURE_COMMAND_ID_MISMATCH:${requestId}`);
      assert(failurePayload.commandStdoutSha256.toLowerCase() === command.stdoutSha256.toLowerCase(), `REVALIDATION_TRANSPORT_FAILURE_STDOUT_HASH_MISMATCH:${requestId}`);
      assert(failurePayload.commandStderrSha256.toLowerCase() === command.stderrSha256.toLowerCase(), `REVALIDATION_TRANSPORT_FAILURE_STDERR_HASH_MISMATCH:${requestId}`);
    } else {
      assert(entry.rawResponsePath === command.stdoutPath, `REVALIDATION_PROVIDER_RAW_RESPONSE_NOT_COMMAND_STDOUT:${requestId}`);
      assert(entry.rawResponseSha256.toLowerCase() === command.stdoutSha256.toLowerCase(), `REVALIDATION_PROVIDER_RAW_RESPONSE_STDOUT_HASH_MISMATCH:${requestId}`);
    }
  }
  for (const requestId of providerCommandsByRequestId.keys()) {
    assert(outputEntriesByRequestId.has(requestId), `REVALIDATION_PROVIDER_COMMAND_WITHOUT_OUTPUT:${requestId}`);
  }
  const assertArtifactGraphClosed = (role, referencedPaths) => {
    const rolePaths = new Set((artifactsByRole.get(role) ?? []).map((artifact) => artifact.path));
    assert(rolePaths.size === referencedPaths.size, `REVALIDATION_ARTIFACT_GRAPH_SIZE_MISMATCH:${role}`);
    for (const path of rolePaths) assert(referencedPaths.has(path), `REVALIDATION_ORPHAN_ARTIFACT:${role}:${path}`);
  };
  assertArtifactGraphClosed("REQUEST_RECORD", new Set([...outputEntriesByRequestId.values()].map((entry) => entry.requestPath)));
  assertArtifactGraphClosed("MODEL_OUTPUT", new Set([...outputEntriesByRequestId.values()].filter((entry) => entry.outcome !== "TRANSPORT_FAILURE").map((entry) => entry.outputPath)));
  assertArtifactGraphClosed("TRANSPORT_FAILURE", new Set([...outputEntriesByRequestId.values()].filter((entry) => entry.outcome === "TRANSPORT_FAILURE").map((entry) => entry.outputPath)));
  assert(report.evaluation.providerCalls === providerCommandsByRequestId.size, "REVALIDATION_PROVIDER_CALLS_NOT_DERIVED_FROM_COMMANDS");
  const transportFailureEntries = [...outputEntriesByRequestId.values()].filter((entry) => entry.outcome === "TRANSPORT_FAILURE");
  if (transportFailureEntries.length > 0) {
    assert(providerStatus === "PILOT_STOPPED", "REVALIDATION_TRANSPORT_FAILURE_DID_NOT_STOP_PILOT");
  }
  const maximumAttempts = sum(pricingProof.models.map((model) => model.plannedCalls * (1 + model.maxRetries)));
  assert(report.evaluation.providerCalls <= maximumAttempts || budgetBreachScellable, "REVALIDATION_PROVIDER_CALLS_EXCEED_PRICED_ATTEMPTS_UNSEALED");

  assert(costReceipt.provider === "OPENROUTER", "REVALIDATION_COST_RECEIPT_PROVIDER_INVALID");
  assert(costReceipt.calls.length === costReceipt.providerCalls, "REVALIDATION_COST_RECEIPT_CALL_LIST_MISMATCH");
  assert(costReceipt.providerCalls === report.evaluation.providerCalls, "REVALIDATION_COST_RECEIPT_CALLS_MISMATCH");
  const receiptRequestIds = new Set();
  for (const call of costReceipt.calls) {
    assert(!receiptRequestIds.has(call.requestId), `REVALIDATION_COST_RECEIPT_REQUEST_DUPLICATE:${call.requestId}`);
    receiptRequestIds.add(call.requestId);
    const outputEntry = outputEntriesByRequestId.get(call.requestId);
    assert(Boolean(outputEntry), `REVALIDATION_COST_RECEIPT_REQUEST_UNKNOWN:${call.requestId}`);
    assert(call.profile === outputEntry.profile && call.caseId === outputEntry.caseId, `REVALIDATION_COST_RECEIPT_REQUEST_MISMATCH:${call.requestId}`);
    assert(call.startedAt === outputEntry.startedAt, `REVALIDATION_COST_RECEIPT_TIME_MISMATCH:${call.requestId}`);
    if (call.usageSource === "NO_PROVIDER_RECEIPT") {
      assert(outputEntry.outcome === "TRANSPORT_FAILURE", `REVALIDATION_MISSING_RECEIPT_WITHOUT_TRANSPORT_FAILURE:${call.requestId}`);
      assert(call.costStatus === "UNSETTLED_UNKNOWN" && outputEntry.costStatus === "UNSETTLED_UNKNOWN", `REVALIDATION_MISSING_RECEIPT_STATUS_INVALID:${call.requestId}`);
      assert(call.inputTokens === null && call.outputTokens === null, `REVALIDATION_MISSING_RECEIPT_TOKENS_FABRICATED:${call.requestId}`);
      assert(call.settledCostUsd === null && call.settledCostCad === null && outputEntry.settledCostCad === null, `REVALIDATION_MISSING_RECEIPT_COST_FABRICATED:${call.requestId}`);
      assert(call.receiptPath === outputEntry.outputPath, `REVALIDATION_TRANSPORT_FAILURE_RECEIPT_PATH_MISMATCH:${call.requestId}`);
      requireLinkedArtifact(call.receiptPath, call.receiptSha256, `REVALIDATION_TRANSPORT_FAILURE_RECEIPT:${call.requestId}`, "TRANSPORT_FAILURE");
      continue;
    }
    assert(call.costStatus === "SETTLED" && outputEntry.costStatus === "SETTLED", `REVALIDATION_PROVIDER_COST_STATUS_INVALID:${call.requestId}`);
    let usagePayload;
    if (call.usageSource === "MODEL_RESPONSE") {
      assert(call.receiptPath === outputEntry.rawResponsePath, `REVALIDATION_RESPONSE_USAGE_PATH_MISMATCH:${call.requestId}`);
      requireLinkedArtifact(call.receiptPath, call.receiptSha256, `REVALIDATION_PROVIDER_RECEIPT:${call.requestId}`, "RAW_OUTPUT");
      const responsePayload = readJson(resolveArtifactPath(call.receiptPath), `REVALIDATION_PROVIDER_RESPONSE_USAGE_INVALID:${call.requestId}`);
      assert(responsePayload.id === outputEntry.providerRequestId, `REVALIDATION_PROVIDER_RESPONSE_USAGE_ID_MISMATCH:${call.requestId}`);
      assert(responsePayload.model === outputEntry.servedModel, `REVALIDATION_PROVIDER_RESPONSE_USAGE_MODEL_MISMATCH:${call.requestId}`);
      usagePayload = {
        inputTokens: responsePayload.usage?.input_tokens ?? responsePayload.usage?.prompt_tokens,
        outputTokens: responsePayload.usage?.output_tokens ?? responsePayload.usage?.completion_tokens,
        settledCostUsd: responsePayload.usage?.cost,
      };
    } else {
      assert(call.usageSource === "GENERATION_METADATA", `REVALIDATION_PROVIDER_USAGE_SOURCE_INVALID:${call.requestId}`);
      requireLinkedArtifact(call.receiptPath, call.receiptSha256, `REVALIDATION_PROVIDER_RECEIPT:${call.requestId}`, "RAW_OUTPUT");
      const generationPayload = readJson(resolveArtifactPath(call.receiptPath), `REVALIDATION_GENERATION_METADATA_INVALID:${call.requestId}`);
      const generation = generationPayload?.data;
      assert(generation?.id === outputEntry.providerRequestId, `REVALIDATION_GENERATION_ID_MISMATCH:${call.requestId}`);
      assert(generation.model === outputEntry.servedModel, `REVALIDATION_GENERATION_MODEL_MISMATCH:${call.requestId}`);
      usagePayload = {
        inputTokens: generation.native_tokens_prompt ?? generation.tokens_prompt,
        outputTokens: generation.native_tokens_completion ?? generation.tokens_completion,
        settledCostUsd: generation.total_cost,
      };
    }
    assert(Number.isInteger(usagePayload.inputTokens) && usagePayload.inputTokens >= 0, `REVALIDATION_PROVIDER_INPUT_USAGE_INVALID:${call.requestId}`);
    assert(Number.isInteger(usagePayload.outputTokens) && usagePayload.outputTokens >= 0, `REVALIDATION_PROVIDER_OUTPUT_USAGE_INVALID:${call.requestId}`);
    assert(Number.isFinite(usagePayload.settledCostUsd) && usagePayload.settledCostUsd >= 0, `REVALIDATION_PROVIDER_COST_USAGE_INVALID:${call.requestId}`);
    assert(call.inputTokens === usagePayload.inputTokens, `REVALIDATION_COST_RECEIPT_INPUT_NOT_DERIVED:${call.requestId}`);
    assert(call.outputTokens === usagePayload.outputTokens, `REVALIDATION_COST_RECEIPT_OUTPUT_NOT_DERIVED:${call.requestId}`);
    assert(numbersEqual(call.settledCostUsd, usagePayload.settledCostUsd), `REVALIDATION_COST_RECEIPT_USD_NOT_DERIVED:${call.requestId}`);
    const derivedCallCostCad = usagePayload.settledCostUsd * pricingProof.fxUsdCad;
    assert(numbersEqual(call.settledCostCad, derivedCallCostCad), `REVALIDATION_COST_RECEIPT_CAD_NOT_DERIVED:${call.requestId}`);
    assert(numbersEqual(call.settledCostCad, outputEntry.settledCostCad), `REVALIDATION_COST_RECEIPT_ENTRY_COST_MISMATCH:${call.requestId}`);
    const pricing = pricingByProfile.get(call.profile);
    assert(call.inputTokens <= pricing.maxInputTokens || budgetBreachScellable, `REVALIDATION_INPUT_TOKEN_CAP_EXCEEDED_UNSEALED:${call.requestId}`);
    assert(call.outputTokens <= pricing.maxOutputTokens || budgetBreachScellable, `REVALIDATION_OUTPUT_TOKEN_CAP_EXCEEDED_UNSEALED:${call.requestId}`);
  }
  assert(receiptRequestIds.size === outputEntriesByRequestId.size, "REVALIDATION_COST_RECEIPT_REQUEST_SET_INCOMPLETE");
  const settledCalls = costReceipt.calls.filter((call) => call.costStatus === "SETTLED");
  const unsettledCalls = costReceipt.calls.filter((call) => call.costStatus === "UNSETTLED_UNKNOWN");
  const derivedSpendCad = sum(settledCalls.map((call) => call.settledCostCad));
  const derivedMaxCallCad = settledCalls.length === 0 ? 0 : Math.max(...settledCalls.map((call) => call.settledCostCad));
  const derivedSettlementStatus = unsettledCalls.length === 0 ? "SETTLED" : "INCOMPLETE";
  if (derivedSettlementStatus === "INCOMPLETE") {
    assert(providerStatus === "PILOT_STOPPED", "REVALIDATION_UNSETTLED_COST_DID_NOT_STOP_PILOT");
  }
  assert(costReceipt.unsettledCallCount === unsettledCalls.length, "REVALIDATION_COST_RECEIPT_UNSETTLED_COUNT_NOT_DERIVED");
  assert(costReceipt.settlementStatus === derivedSettlementStatus, "REVALIDATION_COST_RECEIPT_SETTLEMENT_STATUS_NOT_DERIVED");
  assert(report.evaluation.unsettledProviderCalls === unsettledCalls.length, "REVALIDATION_PROVIDER_UNSETTLED_COUNT_NOT_DERIVED");
  assert(report.evaluation.providerCostSettlementStatus === derivedSettlementStatus, "REVALIDATION_PROVIDER_SETTLEMENT_STATUS_NOT_DERIVED");
  assert(numbersEqual(costReceipt.settledSpendCad, derivedSpendCad), "REVALIDATION_COST_RECEIPT_SPEND_NOT_DERIVED");
  assert(numbersEqual(report.evaluation.settledSpendCad, derivedSpendCad), "REVALIDATION_PROVIDER_SPEND_NOT_DERIVED");
  assert(numbersEqual(costReceipt.maxObservedCallCad, derivedMaxCallCad), "REVALIDATION_COST_RECEIPT_MAX_NOT_DERIVED");
  assert(derivedMaxCallCad <= report.evaluation.perCallCapCad || budgetBreachScellable, "REVALIDATION_PER_CALL_CAP_EXCEEDED_UNSEALED");
  assert(derivedSpendCad <= report.evaluation.authorizedBudgetCad || budgetBreachScellable, "REVALIDATION_AUTHORIZED_BUDGET_EXCEEDED_UNSEALED");
  const firstCallAt = Math.min(...[...outputEntriesByRequestId.values()].map((entry) => Date.parse(entry.startedAt)));
  assert(Date.parse(budgetProof.authorizedAt) <= firstCallAt, "REVALIDATION_BUDGET_TIMESTAMP_AFTER_FIRST_CALL");

  assert(costReceipt.providerReconciliationStatus === report.evaluation.providerReconciliationStatus, "REVALIDATION_PROVIDER_RECONCILIATION_STATUS_MISMATCH");
  assert(costReceipt.providerReconciledCalls === report.evaluation.providerReconciledCalls, "REVALIDATION_PROVIDER_RECONCILIATION_COUNT_MISMATCH");
  const reconciliationCandidates = costReceipt.calls.filter((call) => {
    const entry = outputEntriesByRequestId.get(call.requestId);
    return call.costStatus === "SETTLED" && entry?.outcome === "COMPLETED" && typeof entry?.providerRequestId === "string" && typeof entry?.servedModel === "string";
  });
  if (report.evaluation.providerReconciliationStatus === "INCOMPLETE") {
    assert(report.evaluation.providerReconciledCalls === 0, "REVALIDATION_UNVERIFIED_PROVIDER_RECONCILIATION_COUNT_INVALID");
  } else {
    assert(report.evaluation.providerReconciliationStatus === "VERIFIED", "REVALIDATION_PROVIDER_RECONCILIATION_STATUS_INVALID");
    assert(report.evaluation.providerCostSettlementStatus === "SETTLED" && report.evaluation.unsettledProviderCalls === 0, "REVALIDATION_VERIFIED_RECONCILIATION_HAS_UNSETTLED_CALLS");
    assert(reconciliationCandidates.length === report.evaluation.providerCalls, "REVALIDATION_VERIFIED_RECONCILIATION_CALL_SET_INCOMPLETE");
    assert(report.evaluation.providerReconciledCalls === report.evaluation.providerCalls, "REVALIDATION_PROVIDER_RECONCILIATION_COUNT_NOT_DERIVED");
    const apiKey = process.env.ENDVERA_REVALIDATION_OPENROUTER_API_KEY;
    assert(typeof apiKey === "string" && apiKey.length >= 20, "REVALIDATION_OPENROUTER_RECONCILIATION_KEY_REQUIRED");
    const providerIds = new Set();
    for (let offset = 0; offset < reconciliationCandidates.length; offset += 4) {
      const batch = reconciliationCandidates.slice(offset, offset + 4).map(async (call) => {
        const entry = outputEntriesByRequestId.get(call.requestId);
        assert(!providerIds.has(entry.providerRequestId), `REVALIDATION_PROVIDER_GENERATION_ID_DUPLICATE:${entry.providerRequestId}`);
        providerIds.add(entry.providerRequestId);
        await verifyOpenRouterGeneration(entry.providerRequestId, call, entry, apiKey);
      });
      await Promise.all(batch);
    }
  }

  if (report.evaluation.gradingManifestPath !== null) {
    grading = readArtifactJson(report.evaluation.gradingManifestPath, "GRADING_MANIFEST", "REVALIDATION_GRADING_MANIFEST");
    assert(grading.outputsSealedBeforeOracleLoad === true, "REVALIDATION_GRADING_ORACLE_ORDER_INVALID");
    assert(baselineOutput.sealedBeforeGrading && candidateOutput.sealedBeforeGrading, "REVALIDATION_OUTPUTS_NOT_PRESEALED");
    const baselineOutputArtifact = artifactsByPath.get(report.evaluation.baselineOutputManifestPath);
    const candidateOutputArtifact = artifactsByPath.get(report.evaluation.candidateOutputManifestPath);
    assert(grading.baselineOutputManifestSha256.toLowerCase() === baselineOutputArtifact.sha256.toLowerCase(), "REVALIDATION_GRADING_BASELINE_MANIFEST_HASH_MISMATCH");
    assert(grading.candidateOutputManifestSha256.toLowerCase() === candidateOutputArtifact.sha256.toLowerCase(), "REVALIDATION_GRADING_CANDIDATE_MANIFEST_HASH_MISMATCH");
    assert(grading.oracleManifestSha256.toLowerCase() === oracleProof.oracleManifestSha256.toLowerCase(), "REVALIDATION_GRADING_ORACLE_HASH_MISMATCH");
    const graderArtifact = requireLinkedArtifact(
      grading.graderContractPath,
      grading.graderContractSha256,
      "REVALIDATION_GRADER_CONTRACT",
      "EVALUATION_CONTRACT",
    );
    assert(graderArtifact.origin === "CAMPAIGN_HEAD_BLOB", "REVALIDATION_GRADER_CONTRACT_NOT_FROZEN_AT_CAMPAIGN_HEAD");
    const graderCommand = commandsById.get(grading.graderCommandId);
    assert(Boolean(graderCommand), "REVALIDATION_GRADER_COMMAND_MISSING");
    assert(
      graderCommand.phase === "G6" &&
        graderCommand.classification === "GRADING" &&
        graderCommand.exitCode === graderCommand.expectedExitCode &&
        graderCommand.exitCode === 0,
      "REVALIDATION_GRADER_COMMAND_INVALID",
    );
    assert(graderCommand.startedAt === grading.oracleLoadedAt, "REVALIDATION_ORACLE_LOAD_TIME_NOT_DERIVED");
    assert(graderCommand.finishedAt === grading.gradedAt, "REVALIDATION_GRADED_TIME_NOT_DERIVED");
    assert(grading.graderResultPath === graderCommand.stdoutPath, "REVALIDATION_GRADER_RESULT_PATH_NOT_COMMAND_STDOUT");
    assert(grading.graderResultSha256.toLowerCase() === graderCommand.stdoutSha256.toLowerCase(), "REVALIDATION_GRADER_RESULT_HASH_NOT_COMMAND_STDOUT");
    assert(graderCommand.replay?.entrypointPath === grading.graderContractPath, "REVALIDATION_GRADER_REPLAY_CONTRACT_PATH_MISMATCH");
    assert(graderCommand.replay?.entrypointSha256.toLowerCase() === grading.graderContractSha256.toLowerCase(), "REVALIDATION_GRADER_REPLAY_CONTRACT_HASH_MISMATCH");
    replayCommand(graderCommand, "REVALIDATION_GRADER");
    const graderResult = readArtifactJson(grading.graderResultPath, "GRADER_RESULT", "REVALIDATION_GRADER_RESULT");
    assert(graderResult.graderContractSha256.toLowerCase() === grading.graderContractSha256.toLowerCase(), "REVALIDATION_GRADER_RESULT_CONTRACT_MISMATCH");
    assert(graderResult.baselineOutputManifestSha256.toLowerCase() === grading.baselineOutputManifestSha256.toLowerCase(), "REVALIDATION_GRADER_RESULT_BASELINE_MISMATCH");
    assert(graderResult.candidateOutputManifestSha256.toLowerCase() === grading.candidateOutputManifestSha256.toLowerCase(), "REVALIDATION_GRADER_RESULT_CANDIDATE_MISMATCH");
    assert(graderResult.oracleManifestSha256.toLowerCase() === grading.oracleManifestSha256.toLowerCase(), "REVALIDATION_GRADER_RESULT_ORACLE_MISMATCH");
    assert(Date.parse(baselineOutput.sealedAt) <= Date.parse(grading.oracleLoadedAt), "REVALIDATION_BASELINE_OUTPUT_SEALED_AFTER_ORACLE_LOAD");
    assert(Date.parse(candidateOutput.sealedAt) <= Date.parse(grading.oracleLoadedAt), "REVALIDATION_CANDIDATE_OUTPUT_SEALED_AFTER_ORACLE_LOAD");
    const gradeCaseIds = new Set();
    const derivedGraderRecords = [];
    for (const grade of grading.grades) {
      assert(!gradeCaseIds.has(grade.caseId), `REVALIDATION_GRADE_CASE_DUPLICATE:${grade.caseId}`);
      gradeCaseIds.add(grade.caseId);
      const testCase = corpusCasesById.get(grade.caseId);
      assert(Boolean(testCase) && testCase.split === "HIDDEN", `REVALIDATION_GRADE_CASE_NOT_HIDDEN:${grade.caseId}`);
      const oracleEntry = oracleEntriesByCaseId.get(grade.caseId);
      assert(Boolean(oracleEntry), `REVALIDATION_GRADE_ORACLE_ENTRY_MISSING:${grade.caseId}`);
      assert(grade.oracleEntrySha256.toLowerCase() === oracleEntry.oracleEntrySha256.toLowerCase(), `REVALIDATION_GRADE_ORACLE_ENTRY_HASH_MISMATCH:${grade.caseId}`);
      requireLinkedArtifact(grade.gradingEvidencePath, grade.gradingEvidenceSha256, `REVALIDATION_GRADE_EVIDENCE:${grade.caseId}`, "GRADE_RECORD");
      const gradeRecord = readArtifactJson(grade.gradingEvidencePath, "GRADE_RECORD", `REVALIDATION_GRADE_RECORD:${grade.caseId}`);
      assert(gradeRecord.caseId === grade.caseId, `REVALIDATION_GRADE_RECORD_CASE_MISMATCH:${grade.caseId}`);
      assert(gradeRecord.oracleEntrySha256.toLowerCase() === oracleEntry.oracleEntrySha256.toLowerCase(), `REVALIDATION_GRADE_RECORD_ORACLE_MISMATCH:${grade.caseId}`);
      assert(gradeRecord.graderContractSha256.toLowerCase() === grading.graderContractSha256.toLowerCase(), `REVALIDATION_GRADE_RECORD_CONTRACT_MISMATCH:${grade.caseId}`);
      assert(gradeRecord.graderCommandId === grading.graderCommandId, `REVALIDATION_GRADE_RECORD_COMMAND_MISMATCH:${grade.caseId}`);
      const expectedBaselineHashes = hiddenOutputHashesByProfile.get("BASELINE").get(grade.caseId) ?? [];
      const expectedCandidateHashes = hiddenOutputHashesByProfile.get("CANDIDATE").get(grade.caseId) ?? [];
      assert(
        JSON.stringify([...gradeRecord.baselineOutputSha256].map((value) => value.toLowerCase()).sort()) === JSON.stringify([...expectedBaselineHashes].sort()),
        `REVALIDATION_GRADE_RECORD_BASELINE_OUTPUTS_MISMATCH:${grade.caseId}`,
      );
      assert(
        JSON.stringify([...gradeRecord.candidateOutputSha256].map((value) => value.toLowerCase()).sort()) === JSON.stringify([...expectedCandidateHashes].sort()),
        `REVALIDATION_GRADE_RECORD_CANDIDATE_OUTPUTS_MISMATCH:${grade.caseId}`,
      );
      assert(gradeRecord.baselineRunPassed.length === expectedBaselineHashes.length, `REVALIDATION_GRADE_RECORD_BASELINE_RUN_COUNT_INVALID:${grade.caseId}`);
      assert(gradeRecord.candidateRunPassed.length === expectedCandidateHashes.length, `REVALIDATION_GRADE_RECORD_CANDIDATE_RUN_COUNT_INVALID:${grade.caseId}`);
      const derivedBaselinePassed = gradeRecord.baselineRunPassed.every(Boolean);
      const derivedCandidatePassed = gradeRecord.candidateRunPassed.every(Boolean);
      const derivedHighRiskRegression = oracleEntry.riskLevel === "HIGH" && derivedBaselinePassed && !derivedCandidatePassed;
      assert(gradeRecord.baselinePassed === derivedBaselinePassed, `REVALIDATION_GRADE_RECORD_BASELINE_RESULT_NOT_DERIVED:${grade.caseId}`);
      assert(gradeRecord.candidatePassed === derivedCandidatePassed, `REVALIDATION_GRADE_RECORD_CANDIDATE_RESULT_NOT_DERIVED:${grade.caseId}`);
      assert(gradeRecord.highRiskRegression === derivedHighRiskRegression, `REVALIDATION_GRADE_RECORD_HIGH_RISK_NOT_DERIVED:${grade.caseId}`);
      assert(grade.baselinePassed === gradeRecord.baselinePassed, `REVALIDATION_GRADE_BASELINE_RESULT_MISMATCH:${grade.caseId}`);
      assert(grade.candidatePassed === gradeRecord.candidatePassed, `REVALIDATION_GRADE_CANDIDATE_RESULT_MISMATCH:${grade.caseId}`);
      assert(grade.highRiskRegression === gradeRecord.highRiskRegression, `REVALIDATION_GRADE_HIGH_RISK_MISMATCH:${grade.caseId}`);
      derivedGraderRecords.push({
        caseId: grade.caseId,
        gradingEvidencePath: grade.gradingEvidencePath,
        gradingEvidenceSha256: grade.gradingEvidenceSha256.toLowerCase(),
        baselinePassed: grade.baselinePassed,
        candidatePassed: grade.candidatePassed,
        highRiskRegression: grade.highRiskRegression,
      });
    }
    const canonicalGraderRecords = [...derivedGraderRecords].sort((left, right) => left.caseId.localeCompare(right.caseId));
    const derivedGradeRecordSetSha256 = sha256(Buffer.from(JSON.stringify(canonicalGraderRecords), "utf8"));
    assert(grading.gradeRecordSetSha256.toLowerCase() === derivedGradeRecordSetSha256, "REVALIDATION_GRADE_RECORD_SET_HASH_NOT_DERIVED");
    assert(graderResult.gradeRecordSetSha256.toLowerCase() === derivedGradeRecordSetSha256, "REVALIDATION_GRADER_RESULT_RECORD_SET_HASH_MISMATCH");
    const normalizedGraderResultRecords = [...graderResult.records]
      .map((record) => ({
        caseId: record.caseId,
        gradingEvidencePath: record.gradingEvidencePath,
        gradingEvidenceSha256: record.gradingEvidenceSha256.toLowerCase(),
        baselinePassed: record.baselinePassed,
        candidatePassed: record.candidatePassed,
        highRiskRegression: record.highRiskRegression,
      }))
      .sort((left, right) => left.caseId.localeCompare(right.caseId));
    assert(
      JSON.stringify(normalizedGraderResultRecords) === JSON.stringify(canonicalGraderRecords),
      "REVALIDATION_GRADER_RESULT_RECORDS_MISMATCH",
    );
    assert(grading.baselineHiddenEvaluated === grading.grades.length, "REVALIDATION_GRADING_BASELINE_EVALUATED_NOT_DERIVED");
    assert(grading.candidateHiddenEvaluated === grading.grades.length, "REVALIDATION_GRADING_CANDIDATE_EVALUATED_NOT_DERIVED");
    assert(grading.baselineHiddenPassed === grading.grades.filter((grade) => grade.baselinePassed).length, "REVALIDATION_GRADING_BASELINE_PASSED_NOT_DERIVED");
    assert(grading.candidateHiddenPassed === grading.grades.filter((grade) => grade.candidatePassed).length, "REVALIDATION_GRADING_CANDIDATE_PASSED_NOT_DERIVED");
    assert(grading.highRiskRegressionCount === grading.grades.filter((grade) => grade.highRiskRegression).length, "REVALIDATION_GRADING_HIGH_RISK_NOT_DERIVED");
    for (const field of ["baselineHiddenEvaluated", "candidateHiddenEvaluated", "baselineHiddenPassed", "candidateHiddenPassed", "highRiskRegressionCount"]) {
      assert(grading[field] === report.evaluation[field], `REVALIDATION_GRADING_MISMATCH:${field}`);
    }
  } else {
    for (const field of ["baselineHiddenPassed", "candidateHiddenPassed", "highRiskRegressionCount"]) {
      assert(report.evaluation[field] === null, `REVALIDATION_UNGRADED_METRIC_PRESENT:${field}`);
    }
  }

  const deriveEconomicMetrics = (profile, passedField, costField, p95Field) => {
    const hiddenCalls = costReceipt.calls.filter((call) => corpusCasesById.get(call.caseId)?.split === "HIDDEN" && call.profile === profile);
    const passed = report.evaluation[passedField];
    const expectedCostPerSuccess = Number.isInteger(passed) && passed > 0
      ? sum(hiddenCalls.map((call) => call.settledCostCad)) / passed
      : null;
    if (expectedCostPerSuccess === null) {
      assert(report.evaluation[costField] === null, `REVALIDATION_COST_PER_SUCCESS_UNDEFINED:${profile}`);
    } else {
      assert(numbersEqual(report.evaluation[costField], expectedCostPerSuccess), `REVALIDATION_COST_PER_SUCCESS_NOT_DERIVED:${profile}`);
    }
    const expectedP95 = outputStats.get(profile).hiddenP95;
    if (expectedP95 === null) {
      assert(report.evaluation[p95Field] === null, `REVALIDATION_P95_UNDEFINED:${profile}`);
    } else {
      assert(numbersEqual(report.evaluation[p95Field], expectedP95), `REVALIDATION_P95_NOT_DERIVED:${profile}`);
    }
  };
  deriveEconomicMetrics("BASELINE", "baselineHiddenPassed", "baselineCostPerSuccessCad", "baselineP95DurationMs");
  deriveEconomicMetrics("CANDIDATE", "candidateHiddenPassed", "candidateCostPerSuccessCad", "candidateP95DurationMs");

  if (providerStatus === "PILOT_STOPPED") {
    assert(phases.get("G6").status === "REWORK", "REVALIDATION_PILOT_STOP_G6_INVALID");
    assert(["REWORK", "REJECT"].includes(report.providerVerdict), "REVALIDATION_PILOT_STOP_VERDICT_INVALID");
    assert(report.adoptionDecision === "DO_NOT_ADOPT", "REVALIDATION_PILOT_STOP_ADOPTION_INVALID");
    assert(report.evaluation.stabilityRepetitions === null, "REVALIDATION_PILOT_STOP_STABILITY_OVERCLAIM");
    const bothDevelopmentComplete =
      report.evaluation.baselineDevelopmentEvaluated === 64 &&
      report.evaluation.candidateDevelopmentEvaluated === 64;
    if (!bothDevelopmentComplete) {
      assert(report.evaluation.baselineHiddenEvaluated === 0 && report.evaluation.candidateHiddenEvaluated === 0, "REVALIDATION_HIDDEN_RUN_BEFORE_DEVELOPMENT_COMPLETE");
    }
  } else {
    assert(providerStatus === "FULL_BAKEOFF_COMPLETED", "REVALIDATION_PROVIDER_STATUS_INVALID");
    assert(["PASS", "REWORK"].includes(phases.get("G6").status), "REVALIDATION_FULL_BAKEOFF_G6_INVALID");
    assert(report.models.runtimeBaseline.access === "SERVED_MODEL_CONFIRMED", "REVALIDATION_BASELINE_MODEL_UNCONFIRMED");
    assert(report.models.runtimeCandidate.access === "SERVED_MODEL_CONFIRMED", "REVALIDATION_CANDIDATE_MODEL_UNCONFIRMED");
    assert(report.evaluation.baselineDevelopmentEvaluated === 64, "REVALIDATION_BASELINE_DEVELOPMENT_INCOMPLETE");
    assert(report.evaluation.candidateDevelopmentEvaluated === 64, "REVALIDATION_CANDIDATE_DEVELOPMENT_INCOMPLETE");
    assert(report.evaluation.baselineHiddenEvaluated === 32, "REVALIDATION_BASELINE_HIDDEN_INCOMPLETE");
    assert(report.evaluation.candidateHiddenEvaluated === 32, "REVALIDATION_CANDIDATE_HIDDEN_INCOMPLETE");
    assert(Number.isInteger(report.evaluation.stabilityRepetitions) && report.evaluation.stabilityRepetitions >= 1, "REVALIDATION_STABILITY_REPETITIONS_INVALID");
    assert(pricingProof.plannedStabilityRepetitions === report.evaluation.stabilityRepetitions, "REVALIDATION_STABILITY_PRICING_MISMATCH");
    assert(Boolean(grading), "REVALIDATION_FULL_BAKEOFF_GRADING_MISSING");
    assert(outputStats.get("BASELINE").completedDevelopmentEntries === 64, "REVALIDATION_BASELINE_DEVELOPMENT_RUN_COUNT_INVALID");
    assert(outputStats.get("CANDIDATE").completedDevelopmentEntries === 64, "REVALIDATION_CANDIDATE_DEVELOPMENT_RUN_COUNT_INVALID");
    assert(outputStats.get("BASELINE").completedHiddenEntries === 32 * report.evaluation.stabilityRepetitions, "REVALIDATION_BASELINE_STABILITY_RUNS_INCOMPLETE");
    assert(outputStats.get("CANDIDATE").completedHiddenEntries === 32 * report.evaluation.stabilityRepetitions, "REVALIDATION_CANDIDATE_STABILITY_RUNS_INCOMPLETE");
    for (const profile of ["BASELINE", "CANDIDATE"]) {
      const hashesByCase = hiddenOutputHashesByProfile.get(profile);
      for (const testCase of corpus.cases.filter((item) => item.split === "HIDDEN")) {
        assert((hashesByCase.get(testCase.caseId) ?? []).length === report.evaluation.stabilityRepetitions, `REVALIDATION_HIDDEN_REPETITION_COUNT_INVALID:${profile}:${testCase.caseId}`);
      }
    }
    assert(report.evaluation.providerCalls >= 128 + 64 * report.evaluation.stabilityRepetitions, "REVALIDATION_FULL_BAKEOFF_CALLS_INCOMPLETE");
    if (report.providerVerdict === "ADVANCED_MODEL_REVALIDATION_PASS") {
      assert(phases.get("G6").status === "PASS", "REVALIDATION_PROVIDER_PASS_G6_INVALID");
    } else {
      assert(phases.get("G6").status === "REWORK", "REVALIDATION_PROVIDER_NONPASS_G6_INVALID");
    }
  }
}

if (report.providerVerdict === "ADVANCED_MODEL_REVALIDATION_PASS") {
  assert(providerStatus === "FULL_BAKEOFF_COMPLETED", "REVALIDATION_PROVIDER_PASS_WITHOUT_FULL_BAKEOFF");
  assert(report.evaluation.providerCostSettlementStatus === "SETTLED" && report.evaluation.unsettledProviderCalls === 0, "REVALIDATION_PROVIDER_PASS_COSTS_UNSETTLED");
  assert(report.evaluation.providerReconciliationStatus === "VERIFIED", "REVALIDATION_PROVIDER_PASS_NOT_RECONCILED_WITH_OPENROUTER");
  assert(report.evaluation.providerReconciledCalls === report.evaluation.providerCalls, "REVALIDATION_PROVIDER_PASS_RECONCILIATION_INCOMPLETE");
  assert([...outputEntriesByRequestId.values()].every((entry) => entry.completed && entry.outcome === "COMPLETED"), "REVALIDATION_PROVIDER_PASS_HAS_FAILED_CALLS");
  assert(report.localResult === "LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED", "REVALIDATION_PROVIDER_PASS_LOCAL_RESULT_INVALID");
  assert(report.findingsSummary.openP0 === 0 && report.findingsSummary.openP1 === 0, "REVALIDATION_PROVIDER_PASS_CRITICAL_FINDINGS");
  assert(report.evaluation.deterministicFailures === 0, "REVALIDATION_PROVIDER_PASS_DETERMINISTIC_FAILURES");
  assert(report.evaluation.criticalInvariantsTotal > 0, "REVALIDATION_PROVIDER_PASS_NO_CRITICAL_INVARIANTS");
  assert(
    report.evaluation.criticalInvariantsObserved === report.evaluation.criticalInvariantsTotal &&
      report.evaluation.criticalInvariantsFailed === 0,
    "REVALIDATION_PROVIDER_PASS_INVARIANTS_FAILED",
  );
  assert(report.evaluation.highRiskRegressionCount === 0, "REVALIDATION_PROVIDER_PASS_HIGH_RISK_REGRESSION");
  assert(!incidentObserved, "REVALIDATION_PROVIDER_PASS_INCIDENT_OBSERVED");
  const qualityWin = report.evaluation.candidateHiddenPassed >= report.evaluation.baselineHiddenPassed + 4;
  const tiedQuality = report.evaluation.candidateHiddenPassed === report.evaluation.baselineHiddenPassed;
  const costGain =
    report.evaluation.baselineCostPerSuccessCad > 0 &&
    report.evaluation.candidateCostPerSuccessCad <= report.evaluation.baselineCostPerSuccessCad * 0.8;
  const latencyGain =
    report.evaluation.baselineP95DurationMs > 0 &&
    report.evaluation.candidateP95DurationMs <= report.evaluation.baselineP95DurationMs * 0.8;
  assert(report.evaluation.candidateHiddenPassed >= 24, "REVALIDATION_PROVIDER_PASS_ABSOLUTE_QUALITY_FLOOR_NOT_MET");
  assert(qualityWin || (tiedQuality && (costGain || latencyGain)), "REVALIDATION_PROVIDER_PASS_THRESHOLD_NOT_MET");
  assert(["EVALUATE_ROUTER_POLICY", "DO_NOT_ADOPT"].includes(report.adoptionDecision), "REVALIDATION_PROVIDER_PASS_ADOPTION_INVALID");
}

if (report.providerVerdict === "REWORK") {
  assert(phases.get("G6").status === "REWORK", "REVALIDATION_PROVIDER_REWORK_G6_INVALID");
  if (providerStatus === "PILOT_STOPPED") {
    assert(report.adoptionDecision === "DO_NOT_ADOPT", "REVALIDATION_PILOT_REWORK_ADOPTION_INVALID");
  } else {
    assert(["EVALUATE_ROUTER_POLICY", "DO_NOT_ADOPT"].includes(report.adoptionDecision), "REVALIDATION_REWORK_ADOPTION_INVALID");
  }
}

if (report.providerVerdict === "REJECT") {
  assert(phases.get("G6").status === "REWORK", "REVALIDATION_PROVIDER_REJECT_G6_INVALID");
  assert(report.adoptionDecision === "DO_NOT_ADOPT", "REVALIDATION_REJECT_ADOPTION_INVALID");
  const candidateWorse =
    Number.isInteger(report.evaluation.candidateHiddenPassed) &&
    Number.isInteger(report.evaluation.baselineHiddenPassed) &&
    report.evaluation.candidateHiddenPassed < report.evaluation.baselineHiddenPassed;
  const noEconomicGainAtTiedQuality =
    report.evaluation.candidateHiddenPassed === report.evaluation.baselineHiddenPassed &&
    Number.isFinite(report.evaluation.candidateCostPerSuccessCad) &&
    Number.isFinite(report.evaluation.baselineCostPerSuccessCad) &&
    Number.isFinite(report.evaluation.candidateP95DurationMs) &&
    Number.isFinite(report.evaluation.baselineP95DurationMs) &&
    report.evaluation.candidateCostPerSuccessCad >= report.evaluation.baselineCostPerSuccessCad &&
    report.evaluation.candidateP95DurationMs >= report.evaluation.baselineP95DurationMs;
  const rejectCauseObserved =
    incidentObserved ||
    runtimeModelMismatch ||
    (Number.isInteger(report.evaluation.highRiskRegressionCount) && report.evaluation.highRiskRegressionCount > 0) ||
    report.evaluation.deterministicFailures > 0 ||
    report.evaluation.criticalInvariantsFailed > 0 ||
    report.findingsSummary.openP0 > 0 ||
    report.findingsSummary.openP1 > 0 ||
    candidateWorse ||
    noEconomicGainAtTiedQuality;
  assert(rejectCauseObserved, "REVALIDATION_REJECT_CAUSE_NOT_OBSERVED");
}

for (const artifact of report.artifacts) {
  const bytes = readFileSync(resolveArtifactPath(artifact.path));
  assert(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256.toLowerCase(), `REVALIDATION_ARTIFACT_MUTATED_DURING_VALIDATION:${artifact.path}`);
}

const output = {
  schemaVersion: report.schemaVersion,
  runId: report.runId,
  localResult: report.localResult,
  providerVerdict: report.providerVerdict,
  adoptionDecision: report.adoptionDecision,
  productHead: report.source.productHead,
  specHead: report.source.specHead,
  campaignHead: report.source.campaignHead,
  finalHead: report.source.finalHead,
  brainFinalHead: report.source.brainFinalHead,
  artifacts: report.artifacts.length,
  sealSha256: sha256(rawBytes),
};

console.log(JSON.stringify(output, null, 2));
