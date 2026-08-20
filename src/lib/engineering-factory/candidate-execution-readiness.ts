import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { BakeoffParticipant } from "@/lib/engineering-factory/bakeoff";
import type { DevBenchRun } from "@/lib/engineering-factory/devbench-run";
import type { DryRunTrialPlan } from "@/lib/engineering-factory/measured-trial-v2";

const FORBIDDEN_FIELD =
  /(?:prompt|output|secret|token|authorization|attachment|content|api[_-]?key|credential|command|executablePath|wrapperPath|endpoint|baseUrl)/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/;
const PLACEHOLDER = /^(?:REPLACE|TODO|TBD|CHOOSE)(?:[A-Z0-9_:/ -]*)$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export const CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY =
  ".scratch/engineering-factory/candidate-execution-authority";
const CANDIDATE_EXECUTION_AUTHORITY_FILE_NAME = "candidate-execution-authority.json";

export type CandidateRunnerDeclaration = {
  participant: BakeoffParticipant;
  candidateLabel: string;
  modelLabel: string;
  harnessLabel: string;
  reasoningEffort: DevBenchRun["candidate"]["reasoningEffort"];
  executableSha256: string;
  wrapperSha256: string;
};

export type CandidateExecutionAuthority = {
  schemaVersion: 1;
  status: "DRAFT" | "APPROVED";
  planFingerprint: string;
  executionMode: "external-isolated-runner";
  workspaceMode: "detached-frozen-worktree";
  candidateInputBoundary: "frozen-devbench-only";
  environmentProjection: "allowlist-names-only";
  resultProjection: "privacy-checked-measured-run-only";
  networkPolicyEvidenceId: string;
  providerDataBoundaryEvidenceId: string;
  independentReviewId: string;
  runners: readonly CandidateRunnerDeclaration[];
};

export type CandidateExecutionReadinessReport = {
  status: "EXECUTION_REVIEW_READY";
  planFingerprint: string;
  executionMode: CandidateExecutionAuthority["executionMode"];
  workspaceMode: CandidateExecutionAuthority["workspaceMode"];
  candidateInputBoundary: CandidateExecutionAuthority["candidateInputBoundary"];
  environmentProjection: CandidateExecutionAuthority["environmentProjection"];
  resultProjection: CandidateExecutionAuthority["resultProjection"];
  runnerFingerprints: readonly Pick<
    CandidateRunnerDeclaration,
    "participant" | "executableSha256" | "wrapperSha256"
  >[];
};

export class CandidateExecutionReadinessRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateExecutionReadinessRefusal";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowlist = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowlist.has(key));
  if (unknown) {
    throw new CandidateExecutionReadinessRefusal(`unknown field is forbidden: ${unknown}`);
  }
}

function scanForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const nested of value) scanForbiddenFields(nested);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) {
      throw new CandidateExecutionReadinessRefusal(`sensitive field is forbidden: ${key}`);
    }
    scanForbiddenFields(nested);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CandidateExecutionReadinessRefusal(`${field} is required`);
  }
  return value;
}

function evidenceReference(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (PLACEHOLDER.test(parsed)) {
    throw new CandidateExecutionReadinessRefusal(`${field} contains a placeholder`);
  }
  if (!SAFE_REFERENCE.test(parsed)) {
    throw new CandidateExecutionReadinessRefusal(`${field} must be an opaque evidence reference`);
  }
  return parsed;
}

function sha256(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (!SHA256.test(parsed)) {
    throw new CandidateExecutionReadinessRefusal(`${field} must be a SHA-256 fingerprint`);
  }
  return parsed.toLowerCase();
}

function literal<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new CandidateExecutionReadinessRefusal(`${field} must be ${expected}`);
  }
  return expected;
}

function parseRunner(value: unknown): CandidateRunnerDeclaration {
  if (!isRecord(value)) throw new CandidateExecutionReadinessRefusal("runner declaration is malformed");
  assertOnlyKeys(value, [
    "participant",
    "candidateLabel",
    "modelLabel",
    "harnessLabel",
    "reasoningEffort",
    "executableSha256",
    "wrapperSha256",
  ]);
  if (value.participant !== "Codex" && value.participant !== "Claude") {
    throw new CandidateExecutionReadinessRefusal("runner.participant is invalid");
  }
  if (
    value.reasoningEffort !== "low" &&
    value.reasoningEffort !== "medium" &&
    value.reasoningEffort !== "high" &&
    value.reasoningEffort !== "xhigh"
  ) {
    throw new CandidateExecutionReadinessRefusal("runner.reasoningEffort is invalid");
  }
  return {
    participant: value.participant,
    candidateLabel: requiredString(value.candidateLabel, "runner.candidateLabel"),
    modelLabel: requiredString(value.modelLabel, "runner.modelLabel"),
    harnessLabel: requiredString(value.harnessLabel, "runner.harnessLabel"),
    reasoningEffort: value.reasoningEffort,
    executableSha256: sha256(value.executableSha256, "runner.executableSha256"),
    wrapperSha256: sha256(value.wrapperSha256, "runner.wrapperSha256"),
  };
}

