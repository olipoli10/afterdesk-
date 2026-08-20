import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";

export type DevBenchRunOutcome = {
  caseId: string;
  oracle: "pass" | "fail";
  mutation: "caught-and-restored" | "not-run" | "not-caught" | "not-restored";
  scope: "pass" | "fail";
  commands: readonly { command: string; exitCode: number }[];
};

export type DevBenchRun = {
  schemaVersion: 1;
  runId: string;
  catalogVersion: 1;
  startingCommit: string;
  candidate: {
    label: string;
    modelLabel: string;
    harnessLabel: string;
    reasoningEffort: "low" | "medium" | "high" | "xhigh";
    contextMode: "sanitized-frozen-checkout";
    networkAccess: "none";
  };
  measurements: {
    elapsedSeconds: number;
    costCents: number;
    humanInterventions: number;
  };
  outcomes: readonly DevBenchRunOutcome[];
  reviewerVerdict: "accepted" | "rejected";
};

export type DevBenchRunReport = {
  ok: boolean;
  errors: string[];
  acceptedCaseCount: number;
};

const FORBIDDEN_FIELD = /(?:prompt|output|secret|token|authorization|attachment|content)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scanForbiddenFields(value: unknown, errors: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) scanForbiddenFields(item, errors);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key)) {
      errors.push(`sensitive field is forbidden: ${key}`);
    }
    scanForbiddenFields(nested, errors);
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validates only evidence metadata. It intentionally cannot accept or retain
 * provider requests, responses, credentials or customer content.
 */
export function validateDevBenchRun(
  value: unknown,
  catalog: DevBenchCatalog,
  expectedCaseIds: readonly string[] = catalog.cases.map((benchCase) => benchCase.id)
): DevBenchRunReport {
  const errors: string[] = [];
  scanForbiddenFields(value, errors);
  if (!isRecord(value)) {
    return { ok: false, errors: ["run record must be an object"], acceptedCaseCount: 0 };
  }

  if (value.schemaVersion !== 1) errors.push("unsupported run schema version");
  if (value.catalogVersion !== catalog.version) errors.push("catalog version does not match");
  if (typeof value.runId !== "string" || !value.runId.trim()) errors.push("runId is required");
  if (typeof value.startingCommit !== "string" || !/^[0-9a-f]{40}$/i.test(value.startingCommit)) {
    errors.push("startingCommit must be a 40-character git commit");
  }

  const candidate = value.candidate;
  if (!isRecord(candidate)) {
    errors.push("candidate is required");
  } else {
    for (const key of ["label", "modelLabel", "harnessLabel"] as const) {
      if (typeof candidate[key] !== "string" || !candidate[key].trim()) {
        errors.push(`candidate.${key} is required`);
      }
    }
    if (!(["low", "medium", "high", "xhigh"] as const).includes(candidate.reasoningEffort as never)) {
      errors.push("candidate.reasoningEffort is invalid");
    }
    if (candidate.contextMode !== "sanitized-frozen-checkout") {
      errors.push("candidate.contextMode must be sanitized-frozen-checkout");
    }
    if (candidate.networkAccess !== "none") errors.push("candidate.networkAccess must be none");
  }

  const measurements = value.measurements;
  if (!isRecord(measurements)) {
    errors.push("measurements are required");
  } else {
    for (const key of ["elapsedSeconds", "costCents", "humanInterventions"] as const) {
      if (!isNonNegativeInteger(measurements[key])) errors.push(`${key} must be a non-negative integer`);
    }
  }

  const outcomes = value.outcomes;
  const catalogCases = new Map(catalog.cases.map((benchCase) => [benchCase.id, benchCase]));
  const expectedCases = new Map<string, (typeof catalog.cases)[number]>();
  const requestedCaseIds = new Set<string>();
  for (const caseId of expectedCaseIds) {
    if (requestedCaseIds.has(caseId)) {
      errors.push(`duplicate requested case: ${caseId}`);
      continue;
    }
    requestedCaseIds.add(caseId);
    const benchCase = catalogCases.get(caseId);
    if (!benchCase) {
      errors.push(`unknown requested case: ${caseId}`);
      continue;
    }
    expectedCases.set(caseId, benchCase);
  }
  const outcomeIds = new Set<string>();
  let acceptedCaseCount = 0;
  if (!Array.isArray(outcomes)) {
    errors.push("outcomes are required");
  } else {
    for (const outcome of outcomes) {
      if (!isRecord(outcome) || typeof outcome.caseId !== "string") {
        errors.push("outcome is malformed");
        continue;
      }
      if (outcomeIds.has(outcome.caseId)) errors.push(`duplicate outcome: ${outcome.caseId}`);
      outcomeIds.add(outcome.caseId);
      const benchCase = expectedCases.get(outcome.caseId);
      if (!benchCase) {
        errors.push(`unknown outcome case: ${outcome.caseId}`);
        continue;
      }
      if (outcome.oracle !== "pass") errors.push(`${outcome.caseId}: oracle must pass`);
      if (outcome.mutation !== "caught-and-restored") {
        errors.push(`${outcome.caseId}: mutation must be caught-and-restored`);
      }
      if (outcome.scope !== "pass") errors.push(`${outcome.caseId}: scope must pass`);

      if (!Array.isArray(outcome.commands)) {
        errors.push(`${outcome.caseId}: command evidence is required`);
      } else {
        const observed = new Map<string, number>();
        for (const command of outcome.commands) {
          if (!isRecord(command) || typeof command.command !== "string" || !Number.isInteger(command.exitCode)) {
            errors.push(`${outcome.caseId}: malformed command evidence`);
            continue;
          }
          observed.set(command.command, command.exitCode as number);
        }
        for (const expectedCommand of benchCase.commands) {
          if (observed.get(expectedCommand) !== 0) {
            errors.push(`${outcome.caseId}: required command did not exit zero: ${expectedCommand}`);
          }
        }
      }

      if (outcome.oracle === "pass" && outcome.mutation === "caught-and-restored" && outcome.scope === "pass") {
        acceptedCaseCount += 1;
      }
    }
  }

  for (const caseId of expectedCases.keys()) {
    if (!outcomeIds.has(caseId)) errors.push(`missing outcome: ${caseId}`);
  }

  if (value.reviewerVerdict !== "accepted" && value.reviewerVerdict !== "rejected") {
    errors.push("reviewerVerdict is required");
  }
  if (value.reviewerVerdict !== "accepted") errors.push("reviewerVerdict must be accepted");

  return { ok: errors.length === 0, errors, acceptedCaseCount };
}

/**
 * A single-case trial uses the same evidence schema and fail-closed checks as
 * the full benchmark. It differs only in the explicitly named expected case;
 * an extra result is rejected rather than silently ignored.
 */
export function validateFocusedDevBenchRun(
  value: unknown,
  catalog: DevBenchCatalog,
  caseId: string
): DevBenchRunReport {
  return validateDevBenchRun(value, catalog, [caseId]);
}
