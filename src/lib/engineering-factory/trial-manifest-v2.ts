import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import {
  createDryRunTrialPlan,
  type DryRunCaseSeedMap,
  type DryRunTrialCandidate,
  type DryRunTrialPlan,
  DryRunTrialRefusal,
} from "@/lib/engineering-factory/measured-trial-v2";

const FORBIDDEN_FIELD = /(?:prompt|output|secret|token|authorization|attachment|content|api[_-]?key)/i;
const PLACEHOLDER = /^(?:REPLACE|TODO|TBD|CHOOSE)[A-Z0-9_ -]*$/i;

export const DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY = ".scratch/engineering-factory/dry-run-trial-config";
const DRY_RUN_TRIAL_MANIFEST_FILE_NAME = "dry-run-trial-config.json";

export type DryRunTrialConfigurationManifest = {
  schemaVersion: 2;
  status: "DRAFT" | "APPROVED";
  caseSeeds: DryRunCaseSeedMap;
  candidates: readonly DryRunTrialCandidate[];
};

export class DryRunTrialManifestRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DryRunTrialManifestRefusal";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scanForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const nested of value) scanForbiddenFields(nested);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) throw new DryRunTrialManifestRefusal(`sensitive field is forbidden: ${key}`);
    scanForbiddenFields(nested);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DryRunTrialManifestRefusal(`${field} is required`);
  return value;
}

function parseCandidate(value: unknown): DryRunTrialCandidate {
  if (!isRecord(value)) throw new DryRunTrialManifestRefusal("candidate is malformed");
  if (value.participant !== "Codex" && value.participant !== "Claude") {
    throw new DryRunTrialManifestRefusal("candidate.participant is invalid");
  }
  if (value.reasoningEffort !== "low" && value.reasoningEffort !== "medium" && value.reasoningEffort !== "high" && value.reasoningEffort !== "xhigh") {
    throw new DryRunTrialManifestRefusal("candidate.reasoningEffort is invalid");
  }
  if (value.costSource !== "unavailable") {
    throw new DryRunTrialManifestRefusal("dry-run costSource must be unavailable");
  }
  return {
    participant: value.participant,
    label: requiredString(value.label, "candidate.label"),
    modelLabel: requiredString(value.modelLabel, "candidate.modelLabel"),
    harnessLabel: requiredString(value.harnessLabel, "candidate.harnessLabel"),
    reasoningEffort: value.reasoningEffort,
    costSource: "unavailable",
  };
}

function parseManifest(value: unknown): DryRunTrialConfigurationManifest {
  scanForbiddenFields(value);
  if (!isRecord(value)) throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest is malformed");
  if (value.schemaVersion !== 2) throw new DryRunTrialManifestRefusal("unsupported dry-run trial configuration manifest schema version");
  if (value.status !== "DRAFT" && value.status !== "APPROVED") {
    throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest status is invalid");
  }
  if (!isRecord(value.caseSeeds)) throw new DryRunTrialManifestRefusal("caseSeeds are required");
  if (!Array.isArray(value.candidates)) throw new DryRunTrialManifestRefusal("candidates are required");
  return {
    schemaVersion: 2,
    status: value.status,
    caseSeeds: Object.fromEntries(Object.entries(value.caseSeeds).map(([caseId, commit]) => [caseId, requiredString(commit, `caseSeeds.${caseId}`)])),
    candidates: value.candidates.map(parseCandidate),
  };
}

function assertNoPlaceholders(manifest: DryRunTrialConfigurationManifest): void {
  const values = [
    ...Object.values(manifest.caseSeeds),
    ...manifest.candidates.flatMap((candidate) => [candidate.label, candidate.modelLabel, candidate.harnessLabel]),
  ];
  if (values.some((value) => PLACEHOLDER.test(value))) {
    throw new DryRunTrialManifestRefusal("approved dry-run trial configuration manifest contains a placeholder");
  }
}

function safeManifestPath(directory: string): string {
  const root = resolve(directory);
  const file = resolve(root, DRY_RUN_TRIAL_MANIFEST_FILE_NAME);
  if (basename(file) !== DRY_RUN_TRIAL_MANIFEST_FILE_NAME || !file.startsWith(`${root}\\`)) {
    throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest path escapes its local directory");
  }
  return file;
}

/** Creates a local-only input template. It never invokes a model or provider. */
export function createDryRunTrialManifestTemplate(caseSeeds: DryRunCaseSeedMap): DryRunTrialConfigurationManifest {
  return {
    schemaVersion: 2,
    status: "DRAFT",
    caseSeeds: { ...caseSeeds },
    candidates: [
      {
        participant: "Codex",
        label: "REPLACE_CODEX_LABEL",
        modelLabel: "REPLACE_CODEX_MODEL",
        harnessLabel: "REPLACE_CODEX_HARNESS",
        reasoningEffort: "high",
        costSource: "unavailable",
      },
      {
        participant: "Claude",
        label: "REPLACE_CLAUDE_LABEL",
        modelLabel: "REPLACE_CLAUDE_MODEL",
        harnessLabel: "REPLACE_CLAUDE_HARNESS",
        reasoningEffort: "high",
        costSource: "unavailable",
      },
    ],
  };
}

export async function writeDryRunTrialManifestTemplate({
  caseSeeds,
  directory = DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY,
}: {
  caseSeeds: DryRunCaseSeedMap;
  directory?: string;
}): Promise<string> {
  const file = safeManifestPath(directory);
  await mkdir(resolve(directory), { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(createDryRunTrialManifestTemplate(caseSeeds), null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest already exists");
    }
    throw error;
  }
  return file;
}

export function createApprovedDryRunTrialPlanFromManifest({
  manifest,
  catalog,
}: {
  manifest: unknown;
  catalog: DevBenchCatalog;
}): DryRunTrialPlan {
  const parsed = parseManifest(manifest);
  if (parsed.status !== "APPROVED") throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest is not approved");
  assertNoPlaceholders(parsed);
  try {
    return createDryRunTrialPlan({ catalog, caseSeeds: parsed.caseSeeds, candidates: parsed.candidates });
  } catch (error) {
    if (error instanceof DryRunTrialRefusal) throw new DryRunTrialManifestRefusal(error.message);
    throw error;
  }
}

/** Read-only local preflight. It produces a schedule but never starts a candidate. */
export async function preflightApprovedDryRunTrialManifest({
  file,
  catalog,
}: {
  file: string;
  catalog: DevBenchCatalog;
}): Promise<{ manifest: DryRunTrialConfigurationManifest; plan: DryRunTrialPlan }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new DryRunTrialManifestRefusal("dry-run trial configuration manifest is malformed");
  }
  const manifest = parseManifest(parsed);
  const plan = createApprovedDryRunTrialPlanFromManifest({ manifest, catalog });
  return { manifest, plan };
}
