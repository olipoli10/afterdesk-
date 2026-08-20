import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import {
  createMeasuredTrialPlan,
  type MeasuredTrialCandidate,
  type MeasuredTrialPlan,
  MeasuredTrialRefusal,
} from "@/lib/engineering-factory/measured-trial";

const FORBIDDEN_FIELD = /(?:prompt|output|secret|token|authorization|attachment|content|api[_-]?key)/i;
const PLACEHOLDER = /^(?:REPLACE|TODO|TBD|CHOOSE)[A-Z0-9_ -]*$/i;

export const TRIAL_MANIFEST_LOCAL_DIRECTORY = ".scratch/engineering-factory/trial-config";
const TRIAL_MANIFEST_FILE_NAME = "trial-config.json";

export type TrialConfigurationManifest = {
  schemaVersion: 1;
  status: "DRAFT" | "APPROVED";
  startingCommit: string;
  candidates: readonly MeasuredTrialCandidate[];
};

export class TrialManifestRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrialManifestRefusal";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scanForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) scanForbiddenFields(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) throw new TrialManifestRefusal(`sensitive field is forbidden: ${key}`);
    scanForbiddenFields(nested);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TrialManifestRefusal(`${field} is required`);
  return value;
}

function parseCandidate(value: unknown): MeasuredTrialCandidate {
  if (!isRecord(value)) throw new TrialManifestRefusal("candidate is malformed");
  const participant = value.participant;
  if (participant !== "Codex" && participant !== "Claude") {
    throw new TrialManifestRefusal("candidate.participant is invalid");
  }
  const reasoningEffort = value.reasoningEffort;
  if (reasoningEffort !== "low" && reasoningEffort !== "medium" && reasoningEffort !== "high" && reasoningEffort !== "xhigh") {
    throw new TrialManifestRefusal("candidate.reasoningEffort is invalid");
  }
  const costSource = value.costSource;
  if (costSource !== "harness-meter" && costSource !== "provider-billing-export") {
    throw new TrialManifestRefusal("candidate.costSource must be a supported meter");
  }

  return {
    participant,
    label: requiredString(value.label, "candidate.label"),
    modelLabel: requiredString(value.modelLabel, "candidate.modelLabel"),
    harnessLabel: requiredString(value.harnessLabel, "candidate.harnessLabel"),
    reasoningEffort,
    costSource,
  };
}

function parseManifest(value: unknown): TrialConfigurationManifest {
  scanForbiddenFields(value);
  if (!isRecord(value)) throw new TrialManifestRefusal("trial configuration manifest is malformed");
  if (value.schemaVersion !== 1) throw new TrialManifestRefusal("unsupported trial configuration manifest schema version");
  if (value.status !== "DRAFT" && value.status !== "APPROVED") {
    throw new TrialManifestRefusal("trial configuration manifest status is invalid");
  }
  if (!Array.isArray(value.candidates)) throw new TrialManifestRefusal("trial configuration manifest candidates are required");

  return {
    schemaVersion: 1,
    status: value.status,
    startingCommit: requiredString(value.startingCommit, "startingCommit"),
    candidates: value.candidates.map(parseCandidate),
  };
}

function assertNoPlaceholders(manifest: TrialConfigurationManifest): void {
  const placeholders = [
    manifest.startingCommit,
    ...manifest.candidates.flatMap((candidate) => [candidate.label, candidate.modelLabel, candidate.harnessLabel]),
  ];
  if (placeholders.some((value) => PLACEHOLDER.test(value))) {
    throw new TrialManifestRefusal("approved trial configuration manifest contains a placeholder");
  }
}

function safeManifestPath(directory: string): string {
  const root = resolve(directory);
  const file = resolve(root, TRIAL_MANIFEST_FILE_NAME);
  if (basename(file) !== TRIAL_MANIFEST_FILE_NAME || !file.startsWith(`${root}\\`)) {
    throw new TrialManifestRefusal("trial configuration manifest path escapes its local directory");
  }
  return file;
}

/**
 * Writes an operator-editable local template. It intentionally contains no
 * provider credential or real candidate configuration and is never evidence.
 */
export function createTrialManifestTemplate(startingCommit: string): TrialConfigurationManifest {
  if (!/^[0-9a-f]{40}$/i.test(startingCommit)) {
    throw new TrialManifestRefusal("startingCommit must be a frozen 40-character git commit");
  }
  return {
    schemaVersion: 1,
    status: "DRAFT",
    startingCommit,
    candidates: [
      {
        participant: "Codex",
        label: "REPLACE_CANDIDATE_A",
        modelLabel: "REPLACE_MODEL_LABEL_A",
        harnessLabel: "REPLACE_HARNESS_LABEL_A",
        reasoningEffort: "high",
        costSource: "harness-meter",
      },
      {
        participant: "Claude",
        label: "REPLACE_CANDIDATE_B",
        modelLabel: "REPLACE_MODEL_LABEL_B",
        harnessLabel: "REPLACE_HARNESS_LABEL_B",
        reasoningEffort: "high",
        costSource: "provider-billing-export",
      },
    ],
  };
}

export async function writeTrialManifestTemplate({
  startingCommit,
  directory = TRIAL_MANIFEST_LOCAL_DIRECTORY,
}: {
  startingCommit: string;
  directory?: string;
}): Promise<string> {
  const file = safeManifestPath(directory);
  await mkdir(resolve(directory), { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(createTrialManifestTemplate(startingCommit), null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new TrialManifestRefusal("trial configuration manifest already exists");
    }
    throw error;
  }
  return file;
}

export function createApprovedTrialPlanFromManifest({
  manifest,
  catalog,
}: {
  manifest: unknown;
  catalog: DevBenchCatalog;
}): MeasuredTrialPlan {
  const parsed = parseManifest(manifest);
  if (parsed.status !== "APPROVED") throw new TrialManifestRefusal("trial configuration manifest is not approved");
  assertNoPlaceholders(parsed);
  try {
    return createMeasuredTrialPlan({ catalog, startingCommit: parsed.startingCommit, candidates: parsed.candidates });
  } catch (error) {
    if (error instanceof MeasuredTrialRefusal) throw error;
    throw new TrialManifestRefusal(error instanceof Error ? error.message : "trial configuration manifest is invalid");
  }
}

export async function readApprovedTrialManifest({
  file,
  catalog,
}: {
  file: string;
  catalog: DevBenchCatalog;
}): Promise<TrialConfigurationManifest> {
  return (await preflightApprovedTrialManifest({ file, catalog })).manifest;
}

/**
 * Performs read-only local validation before a human authorizes any candidate
 * process. It intentionally returns a plan but never starts a trial.
 */
export async function preflightApprovedTrialManifest({
  file,
  catalog,
}: {
  file: string;
  catalog: DevBenchCatalog;
}): Promise<{ manifest: TrialConfigurationManifest; plan: MeasuredTrialPlan }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new TrialManifestRefusal("trial configuration manifest is malformed");
  }
  const manifest = parseManifest(parsed);
  const plan = createApprovedTrialPlanFromManifest({ manifest, catalog });
  return { manifest, plan };
}