function parseAuthority(value: unknown): CandidateExecutionAuthority {
  scanForbiddenFields(value);
  if (!isRecord(value)) {
    throw new CandidateExecutionReadinessRefusal("candidate execution authority is malformed");
  }
  assertOnlyKeys(value, [
    "schemaVersion",
    "status",
    "planFingerprint",
    "executionMode",
    "workspaceMode",
    "candidateInputBoundary",
    "environmentProjection",
    "resultProjection",
    "networkPolicyEvidenceId",
    "providerDataBoundaryEvidenceId",
    "independentReviewId",
    "runners",
  ]);
  if (value.schemaVersion !== 1) {
    throw new CandidateExecutionReadinessRefusal("unsupported candidate execution authority schema version");
  }
  if (value.status !== "DRAFT" && value.status !== "APPROVED") {
    throw new CandidateExecutionReadinessRefusal("candidate execution authority status is invalid");
  }
  if (!Array.isArray(value.runners)) {
    throw new CandidateExecutionReadinessRefusal("runner declarations are required");
  }
  return {
    schemaVersion: 1,
    status: value.status,
    planFingerprint: sha256(value.planFingerprint, "planFingerprint"),
    executionMode: literal(value.executionMode, "external-isolated-runner", "executionMode"),
    workspaceMode: literal(value.workspaceMode, "detached-frozen-worktree", "workspaceMode"),
    candidateInputBoundary: literal(
      value.candidateInputBoundary,
      "frozen-devbench-only",
      "candidateInputBoundary"
    ),
    environmentProjection: literal(
      value.environmentProjection,
      "allowlist-names-only",
      "environmentProjection"
    ),
    resultProjection: literal(
      value.resultProjection,
      "privacy-checked-measured-run-only",
      "resultProjection"
    ),
    networkPolicyEvidenceId: requiredString(value.networkPolicyEvidenceId, "networkPolicyEvidenceId"),
    providerDataBoundaryEvidenceId: requiredString(
      value.providerDataBoundaryEvidenceId,
      "providerDataBoundaryEvidenceId"
    ),
    independentReviewId: requiredString(value.independentReviewId, "independentReviewId"),
    runners: value.runners.map(parseRunner),
  };
}

