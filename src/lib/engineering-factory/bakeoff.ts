import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import {
  validateDevBenchRun,
  validateFocusedDevBenchRun,
  type DevBenchRunReport,
  type DevBenchRun,
} from "@/lib/engineering-factory/devbench-run";

export type BakeoffParticipant = "Codex" | "Claude";

export type CandidatePacket = {
  schemaVersion: 1;
  participant: BakeoffParticipant;
  catalogName: string;
  catalogVersion: 1;
  rules: readonly string[];
  cases: readonly {
    id: string;
    title: string;
    objective: string;
    sourcePaths: readonly string[];
    commands: readonly string[];
    oracle: readonly string[];
    mutation: string;
    forbiddenPaths: readonly string[];
  }[];
};

export type BakeoffScorecard = {
  comparable: boolean;
  blockers: string[];
  acceptedCases: number;
  elapsedSeconds: number | null;
  costCents: number | null;
  humanInterventions: number | null;
  costPerAcceptedCaseCents: number | null;
};

const FROZEN_RULES = [
  "Use the supplied frozen checkout and task packet only.",
  "No provider call, network access, secret access, deployment or database mutation.",
  "Do not install packages, change the lockfile, push or use production credentials.",
  "Work only inside the supplied task scope; prove the named mutation and restore it byte-exactly.",
  "Return commands, exit codes, elapsed time, cost, human interventions and a reviewer-ready diff summary.",
] as const;

export function createCandidatePacket(
  catalog: DevBenchCatalog,
  participant: BakeoffParticipant
): CandidatePacket {
  return {
    schemaVersion: 1,
    participant,
    catalogName: catalog.name,
    catalogVersion: catalog.version,
    rules: FROZEN_RULES,
    cases: catalog.cases.map((benchCase) => ({
      id: benchCase.id,
      title: benchCase.title,
      objective: benchCase.objective,
      sourcePaths: benchCase.sourcePaths,
      commands: benchCase.commands,
      oracle: benchCase.oracle,
      mutation: benchCase.mutation,
      forbiddenPaths: benchCase.forbiddenPaths,
    })),
  };
}

/**
 * A controlled trial may isolate one catalog case without inventing a second
 * protocol. Both participants receive the same frozen subset, and an unknown
 * case is a configuration error rather than an empty packet.
 */
export function createFocusedCandidatePacket(
  catalog: DevBenchCatalog,
  participant: BakeoffParticipant,
  caseId: string
): CandidatePacket {
  const benchCase = catalog.cases.find((candidate) => candidate.id === caseId);
  if (!benchCase) throw new Error(`unknown DevBench case: ${caseId}`);

  return {
    ...createCandidatePacket(catalog, participant),
    cases: [
      {
        id: benchCase.id,
        title: benchCase.title,
        objective: benchCase.objective,
        sourcePaths: benchCase.sourcePaths,
        commands: benchCase.commands,
        oracle: benchCase.oracle,
        mutation: benchCase.mutation,
        forbiddenPaths: benchCase.forbiddenPaths,
      },
    ],
  };
}

/** Compares only the frozen instructions, never the participant label. */
export function packetsAreEquivalent(left: CandidatePacket, right: CandidatePacket): boolean {
  const { participant: _leftParticipant, ...leftComparable } = left;
  const { participant: _rightParticipant, ...rightComparable } = right;
  return JSON.stringify(leftComparable) === JSON.stringify(rightComparable);
}

/**
 * Scorecards are deliberately lexicographic: a failed safety/scope/mutation
 * gate produces no rankable cost or speed number. This prevents a cheap but
 * unsafe run from being selected by an aggregate score.
 */
export function scoreDevBenchRun(run: DevBenchRun, catalog: DevBenchCatalog): BakeoffScorecard {
  const report = validateDevBenchRun(run, catalog);
  return scoreValidatedRun(run, report);
}

function scoreValidatedRun(run: DevBenchRun, report: DevBenchRunReport): BakeoffScorecard {
  if (!report.ok) {
    return {
      comparable: false,
      blockers: report.errors,
      acceptedCases: 0,
      elapsedSeconds: null,
      costCents: null,
      humanInterventions: null,
      costPerAcceptedCaseCents: null,
    };
  }

  const blockers: string[] = [];
  if (!report.measurementReadiness.elapsedComparable) blockers.push("elapsed measurement is unavailable");
  if (!report.measurementReadiness.costComparable) blockers.push("cost measurement is unavailable");
  const elapsedSeconds = report.measurementReadiness.elapsedComparable ? run.measurements.elapsedSeconds : null;
  const costCents = report.measurementReadiness.costComparable ? run.measurements.costCents : null;

  return {
    comparable: blockers.length === 0,
    blockers,
    acceptedCases: report.acceptedCaseCount,
    elapsedSeconds,
    costCents,
    humanInterventions: run.measurements.humanInterventions,
    costPerAcceptedCaseCents:
      costCents === null ? null : costCents / report.acceptedCaseCount,
  };
}

/** Score a one-case trial with the same reject-before-ranking rule as V1. */
export function scoreFocusedDevBenchRun(
  run: DevBenchRun,
  catalog: DevBenchCatalog,
  caseId: string
): BakeoffScorecard {
  const report = validateFocusedDevBenchRun(run, catalog, caseId);
  return scoreValidatedRun(run, report);
}