function sortedRecord(value: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

/** Stable identity for the exact dry-run schedule and candidate declarations under review. */
export function createCandidateExecutionPlanFingerprint(plan: DryRunTrialPlan): string {
  const comparable = {
    schemaVersion: plan.schemaVersion,
    catalogName: plan.catalogName,
    catalogVersion: plan.catalogVersion,
    caseSeeds: sortedRecord(plan.caseSeeds),
    casePacketFingerprints: sortedRecord(plan.casePacketFingerprints),
    interventionRule: plan.interventionRule,
    costComparison: plan.costComparison,
    candidates: plan.candidates,
    schedule: plan.schedule,
  };
  return createHash("sha256").update(JSON.stringify(comparable), "utf8").digest("hex");
}

/**
 * Creates only an ignored local review template. Placeholder evidence and
 * fingerprints intentionally keep it inadmissible until an independent review.
 */
export function createCandidateExecutionAuthorityTemplate(plan: DryRunTrialPlan): CandidateExecutionAuthority {
  return {
    schemaVersion: 1,
    status: "DRAFT",
    planFingerprint: createCandidateExecutionPlanFingerprint(plan),
    executionMode: "external-isolated-runner",
    workspaceMode: "detached-frozen-worktree",
    candidateInputBoundary: "frozen-devbench-only",
    environmentProjection: "allowlist-names-only",
    resultProjection: "privacy-checked-measured-run-only",
    networkPolicyEvidenceId: "REPLACE_NETWORK_POLICY_EVIDENCE",
    providerDataBoundaryEvidenceId: "REPLACE_PROVIDER_DATA_BOUNDARY_EVIDENCE",
    independentReviewId: "REPLACE_INDEPENDENT_REVIEW",
    runners: plan.candidates.map((candidate) => ({
      participant: candidate.participant,
      candidateLabel: candidate.label,
      modelLabel: candidate.modelLabel,
      harnessLabel: candidate.harnessLabel,
      reasoningEffort: candidate.reasoningEffort,
      executableSha256: "REPLACE_EXECUTABLE_SHA256",
      wrapperSha256: "REPLACE_WRAPPER_SHA256",
    })),
  };
}

function assertRunnerSetMatchesPlan(
  plan: DryRunTrialPlan,
  runners: readonly CandidateRunnerDeclaration[]
): void {
  if (runners.length !== plan.candidates.length) {
    throw new CandidateExecutionReadinessRefusal(
      "runner declarations must match the frozen candidates exactly"
    );
  }
  const observed = new Set(runners.map((runner) => runner.participant));
  if (observed.size !== runners.length) {
    throw new CandidateExecutionReadinessRefusal(
      "runner declarations must match the frozen candidates exactly"
    );
  }
  for (const candidate of plan.candidates) {
    const runner = runners.find((entry) => entry.participant === candidate.participant);
    if (!runner) {
      throw new CandidateExecutionReadinessRefusal(
        "runner declarations must match the frozen candidates exactly"
      );
    }
    if (
      runner.candidateLabel !== candidate.label ||
      runner.modelLabel !== candidate.modelLabel ||
      runner.harnessLabel !== candidate.harnessLabel ||
      runner.reasoningEffort !== candidate.reasoningEffort
    ) {
      throw new CandidateExecutionReadinessRefusal(
        `runner declaration differs from the frozen candidate: ${candidate.participant}`
      );
    }
  }
}

/**
 * Admits evidence to independent review. This never launches a process and it
 * does not claim that referenced isolation controls exist merely because an ID
 * was supplied; the independent reviewer remains the authority for that proof.
 */
export function assessCandidateExecutionReadiness({
  plan,
  authority,
}: {
  plan: DryRunTrialPlan;
  authority: unknown;
}): CandidateExecutionReadinessReport {
  scanForbiddenFields(authority);
  if (!isRecord(authority)) {
    throw new CandidateExecutionReadinessRefusal("candidate execution authority is malformed");
  }
  if (authority.status !== "APPROVED") {
    throw new CandidateExecutionReadinessRefusal("candidate execution authority is not approved");
  }
  const parsed = parseAuthority(authority);
  const expectedFingerprint = createCandidateExecutionPlanFingerprint(plan);
  if (parsed.planFingerprint !== expectedFingerprint) {
    throw new CandidateExecutionReadinessRefusal(
      "planFingerprint differs from the frozen dry-run plan"
    );
  }
  parsed.networkPolicyEvidenceId = evidenceReference(
    parsed.networkPolicyEvidenceId,
    "networkPolicyEvidenceId"
  );
  parsed.providerDataBoundaryEvidenceId = evidenceReference(
    parsed.providerDataBoundaryEvidenceId,
    "providerDataBoundaryEvidenceId"
  );
  parsed.independentReviewId = evidenceReference(parsed.independentReviewId, "independentReviewId");
  assertRunnerSetMatchesPlan(plan, parsed.runners);

  return {
    status: "EXECUTION_REVIEW_READY",
    planFingerprint: expectedFingerprint,
    executionMode: parsed.executionMode,
    workspaceMode: parsed.workspaceMode,
    candidateInputBoundary: parsed.candidateInputBoundary,
    environmentProjection: parsed.environmentProjection,
    resultProjection: parsed.resultProjection,
    runnerFingerprints: parsed.runners.map((runner) => ({
      participant: runner.participant,
      executableSha256: runner.executableSha256,
      wrapperSha256: runner.wrapperSha256,
    })),
  };
}

function safeAuthorityPath(directory: string): string {
  const root = resolve(directory);
  const file = resolve(root, CANDIDATE_EXECUTION_AUTHORITY_FILE_NAME);
  if (basename(file) !== CANDIDATE_EXECUTION_AUTHORITY_FILE_NAME || !file.startsWith(`${root}\\`)) {
    throw new CandidateExecutionReadinessRefusal(
      "candidate execution authority path escapes its local directory"
    );
  }
  return file;
}

export async function writeCandidateExecutionAuthorityTemplate({
  plan,
  directory = CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY,
}: {
  plan: DryRunTrialPlan;
  directory?: string;
}): Promise<string> {
  const file = safeAuthorityPath(directory);
  await mkdir(resolve(directory), { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(createCandidateExecutionAuthorityTemplate(plan), null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new CandidateExecutionReadinessRefusal("candidate execution authority already exists");
    }
    throw error;
  }
  return file;
}

/** Read-only preflight. It cannot import or invoke a process launcher. */
export async function preflightCandidateExecutionAuthority({
  plan,
  file,
}: {
  plan: DryRunTrialPlan;
  file: string;
}): Promise<CandidateExecutionReadinessReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new CandidateExecutionReadinessRefusal("candidate execution authority is missing");
    }
    throw new CandidateExecutionReadinessRefusal("candidate execution authority is malformed");
  }
  return assessCandidateExecutionReadiness({ plan, authority: parsed });
}
